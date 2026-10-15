import { WEBMAPS } from './catalog';
import type { Dataset } from './contracts';
export type Webmap = (typeof WEBMAPS)[number];
export function searchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('id-ID');
}
export function filterWebmaps(query: string, category = 'all'): Webmap[] {
  const q = searchText(query);
  return WEBMAPS.filter(
    (m) =>
      (category === 'all' || m.category === category) &&
      searchText(`${m.title} ${m.category} ${m.description}`).includes(q),
  );
}
export function filterDatasets(
  datasets: readonly Dataset[],
  filters: { query: string; type: string; category: string; status: string },
): Dataset[] {
  const q = searchText(filters.query);
  return datasets.filter(
    (d) =>
      (filters.type === 'all' || d.type === filters.type) &&
      (filters.category === 'all' || d.category === filters.category) &&
      (filters.status === 'all' || d.status === filters.status) &&
      searchText(
        `${d.title} ${d.description} ${d.source} ${d.tags.join(' ')}`,
      ).includes(q),
  );
}
export const statusLabels: Record<Dataset['status'], string> = {
  demo: 'Demo sintetik',
  available: 'Data tersedia',
  unavailable: 'Belum tersedia',
};
export function webmapStatus(
  map: Webmap,
  datasets: readonly Dataset[],
): Dataset['status'] {
  const layers = map.datasets.map((id) => datasets.find((d) => d.id === id));
  if (layers.some((d) => !d || d.status === 'unavailable'))
    return 'unavailable';
  return layers.some((d) => d?.status === 'demo') ? 'demo' : 'available';
}
