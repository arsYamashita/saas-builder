/**
 * Lightweight blueprint diff: compares latest vs previous blueprint
 * at the name/field level (not deep JSON diff).
 */

import {
  extractBlueprintSummary,
  type BlueprintSummary,
} from "./blueprint-preview";

export interface BlueprintFieldChange {
  field: string;
  from: string;
  to: string;
}

export interface BlueprintDiff {
  hasDiffSource: boolean;
  latestVersion: number;
  previousVersion: number;
  changedFields: BlueprintFieldChange[];
  addedEntities: string[];
  removedEntities: string[];
  addedRoles: string[];
  removedRoles: string[];
  addedScreens: string[];
  removedScreens: string[];
  billingChanged: boolean;
  affiliateChanged: boolean;
  hasAnyChange: boolean;
}

type BlueprintRaw = {
  version: number;
  prd_json: unknown;
  entities_json: unknown;
  screens_json: unknown;
  roles_json: unknown;
  billing_json: unknown;
  affiliate_json: unknown;
};

export function computeBlueprintDiff(
  blueprints: BlueprintRaw[]
): BlueprintDiff | null {
  if (blueprints.length < 2) return null;

  const sorted = [...blueprints].sort((a, b) => b.version - a.version);
  const latest = extractBlueprintSummary(sorted[0]);
  const previous = extractBlueprintSummary(sorted[1]);

  const changedFields = diffProductFields(previous, latest);
  const addedEntities = diffNames(
    previous.entities.map((e) => e.name),
    latest.entities.map((e) => e.name)
  ).added;
  const removedEntities = diffNames(
    previous.entities.map((e) => e.name),
    latest.entities.map((e) => e.name)
  ).removed;
  const addedRoles = diffNames(
    previous.roles.map((r) => r.name),
    latest.roles.map((r) => r.name)
  ).added;
  const removedRoles = diffNames(
    previous.roles.map((r) => r.name),
    latest.roles.map((r) => r.name)
  ).removed;
  const addedScreens = diffNames(
    previous.screens.map((s) => s.name),
    latest.screens.map((s) => s.name)
  ).added;
  const removedScreens = diffNames(
    previous.screens.map((s) => s.name),
    latest.screens.map((s) => s.name)
  ).removed;
  const billingChanged = previous.billingEnabled !== latest.billingEnabled;
  const affiliateChanged =
    previous.affiliateEnabled !== latest.affiliateEnabled;

  const hasAnyChange =
    changedFields.length > 0 ||
    addedEntities.length > 0 ||
    removedEntities.length > 0 ||
    addedRoles.length > 0 ||
    removedRoles.length > 0 ||
    addedScreens.length > 0 ||
    removedScreens.length > 0 ||
    billingChanged ||
    affiliateChanged;

  return {
    hasDiffSource: true,
    latestVersion: latest.version,
    previousVersion: previous.version,
    changedFields,
    addedEntities,
    removedEntities,
    addedRoles,
    removedRoles,
    addedScreens,
    removedScreens,
    billingChanged,
    affiliateChanged,
    hasAnyChange,
  };
}

function diffProductFields(
  prev: BlueprintSummary,
  next: BlueprintSummary
): BlueprintFieldChange[] {
  const fields: { field: string; from: string; to: string }[] = [];
  const keys = ["name", "problem", "target", "category"] as const;
  for (const k of keys) {
    if (prev.product[k] !== next.product[k]) {
      fields.push({ field: k, from: prev.product[k], to: next.product[k] });
    }
  }
  return fields;
}

function diffNames(
  prevNames: string[],
  nextNames: string[]
): { added: string[]; removed: string[] } {
  const prevSet = new Set(prevNames);
  const nextSet = new Set(nextNames);
  return {
    added: nextNames.filter((n) => !prevSet.has(n)),
    removed: prevNames.filter((n) => !nextSet.has(n)),
  };
}
