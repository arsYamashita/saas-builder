export function getScaffoldEslintConfig() {
  return `import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";

export default [
  {
    ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // TypeScript already checks undefined names; core no-undef flags
      // type-only globals such as NodeJS and imported class types.
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.{js,cjs,mjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
`;
}
