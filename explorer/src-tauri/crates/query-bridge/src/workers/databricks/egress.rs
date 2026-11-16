// Where a Databricks client may send requests.
//
// Permissive is for a process the user owns (the desktop explorer, a local
// engine): any https host, plus plain http to loopback for test doubles.
// Strict is for a shared server (the hosted remote engine): the workspace must
// be a Databricks cloud host, every hop is https on 443, and no request may
// reach a private, loopback or link-local address (cloud metadata, the
// platform's private network).
//
// Strict mode is enforced twice: `check_*` gives a clear error up front, and
// the agent's resolver drops the connection if a name resolves to a private
// address at connect time, so DNS rebinding between check and connect gains
// nothing.

use std::fmt;
use std::io;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs};
use std::sync::Arc;

use url::Url;

use crate::protocol::{BridgeError, Result};

pub const DEFAULT_API_HOST_SUFFIXES: &[&str] = &[
    ".cloud.databricks.com",
    ".azuredatabricks.net",
    ".gcp.databricks.com",
    ".cloud.databricks.us",
];

/// Paths taken from Databricks responses must stay under this prefix in strict
/// mode.
pub const STRICT_API_PREFIX: &str = "/api/2.0/sql/";

pub type HostResolver = Arc<dyn Fn(&str, u16) -> io::Result<Vec<IpAddr>> + Send + Sync>;

fn system_resolver(host: &str, port: u16) -> io::Result<Vec<IpAddr>> {
    Ok((host, port).to_socket_addrs()?.map(|a| a.ip()).collect())
}

#[derive(Clone)]
pub struct EgressPolicy {
    pub strict: bool,
    pub api_host_suffixes: Vec<String>,
    /// Let a strict engine reach private addresses (a self-host in front of a
    /// private-link workspace). Host and https rules still apply.
    pub allow_private: bool,
    resolver: HostResolver,
}

impl fmt::Debug for EgressPolicy {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("EgressPolicy")
            .field("strict", &self.strict)
            .field("api_host_suffixes", &self.api_host_suffixes)
            .field("allow_private", &self.allow_private)
            .finish()
    }
}

impl Default for EgressPolicy {
    fn default() -> Self {
        Self::permissive()
    }
}

impl EgressPolicy {
    pub fn permissive() -> Self {
        Self {
            strict: false,
            api_host_suffixes: DEFAULT_API_HOST_SUFFIXES
                .iter()
                .map(|s| s.to_string())
                .collect(),
            allow_private: false,
            resolver: Arc::new(system_resolver),
        }
    }

    pub fn strict() -> Self {
        Self {
            strict: true,
            ..Self::permissive()
        }
    }

    /// Replace DNS resolution (tests).
    pub fn with_resolver(mut self, resolver: HostResolver) -> Self {
        self.resolver = resolver;
        self
    }

    fn guards_addresses(&self) -> bool {
        self.strict && !self.allow_private
    }

    /// The workspace base URL (`scheme://authority`) a client will call.
    pub fn check_api_base(&self, base_url: &str) -> Result<()> {
        if !self.strict {
            return Ok(());
        }
        let url = Url::parse(base_url).map_err(|_| {
            BridgeError::InvalidConfig("Databricks host is not a valid URL.".into())
        })?;
        let host = url.host_str().unwrap_or("").to_ascii_lowercase();
        if url.scheme() != "https" || url.port().is_some_and(|p| p != 443) {
            return Err(BridgeError::EgressDenied(
                "Databricks host must be https on port 443.".into(),
            ));
        }
        if !self
            .api_host_suffixes
            .iter()
            .any(|s| host.ends_with(s.as_str()))
        {
            return Err(BridgeError::EgressDenied(format!(
                "Databricks host {host:?} is not a Databricks cloud workspace ({}).",
                self.api_host_suffixes.join(", ")
            )));
        }
        self.check_resolves_public(&host, 443)
    }

