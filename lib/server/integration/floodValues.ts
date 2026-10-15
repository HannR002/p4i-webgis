/** Provider-returned null/empty/boolean values must never become real measurements. */
export function finiteFloodValue(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`Missing/NoData flood value: ${key}`);
  return value;
}
export function unitFloodValue(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error('Flood susceptibility is outside [0,1]');
  return value;
}
export function floodHistogram(
  value: unknown,
  key: string,
): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Missing flood histogram');
  const histogram = (value as Record<string, unknown>)[key];
  if (
    typeof histogram !== 'object' ||
    histogram === null ||
    Array.isArray(histogram)
  )
    throw new Error('Missing/NoData flood histogram');
  const entries = Object.entries(histogram);
  if (
    !entries.length ||
    entries.some(
      ([code, count]) =>
        !/^-?\d+$/.test(code) ||
        typeof count !== 'number' ||
        !Number.isFinite(count) ||
        count < 0,
    )
  )
    throw new Error('Invalid/empty categorical flood histogram');
  return Object.fromEntries(entries) as Record<string, number>;
}
