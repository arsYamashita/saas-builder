/**
 * Factory Hooks — Events API
 *
 * GET /api/factory-hooks/events
 *
 * Read-only listing of outbound factory events.
 * Query params: eventType, source, limit
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listFactoryEvents,
  useInMemoryStore,
  type FactoryEventType,
} from "@/lib/factory/external-automation-hooks";

export async function GET(req: NextRequest) {
  try {
    // Enable in-memory store for API context
    useInMemoryStore();

    const { searchParams } = req.nextUrl;
    const eventType = searchParams.get("eventType") as FactoryEventType | null;
    const source = searchParams.get("source") ?? undefined;
    const limitStr = searchParams.get("limit");
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;

    const events = listFactoryEvents({
      eventType: eventType ?? undefined,
      source,
      limit,
    });

    return NextResponse.json({
      events,
      count: events.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[factory-hooks/events] Error:", err);
    return NextResponse.json(
      { error: "Failed to list factory events" },
      { status: 500 },
    );
  }
}
