# .env.local Template

Create a file named `.env.local` in the project root.

Example:

```
project-root/
  .env.local
  package.json
  next.config.ts
  app/
  lib/
```

---

## Required Variables

Copy this template and replace values.

```
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

# Gemini
GEMINI_API_KEY=YOUR_GEMINI_API_KEY

# Claude
CLAUDE_API_KEY=YOUR_CLAUDE_API_KEY

# Stripe
STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

---

## Where to Get Each Value

### Supabase URL

Supabase Dashboard

```
Project Settings
→ API
→ Project URL
```

Example:

```
https://abcxyz.supabase.co
```

### Supabase Anon Key

```
Project Settings
→ API
→ anon public key
```

### Supabase Service Role Key

```
Project Settings
→ API
→ service_role key
```

Important:

```
Never expose this in frontend code
```

It must only be used server-side.

### Gemini API Key

Google AI Studio

```
https://aistudio.google.com/app/apikey
```

Create a key and copy it.

### Claude API Key

Anthropic Console

```
https://console.anthropic.com/settings/keys
```

Create key.

If your code reads:

```
CLAUDE_API_KEY
```

Then `.env.local` must also use:

```
CLAUDE_API_KEY
```

Do not mix with `ANTHROPIC_API_KEY`.

### Stripe Keys

Stripe Dashboard

```
Developers
→ API Keys
```

Copy:

```
Secret key
Publishable key
```

### Webhook Secret

If you have a Stripe webhook route:

```
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Stripe CLI will output:

```
whsec_xxxxxxxxx
```

Use that value.

---

## After Creating .env.local

Restart the dev server.

```
npm run dev
```

Environment variables are loaded only on boot.
