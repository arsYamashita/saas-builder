import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "SaaS Builder -- AIでSaaSを構築";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 100%)",
          fontFamily: "sans-serif",
          color: "white",
          padding: "60px",
        }}
      >
        {/* Decorative grid dots */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            opacity: 0.08,
            backgroundImage:
              "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }}
        />

        {/* Logo area */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              fontWeight: 800,
              border: "2px solid rgba(255,255,255,0.25)",
            }}
          >
            S
          </div>
          <span
            style={{
              fontSize: "48px",
              fontWeight: 800,
              letterSpacing: "-1px",
            }}
          >
            SaaS Builder
          </span>
        </div>

        {/* Main tagline */}
        <div
          style={{
            fontSize: "64px",
            fontWeight: 800,
            lineHeight: 1.2,
            textAlign: "center",
            marginBottom: "20px",
            letterSpacing: "-1px",
          }}
        >
          AIでSaaSを、誰でも。
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "26px",
            fontWeight: 400,
            opacity: 0.85,
            textAlign: "center",
            marginBottom: "40px",
            lineHeight: 1.5,
          }}
        >
          Geminiが設計。Claudeがコード。あなたはアイデアだけ。
        </div>

        {/* Tech stack badges */}
        <div
          style={{
            display: "flex",
            gap: "16px",
          }}
        >
          {["Next.js", "Supabase", "Gemini", "Claude"].map((tech) => (
            <div
              key={tech}
              style={{
                padding: "10px 24px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                fontSize: "18px",
                fontWeight: 600,
              }}
            >
              {tech}
            </div>
          ))}
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: "absolute",
            bottom: "30px",
            fontSize: "16px",
            opacity: 0.5,
            fontWeight: 500,
          }}
        >
          saas-builder-cyan.vercel.app
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
