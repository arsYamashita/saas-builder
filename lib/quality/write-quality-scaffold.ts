import fs from "node:fs/promises";
import path from "node:path";

/**
 * エクスポートディレクトリに quality gate 実行に最低限必要なファイルを生成する
 * - package.json (なければ)
 * - tsconfig.json (なければ)
 * - .eslintrc.json (なければ)
 */
export async function writeQualityScaffold(projectDir: string) {
  // package.json
  const pkgPath = path.join(projectDir, "package.json");
  if (!(await fileExists(pkgPath))) {
    const pkg = {
      name: "generated-saas",
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "eslint . --ext .ts,.tsx",
      },
      dependencies: {
        next: "^14",
        react: "^18",
        "react-dom": "^18",
        "@supabase/supabase-js": "^2",
        "@supabase/ssr": "^0",
        stripe: "^14",
        zod: "^3",
      },
      devDependencies: {
        typescript: "^5",
        "@types/node": "^20",
        "@types/react": "^18",
        "@types/react-dom": "^18",
        eslint: "^8",
        "eslint-config-next": "^14",
        "@playwright/test": "^1",
      },
    };
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2), "utf-8");
  }

  // tsconfig.json
  const tsconfigPath = path.join(projectDir, "tsconfig.json");
  if (!(await fileExists(tsconfigPath))) {
    const tsconfig = {
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: {
          "@/*": ["./*"],
        },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
      exclude: ["node_modules"],
    };
    await fs.writeFile(
      tsconfigPath,
      JSON.stringify(tsconfig, null, 2),
      "utf-8"
    );
  }

  // .eslintrc.json
  const eslintPath = path.join(projectDir, ".eslintrc.json");
  if (!(await fileExists(eslintPath))) {
    const eslintConfig = {
      extends: "next/core-web-vitals",
      rules: {
        "@typescript-eslint/no-unused-vars": "warn",
        "@typescript-eslint/no-explicit-any": "off",
      },
    };
    await fs.writeFile(
      eslintPath,
      JSON.stringify(eslintConfig, null, 2),
      "utf-8"
    );
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
