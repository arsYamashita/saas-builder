/**
 * SaaS Builder Template Adapter
 *
 * Implements TemplateCatalogAdapter using SaaS Builder's template-catalog.ts.
 * Bridges the idea discovery engine with the template system.
 */

import type { TemplateCatalogAdapter, TemplateMatch, NewTemplateProposal } from "../core/types";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";
import { getRecommendations, type RecommendationInput } from "@/lib/templates/template-recommendation";

export class SaaSBuilderTemplateAdapter implements TemplateCatalogAdapter {
  /**
   * List all available templates in the SaaS Builder catalog.
   */
  listTemplates(): Array<{
    key: string;
    domain: string;
    features: string[];
    roles: string[];
  }> {
    return TEMPLATE_CATALOG.map((entry) => ({
      key: entry.templateKey,
      domain: "general", // SaaS Builder templates are multi-domain
      features: this.extractFeaturesFromCatalogEntry(entry),
      roles: entry.coreEntities || [],
    }));
  }

  /**
   * Match required features and roles against the template catalog.
   * Uses rule-based template recommendation engine.
   */
  matchFeatures(requiredFeatures: string[], roles: string[]): TemplateMatch {
    // Build recommendation input from features and roles
    const input: RecommendationInput = {
      summary: requiredFeatures.join(" "),
      targetUsers: roles.join(" "),
      requiredFeatures,
      managedData: roles,
      billingModel: this.inferBillingModel(requiredFeatures),
      affiliateEnabled: this.hasAffiliateFeature(requiredFeatures),
    };

    // Get top recommendations
    const recommendations = getRecommendations(input);

    if (recommendations.length === 0) {
      // No match found - gap detected
      return {
        type: "gap_detected",
        templateKey: null,
        confidence: 0,
        reasons: ["No matching template found in catalog"],
        suggestedNewTemplate: this.generateGapProposal(requiredFeatures, roles),
      };
    }

    const topRecommendation = recommendations[0];

    // High confidence match (score >= 3)
    if (topRecommendation.score >= 3) {
      return {
        type: "matched",
        templateKey: topRecommendation.templateKey,
        confidence: Math.min(topRecommendation.score * 25, 100), // Score 1-4 -> confidence 25-100
        reasons: topRecommendation.reasons,
        suggestedNewTemplate: null,
      };
    }

    // Partial match with lower confidence
    return {
      type: "gap_detected",
      templateKey: topRecommendation.templateKey,
      confidence: topRecommendation.score * 25,
      reasons: [
        `Partial match: ${topRecommendation.reasons.join(", ")}`,
        "Confidence below threshold for full match",
      ],
      suggestedNewTemplate: this.generateGapProposal(requiredFeatures, roles, topRecommendation.templateKey),
    };
  }

  private extractFeaturesFromCatalogEntry(
    entry: any,
  ): string[] {
    const features: string[] = [];

    // Extract from label and description
    const label = entry.label.toLowerCase();
    if (label.includes("会員")) features.push("membership");
    if (label.includes("コンテンツ")) features.push("content");
    if (label.includes("予約")) features.push("reservation");
    if (label.includes("crm")) features.push("crm");
    if (label.includes("管理")) features.push("admin");

    // Add billing info
    if (entry.includesBilling) features.push("billing");
    if (entry.includesAffiliate) features.push("affiliate");

    // Add core entities
    if (entry.coreEntities) {
      features.push(...entry.coreEntities);
    }

    return features;
  }

  private inferBillingModel(features: string[]): string {
    const featuresStr = features.join(" ").toLowerCase();

    if (
      featuresStr.includes("subscription") &&
      featuresStr.includes("one_time")
    ) {
      return "hybrid";
    }
    if (featuresStr.includes("subscription")) {
      return "subscription";
    }
    if (featuresStr.includes("one_time")) {
      return "one_time";
    }

    return "none";
  }

  private hasAffiliateFeature(features: string[]): boolean {
    return features.some((f) =>
      f.toLowerCase().includes("affiliate"),
    );
  }

  private generateGapProposal(
    requiredFeatures: string[],
    roles: string[],
    matchedTemplateKey?: string,
  ): NewTemplateProposal {
    // Infer domain from features and roles
    let domain = "general";
    const featureStr = requiredFeatures.join(" ").toLowerCase();
    const roleStr = roles.join(" ").toLowerCase();
    const allText = `${featureStr} ${roleStr}`;

    if (allText.includes("reservation") || allText.includes("booking")) {
      domain = "reservation_services";
    } else if (
      allText.includes("crm") ||
      allText.includes("contact") ||
      allText.includes("deal")
    ) {
      domain = "sales_crm";
    } else if (
      allText.includes("content") ||
      allText.includes("membership") ||
      allText.includes("サロン")
    ) {
      domain = "content_membership";
    } else if (
      allText.includes("community") ||
      allText.includes("コミュニティ")
    ) {
      domain = "community";
    } else if (
      allText.includes("admin") ||
      allText.includes("approval") ||
      allText.includes("workflow")
    ) {
      domain = "internal_admin";
    }

    return {
      domain,
      description: `New template for: ${requiredFeatures.slice(0, 3).join(", ")}`,
      estimatedEntityCount: Math.ceil(roles.length * 1.5),
      estimatedComplexity: this.estimateComplexity(requiredFeatures),
      whyNew: matchedTemplateKey
        ? `Partially matches ${matchedTemplateKey} but requires additional customization`
        : "No existing template matches required features",
      relatedTemplates: matchedTemplateKey ? [matchedTemplateKey] : [],
    };
  }

  private estimateComplexity(
    features: string[],
  ): "simple" | "medium" | "complex" {
    if (features.length <= 3) return "simple";
    if (features.length <= 6) return "medium";
    return "complex";
  }
}
