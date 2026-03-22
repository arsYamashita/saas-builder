# SaaS Builder -- Launch Readiness Assessment
**Date**: 2026-03-23
**Assessor**: Alex (Product Manager)
**Status**: PRE-LAUNCH REVIEW
**Target Market**: Japanese solo developers, small teams, and non-technical creators who want to build SaaS applications

---

## Executive Summary

SaaS Builder is a genuinely differentiated product: an AI-powered tool that generates domain-specific SaaS code (schema, API, permissions, UI) while keeping common infrastructure (auth, billing, tenant management) fixed and battle-tested. The core pipeline works -- Gemini for blueprints, Claude for code generation, 5 templates at GREEN status, and a functional review/export workflow.

However, the app currently drops unauthenticated visitors directly into a login wall. There is no public-facing explanation of what SaaS Builder does, who it is for, or why someone should sign up. This is the single biggest blocker to any credible public launch.

**Verdict**: The engine is strong. The storefront does not exist yet. Fix the storefront, tighten a few rough edges, and this is launchable.

---

## 1. MUST-HAVE Features for MVP Launch

### Tier 1 -- BLOCKING (Cannot launch without these)

| # | Item | Current State | Effort | Why It Blocks |
|---|------|--------------|--------|---------------|
| 1 | **Landing page** | Missing entirely. Root `/` redirects to `/projects` which redirects to `/auth/login`. | 1-2 days | A visitor who lands on saas-builder-cyan.vercel.app sees a login form with zero context. No one signs up for a product they cannot understand. |
| 2 | **Error boundary / global error handling** | No `error.tsx` or `not-found.tsx` detected in route groups. `alert()` used for project creation failure. | 0.5 day | Unhandled errors show raw Next.js error pages or blank screens. Users will bounce immediately. |
| 3 | **User-scoped data** | Projects page uses `createAdminClient()` -- queries ALL projects, not the logged-in user's projects. | 0.5 day | Every user sees every other user's projects. This is a data privacy blocker for any multi-user deployment. |
| 4 | **Sidebar hardcoded identity** | Sidebar shows "管理者 / admin@saas.io" for all users. | 0.5 day | Confusing UX. Users will wonder if they are logged into their own account. |
| 5 | **HTML lang attribute** | `<html lang="en">` despite Japanese UI text. | 5 min | Screen readers, SEO, and browser translation features all depend on this. Should be `ja`. |
| 6 | **Meta description / OGP tags** | Generic English description: "Build and deploy SaaS applications with AI-powered code generation". No OGP image. | 0.5 day | Social sharing (Twitter/X, LINE, Slack) will show a blank preview. First impressions matter. |

### Tier 2 -- HIGH PRIORITY (Should ship within first week)

| # | Item | Current State | Effort | Impact |
|---|------|--------------|--------|--------|
| 7 | **Onboarding flow after signup** | Signup goes to `/dashboard` which does not exist (redirects to projects). New user lands on empty project list. | 1 day | New users have no guidance. "What do I do now?" is the fastest path to churn. A simple welcome modal or guided first-project flow would fix this. |
| 8 | **Loading and empty states** | Project detail shows raw "Loading..." text. | 0.5 day | Replace with skeleton loaders. The redesigned UI components (Card, Badge, etc.) look polished, but loading states break the illusion. |
| 9 | **Consistent UI on new project form** | New project page uses raw HTML inputs/selects (`<input>`, `<select>`) with inline Tailwind, while the rest of the app uses the redesigned component library (Card, Badge, Button, Input). | 1 day | The new project form is the most important conversion page in the app. It currently looks like a different product from the rest of the UI. |
| 10 | **Terms of Service / Privacy Policy** | None visible. | 0.5 day | Required for any public-facing product in Japan. Even a minimal version is needed. Particularly important given AI-generated code and data storage. |
| 11 | **Rate limiting on API routes** | No visible rate limiting on auth endpoints or AI generation endpoints. | 0.5 day | AI API calls are expensive. Without rate limiting, a single bad actor (or a bug) could burn through your Gemini/Claude budget in minutes. |
| 12 | **Email verification after signup** | Not visible in auth flow. | 0.5 day | Without email verification, spam signups are trivial. Supabase supports this natively. |

### Tier 3 -- IMPORTANT (Ship within first month)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 13 | Usage analytics (Vercel Analytics or Plausible) | 0.5 day | You cannot improve what you do not measure. |
| 14 | Feedback mechanism (simple form or mailto link) | 0.5 day | Early users are your best product advisors. Give them a channel. |
| 15 | Help / FAQ page | 1 day | Reduces support burden. Explains what templates do, what gets generated, export format. |
| 16 | Project deletion | 0.5 day | Users need to clean up experiments. |
| 17 | Generation cost visibility | 0.5 day | Show estimated token usage / cost before triggering generation. Builds trust. |

---

## 2. What Is Missing for a Credible Public Launch

### Landing Page (the single most important gap)

