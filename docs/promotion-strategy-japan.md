# SaaS Builder Japan Launch Promotion Strategy
# Comprehensive Week-by-Week Action Plan

**Product**: SaaS Builder - AI-powered SaaS creation tool (Gemini blueprints + Claude code generation)
**URL**: saas-builder-cyan.vercel.app
**Target**: Japanese entrepreneurs, startup founders, freelance developers, small business owners
**Launch Date**: Target Week 2 (T+0 = Launch Day)
**Strategy Period**: 5 weeks total (1 week pre-launch + launch day + 4 weeks post-launch)

---

## PART 1: POSITIONING AND MESSAGING

### Core Value Proposition (Japanese)

**Primary tagline**:
> アイデアを話すだけで、SaaSが生まれる。

**Supporting message**:
> 技術者でなくても、AIがあなたの代わりに設計・開発・デプロイ。
> Geminiが設計図を描き、Claudeがコードを書く。あなたはアイデアだけ持ってきてください。

**English tagline** (for Product Hunt / international):
> Describe your idea. AI builds your SaaS.
> From concept to deployed full-stack app -- no coding required.

### Competitor Differentiation Matrix

| Feature | SaaS Builder | Bubble | v0 (Vercel) | Bolt.new | Lovable |
|---|---|---|---|---|---|
| AI-driven blueprint | Gemini generates architecture | Manual drag-drop | Partial (UI only) | Code generation | Code generation |
| Full-stack code output | Yes (Next.js + Supabase) | No (proprietary runtime) | Frontend only | Yes | Yes |
| Code ownership | 100% exportable | Vendor lock-in | Partial | Yes | Yes |
| Japanese UI/docs | Native Japanese | Limited | English only | English only | English only |
| SaaS templates | Pre-built (CRM, CMS, etc.) | Marketplace | None | None | None |
| Quality gates | Built-in scoreboard | None | None | None | None |
| Price point | TBD (see pricing section) | $29-349/mo | $20/mo | $20/mo | $20/mo |

**Key differentiators to emphasize**:
1. Dual-AI architecture (Gemini for design thinking, Claude for code generation) -- unique in the market
2. Full Japanese language support -- no competitor offers this natively
3. SaaS-specific templates with industry patterns (CRM, CMS, booking, etc.)
4. Code export with no vendor lock-in (real Next.js + Supabase, not proprietary)
5. Quality scoreboard ensuring generated code meets production standards

---

## PART 2: PRE-LAUNCH WEEK (Day -7 to Day -1)

### Objective
Build anticipation, seed content across platforms, collect waitlist signups, and warm up distribution channels.

### Day -7 (Monday): Foundation Setup

**Tasks**:
- [ ] Create dedicated landing page with waitlist form (add to saas-builder-cyan.vercel.app)
  - Hero: screen recording GIF of SaaS creation flow
  - Waitlist CTA: "先行アクセスに登録する" (Sign up for early access)
  - Social proof section: template count, test count (806 tests), tech stack logos
- [ ] Set up analytics: Vercel Analytics + Google Analytics 4 (Japanese locale)
- [ ] Create all social accounts if not existing:
  - Twitter/X: @saas_builder_jp (or similar available handle)
  - note.com account
  - Qiita organization
  - Zenn.dev account
  - YouTube channel
- [ ] Prepare Open Graph images (1200x630) in Japanese for all platforms
- [ ] Set up UTM tracking for each channel

**Content to prepare**:
- 5-minute demo video (screen recording with Japanese narration)
- 30-second teaser clip for Twitter/TikTok
- Hero screenshot set (blueprint view, code generation, template catalog, scoreboard)

### Day -6 (Tuesday): Teaser Campaign Begins

**Twitter/X (3 tweets)**:
1. Morning (8:00 JST):
   ```
   AIに「予約管理SaaSを作って」と言ったら、本当に動くSaaSができた。

   Geminiが設計 → Claudeがコード生成 → Next.js + Supabase の本格アプリ。

   来週公開します。

   #個人開発 #AI開発 #SaaS
   ```
   Attach: 30-second teaser clip

