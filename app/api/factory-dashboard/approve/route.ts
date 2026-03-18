/**
 * Factory Dashboard — Approval Decision API
 *
 * POST /api/factory-dashboard/approve
 * Body: { proposalId: string, decision: "approved" | "rejected" | "deferred", notes?: string, actorId?: string, role?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  submitApprovalDecision,
  type ApprovalDecision,
} from "@/lib/factory/human-approval-workflow";
import {
  resolveActorRole,
  authorizeFactoryAction,
  proposalDecisionToAction,
  ALL_ROLES,
  type FactoryRole,
} from "@/lib/factory/team-role-approval";

const VALID_DECISIONS: ApprovalDecision[] = ["approved", "rejected", "deferred"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { proposalId, decision, notes, actorId, role } = body as {
      proposalId?: string;
      decision?: string;
      notes?: string;
      actorId?: string;
      role?: string;
    };

    if (!proposalId || typeof proposalId !== "string") {
      return NextResponse.json(
        { error: "proposalId is required" },
        { status: 400 },
      );
    }

    if (!decision || !VALID_DECISIONS.includes(decision as ApprovalDecision)) {
      return NextResponse.json(
        { error: `decision must be one of: ${VALID_DECISIONS.join(", ")}` },
        { status: 400 },
      );
    }

    // Authorization check
    const resolvedRole = (role && ALL_ROLES.includes(role as FactoryRole))
      ? role as FactoryRole
      : "viewer";
    const actor = resolveActorRole(actorId ?? "dashboard", resolvedRole);
    const factoryAction = proposalDecisionToAction(decision);

    if (factoryAction) {
      const authResult = authorizeFactoryAction(actor, factoryAction);
      if (!authResult.allowed) {
        return NextResponse.json(
          { error: authResult.reason },
          { status: 403 },
        );
      }
    }

    const record = submitApprovalDecision(
      proposalId,
      decision as ApprovalDecision,
      actor.actorId,
      notes ?? "",
    );

    if (!record) {
      return NextResponse.json(
        { error: `Proposal "${proposalId}" not found` },
        { status: 404 },
      );
    }

    return NextResponse.json(record);
  } catch (err) {
    console.error("[factory-dashboard/approve] Error:", err);
    return NextResponse.json(
      { error: "Failed to submit approval decision" },
      { status: 500 },
    );
  }
}
