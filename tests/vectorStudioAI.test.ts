import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/auth", () => ({
  getRequestIdentity: vi.fn(async () => null),
}));
import { getRequestIdentity } from "../lib/server/auth";
import { POST, GET } from "../app/api/gis/studio-plan/route";
import { planWithOllama, studioAIStatus } from "../lib/server/ai/studio/ollama";
import { studioContext } from "../lib/gis/studio/plans";
import { documentFixture } from "./vectorStudioFixtures";
const env = {
  VECTOR_STUDIO_AI_ENABLED: "true",
  VECTOR_STUDIO_AI_PROVIDER: "ollama",
  VECTOR_STUDIO_AI_MODEL: "local-test-model",
  VECTOR_STUDIO_AI_LOCAL_ONLY_ACK: "true",
};
const input = () => ({
  prompt: "Beri warna biru pada layer ini",
  context: studioContext(documentFixture()),
  metadataConsent: true,
});
const good = {
  message: "Ubah tampilan layer yang tersedia",
  actions: [
    {
      type: "set_style",
      layerId: "layer-fixture",
      color: "#1122aa",
      opacity: 0.8,
    },
  ],
};
const reply = (proposal: unknown) =>
  new Response(
    JSON.stringify({ done: true, response: JSON.stringify(proposal) }),
    { headers: { "Content-Type": "application/json" } },
  );
beforeEach(() => {
  vi.stubEnv("P4I_ACADEMIC_PREVIEW", "false");
  vi.stubEnv("P4I_PREVIEW_PROVIDER", undefined);
  for (const name of [
    "P4I_HOSTINGER_APP_ID",
    "P4I_HOSTINGER_ENV",
    "P4I_HOSTINGER_HOSTNAME",
  ])
    vi.stubEnv(name, "");
  vi.stubEnv("VECTOR_STUDIO_AI_ENABLED", "");
  vi.mocked(getRequestIdentity).mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("model integration boundaries (mocked transport; NOT live model inference)", () => {
  it("disabled by default; unknown/cloud selections and missing operator acknowledgement stay unavailable", () => {
    expect(studioAIStatus({}).enabled).toBe(false);
    expect(
      studioAIStatus({ ...env, VECTOR_STUDIO_AI_LOCAL_ONLY_ACK: "" }).enabled,
    ).toBe(false);
    expect(
      studioAIStatus({ ...env, VECTOR_STUDIO_AI_MODEL: "gpt-oss:120b-cloud" })
        .enabled,
    ).toBe(false);
    expect(
      studioAIStatus({ ...env, VECTOR_STUDIO_AI_PROVIDER: "other" }).enabled,
    ).toBe(false);
  });
  it("uses fixed local endpoint and sends no features, coordinate rows or source file paths", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply(good));
    const request = input();
    const plan = await planWithOllama(request, env, fetcher);
    expect(plan.provider).toBe("ollama");
    expect(plan.actions).toEqual(good.actions);
    expect(fetcher.mock.calls[0][0]).toBe(
      "http://127.0.0.1:11434/api/generate",
    );
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.stream).toBe(false);
    expect(JSON.stringify(body)).not.toContain("103.6");
    expect(JSON.stringify(body)).not.toContain("Synthetic automated fixture");
    expect(body.model).toBe("local-test-model");
  });
  it("requires explicit metadata consent and rejects extra data/model/URL fields before fetch", async () => {
    const fetcher = vi.fn();
    await expect(
      planWithOllama({ ...input(), metadataConsent: false }, env, fetcher),
    ).rejects.toThrow();
    await expect(
      planWithOllama(
        { ...input(), model: "remote", features: [] },
        env,
        fetcher,
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    {
      message: "Invented geoprocessing",
      actions: [{ type: "overlay", layerId: "layer-fixture" }],
    },
    {
      message: "Invent geometry",
      actions: [
        {
          type: "create_polygon",
          layerId: "layer-fixture",
          coordinates: [[0, 0]],
        },
      ],
    },
    {
      message: "Unknown layer",
      actions: [{ type: "fit_layer", layerId: "private-other" }],
    },
    {
      message: "Unsafe color",
      actions: [
        {
          type: "set_style",
          layerId: "layer-fixture",
          color: "url(https://evil)",
          opacity: 1,
        },
      ],
    },
  ])("rejects unauthorized model output: $message", async (proposal) => {
    await expect(
      planWithOllama(input(), env, async () => reply(proposal)),
    ).rejects.toThrow();
  });
  it("rejects incomplete, malformed and oversized responses", async () => {
    for (const response of [
      new Response("{"),
      new Response(JSON.stringify({ done: false, response: "{}" })),
      new Response("x".repeat(33000)),
      new Response("no", { status: 500 }),
    ])
      await expect(
        planWithOllama(input(), env, async () => response),
      ).rejects.toThrow();
  });
  it("honors cancellation and never retries generation", async () => {
    const c = new AbortController();
    c.abort();
    const fetcher = vi.fn(async (_url, options) => {
      if (options?.signal?.aborted) throw Error("aborted");
      return reply(good);
    });
    await expect(
      planWithOllama(input(), env, fetcher, c.signal),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
describe("Next route authentication and preview isolation", () => {
  it("reports unavailable honestly; never calls a live model when unconfigured", async () => {
    expect((await (await GET()).json()).enabled).toBe(false);
    expect(
      (
        await POST(
          new Request("http://localhost/api/gis/studio-plan", {
            method: "POST",
          }),
        )
      ).status,
    ).toBe(503);
  });
  it("rejects unauthenticated and cross-origin generation before transport", async () => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (
        await POST(
          new Request("http://localhost/api/gis/studio-plan", {
            method: "POST",
            body: JSON.stringify(input()),
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await POST(
          new Request("http://localhost/api/gis/studio-plan", {
            method: "POST",
            headers: { Origin: "https://other.example" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("accepts authenticated planning but returns only a proposal, never a mutated map", async () => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.mocked(getRequestIdentity).mockResolvedValue({
      user: { id: "fixture-test", email: null },
      role: "managerial_analyst",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => reply(good)),
    );
    const r = await POST(
      new Request("http://localhost/api/gis/studio-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify(input()),
      }),
    );
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.plan.actions).toEqual(good.actions);
    expect(b.document).toBeUndefined();
    expect(r.headers.get("Cache-Control")).toContain("no-store");
  });
  it("blocks all generation in academic mode even if the model flag is enabled", async () => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.stubEnv("P4I_ACADEMIC_PREVIEW", "true");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(
      (
        await POST(
          new Request("http://localhost/api/gis/studio-plan", {
            method: "POST",
          }),
        )
      ).status,
    ).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });
});