2. Afternoon (12:00 JST):
   ```
   「ノーコード」の次は「AIコード」の時代。

   ノーコードの問題点:
   - ベンダーロックイン
   - 複雑な機能に限界
   - カスタマイズ性の低さ

   AIコード生成の利点:
   - 本物のNext.jsコード
   - 完全エクスポート可能
   - AIが設計から実装まで

   来週、日本語で使えるツールを公開します。
   ```

3. Evening (20:00 JST):
   ```
   806テストが全パス。CI/CDも完備。

   「AIが書いたコード」の品質を担保するために、
   品質スコアボードを内蔵しました。

   ただ動くだけじゃない。本番に出せる品質を保証する。

   #SaaSBuilder #プロダクト開発
   ```

### Day -5 (Wednesday): Technical Teaser

**note.com -- Article 1** (teaser):
Title: 「AIに『CRMを作って』と言ったら、本当にできた話」
Content outline:
- Personal story: why I built this tool
- The problem: SaaS development costs 50-650万円 in Japan
- The solution: AI blueprints + AI code generation
- Teaser screenshots (blurred sections to build curiosity)
- Waitlist CTA at the end
- Length: 2,000-3,000 characters
- Tags: #AI開発 #SaaS #個人開発 #ノーコード

**Twitter/X**: Share the note.com article with a thread summarizing key points

### Day -4 (Thursday): Developer Community Seeding

**Qiita -- Article 1** (technical):
Title: 「Gemini + Claude の二刀流AI設計パターン -- SaaS自動生成の裏側」
Content outline:
- Architecture diagram: User Input -> Gemini Blueprint -> Claude Code Gen -> Next.js App
- Why two AI models instead of one (design thinking vs code implementation)
- Code snippets showing the blueprint schema and validation
- Template system architecture
- Quality gate / scoreboard mechanism
- Length: 4,000-6,000 characters (Qiita readers expect depth)
- Tags: AI, Next.js, Supabase, SaaS, 個人開発

**Zenn.dev -- Article 1** (technical):
Title: 「Next.js + Supabase + AI でフルスタックSaaSを自動生成するアーキテクチャ」
Content outline:
- Tech stack deep-dive: Next.js 14 (App Router), Supabase (Auth + DB), Stripe (payments)
- How Gemini generates structured blueprints (JSON schema design)
- How Claude generates production-ready code with 806 tests
- Deployment pipeline: GitHub -> Vercel auto-deploy
- Code quality: TypeScript strict mode, Playwright E2E, Vitest unit tests
- Length: 5,000-8,000 characters
- Tags: nextjs, supabase, ai, typescript

### Day -3 (Friday): Social Proof and Influencer Outreach

**Tasks**:
- [ ] Reach out to 10-15 Japanese tech Twitter influencers (1,000-50,000 followers)
  - Target profiles: indie hackers, AI enthusiasts, Next.js/React developers
  - Offer: early access + personalized demo
  - Template DM:

    ```
    [Name]さん、こんにちは。
    AIでSaaSを自動生成するツールを開発しました。
    Geminiで設計、Claudeでコード生成、Next.js+Supabaseの本格アプリが
    数分で作れます。来週公開予定です。
    よろしければ先行アクセスをお送りしたいのですが、ご興味ありますか？
    ```

- [ ] Reach out to 5 Japanese tech YouTubers for potential review/demo
- [ ] Post in Japanese indie hacker communities (個人開発者コミュニティ on Discord/Slack)
- [ ] Submit to はてなブックマーク: bookmark your own note.com and Qiita articles from trusted accounts

**Twitter/X** (2 tweets):
1. Behind-the-scenes thread showing the development journey
2. Poll: 「SaaS開発で一番大変なのは？」(What is the hardest part of SaaS development?)
   - 設計・アーキテクチャ
   - コーディング
   - デプロイ・インフラ
   - マーケティング

### Day -2 (Saturday): Video Content