The landing page needs to answer four questions in under 10 seconds:

1. **What is this?** -- "AIでSaaSアプリを構築するツール"
2. **Who is it for?** -- "個人開発者・小規模チーム・非エンジニア"
3. **How does it work?** -- Visual of the 3-step pipeline: 要件入力 -> AI設計 -> コード生成
4. **What do I get?** -- "Next.js + Supabase + Stripeの本格的なSaaSアプリがエクスポートできます"

Recommended structure:

```
Hero section:
  Headline: "SaaSアプリを、AIで構築する"
  Sub: "要件を入力するだけ。設計・コード・データベース・APIをAIが自動生成します。"
  CTA: "無料で始める" -> /auth/signup
  Secondary: "デモを見る" (anchor to demo section or video)

How it works (3 steps):
  1. テンプレートを選んで要件を入力
  2. AIが設計図を自動生成
  3. コードをエクスポートして即座にデプロイ

Template showcase:
  5 templates at GREEN status, each with a card (reuse TemplatesPage design)

Tech stack trust signals:
  "Next.js / Supabase / Stripe / Tailwind" logos
  "Gemini + Claudeによるマルチモデルパイプライン"

CTA repeat:
  "まずは無料でプロジェクトを作成" -> /auth/signup
```

### Documentation (user-facing)

The `/docs` directory has good internal docs (architecture, runbooks, baselines) but zero user-facing documentation. Minimum viable docs:

- Getting started guide (3 steps to first project)
- What each template generates (expected output)
- How to deploy the exported code
- FAQ (AI cost, data privacy, what you own)

### Onboarding

After signup, the user needs to understand the workflow: Create Project -> Generate Blueprint -> Review -> Generate Code -> Export. Currently the UI assumes users know this flow. A simple stepper or tooltip walkthrough on first visit would significantly reduce time-to-value.

---

## 3. Japanese Market Differentiation

### What already works well

- Full Japanese localization on all UI text -- this is table stakes for Japan and many competitors miss it.
- "かんたん入力" (easy input) intake flow with auto-fill -- this is excellent UX for non-technical users.
- "AIで整える" (polish with AI) button to refine project briefs -- unique and thoughtful.
- Templates tailored to Japanese business patterns (オンラインサロン, 予約管理SaaS, コミュニティ会員制).

### What would make this stand out

| Strategy | Effort | Impact | Rationale |
|----------|--------|--------|-----------|
| **Japanese business template library** | Ongoing | High | Japan's SaaS market has specific patterns: 月額制オンラインスクール, 士業向け顧客管理, フリーランス請求管理, 不動産内覧予約. Each new GREEN template is a distinct acquisition channel. |
| **Exported code includes Japanese comments and variable naming conventions** | 1 day | Medium | Show that this is not just a translated English product. Japanese developers reading generated code in their language is a trust signal no competitor offers. |
| **Invoice/receipt generation (インボイス制度対応)** | 3-5 days | High | Japan's invoice system reform (2023) created massive demand for compliant billing tools. If generated SaaS apps include proper invoice formatting, that is a significant selling point. |
| **LINE integration template** | 2-3 days | High | LINE is the dominant messaging platform in Japan. A template that generates LINE notification hooks or LINE Login would be immediately valuable for any customer-facing SaaS. |
| **Content marketing in Japanese** | Ongoing | High | Write about "個人開発者のためのSaaS構築ガイド", publish on Zenn, Qiita, and note.com. The Japanese indie dev community is active and shares tools aggressively. One well-written Zenn article can drive more signups than months of paid ads. |
| **Pricing in JPY with Japan-friendly tiers** | 0.5 day | Medium | Even if using Stripe, show prices in yen. Consider a generous free tier (3 projects, unlimited blueprint generation) with paid tier for code generation and export. |
| **Discord or Slack community for Japanese users** | 0.5 day | Medium | Japanese dev communities thrive in Discord. A support channel doubles as a feedback loop and a retention tool. |

### Competitive landscape note

The main competitors in this space (v0, bolt.new, Lovable) are all English-first and generate generic web apps. SaaS Builder's focus on SaaS-specific patterns (multi-tenancy, RBAC, billing, affiliate) with Japanese localization is a genuine moat. Lean into it.

---

## 4. Launch Timeline and Checklist

### Phase 0: Pre-Launch Sprint (This week -- March 23-30)

**Goal**: Make the deployed URL shareable without embarrassment.

