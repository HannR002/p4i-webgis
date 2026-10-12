import { NextResponse } from 'next/server';
import { getGisPlanner } from '../../../../lib/server/ai';
import { getGisProvider } from '../../../../lib/server/gis';
import { getGisContext } from '../../../../lib/server/gis/context';
import { record, parseRecipe, GisInputError } from '../../../../lib/gis/validation';
import { assertRecipeAccess } from '../../../../lib/gis/recipe';
import { gisError, readGisBody } from '../../../../lib/server/gis/http';
export async function POST(request: Request) {
  try {
    const body = await readGisBody(request);
    if (!record(body) || typeof body.prompt !== 'string')
      throw new GisInputError('Prompt tidak valid');
    const catalog = getGisProvider().catalog();
    const context = await getGisContext(request, catalog);
    const recipe = parseRecipe(body.recipe, catalog);
    assertRecipeAccess(recipe, catalog, context);
    const planner = getGisPlanner();
    if (!planner)
      return NextResponse.json(
        {
          status: 'unavailable',
          error: 'Provider AI belum dikonfigurasi. Demo hanya tersedia dalam development.',
        },
        { status: 503 },
      );
    return NextResponse.json(await planner.plan(body.prompt, recipe, catalog, context), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return gisError(e);
  }
}