**YouTube** -- Video 1:
Title: 「5分でSaaSを作ってみた｜AIが設計からコード生成まで全自動」
- Length: 5-8 minutes
- Content: Full walkthrough creating a simple booking SaaS
  1. Describe the idea in Japanese
  2. Show Gemini blueprint generation
  3. Show Claude code generation with progress
  4. Show the template catalog
  5. Show the quality scoreboard
  6. Export and deployment
- Call to action: waitlist signup link in description

**TikTok/YouTube Shorts** (3 clips):
1. "AIにSaaSを作らせてみた" (15 sec speed-run)
2. "806テストが全部通る AIのコード" (concept clip)
3. "ノーコード vs AIコード 違いは？" (comparison)

**Twitter/X**: Share the YouTube video with a teaser thread

### Day -1 (Sunday): Final Prep

**Tasks**:
- [ ] Prepare Product Hunt launch page (save as draft)
  - Title: "SaaS Builder -- Describe your idea, AI builds your SaaS"
  - Tagline: "Gemini designs. Claude codes. You ship."
  - Description (800 chars max): Focus on dual-AI, Japanese support, code ownership
  - Gallery: 5 images (hero, blueprint, code gen, templates, scoreboard)
  - Maker comment draft ready
  - First comment draft ready
- [ ] Schedule launch day tweets (pre-write 5-7 tweets for the day)
- [ ] Prepare launch day note.com article
- [ ] Email waitlist: "Tomorrow is launch day" preview
- [ ] Brief all early access influencers: "Please share tomorrow if you found it useful"
- [ ] Test the live site one final time -- all pages, auth flow, demo mode

---

## PART 3: LAUNCH DAY (Day 0)

### Objective
Maximize visibility across all channels simultaneously. Target: 500+ waitlist signups, Top 5 on Product Hunt daily, trending on はてなブックマーク.

### Timeline (all times JST)

**00:01 -- Product Hunt goes live**
- Publish the Product Hunt page (launches at midnight PST = 16:00 JST the day before, or schedule for 00:01 PST)
- Recommended: Launch on Tuesday, Wednesday, or Thursday
- Post maker comment immediately
- Share PH link in all prepared channels

**07:00 -- Morning wave (commuter reading time)**
- Twitter/X launch thread (7-10 tweets):
  ```
  Tweet 1:
  本日、SaaS Builder を公開しました。

  「アイデアを話すだけで、SaaSが生まれる」

  Geminiが設計図を描き、Claudeが本格的なNext.jsアプリを生成。
  テンプレートから5分でSaaSが立ち上がります。

  saas-builder-cyan.vercel.app

  以下、詳しく紹介します
  ```

  ```
  Tweet 2:
  仕組み:

  1. あなた: 「予約管理SaaSを作りたい」
  2. Gemini: 設計図(Blueprint)を自動生成
  3. あなた: 設計を確認・承認
  4. Claude: フルスタックコードを生成
  5. 品質チェック → デプロイ

  全工程、日本語で完結します。
  ```

  ```
  Tweet 3:
  なぜ「ノーコード」ではなく「AIコード」なのか？

  ノーコード → ベンダーロックイン
  AIコード → 本物のNext.js + Supabase

  生成されたコードは100%あなたのもの。
  エクスポートして自由にカスタマイズできます。
  ```

  (Continue thread with: templates, quality scoreboard, pricing, comparison, PH link)

**08:00 -- note.com launch article**
Title: 「SaaS Builder を公開しました -- AIだけでSaaSを作れる時代の到来」
Content:
- Founding story and motivation
- Product overview with screenshots
- Use cases: who should use this
- Technical architecture overview (accessible level)
- Future roadmap
- Links to PH, waitlist, demo
- Length: 4,000-6,000 characters

**09:00 -- Qiita launch article**
Title: 「SaaS Builder の技術的アーキテクチャ全公開 -- Gemini x Claude x Next.js x Supabase」
Content:
- Complete architecture diagram
- Blueprint generation pipeline (Gemini integration details)
- Code generation pipeline (Claude integration details)
- Template system and factory pattern
- Quality assurance: 806 tests, TypeScript strict, Playwright E2E
- Open questions and future technical challenges
- Length: 6,000-10,000 characters

