/**
 * Starter widget seeded into new freeform cells. Doubles as the worked example
 * in the agent prompt, so keep it small, dependency-free, and exercising the
 * whole API surface: subscribe → render, click → filter, and ready().
 */
export const DEFAULT_FREEFORM_HTML = `<style>
  /* Every color comes from the theme contract, so the widget follows the
     host's light/dark mode instead of pinning one of them. */
  .widget { padding: 12px 14px; color: var(--widget-text); }
  .row {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 8px; border-radius: 8px; cursor: pointer;
  }
  .row:hover { background: rgba(var(--widget-accent-rgb), 0.08); }
  .row.selected { background: rgba(var(--widget-accent-rgb), 0.18); }
  .label { flex: 0 0 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { height: 10px; border-radius: 999px; background: var(--widget-accent); min-width: 2px; }
  .value {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    color: var(--widget-text-muted);
  }
  .empty { color: var(--widget-text-muted); padding: 12px 14px; }
</style>

<div class="widget" id="root"></div>

<script>
  var root = document.getElementById('root');
  var selected = null;

  trilogy.subscribe(function (state) {
    if (state.status === 'loading' && !state.rows.length) return;
    if (!state.rows.length) {
      root.innerHTML = '<div class="empty">No rows.</div>';
      return;
    }

    // Convention: first column is the dimension, second is the measure.
    var dim = state.columns[0] && state.columns[0].name;
    var measure = state.columns[1] && state.columns[1].name;
    if (!dim || !measure) {
      root.innerHTML = '<div class="empty">Needs a dimension and a measure column.</div>';
      return;
    }

    var max = 0;
    state.rows.forEach(function (row) {
      var n = Number(row[measure]);
      if (isFinite(n) && n > max) max = n;
    });

    root.innerHTML = '';
    state.rows.slice(0, 25).forEach(function (row) {
      var value = Number(row[measure]) || 0;
      var label = String(row[dim]);

      var el = document.createElement('div');
      el.className = 'row' + (selected === label ? ' selected' : '');

      var name = document.createElement('div');
      name.className = 'label';
      name.textContent = label;

      var bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.width = (max ? (value / max) * 55 : 0) + '%';

      var num = document.createElement('div');
      num.className = 'value';
      num.textContent = value.toLocaleString();

      el.appendChild(name);
      el.appendChild(bar);
      el.appendChild(num);

      el.addEventListener('click', function () {
        if (selected === label) {
          selected = null;
          trilogy.filters.clear();
        } else {
          selected = label;
          trilogy.filters.eq(dim, row[dim]);
        }
      });

      root.appendChild(el);
    });
  });

  trilogy.ready();
</script>`
