/* Generic UI helpers for the Once Human Build Planner (no game logic here). */
(function (global) {
  'use strict';

  /** Create an element: h('div.cls#id', {attr: v, onclick: fn}, child, child...) */
  function h(spec, props, ...children) {
    const [tagPart, ...rest] = spec.split(/(?=[.#])/);
    const el = document.createElement(tagPart || 'div');
    for (const token of rest) {
      if (token[0] === '.') el.classList.add(token.slice(1));
      else if (token[0] === '#') el.id = token.slice(1);
    }
    if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k in el && k !== 'list' && typeof v !== 'object') { try { el[k] = v; } catch (_) { el.setAttribute(k, v); } }
        else el.setAttribute(k, v === true ? '' : v);
      }
    } else if (props != null) {
      children.unshift(props);
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /** <select> with options [{value,label,group?,disabled?,class?}] */
  function select(opts, value, onChange, attrs) {
    const sel = h('select', attrs || {});
    const groups = new Map();
    for (const o of opts) {
      const opt = h('option', { value: o.value, disabled: !!o.disabled, class: o.class || null }, o.label);
      if (o.group) {
        if (!groups.has(o.group)) { const g = h('optgroup', { label: o.group }); groups.set(o.group, g); sel.append(g); }
        groups.get(o.group).append(opt);
      } else sel.append(opt);
    }
    if (value != null) sel.value = String(value);
    if (onChange) sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  /** Star rating picker 1..max */
  function starPicker(value, max, onChange, attrs) {
    const wrap = h('div.stars', Object.assign({ role: 'radiogroup', 'aria-label': 'Star level' }, attrs || {}));
    for (let i = 1; i <= max; i++) {
      const b = h('button', {
        type: 'button', role: 'radio', 'aria-checked': i === value ? 'true' : 'false', 'aria-label': `${i} star`,
        class: i <= value ? 'on' : '', title: `${i}★`,
        onclick: () => onChange(i),
      }, '★');
      wrap.append(b);
    }
    return wrap;
  }

  function numberInput(value, { min, max, step, onChange, width, attrs } = {}) {
    const inp = h('input', Object.assign({ type: 'number', value: value ?? '', min, max, step: step ?? 'any', inputmode: 'decimal' }, attrs || {}));
    if (width) inp.style.width = width;
    if (onChange) inp.addEventListener('input', () => onChange(inp.value === '' ? null : Number(inp.value)));
    return inp;
  }

  function switchInput(checked, label, onChange, attrs) {
    const input = h('input', Object.assign({ type: 'checkbox', checked: !!checked }, attrs || {}));
    input.addEventListener('change', () => onChange(input.checked));
    return h('label.switch', input, h('span', label));
  }

  function panel(id, title, bodyChildren, { headerExtra, collapsed } = {}) {
    const body = h('div.body', bodyChildren);
    const toggle = h('button.toggle', { type: 'button', 'aria-label': 'Collapse section', title: 'Collapse / expand' }, collapsed ? '▸' : '▾');
    const el = h(`section.panel#${id}`, { class: collapsed ? 'collapsed' : '' },
      h('header', h('h2', title), headerExtra || null, toggle), body);
    toggle.addEventListener('click', () => {
      el.classList.toggle('collapsed');
      toggle.textContent = el.classList.contains('collapsed') ? '▸' : '▾';
      storage.set('collapsed:' + id, el.classList.contains('collapsed'));
    });
    return el;
  }

  const storage = {
    get(key, fallback) { try { const v = localStorage.getItem('ohbp:' + key); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; } },
    set(key, value) { try { localStorage.setItem('ohbp:' + key, JSON.stringify(value)); } catch (_) { /* storage unavailable */ } },
    remove(key) { try { localStorage.removeItem('ohbp:' + key); } catch (_) { /* ignore */ } },
  };

  /** Compact URL-safe encoding of a build object (JSON -> UTF-8 -> base64url). */
  function encodeState(obj) {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeState(str) {
    try {
      const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) { return null; }
  }

  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  const fmt = {
    num(v, digits = 0) { if (v == null || !isFinite(v)) return '–'; return Number(v).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }); },
    pct(v, digits = 1) { if (v == null || !isFinite(v)) return '–'; return (v >= 0 ? '+' : '') + Number(v).toFixed(digits) + '%'; },
    mult(v, digits = 3) { if (v == null || !isFinite(v)) return '–'; return '×' + Number(v).toFixed(digits); },
    signed(v, digits = 0) { if (v == null || !isFinite(v)) return '–'; return (v > 0 ? '+' : '') + Number(v).toLocaleString('en-US', { maximumFractionDigits: digits }); },
  };

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  global.UI = { h, append, clear, select, starPicker, numberInput, switchInput, panel, storage, encodeState, decodeState, toast, fmt, debounce };
})(window);
