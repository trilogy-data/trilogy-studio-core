import { FREEFORM_HELLO, FREEFORM_PROTOCOL_VERSION } from './types'

/**
 * Source of the `window.trilogy` shim injected as the first script of every
 * freeform widget frame.
 *
 * This runs inside the sandbox, as untrusted-adjacent code: it is a
 * convenience layer, NOT a security boundary. Author code can bypass it and
 * post directly to the port — which is exactly why every message is
 * re-validated on the host side in protocol.ts. Nothing here is load-bearing
 * for security; the boundary is the sandbox attribute plus the frame CSP.
 *
 * Kept as a plain string (rather than a separate bundled entry) so the library
 * build stays a single Vite pass. It intentionally avoids template literals so
 * it can live inside one.
 */
export const GUEST_RUNTIME_SOURCE = `(function () {
  'use strict';

  var VERSION = ${FREEFORM_PROTOCOL_VERSION};
  var HELLO = '${FREEFORM_HELLO}';

  var port = null;
  var pending = [];
  var subscribers = [];
  var readySent = false;

  var state = {
    status: 'loading',
    columns: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    filters: [],
    error: null
  };

  var theme = { mode: 'light', vars: {} };

  function send(message) {
    if (port) {
      try {
        port.postMessage(message);
      } catch (err) {
        // Non-cloneable payload; drop it rather than tearing down the widget.
      }
      return;
    }
    if (pending.length < 64) {
      pending.push(message);
    }
  }

  function flush() {
    var queued = pending;
    pending = [];
    for (var i = 0; i < queued.length; i++) {
      send(queued[i]);
    }
  }

  function notify() {
    for (var i = 0; i < subscribers.length; i++) {
      try {
        subscribers[i](state);
      } catch (err) {
        report('error', 'widget subscriber threw: ' + (err && err.message ? err.message : err));
      }
    }
  }

  function report(level, message) {
    send({ type: 'log', level: level, message: String(message).slice(0, 2000) });
  }

  function applyTheme(next) {
    theme = next;
    var root = document.documentElement;
    if (!root) return;
    root.setAttribute('data-theme', next.mode);
    // Keeps scrollbars and native controls legible when the host flips mode.
    root.style.setProperty('color-scheme', next.mode);
    var vars = next.vars || {};
    for (var key in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, key)) {
        try {
          root.style.setProperty(key, vars[key]);
        } catch (err) {
          // Ignore invalid custom property names.
        }
      }
    }
    api.theme = next;
  }

  function onHostMessage(event) {
    var data = event && event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'state' && data.state) {
      state = data.state;
      notify();
    } else if (data.type === 'theme' && data.theme) {
      applyTheme(data.theme);
    }
  }

  var api = {
    version: VERSION,
    theme: theme,

    get state() {
      return state;
    },

    ready: function () {
      if (readySent) return;
      readySent = true;
      send({ type: 'ready' });
    },

    subscribe: function (callback) {
      if (typeof callback !== 'function') return function () {};
      subscribers.push(callback);
      // Fire immediately so late subscribers see the current snapshot.
      try {
        callback(state);
      } catch (err) {
        report('error', 'widget subscriber threw: ' + (err && err.message ? err.message : err));
      }
      return function () {
        var index = subscribers.indexOf(callback);
        if (index >= 0) subscribers.splice(index, 1);
      };
    },

    filters: {
      set: function (filters) {
        send({ type: 'filter', mode: 'set', filters: filters || {} });
      },
      append: function (filters) {
        send({ type: 'filter', mode: 'append', filters: filters || {} });
      },
      clear: function () {
        send({ type: 'filter', mode: 'clear', filters: {} });
      },
      eq: function (field, value) {
        var payload = {};
        payload[field] = { op: 'eq', value: value };
        send({ type: 'filter', mode: 'set', filters: payload });
      }
    },

    refresh: function () {
      send({ type: 'refresh' });
    },

    resize: function (height) {
      send({ type: 'resize', height: Number(height) || 0 });
    },

    log: function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) {
        parts.push(String(arguments[i]));
      }
      report('log', parts.join(' '));
    }
  };

  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data || typeof data !== 'object' || data.type !== 'connect') return;
    if (data.v !== VERSION) {
      report('error', 'freeform protocol version mismatch');
      return;
    }
    if (!event.ports || !event.ports.length) return;
    port = event.ports[0];
    port.onmessage = onHostMessage;
    port.start();
    api.itemId = data.itemId;
    api.editMode = !!data.editMode;
    flush();
  });

  window.addEventListener('error', function (event) {
    report('error', (event && event.message) || 'uncaught error in widget');
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    report('error', 'unhandled rejection: ' + (reason && reason.message ? reason.message : reason));
  });

  Object.freeze(api.filters);
  Object.defineProperty(window, 'trilogy', { value: api, writable: false, configurable: false });

  parent.postMessage({ type: HELLO, v: VERSION }, '*');
})();`
