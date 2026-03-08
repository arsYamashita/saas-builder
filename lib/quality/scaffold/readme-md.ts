export function getScaffoldReadmeMd(projectId: string) {
  return `# Generated SaaS Template

This project was exported by the AI SaaS Builder.

## Project ID
${projectId}

## Commands

\`\`\`bash
npm install
npm run lint
npm run typecheck
npm run test:e2e
npm run dev
\`\`\`
`;
}
