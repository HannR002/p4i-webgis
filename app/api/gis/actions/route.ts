import { NextResponse } from 'next/server';
import { getGisProvider } from '../../../../lib/server/gis';
import { getGisContext } from '../../../../lib/server/gis/context';
import { record, parseRecipe, parseMapAction, GisInputError } from '../../../../lib/gis/validation';
import { executeMapPlan, assertRecipeAccess } from '../../../../lib/gis/recipe';
import { gisError, readGisBody } from '../../../../lib/server/gis/http';
export async function POST(request: Request) {
  try {
    const body = await readGisBody(request);
    if (!record(body) || !Array.isArray(body.actions) || body.actions.length > 30)
      throw new GisInputError('Actions tidak valid');
    const catalog = getGisProvider().catalog();
    const context = await getGisContext(request, catalog);
    const recipe = parseRecipe(body.recipe, catalog);
    assertRecipeAccess(recipe, catalog, context);
    const actions = body.actions.map(parseMapAction);
    const next = executeMapPlan(recipe, actions, catalog, context);
    next.provenance = body.origin === 'ai' ? 'ai' : 'human';
    return NextResponse.json(
      { recipe: next, events: actions.map((a) => ({ tool: a.tool, status: 'completed' })) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return gisError(e);
  }
}
