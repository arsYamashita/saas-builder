/**
 * Factory Hooks — Trigger API
 *
 * POST /api/factory-hooks/trigger
 *
 * Safe inbound trigger requests.
 * Body: { triggerType, actorId, role, parameters }
 *
 * Enforces role authorization and governance gating.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  executeInboundTrigger,
  useInMemoryStore,
  type TriggerType,
} from "@/lib/factory/external-automation-hooks";
import { resolveActorRole, type FactoryRole } from "@/lib/factory/team-role-approval";
import {
  useInMemoryStore as useGovernanceStore,
} from "@/lib/factory/scenario-execution-governance";
import {
  useInMemoryStore as useBridgeStore,
} from "@/lib/factory/scenario-execution-bridge";
import {
  useInMemoryStore as useRuntimeStore,
} from "@/lib/factory/factory-runtime-execution";

interface TriggerBody {
  triggerType: string;
  actorId: string;
  role: string;
  parameters: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TriggerBody;

    if (!body.triggerType || !body.actorId || !body.role) {
      return NextResponse.json(
        { error: "triggerType, actorId, and role are required" },
        { status: 400 },
      );
    }

    // Enable in-memory stores for API context
    useInMemoryStore();
    useGovernanceStore();
    useBridgeStore();
    useRuntimeStore();

    const actor = resolveActorRole(body.actorId, body.role as FactoryRole);
    const result = executeInboundTrigger(
      body.triggerType as TriggerType,
      actor,
      body.parameters ?? {},
    );

    const statusCode = result.status === "completed" || result.status === "accepted"
      ? 200
      : result.status === "blocked"
        ? 403
        : 400;

    return NextResponse.json(result, { status: statusCode });
  } catch (err) {
    console.error("[factory-hooks/trigger] Error:", err);
    return NextResponse.json(
      { error: "Failed to process trigger request" },
      { status: 500 },
    );
  }
}
