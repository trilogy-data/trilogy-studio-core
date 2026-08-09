import type { ConnectionStoreType } from '../stores/connectionStore'

/**
 * A dashboard carries its connection twice: `connectionId` is the real key
 * (`local:<name>` / `remote:<store>:<name>`), and `connection` is the display
 * name kept for back-compat with dashboards persisted before the id migration.
 * Everything downstream — queryExecutionService in particular — looks
 * connections up by *id*, so a bare name reaching it surfaces as
 * "Connection <name> not found." even though the connection is present and
 * healthy.
 */
export interface DashboardConnectionRef {
  connection?: string
  connectionId?: string
}

/**
 * Resolve a dashboard's connection to a store key.
 *
 * The id is only trusted when it actually resolves: a dashboard can carry an
 * id for a connection that has since been renamed or recreated, and forks used
 * to carry none at all. Falling back to the name lets those self-heal. The last
 * resort returns whatever we have so the eventual error names something the
 * user recognizes.
 */
export function resolveDashboardConnectionId(
  dashboard: DashboardConnectionRef | null | undefined,
  connectionStore: ConnectionStoreType,
): string {
  if (!dashboard) return ''

  const { connection = '', connectionId = '' } = dashboard
  if (connectionId && connectionStore.connections[connectionId]) return connectionId

  const byName = connection ? connectionStore.connectionByName(connection)?.id : undefined
  if (byName) return byName

  return connectionId || connection
}

/** A dashboard whose connection refs can be repaired in place. */
export interface RepairableDashboard extends DashboardConnectionRef {
  changed?: boolean
}

/**
 * Repair dashboards whose stored `connectionId` is missing or does not resolve.
 *
 * `resolveDashboardConnectionId` fixes the *query* path at read time, but the
 * stored id is consumed directly, by exact match, elsewhere: cascade delete in
 * ConnectionList, the `getConnectionDashboards` getter, and the dashboard
 * sidebar's connection grouping. Those see a stale id as a different
 * connection — dashboards get orphaned instead of cleaned up on delete, and the
 * sidebar renders a second group under the same display name. So the value has
 * to be corrected on disk, not just resolved around.
 *
 * Only writes when the display name resolves to a connection that currently
 * exists. A dashboard pointing at a connection that is genuinely gone keeps
 * what it had, so it stays visible as its own group rather than being silently
 * merged into a live connection. Callers must run this after the connection
 * store has hydrated, or a resolution race would persist the wrong answer.
 *
 * Returns the number of dashboards changed.
 */
export function repairDashboardConnectionRefs(
  dashboards: Iterable<RepairableDashboard>,
  connectionStore: ConnectionStoreType,
): number {
  let repaired = 0

  for (const dashboard of dashboards) {
    if (dashboard.connectionId && connectionStore.connections[dashboard.connectionId]) continue
    if (!dashboard.connection) continue

    // `connection` normally holds a display name, but newDashboard falls back
    // to writing the id into it when the connection didn't resolve at creation
    // time — so try both readings, and accept only a confirmed hit.
    const match =
      connectionStore.connectionByName(dashboard.connection) ||
      connectionStore.connections[dashboard.connection]
    if (!match) continue
    if (dashboard.connectionId === match.id && dashboard.connection === match.name) continue

    dashboard.connectionId = match.id
    // Re-normalize so the two fields can't disagree.
    dashboard.connection = match.name
    dashboard.changed = true
    repaired += 1
  }

  return repaired
}
