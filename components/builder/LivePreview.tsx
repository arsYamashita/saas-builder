"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──

interface PreviewRoute {
  path: string;
  label: string;
  fileId: string;
}

type DeviceMode = "desktop" | "tablet" | "mobile";

interface LivePreviewProps {
  projectId: string;
  /** If true, the panel is expanded */
  isOpen: boolean;
  /** Toggle callback */
  onToggle: () => void;
  /** Optional: auto-refresh when generation completes */
  refreshKey?: number;
}

// ── Device Presets ──

const DEVICE_PRESETS: Record<DeviceMode, { width: number; label: string; icon: string }> = {
  desktop: { width: 1280, label: "Desktop", icon: "🖥️" },
  tablet: { width: 768, label: "Tablet", icon: "📱" },
  mobile: { width: 375, label: "Mobile", icon: "📲" },
};

// ── Component ──

export default function LivePreview({
  projectId,
  isOpen,
  onToggle,
  refreshKey = 0,
}: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<PreviewRoute[]>([]);
  const [activeRoute, setActiveRoute] = useState("/");
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [darkMode, setDarkMode] = useState(false);
  const [previewMode, setPreviewMode] = useState<"full" | "wireframe" | "empty">("empty");
  const [error, setError] = useState<string | null>(null);

  // ── Load Preview ──

  const loadPreview = useCallback(
    async (route?: string) => {
      setLoading(true);
      setError(null);

      const targetRoute = route || activeRoute;
      const params = new URLSearchParams({
        route: targetRoute,
        darkMode: String(darkMode),
        width: String(DEVICE_PRESETS[device].width),
      });

      try {
        const res = await fetch(
          `/api/projects/${projectId}/preview?${params.toString()}`
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Preview failed" }));
          setError(err.error || "Preview failed");
          setLoading(false);
          return;
        }

        // Parse route info from headers
        const routesHeader = res.headers.get("X-Preview-Routes");
        if (routesHeader) {
          try {
            setRoutes(JSON.parse(routesHeader));
          } catch {
            // ignore parse errors
          }
        }

        const mode = res.headers.get("X-Preview-Mode");
        if (mode === "wireframe") setPreviewMode("wireframe");
        else if (mode === "empty") setPreviewMode("empty");
        else setPreviewMode("full");

        const html = await res.text();

        // Write HTML to iframe via srcdoc
        if (iframeRef.current) {
          iframeRef.current.srcdoc = html;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
      }
    },
    [projectId, activeRoute, darkMode, device]
  );

  // ── Load on open / refresh ──

  useEffect(() => {
    if (isOpen) {
      loadPreview();
    }
  }, [isOpen, refreshKey, loadPreview]);

  // ── Listen for iframe messages ──

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "preview-navigate") {
        const newRoute = event.data.path;
        setActiveRoute(newRoute);
        loadPreview(newRoute);
      }
      if (event.data?.type === "preview-ready") {
        setLoading(false);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [loadPreview]);

  // ── Refresh handler ──

  const handleRefresh = () => {
    loadPreview();
  };

  // ── Route change ──

  const handleRouteChange = (path: string) => {
    setActiveRoute(path);
    loadPreview(path);
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-4 bottom-4 z-50 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-full shadow-lg flex items-center gap-2 transition-all hover:scale-105"
        title="プレビューを開く"
      >
        <span className="text-lg">👁️</span>
        <span className="font-medium text-sm">Preview</span>
      </button>
    );
  }

  const deviceWidth = DEVICE_PRESETS[device].width;

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex flex-col bg-white border-l border-gray-200 shadow-2xl"
      style={{ width: "min(55vw, 800px)" }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggle}
            className="text-gray-400 hover:text-gray-600 text-lg"
            title="閉じる"
          >
            ✕
          </button>
          <h3 className="text-sm font-semibold text-gray-700">
            Live Preview
          </h3>
          {previewMode === "wireframe" && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              Wireframe
            </span>
          )}
          {previewMode === "full" && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              Generated
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Dark mode toggle */}
          <button
            onClick={() => {
              setDarkMode(!darkMode);
              setTimeout(() => loadPreview(), 50);
            }}
            className={`text-sm px-2 py-1 rounded transition-colors ${
              darkMode
                ? "bg-gray-800 text-yellow-300"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            title="ダークモード切替"
          >
            {darkMode ? "🌙" : "☀️"}
          </button>

          {/* Device switcher */}
          {(Object.keys(DEVICE_PRESETS) as DeviceMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setDevice(mode);
                setTimeout(() => loadPreview(), 50);
              }}
              className={`text-sm px-2 py-1 rounded transition-colors ${
                device === mode
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
              title={DEVICE_PRESETS[mode].label}
            >
              {DEVICE_PRESETS[mode].icon}
            </button>
          ))}

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-sm px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50 transition-colors"
            title="リフレッシュ"
          >
            {loading ? "⏳" : "🔄"}
          </button>
        </div>
      </div>

      {/* ── Route Tabs ── */}
      {routes.length > 1 && (
        <div className="flex items-center gap-1 px-4 py-1.5 bg-gray-50 border-b border-gray-100 overflow-x-auto">
          {routes.map((r) => (
            <button
              key={r.path}
              onClick={() => handleRouteChange(r.path)}
              className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition-colors ${
                activeRoute === r.path
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* ── URL Bar ── */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-white border-b border-gray-100">
        <span className="text-xs text-gray-400">🔒</span>
        <div className="flex-1 bg-gray-50 rounded px-3 py-1 text-xs text-gray-500 font-mono truncate">
          preview://localhost{activeRoute}
        </div>
      </div>

      {/* ── Error Display ── */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600">
          ⚠️ {error}
        </div>
      )}

      {/* ── iframe ── */}
      <div className="flex-1 overflow-hidden bg-gray-100 flex items-start justify-center p-4">
        <div
          className="bg-white shadow-lg rounded-lg overflow-hidden transition-all duration-300"
          style={{
            width: device === "desktop" ? "100%" : `${deviceWidth}px`,
            height: "100%",
            maxWidth: "100%",
          }}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <div className="flex items-center gap-2 text-gray-500">
                <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                <span className="text-sm">プレビュー読み込み中...</span>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
            title="SaaS Live Preview"
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
        <span>
          {previewMode === "full"
            ? `${routes.length} routes`
            : previewMode === "wireframe"
            ? "Blueprint wireframe"
            : "No content"}
        </span>
        <span>{deviceWidth}px</span>
      </div>
    </div>
  );
}
