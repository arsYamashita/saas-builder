/**
 * Preview Assembler
 *
 * Assembles generated files into a single renderable HTML document
 * for iframe sandbox preview. Similar to blink.new / bolt.new approach.
 *
 * Strategy:
 *  1. Find page components from generatedFiles
 *  2. Wrap them in a minimal React/HTML shell with Tailwind CDN
 *  3. Output a self-contained HTML string renderable in an iframe
 */

// ── Types ──

export interface GeneratedFileRecord {
  id: string;
  file_category: string;
  file_path: string;
  language: string;
  version: number;
  status: string;
  source: string;
  content_text: string;
  title?: string | null;
  description?: string | null;
  created_at: string;
}

export interface PreviewRoute {
  path: string;
  label: string;
  fileId: string;
}

export interface PreviewBundle {
  html: string;
  routes: PreviewRoute[];
  fileCount: number;
  generatedAt: string;
}

// ── File Classification ──

function isPageFile(f: GeneratedFileRecord): boolean {
  return (
    f.file_category === "page" ||
    f.file_path.includes("/app/") ||
    f.file_path.includes("/pages/") ||
    f.file_path.match(/page\.(tsx|jsx|ts|js)$/) !== null
  );
}

function isComponentFile(f: GeneratedFileRecord): boolean {
  return (
    f.file_category === "component" ||
    f.file_path.includes("/components/")
  );
}

function isApiFile(f: GeneratedFileRecord): boolean {
  return (
    f.file_category === "api" ||
    f.file_path.includes("/api/") ||
    f.file_path.match(/route\.(ts|js)$/) !== null
  );
}

function isStyleFile(f: GeneratedFileRecord): boolean {
  return (
    f.language === "css" ||
    f.file_path.endsWith(".css") ||
    f.file_path.endsWith(".scss")
  );
}

function isLayoutFile(f: GeneratedFileRecord): boolean {
  return f.file_path.match(/layout\.(tsx|jsx|ts|js)$/) !== null;
}

// ── Route Extraction ──

function extractRoutePath(filePath: string): string {
  // app/(group)/some/page.tsx → /some
  // app/dashboard/page.tsx → /dashboard
  // pages/index.tsx → /
  let route = filePath
    .replace(/^(src\/)?(app|pages)\//, "")
    .replace(/\([\w-]+\)\//g, "") // remove route groups
    .replace(/page\.(tsx|jsx|ts|js)$/, "")
    .replace(/index\.(tsx|jsx|ts|js)$/, "")
    .replace(/\/$/, "");

  return "/" + route || "/";
}

function extractRouteLabel(routePath: string): string {
  if (routePath === "/" || routePath === "") return "Home";
  const segments = routePath.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── JSX/TSX to Plain JS Transform (lightweight) ──

/**
 * Very lightweight transform: strips TypeScript type annotations,
 * converts JSX to template literals for inline rendering.
 * This is NOT a full compiler — it handles the 80% case for preview.
 */
function stripTypeAnnotations(code: string): string {
  // Remove import type statements
  let result = code.replace(/^import\s+type\s+.*$/gm, "");
  // Remove type-only imports within import statements
  result = result.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]\s*;?/g, (match) => {
    // Keep the import but it will be handled by the shell
    return `// ${match}`;
  });
  // Remove TypeScript-specific syntax
  result = result.replace(/:\s*(string|number|boolean|any|void|never|unknown|null|undefined)(\[\])?\s*(;|\)|,|\}|\|)/g, "$3");
  result = result.replace(/<[A-Z]\w+(?:<[^>]+>)?>/g, ""); // generic type params
  result = result.replace(/as\s+\w+/g, "");
  result = result.replace(/interface\s+\w+\s*\{[^}]*\}/g, "");
  result = result.replace(/type\s+\w+\s*=\s*[^;]+;/g, "");
  return result;
}

// ── HTML Assembly ──

function extractInlineStyles(files: GeneratedFileRecord[]): string {
  const styleFiles = files.filter(isStyleFile);
  if (styleFiles.length === 0) return "";

  return styleFiles
    .map((f) => f.content_text)
    .join("\n");
}

