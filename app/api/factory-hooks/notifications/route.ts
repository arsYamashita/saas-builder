/**
 * Factory Hooks — Notifications API
 *
 * GET /api/factory-hooks/notifications
 *
 * Read-only listing/filtering of notification decisions.
 * Query params: severity, decision, eventType, limit
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listNotificationDecisions,
  useInMemoryStore,
  type NotificationSeverity,
  type NotificationDecisionType,
} from "@/lib/factory/notification-policy-layer";
import { type FactoryEventType } from "@/lib/factory/external-automation-hooks";

export async function GET(req: NextRequest) {
  try {
    useInMemoryStore();

    const { searchParams } = req.nextUrl;
    const severity = searchParams.get("severity") as NotificationSeverity | null;
    const decision = searchParams.get("decision") as NotificationDecisionType | null;
    const eventType = searchParams.get("eventType") as FactoryEventType | null;
    const limitStr = searchParams.get("limit");
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;

    const decisions = listNotificationDecisions({
      severity: severity ?? undefined,
      decision: decision ?? undefined,
      eventType: eventType ?? undefined,
      limit,
    });

    return NextResponse.json({
      decisions,
      count: decisions.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[factory-hooks/notifications] Error:", err);
    return NextResponse.json(
      { error: "Failed to list notification decisions" },
      { status: 500 },
    );
  }
}
