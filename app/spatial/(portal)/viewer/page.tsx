import MapWorkspace from '../../../../components/gis/MapWorkspace';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  return (
    <MapWorkspace
      webmap={typeof p.webmap === 'string' ? p.webmap : undefined}
      dataset={typeof p.dataset === 'string' ? p.dataset : undefined}
    />
  );
}