**10:00 -- Zenn.dev launch article**
Title: 「AIでSaaS開発を自動化する -- SaaS Builder のエンジニアリング」
Content:
- Focus on engineering decisions and tradeoffs
- Why Next.js 14 App Router
- Supabase RLS patterns for multi-tenant SaaS
- Structured logging with createLogger
- Document analysis engine architecture
- Content-level diff with LCS algorithm
- Length: 5,000-8,000 characters

**12:00 -- Lunch wave**
- Twitter/X: Retweet thread with updated stats ("100人が登録してくれました！")
- Reply to all comments on PH, note, Qiita, Zenn
- Share in Slack/Discord communities

**15:00 -- Afternoon push**
- Twitter/X: Post a GIF/video demo
- Submit note.com article to はてなブックマーク
- Cross-post updates

**18:00 -- Evening wave (commuter time)**
- Twitter/X: Summary of the day + personal reflection
- Thank early supporters publicly
- Share any interesting feedback received

**21:00 -- Night wrap**
- Final PH engagement push
- Respond to all remaining comments
- Plan tomorrow's follow-up content

### Launch Day Metrics to Track
- Product Hunt: upvotes, comments, ranking position
- Twitter/X: impressions, retweets, profile visits, link clicks
- note.com: views, likes (スキ), comments
- Qiita: views, likes (LGTM), stocks
- Zenn.dev: views, likes
- はてなブックマーク: bookmark count (target: 3+ for "new arrivals", 10+ for "popular")
- Waitlist/signup conversions by UTM source

---

## PART 4: POST-LAUNCH GROWTH (Weeks 1-4)

### Week 1 (Day +1 to Day +7): Momentum Maintenance

**Goal**: Convert launch traffic into active users, maintain content velocity.

**Day +1 -- Product Hunt recap**:
- Twitter thread: "Product Huntの結果報告" with screenshots of ranking, upvotes, comments
- Thank-you note on PH discussion
- Follow up with all commenters

**Day +2 -- Case study content**:
- note.com Article 2: 「SaaS Builderで実際にCRMを作ってみた -- ステップバイステップ」
  - Full tutorial with screenshots at each step
  - Show the generated code quality
  - Deployment to Vercel

**Day +3 -- Comparison content (SEO play)**:
- Qiita Article 2: 「SaaS Builder vs Bubble vs v0 -- AI時代のSaaS開発ツール徹底比較」
  - Honest comparison with pros/cons
  - Feature matrix
  - Use case recommendations (when to use which)

**Day +4 -- User feedback incorporation**:
- Twitter: Share early user feedback (screenshots of DMs with permission)
- Publish a "Week 1 learnings" thread

**Day +5 -- Template showcase**:
- Zenn.dev Article 2: 「SaaS Builderテンプレート解剖 -- CRM/CMS/予約システムの裏側」
  - Deep-dive into template architecture
  - How templates get customized by AI
  - Code quality comparison: template vs from-scratch

**Day +6-7 -- Video content**:
- YouTube Video 2: 「SaaS Builderで〇〇を作ってみた」(build something requested by community)
- 3 new TikTok/Shorts clips based on launch week feedback

### Week 2 (Day +8 to Day +14): Community Building

**Goal**: Establish community channels, begin user-generated content flywheel.

**Community setup**:
- [ ] Create Discord server for SaaS Builder users
  - Channels: #general, #showcase (user creations), #feature-requests, #bugs, #templates
  - Role: "Early Adopter" badge for launch week signups
- [ ] Create a "Show & Tell" format: users share what they built

**Content schedule**:
- Monday: Twitter thread -- "先週のアップデートまとめ" (weekly update)
- Tuesday: note.com Article 3 -- 「個人開発者がAIでSaaSを作って月10万円稼ぐロードマップ」
  (Monetization angle -- highly shareable content for indie hackers)