| Day | Task | Owner | Done |
|-----|------|-------|------|
| Day 1 (Mar 23) | Fix `<html lang="ja">` | Dev | [ ] |
| Day 1 | Fix user-scoped project queries (replace `createAdminClient` with user-scoped client) | Dev | [ ] |
| Day 1 | Fix sidebar to show actual user name/email | Dev | [ ] |
| Day 2 (Mar 24) | Build landing page (hero + 3-step + template showcase + CTA) | Dev | [ ] |
| Day 2 | Add OGP meta tags with Japanese description and OGP image | Dev | [ ] |
| Day 3 (Mar 25) | Add `error.tsx` and `not-found.tsx` to all route groups | Dev | [ ] |
| Day 3 | Replace `alert()` with proper error toast (reuse existing toast pattern from project detail) | Dev | [ ] |
| Day 3 | Upgrade new project form to use the component library (Input, Card, etc.) | Dev | [ ] |
| Day 4 (Mar 26) | Add rate limiting to AI generation endpoints (simple in-memory or Supabase-backed) | Dev | [ ] |
| Day 4 | Enable Supabase email verification | Dev | [ ] |
| Day 4 | Add minimal Terms of Service and Privacy Policy pages | Dev | [ ] |
| Day 5 (Mar 27) | Add welcome/onboarding modal for first-time users | Dev | [ ] |
| Day 5 | Replace "Loading..." with skeleton loaders | Dev | [ ] |
| Day 6 (Mar 28) | End-to-end testing of the full flow: signup -> create project -> generate blueprint -> generate code -> export | Dev | [ ] |
| Day 6 | Deploy and verify on Vercel | Dev | [ ] |
| Day 7 (Mar 29) | Buffer / bug fixes | Dev | [ ] |

### Phase 1: Soft Launch (March 30 - April 13)

**Goal**: Get 10-20 real users through direct outreach. Validate that the pipeline works reliably and the output is useful.

| Task | Success Gate |
|------|-------------|
| Share with 5-10 developer friends / Twitter followers | 5+ signups |
| Post on personal Twitter/X with a demo GIF | 50+ impressions |
| Collect feedback via simple Google Form linked from the app | 5+ responses |
| Monitor error rates and AI costs daily | < 2% generation failure rate |
| Fix top 3 reported issues | Resolved within 48 hours |
| Add Vercel Analytics or Plausible | Dashboard live |

**Rollback criteria**: If AI generation failure rate exceeds 10% or cost per generation exceeds reasonable threshold, pause signups and investigate.

### Phase 2: Public Launch (April 14-28)

**Goal**: Broader visibility in the Japanese indie developer community.

| Task | Success Gate |
|------|-------------|
| Publish Zenn article: "AIでSaaSを自動生成するツールを作った" | 100+ likes |
| Publish Qiita article: technical deep-dive on the multi-model pipeline | 50+ likes |
| Post on Product Hunt (Japanese indie dev audience cross-posts) | Listed |
| Submit to Japanese startup directories (BRIDGE, TechCrunch Japan tips) | Submitted |
| Add 1-2 new templates based on Phase 1 feedback | Templates at GREEN |
| Implement usage analytics dashboard | PM can see activation funnel |

### Phase 3: Growth (May onward)

| Task | Success Gate |
|------|-------------|
| Pricing tier implementation (free + paid) | Stripe integration live |
| LINE integration template | Template at GREEN |
| Invoice-compliant billing template | Template at GREEN |
| SEO-optimized template landing pages (one per template) | Indexed by Google |
| Community Discord channel | 50+ members |

---

## 5. Success Metrics for MVP Launch

| Metric | Target | Measurement Window |
|--------|--------|--------------------|
| Signup completion rate (landing page -> signup -> email verified) | 15%+ | 30 days post-launch |
| Activation rate (signed up -> created first project) | 60%+ | 30 days |
| Blueprint generation success rate | 95%+ | Ongoing |
| Code generation success rate | 85%+ | Ongoing |
| Export completion rate (project with generated code -> downloaded/exported) | 50%+ of generated projects | 30 days |
| Average generation cost per project | Track and report | Ongoing |
| NPS from feedback form | 30+ | 60 days |

---

## 6. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI API cost overrun from abuse or bugs | Medium | High | Rate limiting per user (Tier 1 fix), daily cost monitoring alert |
| Generated code quality varies by template | Medium | High | 5 templates at GREEN with regression tests is good. Do not add DRAFT templates to public-facing catalog. |
| User data exposure (admin client issue) | High | Critical | Fix BEFORE any public link sharing. This is the top priority fix. |
| Users expect fully deployable app, get code export | Medium | Medium | Set expectations clearly on landing page and in onboarding. "SaaS Builder generates your codebase. You deploy it." |
| Supabase free tier limits under load | Low | Medium | Monitor Supabase usage. Upgrade plan before Phase 2 if needed. |

---

## 7. Immediate Action Items (Today, March 23)

If you only have a few hours today, do these three things:

1. **Fix the data privacy issue**: Replace `createAdminClient()` in the projects page with a user-scoped query. This is a security bug, not a feature request.

2. **Set `<html lang="ja">`**: One-line change in `app/layout.tsx`. Immediate SEO and accessibility benefit.

3. **Start the landing page**: Even a minimal version (headline + 3-step description + signup CTA) transforms the product from "mysterious login wall" to "thing I can evaluate." This is the highest-leverage work you can do today.

Everything else can wait until tomorrow. These three changes move the product from "internal tool" to "launchable MVP."
