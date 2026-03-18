/**
 * Notification Escalation Rules v2 — API Route
 *
 * GET /api/factory-hooks/notification-escalations
 *
 * Query params:
 *   ?severity=critical
 *   ?level=2
 *   ?eventType=runtime.job.failed
 *   ?decision=notify
 *   ?limit=50
 */

import { NextRequest, NextResponse } from "next/server";
import {
  evaluateNotificationEscalation,
  listNotificationEscalations,
  buildNotificationEscalationReport,
  useInMemoryStore,
  type EscalationLevel,
  type EscalationDecisionType,
} from "@/lib/factory/notification-escalation-rules";
import {
  useInMemoryStore as useHooksStore,
  type FactoryEventType,
} from "@/lib/factory/external-automation-hooks";
import {
  useInMemoryStore as useNotificationStore,
  type NotificationSeverity,
} from "@/lib/factory/notification-policy-layer";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const severity = searchParams.get("severity") as NotificationSeverity | null;
    const levelStr = searchParams.get("level");
    const eventType = searchParams.get("eventType") as FactoryEventType | null;
    const decision = searchParams.get("decision") as EscalationDecisionType | null;
    const limitStr = searchParams.get("limit");
    const format = searchParams.get("format");

    const level = levelStr !== null ? (Number(levelStr) as EscalationLevel) : undefined;
    const limit = limitStr ? Number(limitStr) : undefined;

    // Initialize stores if needed
    useInMemoryStore();
    useHooksStore();
    useNotificationStore();

    // Evaluate escalations
    evaluateNotificationEscalation();

    if (format === "report") {
      const report = buildNotificationEscalationReport();
      return NextResponse.json(report);
    }

    const escalations = listNotificationEscalations({
      severity: severity ?? undefined,
      level,
      eventType: eventType ?? undefined,
      decision: decision ?? undefined,
      limit,
    });

    return NextResponse.json({
      escalations,
      total: escalations.length,
    });
  } catch (err) {
    console.error("[notification-escalations] Error:", err);
    return NextResponse.json(
      { error: "Failed to evaluate notification escalations" },
      { status: 500 },
    );
  }
}
