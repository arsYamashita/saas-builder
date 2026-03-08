# Runbook

## 14-Day Execution Plan

### Day 1
- Create repository
- Create folder structure
- Save prompts

### Day 2
- Create common-core.md
- Decide first template

### Day 3
- Build Project creation form

### Day 4
- Implement Gemini intake

### Day 5
- Implement Gemini blueprint
- Save to blueprints table

### Day 6
- Implement normalizer

### Day 7
- Run Claude implementation

### Day 8
- Create Claude schema
- Create migrations

### Day 9
- Design Claude API
- Create route structure

### Day 10
- Generate UI with Lovable

### Day 11
- Integrate UI with Claude

### Day 12
- Generate Playwright tests
- Run tests

### Day 13
- Preview confirmation
- Bug fixes

### Day 14
- Lock as template #1

## Environment Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Required env vars:
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
# GEMINI_API_KEY=
# CLAUDE_API_KEY=

# Run migrations
npx supabase db push

# Start dev server
npm run dev
```