- Wednesday: Qiita Article 3 -- technical deep-dive on a specific feature
- Thursday: YouTube Video 3 -- live coding session or Q&A
- Friday: Twitter recap + weekend project challenge

**Growth tactics**:
- [ ] Launch a "Build Challenge": create a SaaS in 1 hour, share on Twitter with #SaaSBuilder
- [ ] Feature 3 early user creations on your Twitter (user-generated social proof)
- [ ] Guest post pitch to 2-3 Japanese tech blogs
- [ ] Start responding to relevant questions on Qiita and Stack Overflow JP

### Week 3 (Day +15 to Day +21): SEO and Organic Growth Engine

**Goal**: Establish long-term organic traffic channels.

**SEO Content Plan** (target keywords):

| Keyword | Search Volume Est. | Content Type | Platform |
|---|---|---|---|
| AIでSaaS開発 | Medium | Tutorial article | note.com |
| ノーコードSaaS 作り方 | High | Step-by-step guide | Zenn.dev |
| SaaS 個人開発 始め方 | High | Comprehensive guide | note.com |
| Next.js SaaS テンプレート | Medium | Technical article | Qiita |
| AI コード生成 比較 | Medium | Comparison article | Zenn.dev |
| SaaS 開発費用 安く | High | Cost analysis article | note.com |
| Bubble 代替 | Medium | Comparison article | Qiita |
| フルスタック AI 開発 | Low-Medium | Technical deep-dive | Zenn.dev |
| SaaS アイデア 2026 | Medium | Inspiration list | note.com |

**Content production**:
- note.com Article 4: 「SaaS開発費用を90%削減する方法 -- AI自動生成の実力」
  (Targets: SaaS 開発費用, SaaS 個人開発)
- Qiita Article 4: 「Next.js 14 + Supabase でマルチテナントSaaSを作るベストプラクティス」
  (Targets: Next.js SaaS, Supabase マルチテナント)
- Zenn.dev Article 3: 「AI コード生成ツール 2026年版 徹底比較」
  (Targets: AI コード生成 比較)

**Technical SEO for the product site**:
- [ ] Add Japanese-language meta tags and structured data
- [ ] Create /blog section on saas-builder-cyan.vercel.app
- [ ] Implement proper OGP tags for all pages
- [ ] Add sitemap.xml and robots.txt
- [ ] Target featured snippets for "AIでSaaS開発" queries

### Week 4 (Day +22 to Day +28): Viral Loop and Referral System

**Goal**: Implement product-led growth mechanics for sustainable viral growth.

**Viral mechanics to implement**:

1. **"Built with SaaS Builder" badge**
   - Every SaaS created with the tool shows a small "Built with SaaS Builder" link
   - Links back to saas-builder-cyan.vercel.app with referral tracking
   - This is the single most important viral loop

2. **Referral program**
   - Existing user invites friend -> both get extended free tier
   - Referral link format: saas-builder-cyan.vercel.app/?ref=USERNAME
   - Dashboard showing referral stats

3. **Template marketplace** (future)
   - Users can share/sell their custom templates
   - Creators earn revenue share
   - Each template page is SEO-indexed

4. **Showcase gallery**
   - Public gallery of SaaS products built with the tool
   - Each entry links back to the builder
   - Upvote system for community engagement

**Content for Week 4**:
- note.com Article 5: Monthly recap + user showcase
- Twitter: Daily user spotlights
- YouTube Video 4: "1 month of SaaS Builder -- what we learned"

---

## PART 5: PRICING STRATEGY

### Recommended Tier Structure

Based on the Japanese market research showing competing tools at $20-$29/month and the expectation that individual developers and small businesses are price-sensitive:

| Tier | Price (JPY) | Price (USD) | Target | Limits |
|---|---|---|---|---|
| Free | 0 | $0 | Trial users | 1 project, basic templates only, "Built with SaaS Builder" badge required |
| Starter | 1,980/mo | ~$13/mo | Individual developers | 3 projects, all templates, remove badge optional |
| Pro | 4,980/mo | ~$33/mo | Freelancers / small teams | 10 projects, priority generation, custom domains, team members (3) |
| Business | 14,800/mo | ~$99/mo | Agencies / growing companies | Unlimited projects, white-label, API access, team members (10) |

