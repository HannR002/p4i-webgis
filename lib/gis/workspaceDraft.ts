import type { MapRecipe } from './contracts';
export const WORKSPACE_DRAFT_KEY = 'p4i-map-draft-v1';
/** Shared explicit local draft action; never a project/database save. */
export function saveLocalWorkspaceDraft(
  recipe: MapRecipe,
  unfinished: boolean,
  storage: Pick<Storage, 'setItem'>,
): void {
  if (unfinished)
    throw Error(
      'Selesaikan atau batalkan gambar/edit sebelum menyimpan draft.',
    );
  const value = JSON.stringify(recipe);
  if (new TextEncoder().encode(value).length > 65536)
    throw Error(
      'Draft terlalu besar (maks 64 KB); kurangi objek/konfigurasi sebelum menyimpan.',
    );
  storage.setItem(WORKSPACE_DRAFT_KEY, value);
}