    /// A presigned result link, or a redirect hop from one.
    pub fn check_download(&self, url: &Url) -> Result<()> {
        let host = url.host_str().unwrap_or("").to_ascii_lowercase();
        if host.is_empty() || !url.username().is_empty() || url.password().is_some() {
            return Err(BridgeError::EgressDenied(
                "Databricks returned an unusable result link.".into(),
            ));
        }
        if url.scheme() == "http" && !self.strict && is_loopback_name(&host) {
            return Ok(());
        }
        if url.scheme() != "https" {
            return Err(BridgeError::EgressDenied(
                "Databricks result links must be https.".into(),
            ));
        }
        if self.strict {
            if url.port().is_some_and(|p| p != 443) {
                return Err(BridgeError::EgressDenied(
                    "Databricks result links must use port 443.".into(),
                ));
            }
            self.check_resolves_public(&host, 443)?;
        }
        Ok(())
    }

    fn check_resolves_public(&self, host: &str, port: u16) -> Result<()> {
        if !self.guards_addresses() {
            return Ok(());
        }
        let host = host.trim_start_matches('[').trim_end_matches(']');
        if [".internal", ".flycast", ".localhost"]
            .iter()
            .any(|s| host.ends_with(s))
            || host == "localhost"
        {
            return Err(BridgeError::EgressDenied(format!(
                "Refusing to connect to private host {host:?}."
            )));
        }
        let addresses = (self.resolver)(host, port)
            .map_err(|e| BridgeError::Io(format!("could not resolve {host}: {e}")))?;
        if addresses.is_empty() || !addresses.iter().all(|ip| is_public_ip(*ip)) {
            return Err(BridgeError::EgressDenied(format!(
                "Refusing to connect to {host:?}: it resolves to a private address."
            )));
        }
        Ok(())
    }

    /// The resolver the HTTP agent connects through. In strict mode it fails
    /// the connection when any address for the name is not public.
    pub(crate) fn agent_resolver(&self) -> impl ureq::Resolver + 'static {
        let resolver = self.resolver.clone();
        let guard = self.guards_addresses();
        move |netloc: &str| -> io::Result<Vec<SocketAddr>> {
            let (host, port) = split_netloc(netloc)?;
            let ips = resolver(host, port)?;
            if guard && (ips.is_empty() || !ips.iter().all(|ip| is_public_ip(*ip))) {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    format!("{host} resolves to a private address"),
                ));
            }
            Ok(ips
                .into_iter()
                .map(|ip| SocketAddr::new(ip, port))
                .collect())
        }
    }
}

fn split_netloc(netloc: &str) -> io::Result<(&str, u16)> {
    let bad = || {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("bad address {netloc:?}"),
        )
    };
    let (host, port) = netloc.rsplit_once(':').ok_or_else(bad)?;
    let port = port.parse().map_err(|_| bad())?;
    Ok((host.trim_start_matches('[').trim_end_matches(']'), port))
}

pub(crate) fn is_loopback_name(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]")
}

/// True only for globally routable unicast addresses. IPv4-mapped and NAT64
/// IPv6 forms are judged by the IPv4 address they carry.
pub fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public_v4(v4);
            }
            let s = v6.segments();
            // NAT64 well-known prefix 64:ff9b::/96.
            if s[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
                return is_public_v4(Ipv4Addr::new(
                    (s[6] >> 8) as u8,
                    s[6] as u8,
                    (s[7] >> 8) as u8,
                    s[7] as u8,
                ));
            }
            is_public_v6(v6)
        }
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    !(ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_multicast()
        || o[0] == 0
        // 100.64.0.0/10 carrier-grade NAT
        || (o[0] == 100 && (o[1] & 0xC0) == 64)
        // 192.0.0.0/24 IETF protocol assignments
        || (o[0] == 192 && o[1] == 0 && o[2] == 0)
        // 198.18.0.0/15 benchmarking
        || (o[0] == 198 && (o[1] & 0xFE) == 18)
        // 240.0.0.0/4 reserved
        || o[0] >= 240)
}

