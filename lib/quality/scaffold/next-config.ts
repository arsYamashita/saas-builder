export function getScaffoldNextConfig() {
  return `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
};

export default nextConfig;
`;
}