function buildComponentRegistry(files: GeneratedFileRecord[]): string {
  const components = files.filter(isComponentFile);
  if (components.length === 0) return "";

  return components
    .map((f) => {
      const name = f.file_path
        .split("/")
        .pop()
        ?.replace(/\.(tsx|jsx|ts|js)$/, "") || "Unknown";
      return `// Component: ${name}\n// Source: ${f.file_path}\n// (Available in preview shell)`;
    })
    .join("\n\n");
}

/**
 * Assembles generated files into a self-contained HTML preview.
 */
export function assemblePreview(
  files: GeneratedFileRecord[],
  options: {
    selectedRoute?: string;
    darkMode?: boolean;
    deviceWidth?: number;
  } = {}
): PreviewBundle {
  const pages = files.filter(isPageFile);
  const layouts = files.filter(isLayoutFile);
  const styles = extractInlineStyles(files);
  const components = files.filter(isComponentFile);
  const apis = files.filter(isApiFile);

  // Build route list
  const routes: PreviewRoute[] = pages.map((f) => {
    const path = extractRoutePath(f.file_path);
    return {
      path,
      label: extractRouteLabel(path),
      fileId: f.id,
    };
  });

  // Sort routes: / first, then alphabetical
  routes.sort((a, b) => {
    if (a.path === "/") return -1;
    if (b.path === "/") return 1;
    return a.path.localeCompare(b.path);
  });

  // Find the active page
  const activeRoute = options.selectedRoute || routes[0]?.path || "/";
  const activePage = pages.find(
    (f) => extractRoutePath(f.file_path) === activeRoute
  ) || pages[0];

  // Find layout
  const layout = layouts[0];

  // Build component map for inline references
  const componentMap = components.reduce<Record<string, string>>((acc, f) => {
    const name = f.file_path
      .split("/")
      .pop()
      ?.replace(/\.(tsx|jsx|ts|js)$/, "") || "Component";
    acc[name] = f.content_text;
    return acc;
  }, {});

  // Build the page content for preview
  const pageContent = activePage?.content_text || "<p>No page content generated yet.</p>";

  // Determine the theme
  const isDark = options.darkMode ?? false;
  const bgColor = isDark ? "#0f172a" : "#ffffff";
  const textColor = isDark ? "#e2e8f0" : "#1e293b";

  const deviceWidth = options.deviceWidth || 1280;

  const html = `<!DOCTYPE html>
<html lang="ja" ${isDark ? 'class="dark"' : ""}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SaaS Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: { extend: {} }
    }
  </script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${bgColor};
      color: ${textColor};
      min-height: 100vh;
    }
    /* Reset for generated content */
    #preview-root { min-height: 100vh; }
    /* Custom styles from generated CSS files */
    ${styles}
  </style>
</head>
<body>
  <div id="preview-root"></div>

  <script type="text/babel" data-type="module">
    const { useState, useEffect, useCallback, useRef, useMemo } = React;

    // ── Mock Router ──
    const useRouter = () => ({
      push: (path) => { window.__PREVIEW_NAVIGATE?.(path); },
      back: () => {},
      forward: () => {},
      refresh: () => {},
      replace: (path) => { window.__PREVIEW_NAVIGATE?.(path); },
      pathname: "${activeRoute}",
    });
    const usePathname = () => "${activeRoute}";
    const useParams = () => ({});
    const useSearchParams = () => new URLSearchParams();
    const Link = ({ href, children, className, ...props }) =>
      React.createElement('a', {
        href: '#',
        className,
        onClick: (e) => { e.preventDefault(); window.__PREVIEW_NAVIGATE?.(href); },
        ...props
      }, children);
    const Image = ({ src, alt, width, height, className, ...props }) =>
      React.createElement('img', { src: src || '/placeholder.svg', alt, width, height, className, ...props });

    // ── Mock Data Hooks ──
    const useMockData = (key, fallback = []) => {
      const [data] = useState(fallback);
      return { data, loading: false, error: null };
    };

    // ── Stub Components ──
    ${Object.entries(componentMap)
      .map(([name, _content]) => {
        return `const ${name} = (props) => React.createElement('div', { className: 'border border-dashed border-gray-300 rounded p-4 my-2', 'data-component': '${name}' }, React.createElement('span', { className: 'text-xs text-gray-400' }, '${name}'), props.children);`;
      })
      .join("\n    ")}

    // ── Layout ──
    ${layout
      ? `const Layout = ({ children }) => {
      return React.createElement('div', { className: 'min-h-screen' }, children);
    };`
      : `const Layout = ({ children }) => React.createElement('div', { className: 'min-h-screen' }, children);`
    }

    // ── Page Component ──
    // Try to render the generated page; fall back to static HTML display
    let PageComponent;
    try {
      ${activePage
        ? `PageComponent = function GeneratedPage() {
        return (
          ${extractPageJSX(pageContent)}
        );
      };`
        : `PageComponent = function EmptyPage() {
        return React.createElement('div', {
          className: 'flex items-center justify-center min-h-screen text-gray-400'
        }, React.createElement('div', { className: 'text-center' },
          React.createElement('p', { className: 'text-6xl mb-4' }, '🏗️'),
          React.createElement('p', { className: 'text-xl' }, 'プレビュー準備中...'),
          React.createElement('p', { className: 'text-sm mt-2' }, 'Generate を実行してページを生成してください')
        ));
      };`
      }
    } catch (err) {
      PageComponent = function ErrorPage() {
        return React.createElement('div', {
          className: 'flex items-center justify-center min-h-screen bg-red-50 text-red-600'
        }, React.createElement('div', { className: 'text-center p-8' },
          React.createElement('p', { className: 'text-2xl mb-2' }, '⚠️ レンダリングエラー'),
          React.createElement('pre', { className: 'text-xs text-left bg-red-100 p-4 rounded max-w-lg overflow-auto' }, String(err))
        ));
      };
    }

    // ── App ──
    function App() {
      return React.createElement(Layout, null,
        React.createElement(PageComponent)
      );
    }

    const root = ReactDOM.createRoot(document.getElementById('preview-root'));
    root.render(React.createElement(App));

    // Navigation handler (called from parent via postMessage)
    window.__PREVIEW_NAVIGATE = (path) => {
      window.parent.postMessage({ type: 'preview-navigate', path }, '*');
    };

    // Notify parent that preview is ready
    window.parent.postMessage({ type: 'preview-ready', route: "${activeRoute}" }, '*');
  </script>
</body>
</html>`;

  return {
    html,
    routes,
    fileCount: files.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Extract JSX from page content.
 * Attempts to find the return statement's JSX; falls back to wrapping
 * the content in a static code display.
 */
function extractPageJSX(content: string): string {
  // Try to find default export function's return JSX
  const returnMatch = content.match(
    /return\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*\}[\s\S]*(?:export\s+default|$)/
  );
  if (returnMatch) {
    return returnMatch[1];
  }

  // Try to find JSX in simpler arrow function
  const arrowMatch = content.match(
    /=>\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*(?:export|$)/
  );
  if (arrowMatch) {
    return arrowMatch[1];
  }

  // Try to find any JSX-like content (starts with <)
  const jsxMatch = content.match(
    /return\s*\(\s*(<[\s\S]*?>[\s\S]*?<\/[\s\S]*?>)\s*\)/
  );
  if (jsxMatch) {
    return jsxMatch[1];
  }

  // Fallback: show a wireframe-style representation based on page content
  return `React.createElement('div', { className: 'min-h-screen bg-gray-50 p-6' },
    React.createElement('div', { className: 'max-w-4xl mx-auto' },
      React.createElement('div', { className: 'bg-white rounded-lg shadow p-6' },
        React.createElement('div', { className: 'flex items-center gap-2 mb-4' },
          React.createElement('div', { className: 'w-3 h-3 rounded-full bg-green-500' }),
          React.createElement('span', { className: 'text-sm text-gray-500' }, 'Generated Page Preview')
        ),
        React.createElement('pre', {
          className: 'text-xs bg-gray-50 p-4 rounded overflow-auto max-h-96 font-mono',
          style: { whiteSpace: 'pre-wrap' }
        }, ${JSON.stringify(content.slice(0, 3000))})
      )
    )
  )`;
}

/**
 * Generates a lightweight wireframe preview from blueprint data
 * when no generated files exist yet.
 */
export function assembleWireframePreview(blueprint: {
  screens_json: unknown;
  prd_json: unknown;
  entities_json: unknown;
}): PreviewBundle {
  const screens = Array.isArray(blueprint.screens_json) ? blueprint.screens_json : [];
  const prd = (blueprint.prd_json as Record<string, unknown>) || {};

  const routes: PreviewRoute[] = screens.map((s: Record<string, unknown>, i: number) => ({
    path: (s.path as string) || `/${(s.name as string || `screen-${i}`).toLowerCase().replace(/\s+/g, "-")}`,
    label: (s.name as string) || `Screen ${i + 1}`,
    fileId: `wireframe-${i}`,
  }));

  const activeScreen = screens[0] as Record<string, unknown> | undefined;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Blueprint Wireframe Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wireframe-box {
      border: 2px dashed #cbd5e1;
      border-radius: 8px;
      padding: 16px;
      margin: 8px 0;
      background: #f8fafc;
    }
    .wireframe-header {
      background: linear-gradient(135deg, #1e40af, #3b82f6);
      color: white;
      padding: 24px;
      border-radius: 8px 8px 0 0;
    }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="wireframe-header">
    <h1 class="text-2xl font-bold">${(prd.name as string) || "SaaS Application"}</h1>
    <p class="text-blue-200 text-sm mt-1">${(prd.problem as string) || "Blueprint wireframe preview"}</p>
  </div>

  <nav class="bg-white shadow px-6 py-3 flex gap-4 text-sm">
    ${screens
      .map(
        (s: Record<string, unknown>) =>
          `<a href="#" class="text-blue-600 hover:text-blue-800 font-medium">${s.name || "Page"}</a>`
      )
      .join("\n    ")}
  </nav>

  <main class="max-w-5xl mx-auto p-6">
    ${activeScreen
      ? `
    <div class="bg-white rounded-lg shadow-lg p-6">
      <h2 class="text-xl font-bold text-gray-800 mb-4">${activeScreen.name || "Screen"}</h2>
      <p class="text-gray-500 text-sm mb-6">${activeScreen.description || ""}</p>

      <div class="wireframe-box">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-8 h-8 bg-blue-100 rounded"></div>
          <div class="h-4 bg-gray-200 rounded w-32"></div>
        </div>
        <div class="space-y-2">
          <div class="h-4 bg-gray-200 rounded w-full"></div>
          <div class="h-4 bg-gray-200 rounded w-3/4"></div>
          <div class="h-4 bg-gray-200 rounded w-5/6"></div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 mt-4">
        <div class="wireframe-box">
          <div class="h-3 bg-gray-200 rounded w-20 mb-2"></div>
          <div class="h-8 bg-gray-100 rounded"></div>
        </div>
        <div class="wireframe-box">
          <div class="h-3 bg-gray-200 rounded w-20 mb-2"></div>
          <div class="h-8 bg-gray-100 rounded"></div>
        </div>
      </div>

      <div class="mt-6 flex gap-3">
        <div class="bg-blue-500 text-white px-6 py-2 rounded-lg text-sm font-medium">保存</div>
        <div class="bg-gray-200 text-gray-600 px-6 py-2 rounded-lg text-sm font-medium">キャンセル</div>
      </div>
    </div>`
      : `
    <div class="flex items-center justify-center min-h-[400px] text-gray-400">
      <div class="text-center">
        <p class="text-5xl mb-4">📐</p>
        <p class="text-lg">Blueprint にスクリーン定義がありません</p>
      </div>
    </div>`
    }

    <div class="mt-6 grid grid-cols-3 gap-4">
      ${screens
        .slice(1, 4)
        .map(
          (s: Record<string, unknown>) => `
      <div class="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow">
        <div class="h-2 bg-gray-200 rounded w-16 mb-2"></div>
        <p class="text-sm font-medium text-gray-700">${s.name || "Screen"}</p>
        <p class="text-xs text-gray-400 mt-1">${s.path || ""}</p>
      </div>`
        )
        .join("")}
    </div>
  </main>

  <script>
    window.parent.postMessage({ type: 'preview-ready', route: '/' }, '*');
  </script>
</body>
</html>`;

  return {
    html,
    routes,
    fileCount: 0,
    generatedAt: new Date().toISOString(),
  };
}
