import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const TEMPLATE_LABELS: Record<string, string> = {
  membership_content_affiliate: "会員コンテンツ配信",
  reservation_saas: "予約管理 SaaS",
  simple_crm_saas: "顧客管理 CRM",
  community_membership_saas: "コミュニティ会員制",
  internal_admin_ops_saas: "社内管理オペレーション",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectName = searchParams.get("name") ?? "SaaS Project";
  const templateKey = searchParams.get("template") ?? "";
  const fileCount = searchParams.get("files") ?? "0";
  const duration = searchParams.get("duration") ?? "0";
  const quality = searchParams.get("quality") ?? "passed";

  const templateLabel = TEMPLATE_LABELS[templateKey] ?? templateKey;
  const durationSec = parseInt(duration, 10);
  const min = Math.floor(durationSec / 60);
  const sec = durationSec % 60;
  const durationText =
    min > 0 ? `${min}分${sec}秒` : `${sec}秒`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
          padding: "60px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              color: "#94a3b8",
              fontSize: "24px",
              marginBottom: "16px",
            }}
          >
            AI SaaS Builder
          </div>
          <div
            style={{
              color: "#ffffff",
              fontSize: "48px",
              fontWeight: "bold",
              marginBottom: "24px",
              lineHeight: 1.2,
            }}
          >
            {projectName}
          </div>
          {templateLabel && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "32px",
              }}
            >
              <div
                style={{
                  background: "#1e40af",
                  color: "#93c5fd",
                  padding: "6px 16px",
                  borderRadius: "9999px",
                  fontSize: "20px",
                }}
              >
                {templateLabel}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              gap: "32px",
              color: "#e2e8f0",
              fontSize: "28px",
            }}
          >
            <span>{fileCount} files</span>
            <span>{durationText}</span>
          </div>
          <div
            style={{
              display: "flex",
              gap: "16px",
              color: quality === "passed" ? "#86efac" : "#fca5a5",
              fontSize: "20px",
            }}
          >
            <span>lint {quality === "passed" ? "OK" : "NG"}</span>
            <span>TypeScript {quality === "passed" ? "OK" : "NG"}</span>
            <span>Playwright {quality === "passed" ? "OK" : "NG"}</span>
          </div>
          <div style={{ color: "#64748b", fontSize: "20px", marginTop: "8px" }}>
            SaaSを、つくれる人に。
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
