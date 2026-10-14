'use client';
import { useEffect } from 'react';
import useSWR from 'swr';
import type { Dataset, GisRole } from '../../lib/gis/contracts';
import { isAppRole } from '../../lib/authRoles';
import { record } from '../../lib/gis/validation';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
interface CatalogResponse {
  mode: 'demo' | 'unavailable';
  datasets: Dataset[];
  role: GisRole;
  entitledProjectIds: string[];
}
async function fetchCatalog(): Promise<CatalogResponse> {
  const r = await fetch('/api/gis/catalog');
  if (!r.ok) throw new Error('Katalog tidak dapat dimuat');
  const d: unknown = await r.json();
  if (
    !record(d) ||
    !Array.isArray(d.datasets) ||
    !['demo', 'unavailable'].includes(String(d.mode))
  )
    throw new Error('Katalog tidak valid');
  return {
    mode: d.mode as CatalogResponse['mode'],
    datasets: d.datasets as Dataset[],
    role: isAppRole(d.role) ? d.role : 'guest',
    entitledProjectIds:
      Array.isArray(d.entitledProjectIds) &&
      d.entitledProjectIds.every((id) => typeof id === 'string')
        ? d.entitledProjectIds.slice(0, 100)
        : [],
  };
}
export function useGisCatalog() {
  const result = useSWR('gis-catalog', fetchCatalog, {
    revalidateOnFocus: false,
  });
  const configure = useWorkspaceStore((s) => s.configure);
  useEffect(() => {
    if (result.data)
      configure(result.data.datasets, result.data.mode, {
        role: result.data.role,
        entitledProjectIds: result.data.entitledProjectIds,
      });
  }, [configure, result.data]);
  return result;
}