**Pricing psychology notes for Japan**:
- Use JPY pricing ending in 80 (1,980, 4,980) -- common Japanese SaaS pricing convention
- Annual discount: 2 months free (show monthly equivalent prominently)
- Include consumption tax (10%) in displayed price ("税込" notation)
- Offer educational discount (50% off for students -- popular in Japan)

**Launch pricing strategy**:
- Launch week: Free tier only (maximize signups and usage data)
- Week 2: Announce paid tiers with "Early Adopter 50% off forever" for first 100 paying users
- Week 3: Full pricing goes live
- The early adopter discount creates urgency and rewards launch supporters

---

## PART 6: PARTNERSHIP OPPORTUNITIES

### Tier 1 -- Immediate (Month 1)

1. **Vercel Japan community**
   - SaaS Builder deploys on Vercel -- natural partnership
   - Reach out to Vercel Japan team for potential case study or blog feature
   - Participate in Vercel meetups in Tokyo

2. **Supabase community**
   - Contribute to Supabase Japanese docs or community
   - Write "Supabase + SaaS Builder" integration guides
   - Apply for Supabase Launch Week feature

3. **Japanese indie hacker communities**
   - 個人開発 Advent Calendar (seasonal, but plan ahead)
   - 個人開発者 Slack / Discord communities
   - Indie Hackers Japan meetups

### Tier 2 -- Near-term (Month 2-3)

4. **Tech media partnerships**
   - TechCrunch Japan
   - BRIDGE (Japanese startup media)
   - ASCII.jp
   - Publickey
   - Offer exclusive stories or early access to new features

5. **AI tool aggregators**
   - There's An AI For That (theresanaiforthat.com)
   - AI-navi.jp (Japanese AI tool directory)
   - ToolPilot.ai
   - FuturePedia

6. **Developer education platforms**
   - Udemy Japan -- create a course "AIでSaaSを作ろう" using SaaS Builder
   - Schoo (Japanese online learning) -- guest lecture
   - Progate collaboration

### Tier 3 -- Strategic (Month 3-6)

7. **Incubator/Accelerator partnerships**
   - Offer SaaS Builder as a tool for startup programs
   - Partner with Japanese accelerators (Open Network Lab, Code Republic, etc.)
   - Provide special pricing for accelerator cohorts

8. **Freelance platform integrations**
   - Lancers.jp -- SaaS Builder as a recommended tool for freelance developers
   - CrowdWorks -- similar partnership
   - Coconala -- offer SaaS development as a service using the tool

9. **Anthropic / Google partnerships**
   - Apply for Claude Partner Program (tool is a significant Claude API consumer)
   - Apply for Google Cloud for Startups (Gemini API credits)
   - Case study material for both AI providers

---

## PART 7: COMMUNITY BUILDING STRATEGY

### Discord Server Structure

```
SaaS Builder Community (日本語 & English)
|
+-- INFORMATION
|   +-- #welcome-rules
|   +-- #announcements
|   +-- #roadmap
|
+-- GENERAL
|   +-- #general-chat
|   +-- #introductions
|   +-- #ideas-brainstorm
|
+-- BUILDING
|   +-- #help-support
|   +-- #showcase (share what you built)
|   +-- #templates-discussion
|   +-- #feature-requests
|
+-- TECHNICAL
|   +-- #bugs-reports
|   +-- #api-discussion
|   +-- #custom-templates
|
+-- BUSINESS
|   +-- #marketing-tips
|   +-- #pricing-strategy
|   +-- #saas-revenue-share
|
+-- EVENTS
    +-- #build-challenges
    +-- #meetups
    +-- #ama-sessions
```

### Community Engagement Cadence

| Frequency | Activity |
|---|---|
| Daily | Respond to all Discord messages within 4 hours |
| Weekly | Twitter Spaces or Discord voice chat (30 min) -- "SaaS開発相談室" |
| Bi-weekly | Build Challenge: themed SaaS creation contest |
| Monthly | User showcase blog post on note.com |
| Monthly | AMA session with the founder |
| Quarterly | Virtual meetup with demos and roadmap preview |

