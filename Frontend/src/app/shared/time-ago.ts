const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const formatter = new Intl.RelativeTimeFormat('fr', { numeric: 'always' });

/** Date relative en français : « il y a 2 heures » (« à l'instant » sous une minute). */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) {
    return '';
  }
  if (seconds < 60) {
    return "à l'instant";
  }
  const [unit, size] = UNITS.find(([, size]) => seconds >= size) ?? UNITS[UNITS.length - 1];
  return formatter.format(-Math.floor(seconds / size), unit);
}
