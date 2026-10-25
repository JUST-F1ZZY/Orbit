// dates are 'YYYY-MM-DD' strings. math is done in UTC so DST doesn't break it

const DAY = 86400000;

export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const today = () => toISO(new Date());

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = new Date(toUTC(iso) + n * DAY);
  return d.toISOString().slice(0, 10);
}

export const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY);

export function formatDate(iso, opts = { month: 'short', day: 'numeric' }) {
  return new Date(toUTC(iso)).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}