### Gamification Elements

- **Builder Levels**: Beginner -> Maker -> Pro Builder -> SaaS Master (based on projects created)
- **Showcase Badges**: "Featured Builder" for highlighted projects
- **Template Creator**: badge for users who share templates
- **Bug Hunter**: badge for reporting confirmed bugs
- **Community Helper**: badge for answering 10+ questions

---

## PART 8: CONTENT CALENDAR SUMMARY

### Pre-Launch Week

| Day | Twitter/X | note.com | Qiita | Zenn.dev | YouTube | Other |
|---|---|---|---|---|---|---|
| Mon (-7) | -- | -- | -- | -- | -- | Landing page + waitlist |
| Tue (-6) | 3 teaser tweets | -- | -- | -- | -- | -- |
| Wed (-5) | Article share | Article 1 (teaser) | -- | -- | -- | -- |
| Thu (-4) | Article shares | -- | Article 1 (arch) | Article 1 (tech) | -- | -- |
| Fri (-3) | Poll + outreach | -- | -- | -- | -- | Influencer DMs |
| Sat (-2) | Video share | -- | -- | -- | Video 1 (demo) | 3x TikTok/Shorts |
| Sun (-1) | Countdown | -- | -- | -- | -- | PH page prep |

### Launch Week

| Day | Twitter/X | note.com | Qiita | Zenn.dev | YouTube | Other |
|---|---|---|---|---|---|---|
| Launch | 7+ tweets | Article 2 (launch) | Article 2 (launch) | Article 2 (launch) | -- | Product Hunt, Hatena |
| +1 | PH recap | -- | -- | -- | -- | -- |
| +2 | User feedback | Article 3 (tutorial) | -- | -- | -- | -- |
| +3 | -- | -- | Article 3 (compare) | -- | -- | -- |
| +4 | Feedback thread | -- | -- | -- | -- | -- |
| +5 | -- | -- | -- | Article 3 (template) | -- | -- |
| +6-7 | Recap thread | -- | -- | -- | Video 2 | 3x Shorts |

### Weeks 2-4 (ongoing cadence)

| Frequency | Channel | Content Type |
|---|---|---|
| 3x/day | Twitter/X | Tips, updates, user spotlights, engagement |
| 1x/week | note.com | Long-form article (SEO + storytelling) |
| 1x/week | Qiita | Technical deep-dive |
| 1x/2 weeks | Zenn.dev | Engineering article |
| 1x/week | YouTube | Demo, tutorial, or Q&A |
| 3x/week | TikTok/Shorts | Quick demos, tips, comparisons |
| Daily | Discord | Community management |

---

## PART 9: KEY PERFORMANCE INDICATORS

### Pre-Launch KPIs (Week -1)

| Metric | Target |
|---|---|
| Waitlist signups | 200+ |
| Twitter followers | 300+ |
| note.com article views | 1,000+ |
| Qiita article LGTMs | 50+ |
| Influencer confirmations | 5+ |

### Launch Day KPIs (Day 0)

| Metric | Target |
|---|---|
| Product Hunt ranking | Top 5 daily |
| Product Hunt upvotes | 200+ |
| New signups | 500+ |
| Twitter impressions | 50,000+ |
| Hatena Bookmarks on launch article | 30+ |

### Month 1 KPIs (Day +30)

| Metric | Target |
|---|---|
| Total registered users | 2,000+ |
| Weekly active users | 400+ (20% of registered) |
| Projects created | 1,000+ |
| Paid conversions | 50+ (after paid tiers launch) |
| Discord members | 300+ |
| Monthly recurring revenue | 100,000+ JPY |
| Content pieces published | 15+ |
| Backlinks acquired | 30+ |

### Growth Loop Metrics (ongoing)

