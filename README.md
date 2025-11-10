# 🚀 SaaS Scaffold Starter

**Generate a full-stack SaaS app in minutes.**  
This CLI spins up a production-ready Next.js application powered by:

- **Next.js 15 (App Router)**
- **Chakra UI** – clean design system ready out of the box
- **Clerk** – user auth (email + Google, single-tenant)
- **Supabase** – Postgres DB + analytics/events
- **Stripe** – billing + subscriptions
- **Netlify** – hosting with GitHub Actions auto-deploy
- **Pre-wired** CI/CD, `.env` templates, SQL migrations & example API routes

Built for founders and engineers who want to validate SaaS ideas **in under 1 day**.

---

## ⚙️ Features

| Area | Details |
|------|----------|
| **Frontend** | Next.js + Chakra UI, SEO ready, responsive, dark-mode compatible |
| **Auth** | Clerk single-tenant (email & Google) |
| **Database** | Supabase (Postgres) with events & signups tables |
| **Payments** | Stripe Checkout + webhook |
| **Analytics** | Supabase `events` table for tracking custom events |
| **CI/CD** | GitHub Actions → Netlify auto-deploy on push to `main` |
| **Env Templates** | `.env.local`, `.env.staging`, `.env.production` prefilled |
| **Full Stack Ready** | `/api` routes, Supabase client, and working signup endpoint |
| **One-Command Setup** | Auto-installs dependencies and runs instantly |

---

## 🧠 Prerequisites

- Node.js ≥ 16
- npm or pnpm
- GitHub repo (for CI/CD)
- Accounts on:
  - [Clerk.dev](https://clerk.dev)
  - [Supabase](https://supabase.com)
  - [Stripe](https://stripe.com)
  - [Netlify](https://www.netlify.com)

---

## 🪄 Quick Start

### 1️⃣ Install dependencies for the CLI
```bash
npm i commander enquirer
````

### 2️⃣ Generate a new SaaS project

Interactive:

```bash
node scaffold.js apply
```

Non-interactive:

```bash
node scaffold.js apply \
  --name onboardkit \
  --stripe \
  --db=supabase \
  --deploy=netlify
```

### 3️⃣ Run it locally

```bash
cd onboardkit
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

You’ll have:

* Chakra landing page (`/`)
* Clerk auth (`/sign-in`, `/sign-up`)
* Stripe paywall (`/api/stripe/*`)
* Supabase analytics & signups (`/api/events`, `/api/signups/add`)
* Founder dashboard (`/founder`)

---

## 🔑 Environment Setup

### `.env.local`

Auto-generated with placeholder values.
Fill in your keys from:

* **Clerk** → API Keys → `publishable`, `secret`, and frontend API
* **Supabase** → Project Settings → API
* **Stripe** → Developers → API keys
* Optionally, adjust `SUCCESS_URL` / `CANCEL_URL`.

### `.env.staging` / `.env.production`

Same variables, adjusted for deploy environments.

---

## 🗃️ Supabase Migration

Your scaffold includes:

```
supabase/init.sql
```

Run this script once in your Supabase dashboard → SQL Editor to create:

* `events` table – for product analytics
* `signups` table – for lead capture

It also includes row-level security policies allowing inserts via service-role key.

---

## 🧱 Directory Structure

```
saas-scaffold-starter/
├─ scaffold.js               # The CLI itself
├─ package.json
├─ README.md                 # This file
└─ (generated projects)
   ├─ pages/
   ├─ lib/
   ├─ supabase/init.sql
   ├─ .env.local
   ├─ .github/workflows/deploy.yml
   └─ netlify.toml
```

---

## ⚙️ Deployment (Netlify + GitHub Actions)

1. Create a Netlify site and connect it to your generated GitHub repo.
2. Add GitHub repository secrets:

   * `NETLIFY_AUTH_TOKEN`
   * `NETLIFY_SITE_ID`
3. Push to `main` — the GitHub Action in `.github/workflows/deploy.yml` will:

   * Install deps
   * Build with Next.js
   * Deploy to Netlify automatically

---

## 🧩 Extend or Customize

You can safely edit `scaffold.js` to:

* Change default UI kit (Chakra → MUI)
* Add new feature templates
* Include new integrations (e.g. Resend email, PostHog)
* Point to a GitHub template repo for faster updates

---

## 🧠 Validation Playbook

1. **Idea → Scaffold** (`node scaffold.js apply`)
2. **Customize Copy** (landing, hero, features)
3. **Deploy** to Netlify
4. **Run Ads** (Meta / Google)
5. **Collect signups** → view in Supabase `signups`
6. **Convert** via Stripe checkout
7. **Track events** → stored in Supabase `events`
8. **Iterate or kill fast**

---

## 🧹 CLI Commands

| Command                                   | Description                          |
| ----------------------------------------- | ------------------------------------ |
| `node scaffold.js apply`                  | Generate a new project (interactive) |
| `node scaffold.js apply --flags`          | Non-interactive scaffold             |
| `node scaffold.js destroy --dir ./my-app` | Remove generated project             |
| `--no-install`                            | Skip npm install (for CI usage)      |

---

## 🧰 Stack Versions

| Tool           | Version | Notes                    |
| -------------- | ------- | ------------------------ |
| Next.js        | latest  | Includes API routes      |
| Chakra UI      | ^2.7    | Theme + components       |
| Clerk          | ^5.0    | Single-tenant auth       |
| Supabase JS    | ^2.34   | DB + auth SDK            |
| Stripe         | ^11.0   | Checkout + webhooks      |
| Node           | ≥16     | Required runtime         |
| Netlify Plugin | latest  | `@netlify/plugin-nextjs` |

---

## 🏁 License

MIT © 2025
Created for rapid SaaS validation and experimentation.

---

### ❤️ Contributions

PRs welcome!
Got an idea for an integration (Resend, PostHog, Airtable)?
Fork this repo, edit `scaffold.js`, and submit a PR.

---

**Made with ⚡ speed & sanity for modern SaaS builders.**


gh repo create saas-scaffold-starter --public --source=. --remote=origin