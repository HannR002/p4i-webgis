import 'server-only';
/** Per-process containment only; NOT a distributed quota, user billing or durable ledger. */
export class RequestBudgetExceeded extends Error {
  readonly retryAfter = 60;
}
export class RequestBudget {
  private start = 0;
  private count = 0;
  private active = 0;
  constructor(
    private readonly perMinute: number,
    private readonly concurrent: number,
    private readonly now = Date.now,
  ) {}
  acquire(): () => void {
    const now = this.now();
    if (now - this.start >= 60_000 || now < this.start) {
      this.start = now;
      this.count = 0;
    }
    if (this.count >= this.perMinute || this.active >= this.concurrent)
      throw new RequestBudgetExceeded(
        'Batas permintaan sementara terlampaui. Coba lagi nanti.',
      );
    this.count++;
    this.active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
  }
}
// Fixed keys; never use spoofable forwarded IP headers or unbounded per-user maps.
const runtime = globalThis as typeof globalThis & {
  p4iRequestBudgets?: { copilot: RequestBudget; boundaries: RequestBudget };
};
export const requestBudgets = (runtime.p4iRequestBudgets ??= {
  copilot: new RequestBudget(60, 4),
  boundaries: new RequestBudget(120, 8),
});

const vectorRuntime = globalThis as typeof globalThis & {
  p4iVectorAnalysisBudget?: RequestBudget;
};
export const vectorAnalysisBudget = (vectorRuntime.p4iVectorAnalysisBudget ??=
  new RequestBudget(30, 2));

const uploadRuntime = globalThis as typeof globalThis & {
  p4iProjectUploadBudget?: RequestBudget;
};
export const projectUploadBudget = (uploadRuntime.p4iProjectUploadBudget ??=
  new RequestBudget(20, 2));
