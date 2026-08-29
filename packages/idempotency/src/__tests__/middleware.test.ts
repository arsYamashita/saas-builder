import { describe, it, expect, vi } from "vitest";
import { withRoute } from "../middleware";
import { InMemoryIdempotencyStore } from "../store";

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/orders", { method: "POST", headers });
}

describe("withRoute", () => {
  it("400s a required Idempotency-Key that is missing", async () => {
    const store = new InMemoryIdempotencyStore();
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const wrapped = withRoute(handler, { store });

    const res = await wrapped(req(), undefined);

    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes requests through unguarded when required: false and header is absent", async () => {
    const store = new InMemoryIdempotencyStore();
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const wrapped = withRoute(handler, { store, required: false });

    const res = await wrapped(req(), undefined);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("runs the handler once and returns its response for a fresh key", async () => {
    const store = new InMemoryIdempotencyStore();
    const handler = vi.fn(async () => Response.json({ orderId: "order-1" }, { status: 201 }));
    const wrapped = withRoute(handler, { store });

    const res = await wrapped(req({ "Idempotency-Key": "k1" }), undefined);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ orderId: "order-1" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("replays the SAME response for a retried request with the same key, without re-running the handler", async () => {
    const store = new InMemoryIdempotencyStore();
    const handler = vi.fn(async () => Response.json({ orderId: "order-1" }, { status: 201 }));
    const wrapped = withRoute(handler, { store });

    const first = await wrapped(req({ "Idempotency-Key": "k1" }), undefined);
    const second = await wrapped(req({ "Idempotency-Key": "k1" }), undefined);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(first.status);
    expect(await second.json()).toEqual(await first.clone().json());
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
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
    const wrapped = withRoute(handler, { store });

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
    const wrapped = withRoute(handler, { store });

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
      getScope: async (r) => r.headers.get("x-tenant") ?? "unscoped",
    });

    const resA = await wrapped(req({ "Idempotency-Key": "same-key", "x-tenant": "tenant-a" }), undefined);
    const resB = await wrapped(req({ "Idempotency-Key": "same-key", "x-tenant": "tenant-b" }), undefined);

    expect(await resA.json()).toEqual({ processedFor: "tenant-a" });
    expect(await resB.json()).toEqual({ processedFor: "tenant-b" }); // NOT a replay of tenant-a's response
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
