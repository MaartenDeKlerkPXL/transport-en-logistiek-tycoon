// Kleine hulpfuncties: toeval, opmaak van bedragen/tijd en HTML-escaping.

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// entries = [[waarde, gewicht], ...]
export function weighted(entries) {
  const total = entries.reduce((s, e) => s + e[1], 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) if ((r -= w) <= 0) return key;
  return entries[entries.length - 1][0];
}

export const fmtMoney = n => (n < 0 ? '−' : '') + '€ ' + Math.round(Math.abs(n)).toLocaleString('nl-BE');
export const fmtKm = n => Math.round(n).toLocaleString('nl-BE') + ' km';
export const fmtWeight = w => (w < 3 ? w.toLocaleString('nl-BE', { maximumFractionDigits: 1 }) : Math.round(w)) + ' t';

export function fmtDur(h) {
  if (h <= 0) return '0 min';
  const min = Math.round(h * 60);
  if (min < 60) return min + ' min';
  const H = Math.floor(min / 60), M = min % 60;
  return M ? `${H}u${String(M).padStart(2, '0')}` : `${H}u`;
}

export function fmtClock(t) {
  const day = Math.floor(t / 24) + 1;
  const m = Math.floor((t % 24) * 60);
  return `Dag ${day} · ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
