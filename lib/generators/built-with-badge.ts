/**
 * Generates the "Built with SaaS Builder" badge component
 * that gets included in every generated SaaS application.
 *
 * This is the primary viral growth loop - every deployed app
 * links back to SaaS Builder with a project-specific referral param.
 *
 * Free tier: badge is always visible.
 * Paid tier: badge can be removed (controlled by the generated app's env).
 */

const SAAS_BUILDER_URL = "https://saas-builder-cyan.vercel.app";

export function generateBuiltWithBadge(projectId: string): string {
  return `"use client";

// Built with SaaS Builder - ${SAAS_BUILDER_URL}
// This badge is included in the free tier. Upgrade to remove it.

import { useState } from "react";

export function BuiltWithBadge() {
  const [hovered, setHovered] = useState(false);

  // Allow removal via environment variable (paid tier)
  if (process.env.NEXT_PUBLIC_HIDE_BUILT_WITH_BADGE === "true") {
    return null;
  }

  return (
    <a
      href="${SAAS_BUILDER_URL}?ref=${projectId}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Built with SaaS Builder"
      style={{
        position: "fixed",
        bottom: "16px",
        right: "16px",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        borderRadius: "9999px",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        color: "white",
        fontSize: "12px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        textDecoration: "none",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
        zIndex: 9999,
        opacity: hovered ? 1 : 0.7,
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
        <rect x="9" y="9" width="6" height="6" />
        <line x1="9" y1="1" x2="9" y2="4" />
        <line x1="15" y1="1" x2="15" y2="4" />
        <line x1="9" y1="20" x2="9" y2="23" />
        <line x1="15" y1="20" x2="15" y2="23" />
        <line x1="20" y1="9" x2="23" y2="9" />
        <line x1="20" y1="14" x2="23" y2="14" />
        <line x1="1" y1="9" x2="4" y2="9" />
        <line x1="1" y1="14" x2="4" y2="14" />
      </svg>
      Built with SaaS Builder
    </a>
  );
}
`;
}

/**
 * Returns the file path where the badge component should live
 * in the generated project.
 */
export function getBadgeFilePath(): string {
  return "components/built-with-badge.tsx";
}