fn is_public_v6(ip: Ipv6Addr) -> bool {
    let s = ip.segments();
    !(ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_multicast()
        // fc00::/7 unique local (Fly's 6PN lives here)
        || (s[0] & 0xFE00) == 0xFC00
        // fe80::/10 link local
        || (s[0] & 0xFFC0) == 0xFE80
        // 2001:db8::/32 documentation
        || (s[0] == 0x2001 && s[1] == 0x0DB8)
        // ::/96 IPv4-compatible (deprecated)
        || s[..6] == [0, 0, 0, 0, 0, 0])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixed(ips: &'static [&'static str]) -> HostResolver {
        Arc::new(move |_, _| Ok(ips.iter().map(|s| s.parse().unwrap()).collect()))
    }

    #[test]
    fn classifies_addresses() {
        for public in [
            "8.8.8.8",
            "52.1.2.3",
            "2600:1f18::1",
            "::ffff:8.8.8.8",
            "64:ff9b::808:808",
        ] {
            assert!(is_public_ip(public.parse().unwrap()), "{public}");
        }
        for private in [
            "10.0.0.1",
            "172.16.0.1",
            "192.168.1.1",
            "127.0.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "0.0.0.0",
            "::1",
            "fdaa::3",
            "fe80::1",
            "::ffff:10.0.0.1",
            "64:ff9b::a00:1",
            "::",
        ] {
            assert!(!is_public_ip(private.parse().unwrap()), "{private}");
        }
    }

    #[test]
    fn strict_api_base_rules() {
        let p = EgressPolicy::strict().with_resolver(fixed(&["52.1.2.3"]));
        assert!(p
            .check_api_base("https://dbc-1.cloud.databricks.com")
            .is_ok());
        assert!(p
            .check_api_base("https://adb-1.2.azuredatabricks.net")
            .is_ok());
        for bad in [
            "https://evil.example",
            "https://dbc-1.cloud.databricks.com:8443",
            "http://dbc-1.cloud.databricks.com",
            "https://cloud.databricks.com.evil.example",
        ] {
            assert!(
                matches!(p.check_api_base(bad), Err(BridgeError::EgressDenied(_))),
                "{bad}"
            );
        }
        let rebound = EgressPolicy::strict().with_resolver(fixed(&["52.1.2.3", "10.0.0.5"]));
        assert!(matches!(
            rebound.check_api_base("https://dbc-1.cloud.databricks.com"),
            Err(BridgeError::EgressDenied(_))
        ));
        let mut private_ok = rebound.clone();
        private_ok.allow_private = true;
        assert!(private_ok
            .check_api_base("https://dbc-1.cloud.databricks.com")
            .is_ok());
        // Permissive checks nothing about the base.
        assert!(EgressPolicy::permissive()
            .check_api_base("https://anything.example")
            .is_ok());
    }

    #[test]
    fn download_rules() {
        let strict = EgressPolicy::strict().with_resolver(fixed(&["52.1.2.3"]));
        let ok = Url::parse("https://bucket.s3.amazonaws.com/x?sig=1").unwrap();
        assert!(strict.check_download(&ok).is_ok());
        for bad in [
            "http://bucket.s3.amazonaws.com/x",
            "https://bucket.s3.amazonaws.com:8443/x",
            "https://user:pw@bucket.s3.amazonaws.com/x",
            "http://127.0.0.1:9000/x",
            "https://metadata.internal/x",
        ] {
            assert!(
                strict.check_download(&Url::parse(bad).unwrap()).is_err(),
                "{bad}"
            );
        }
        let to_private = EgressPolicy::strict().with_resolver(fixed(&["169.254.169.254"]));
        assert!(to_private.check_download(&ok).is_err());

        let permissive = EgressPolicy::permissive();
        assert!(permissive
            .check_download(&Url::parse("http://127.0.0.1:9000/x").unwrap())
            .is_ok());
        assert!(permissive
            .check_download(&Url::parse("http://example.com/x").unwrap())
            .is_err());
    }

    #[test]
    fn agent_resolver_refuses_private_addresses_when_strict() {
        let strict = EgressPolicy::strict().with_resolver(fixed(&["10.1.2.3"]));
        let r = strict.agent_resolver();
        assert!(ureq::Resolver::resolve(&r, "dbc-1.cloud.databricks.com:443").is_err());
        let public = EgressPolicy::strict().with_resolver(fixed(&["52.1.2.3"]));
        let addrs = ureq::Resolver::resolve(&public.agent_resolver(), "[::1]:443").unwrap();
        assert_eq!(addrs, vec!["52.1.2.3:443".parse().unwrap()]);
        let permissive = EgressPolicy::permissive().with_resolver(fixed(&["127.0.0.1"]));
        assert!(ureq::Resolver::resolve(&permissive.agent_resolver(), "localhost:80").is_ok());
    }
}
