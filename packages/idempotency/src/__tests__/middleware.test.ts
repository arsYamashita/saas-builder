import { describe, it, expect, vi } from "vitest";
import { withRoute } from "../middleware";
import { InMemoryIdempotencyStore } from "../store";
import type { IdempotencyStore, ClaimOutcome } from "../types";

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/orders", { method: "POST", headers });
}

// Every test route needs SOME scope/namespace — both are required, no
// default (Codex review gpt-5.6-sol, 2026-08-30 P1: see middleware.ts
// doc). Tests that don't care about tenant scoping use this fixed pair.
const UNSCOPED = { getScope: async () => "system", namespace: "test-route" };

describe("withRoute", () => {
  it("400s a required Idempotency-Key that is missing", async () => {
    const store = new InMemoryIdempotencyStore();
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const wrapped = withRoute(handler, { store, ...UNSCOPED });

    const res = await wrapped(req(), undefined);

    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes requests through unguarded when required: false and header is absent", async () => {
    const store = new InMemoryIdempotencyStore();
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const wrapped = withRoute(handler, { store, required: false, ...UNSCOPED });

    const res = await wrapped(req(), undefined);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("throws constructing withRoute without a namespace", () => {
    const store = new InMemoryIdempotencyStore();
    expect(() =>
      withRoute(async () => Response.json({}), {
        store,
        getScope: async () => "system",
        namespace: "",
      })
    ).toThrow(/namespace/);
  });

  it("runs the handler once and returns its response for a fresh key", async () => {
    const store = new InMemoryIdempotencyStore();
    const handler = vi.fn(async () => Response.json({ orderId: "order-1" }, { status: 201 }));
    const wrapped = withRoute(handler, { store, ...UNSCOPED });

    const res = await wrapped(req({ "Idempotency-Key": "k1" }), undefined);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ orderId: "order-1" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("replays the SAME status + body + content-type for a retried request, without re-running the handler", async () => {
    const store = new InMemoryIdempotencyStore();
    const handler = vi.fn(async () => Response.json({ orderId: "order-1" }, { status: 201 }));
    const wrapped = withRoute(handler, { store, ...UNSCOPED });

    const first = await wrapped(req({ "Idempotency-Key": "k1" }), undefined);
    const second = await wrapped(req({ "Idempotency-Key": "k1" }), undefined);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(first.status);
    expect(await second.json()).toEqual(await first.clone().json());
    expect(second.headers.get("Content-Type")).toBe(first.headers.get("Content-Type"));
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
  });

  it("replays a non-JSON (plain text) body byte-for-byte, not double-JSON-encoded", async () => {
    const store = new InMemoryIdempotencyStore();
    const handler = vi.fn(
      async () => new Response("hello", { status: 200, headers: { "Content-Type": "text/plain" } })
    );
    const wrapped = withRoute(handler, { store, ...UNSCOPED });

    await wrapped(req({ "Idempotency-Key": "k1" }), undefined);
    const replay = await wrapped(req({ "Idempotency-Key": "k1" }), undefined);

    expect(await replay.text()).toBe("hello"); // NOT '"hello"'
    expect(replay.headers.get("Content-Type")).toBe("text/plain");
  });

  it("returns 409 for a concurrent request with the same key still in flight", async () => {
    const store = new InMemoryIdempotencyStore();
    let releaseHandler!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    const handler = vi.fn(async () => {
      await gate;
      return Response.json({ ok: true });
    });
    const wrapped = withRoute(handler, { store, ...UNSCOPED });

    const inFlight = wrapped(req({ "Idempotency-Key": "k1" }), undefined);
    await new Promise((r) => setTimeout(r, 0)); // let the first request claim

    const concurrent = await wrapped(req({ "Idempotency-Key": "k1" }), undefined);
    expect(concurrent.status).toBe(409);
    const concurrentBody = (await concurrent.json()) as { error: string };
    expect(concurrentBody.error).toBe("request_in_progress");

    releaseHandler();
    await inFlight;
  });

  it("releases the claim on handler throw, allowing a retry to actually run", async () => {
    const store = new InMemoryIdempotencyStore();
    let attempt = 0;
    const handler = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("boom");
      return Response.json({ ok: true });
    });
    const wrapped = withRoute(handler, { store, ...UNSCOPED });

    await expect(wrapped(req({ "Idempotency-Key": "k1" }), undefined)).rejects.toThrow("boom");
    const retry = await wrapped(req({ "Idempotency-Key": "k1" }), undefined);

    expect(retry.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("scopes by tenant via getScope — same key, different tenants, do not collide", async () => {
    const store = new InMemoryIdempotencyStore();
    const handler = vi.fn(async (r: Request) => {
      const tenant = r.headers.get("x-tenant");
      return Response.json({ processedFor: tenant }, { status: 201 });
    });
    const wrapped = withRoute(handler, {
      store,
      namespace: "orders.create",
      getScope: async (r) => r.headers.get("x-tenant") ?? "unscoped",
    });

    const resA = await wrapped(req({ "Idempotency-Key": "same-key", "x-tenant": "tenant-a" }), undefined);
    const resB = await wrapped(req({ "Idempotency-Key": "same-key", "x-tenant": "tenant-b" }), undefined);

    expect(await resA.json()).toEqual({ processedFor: "tenant-a" });
    expect(await resB.json()).toEqual({ processedFor: "tenant-b" }); // NOT a replay of tenant-a's response
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("namespaces by route — same tenant + same key, different routes, do not collide", async () => {
    const store = new InMemoryIdempotencyStore();
    const ordersHandler = vi.fn(async () => Response.json({ from: "orders" }, { status: 201 }));
    const refundsHandler = vi.fn(async () => Response.json({ from: "refunds" }, { status: 201 }));

    const ordersRoute = withRoute(ordersHandler, {
      store,
      namespace: "orders.create",
      getScope: async () => "tenant-a",
    });
    const refundsRoute = withRoute(refundsHandler, {
      store,
      namespace: "refunds.create",
      getScope: async () => "tenant-a",
    });

    // Same tenant, same client-chosen Idempotency-Key, two different
    // endpoints — without namespacing, refundsRoute would incorrectly
    // replay ordersRoute's response instead of running at all.
    const orderRes = await ordersRoute(req({ "Idempotency-Key": "retry-1" }), undefined);
    const refundRes = await refundsRoute(req({ "Idempotency-Key": "retry-1" }), undefined);

    expect(await orderRes.json()).toEqual({ from: "orders" });
    expect(await refundRes.json()).toEqual({ from: "refunds" });
    expect(ordersHandler).toHaveBeenCalledTimes(1);
    expect(refundsHandler).toHaveBeenCalledTimes(1);
  });

  it("returns 500 idempotency_claim_lost (not a silent 2xx) when the claim is reclaimed before complete() can record it", async () => {
    const scriptedStore: IdempotencyStore = {
      claim: async () => ({ kind: "own", token: "token-1" }) as ClaimOutcome,
      complete: async () => false, // simulates "reclaimed while handler ran"
      release: async () => {},
      extend: async () => true,
    };
    const handler = vi.fn(async () => Response.json({ orderId: "order-1" }, { status: 201 }));
    const wrapped = withRoute(handler, { store: scriptedStore, ...UNSCOPED });

    const res = await wrapped(req({ "Idempotency-Key": "k1" }), undefined);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("idempotency_claim_lost");
  });

  it("does NOT release the claim when complete() throws after handler succeeded (a retry must not re-run handler)", async () => {
    const release = vi.fn(async () => {});
    const scriptedStore: IdempotencyStore = {
      claim: async () => ({ kind: "own", token: "token-1" }) as ClaimOutcome,
      complete: async () => {
        throw new Error("DB outage");
      },
      release,
      extend: async () => true,
    };
    const handler = vi.fn(async () => Response.json({ orderId: "order-1" }, { status: 201 }));
    const wrapped = withRoute(handler, { store: scriptedStore, ...UNSCOPED });

    const res = await wrapped(req({ "Idempotency-Key": "k1" }), undefined);

    expect(res.status).toBe(500);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
  });

  it("heartbeats the claim while a slow handler runs, so a concurrent retry sees in_progress instead of reclaiming mid-flight", async () => {
    vi.useFakeTimers();
    try {
      const store = new InMemoryIdempotencyStore();
      let concurrentStatus: number | undefined;
      let wrapped!: ReturnType<typeof withRoute>;
      const handler = vi.fn(async () => {
        // Outlives the original ttlMs (300ms) — without a working
        // heartbeat this claim would be reclaimable by the time this
        // concurrent request runs.
        await vi.advanceTimersByTimeAsync(400);
        const concurrent = await wrapped(req({ "Idempotency-Key": "k1" }), undefined);
        concurrentStatus = concurrent.status;
        return Response.json({ ok: true });
      });
      wrapped = withRoute(handler, {
        store,
        getScope: async () => "system",
        namespace: "slow-route",
        ttlMs: 300,
      });

      await wrapped(req({ "Idempotency-Key": "k1" }), undefined);

      expect(concurrentStatus).toBe(409);
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("encodes scope+namespace collision-resistantly — a ':'-containing tenant scope does not collide with a different namespace split", async () => {
    const store = new InMemoryIdempotencyStore();
    const handlerA = vi.fn(async () => Response.json({ from: "A" }, { status: 201 }));
    const handlerB = vi.fn(async () => Response.json({ from: "B" }, { status: 201 }));

    // callerScope="a:b", namespace="c"  vs  callerScope="a", namespace="b:c"
    // — a naive `${scope}:${namespace}` template produces "a:b:c" for BOTH.
    const routeA = withRoute(handlerA, { store, getScope: async () => "a:b", namespace: "c" });
    const routeB = withRoute(handlerB, { store, getScope: async () => "a", namespace: "b:c" });

    const resA = await routeA(req({ "Idempotency-Key": "k1" }), undefined);
    const resB = await routeB(req({ "Idempotency-Key": "k1" }), undefined);

    expect(await resA.json()).toEqual({ from: "A" });
    expect(await resB.json()).toEqual({ from: "B" }); // NOT a replay of routeA's response
    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
  });
});
