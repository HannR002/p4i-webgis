import { NextResponse } from 'next/server';
import { getGisProvider } from '../../../../lib/server/gis';
import { getGisContext } from '../../../../lib/server/gis/context';
import { canAccessDataset } from '../../../../lib/gis/recipe';
import { gisError } from '../../../../lib/server/gis/http';
export async function GET(request: Request) {
  try {
    const provider = getGisProvider();
    const catalog = provider.catalog();
    const context = await getGisContext(request, catalog);
    return NextResponse.json(
      {
        mode: provider.mode,
        datasets: catalog.filter((d) => canAccessDataset(d, context)),
        role: context.role,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return gisError(e);
  }
}
