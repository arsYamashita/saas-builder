/**
 * Preset Map — central registry of template preset values.
 *
 * When adding a new template:
 *   1. Create lib/templates/<template-name>.ts with a Partial<ProjectFormValues> export
 *   2. Import it here and add to PRESET_MAP
 *
 * This is the ONLY place preset imports are gathered.
 * UI pages import from here — never from individual preset files directly.
 */

import type { ProjectFormValues } from "@/types/project";
import { membershipContentAffiliatePreset } from "./membership-content-affiliate";
import { reservationSaasPreset } from "./reservation-saas";
import { simpleCrmSaasPreset } from "./simple-crm-saas";
import { communityMembershipSaasPreset } from "./community-membership-saas";
import { internalAdminOpsSaasPreset } from "./internal-admin-ops-saas";

export const PRESET_MAP: Record<string, Partial<ProjectFormValues>> = {
  membership_content_affiliate: membershipContentAffiliatePreset,
  reservation_saas: reservationSaasPreset,
  simple_crm_saas: simpleCrmSaasPreset,
  community_membership_saas: communityMembershipSaasPreset,
  internal_admin_ops_saas: internalAdminOpsSaasPreset,
};

/** Get preset for a template key. Returns undefined if no preset exists. */
export function getPreset(
  templateKey: string
): Partial<ProjectFormValues> | undefined {
  return PRESET_MAP[templateKey];
}