| Metric | Target |
|---|---|
| Viral coefficient (K-factor) | > 0.5 (via "Built with" badge + referrals) |
| Organic search traffic | 20% of total by Month 2 |
| Referral signup rate | 15% of new users from referrals |
| Content-driven signups | 30% of total |
| CAC (blended) | < 2,000 JPY |
| LTV:CAC ratio | > 3:1 by Month 3 |

---

## PART 10: AUTOMATION LEVERAGING EXISTING TOOLS

Given that you already have `publish_note.py` (Playwright-based note.com auto-publisher) set up:

### Content Pipeline Automation

```
Content Creation Flow:
1. Write article in Markdown (~/Documents/my-vault/60_SNS_Content/)
2. Generate eyecatch image via Pillow script ({stem}_eyecatch.png)
3. Auto-publish to note.com via publish_note.py
4. Cross-post adapted version to Qiita (API: POST /api/v2/items)
5. Cross-post adapted version to Zenn.dev (GitHub repo sync)
6. Auto-tweet article link via Twitter API
7. Track all UTM links in analytics dashboard
```

### Recommended Automation Scripts to Build

| Script | Purpose | Priority |
|---|---|---|
| `publish_qiita.py` | Auto-publish to Qiita via API | High |
| `publish_zenn.sh` | Auto-sync Zenn articles via Git | High |
| `schedule_tweets.py` | Schedule tweets via Twitter API | Medium |
| `generate_og_images.py` | Auto-generate OG images for articles | Medium |
| `analytics_report.py` | Weekly analytics summary across platforms | Medium |
| `waitlist_notify.py` | Email waitlist on launch day | High |

### Integration with M2 Gunshi Workflow

The existing M2 content pipeline can be extended:
1. M2 generates article drafts in `60_SNS_Content/scripts/`
2. M5 reviews and publishes via automated scripts
3. `master_runner.sh` orchestrates: article generation -> eyecatch -> multi-platform publish
4. Track `executed: true` status in vault for content pipeline management

---

## PART 11: RISK MITIGATION

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Low Product Hunt engagement | Medium | Medium | Do not over-index on PH; Japanese channels are primary |
| Negative technical feedback on Qiita | Medium | High | Ensure code examples are accurate; respond constructively |
| Server overload on launch day | Low | High | Vercel auto-scales; set up monitoring alerts |
| AI generation quality complaints | Medium | High | Set clear expectations; quality scoreboard is the answer |
| Competitor launches similar tool | Medium | Medium | Speed advantage + Japanese-first positioning |
| Low conversion to paid | High | High | Validate pricing with early users before hard launch |

---

## EXECUTION CHECKLIST

### Immediate Actions (This Week)

- [ ] Set up waitlist landing page on saas-builder-cyan.vercel.app
- [ ] Record 5-minute demo video in Japanese
- [ ] Create 30-second teaser clips (3 variants)
- [ ] Write and publish note.com teaser article
- [ ] Write and publish Qiita technical architecture article
- [ ] Write and publish Zenn.dev engineering article
- [ ] Set up Twitter/X account and begin posting
- [ ] Prepare Product Hunt page (draft)
- [ ] Build `publish_qiita.py` automation script
- [ ] Identify and contact 15 Japanese tech influencers
- [ ] Generate eyecatch images for all articles
- [ ] Set up UTM tracking across all channels
- [ ] Choose launch day (Tuesday-Thursday recommended)
- [ ] Set up Discord server with channel structure

### Week 2 Actions

- [ ] Execute launch day timeline
- [ ] Publish all launch day articles simultaneously
- [ ] Active engagement on all platforms for 48 hours
- [ ] Begin daily Twitter posting cadence
- [ ] Announce paid tier early adopter pricing

### Week 3-5 Actions

- [ ] Maintain content calendar (3 articles/week minimum)
- [ ] Implement referral system
- [ ] Add "Built with SaaS Builder" badge to generated apps
- [ ] Launch first Build Challenge
- [ ] Pitch to tech media (TechCrunch Japan, BRIDGE)
- [ ] Create SEO-targeted content for top 9 keywords
- [ ] Analyze and optimize based on first month data
