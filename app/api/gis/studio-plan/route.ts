import { NextResponse } from "next/server";
import { academicRequested } from "../../../../lib/academicPreview";
import { getRequestIdentity } from "../../../../lib/server/auth";
import { readGisBody } from "../../../../lib/server/gis/http";
import { GisInputError } from "../../../../lib/gis/validation";
import { StudioError } from "../../../../lib/gis/studio/model";
import {
  RequestBudget,
  RequestBudgetExceeded,
} from "../../../../lib/server/requestBudget";
import {
  planWithOllama,
  studioAIStatus,
} from "../../../../lib/server/ai/studio/ollama";
export const runtime = "nodejs";
const budget = new RequestBudget(20, 1);
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  return NextResponse.json(
    academicRequested(process.env)
      ? {
          provider: "ollama",
          enabled: false,
          message: "Model eksternal/lokal dinonaktifkan pada preview akademik.",
        }
      : studioAIStatus(process.env),
    { headers },
  );
}
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    if (academicRequested(process.env) || !studioAIStatus(process.env).enabled)
      return NextResponse.json(
        { error: "AI lokal belum aktif." },
        { status: 503, headers },
      );
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return NextResponse.json(
        { error: "Origin tidak diizinkan." },
        { status: 403, headers },
      );
    if (!(await getRequestIdentity(request)))
      return NextResponse.json(
        { error: "Masuk dengan akun aktif untuk memakai model AI lokal." },
        { status: 401, headers },
      );
    release = budget.acquire();
    const input = await readGisBody(request);
    const plan = await planWithOllama(
      input,
      process.env,
      fetch,
      request.signal,
    );
    return NextResponse.json({ plan }, { headers });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof RequestBudgetExceeded
            ? "Batas permintaan sementara tercapai."
            : e instanceof StudioError
              ? e.message
              : "Model lokal gagal merencanakan perubahan; peta tidak diubah.",
      },
      {
        status:
          e instanceof RequestBudgetExceeded
            ? 429
            : e instanceof StudioError || e instanceof GisInputError
              ? 400
              : 502,
        headers,
      },
    );
  } finally {
    release?.();
  }
}
