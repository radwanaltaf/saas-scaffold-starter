// scaffold.js
// #!/usr/bin/env node
/**
 * Full scaffold CLI for Next.js + Chakra + Clerk + Supabase + Stripe
 * - Auto-installs dependencies by default
 * - Produces Netlify-ready project + GitHub Actions workflow (auto deploy on push main)
 *
 * Usage:
 *   node scaffold.js apply --name my-saas --dir ./my-saas --stripe --db=supabase --deploy=netlify
 *   node scaffold.js destroy --dir ./my-saas
 *
 * Requirements: node >= 16
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { Command } = require('commander');
const { prompt } = require('enquirer');
const program = new Command();
program.version('1.0.0');

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}
function render(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
}

async function askInteractive(defaults = {}) {
  const resp = await prompt([
    { type: 'input', name: 'name', message: 'Project name', initial: defaults.name || 'saas-experiment' },
    { type: 'input', name: 'dir', message: 'Directory to create (leave blank for ./<name>)', initial: '' },
    { type: 'input', name: 'repo', message: 'Git repo URL (optional)', initial: '' },
    { type: 'confirm', name: 'stripe', message: 'Include Stripe billing (subscriptions)?', initial: defaults.stripe || true },
    { type: 'select', name: 'auth', message: 'Auth provider', choices: ['clerk'], initial: 0 },
    { type: 'select', name: 'db', message: 'Database', choices: ['supabase'], initial: 0 },
    { type: 'select', name: 'deploy', message: 'Deploy target', choices: ['netlify'], initial: 0 },
    { type: 'confirm', name: 'autoInstall', message: 'Run npm install automatically after scaffold?', initial: true }
  ]);
  if (!resp.dir) resp.dir = path.join(process.cwd(), slugify(resp.name));
  return resp;
}

function basePackageJson(name, opts) {
  const deps = {
    next: "latest",
    react: "latest",
    "react-dom": "latest",
    "@chakra-ui/react": "^2.7.0",
    "@emotion/react": "^11.10.5",
    "@emotion/styled": "^11.10.5",
    "framer-motion": "^10.12.16",
    "@clerk/nextjs": "^5.0.0",
    "@supabase/supabase-js": "^2.34.0",
    stripe: "^11.0.0",
  };
  // dev deps minimal
  const devDeps = {
    "eslint": "^8.47.0",
  };
  return {
    name,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "eslint . --ext .js,.jsx,.ts,.tsx || true"
    },
    dependencies: deps,
    devDependencies: devDeps
  };
}

function createScaffold(dir, opts) {
  if (fs.existsSync(dir)) {
    console.error('Directory already exists:', dir);
    process.exit(1);
  }
  fs.mkdirSync(dir, { recursive: true });

  // package.json
  write(path.join(dir, 'package.json'), JSON.stringify(basePackageJson(opts.name, opts), null, 2));

  // README
  write(path.join(dir, 'README.md'), `# ${opts.name}\n\nScaffolded with CLI. See .env examples and README for run instructions.\n`);

  // netlify.toml (Netlify Next plugin)
  write(path.join(dir, 'netlify.toml'), `[build]
  command = "npm run build"
  functions = "netlify/functions"
  publish = ".next"
[dev]
  command = "npm run dev"
[plugins]
  [[plugins]]
    package = "@netlify/plugin-nextjs"
`);

  // .gitignore
  write(path.join(dir, '.gitignore'), `node_modules\n.next\n.env*\n.netlify\n`);

  // env templates
  write(path.join(dir, '.env.staging'), `NEXT_PUBLIC_SITE_URL=https://staging.example.com
NEXT_PUBLIC_SITE_NAME=${opts.name}
CLERK_FRONTEND_API=
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SUCCESS_URL=https://staging.example.com/dashboard
CANCEL_URL=https://staging.example.com/
`);
  write(path.join(dir, '.env.production'), `NEXT_PUBLIC_SITE_URL=https://yourdomain.com
NEXT_PUBLIC_SITE_NAME=${opts.name}
CLERK_FRONTEND_API=
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SUCCESS_URL=https://yourdomain.com/dashboard
CANCEL_URL=https://yourdomain.com/
`);

  // -------------------------------------------
  // Add ready-to-run .env.local for dev
  // -------------------------------------------
  write(path.join(dir, '.env.local'), `# .env.local
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_NAME=${opts.name}

# Clerk
NEXT_PUBLIC_CLERK_FRONTEND_API=clerk.your-project.lcl.dev
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
SUCCESS_URL=http://localhost:3000/dashboard
CANCEL_URL=http://localhost:3000/

NEXT_PUBLIC_ENV=development
`);

  // -------------------------------------------
  // Add Supabase SQL migration file
  // -------------------------------------------
  write(path.join(dir, 'supabase/init.sql'), `-- supabase/init.sql
-- Creates events + signups tables for analytics and lead capture.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_type on public.events (type);
create index if not exists idx_events_created_at on public.events (created_at desc);

create table if not exists public.signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_signups_email on public.signups (email);
create index if not exists idx_signups_created_at on public.signups (created_at desc);

alter table public.events enable row level security;
alter table public.signups enable row level security;

create policy "allow_service_insert_events" on public.events
  for insert
  with check (auth.role() = 'service_role');

create policy "allow_service_insert_signups" on public.signups
  for insert
  with check (auth.role() = 'service_role');
`);



  // -------------------------------------------
  // Add Supabase client utility (universal client)
  // -------------------------------------------
  write(path.join(dir, 'lib/supabaseClient.ts'), `// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

/**
 * Client-side: use anonymous key
 * Server-side: prefer service role key for privileged ops
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY =
  typeof window === 'undefined'
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!)
`);

  // Optional: add minimal example API route using this client
  write(path.join(dir, 'pages/api/signups/add.ts'), `// pages/api/signups/add.ts
import { supabase } from '../../../lib/supabaseClient'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { email, source } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Missing email' })
  const { error } = await supabase.from('signups').insert([{ email, source, metadata: { ua: req.headers['user-agent'] } }])
  if (error) return res.status(500).json({ error: error.message })
  res.status(200).json({ ok: true })
}
`);

  // next.config.js
  write(path.join(dir, 'next.config.js'), `/** @type {import('next').NextConfig} */\nmodule.exports = { reactStrictMode: true };\n`);

  // pages/_app.tsx - wraps Clerk + Chakra providers
  write(path.join(dir, 'pages/_app.tsx'), `import { ChakraProvider } from '@chakra-ui/react';
import { ClerkProvider } from '@clerk/nextjs';
import { ClerkProvider as ClerkProviderClient } from '@clerk/nextjs/app-beta';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  // Clerk expects frontendApi or publishable key in env
  const clerkFrontendApi = process.env.NEXT_PUBLIC_CLERK_FRONTEND_API || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return (
    <ClerkProvider frontendApi={clerkFrontendApi}>
      <ChakraProvider>
        <Component {...pageProps} />
      </ChakraProvider>
    </ClerkProvider>
  );
}
`);

  // styles/globals.css
  write(path.join(dir, 'styles/globals.css'), `/* Minimal global styles - Chakra handles rest */\nhtml,body,#__next{height:100%;}\nbody{margin:0;font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue'}\n`);

  // pages/index.tsx - Chakra landing + hero + pricing + FAQ + CTA
  write(path.join(dir, 'pages/index.tsx'), `import { Box, Container, Heading, Text, Stack, Button, SimpleGrid, Flex, VStack } from '@chakra-ui/react';
import Link from 'next/link';

export default function Home() {
  return (
    <Box as="main" py={12}>
      <Container maxW="5xl">
        <Stack spacing={8} textAlign="center">
          <Heading size="2xl">Turn ideas into paying customers in days</Heading>
          <Text color="gray.600">Validated landing + billing + auth scaffold for rapid SaaS experiments.</Text>
          <Flex justify="center" gap={4}>
            <Link href="/sign-up"><Button colorScheme="blue">Get early access</Button></Link>
            <Link href="#features"><Button variant="ghost">See features</Button></Link>
          </Flex>
        </Stack>

        <SimpleGrid columns={{base:1, md:3}} spacing={6} mt={12}>
          <Box p={6} borderWidth={1} rounded="md"><Heading size="md">Fast templates</Heading><Text mt={2}>Launch landing + checkout quickly</Text></Box>
          <Box p={6} borderWidth={1} rounded="md"><Heading size="md">Clerk auth</Heading><Text mt={2}>Email + Google handled</Text></Box>
          <Box p={6} borderWidth={1} rounded="md"><Heading size="md">Stripe billing</Heading><Text mt={2}>Subscription checkout & webhooks</Text></Box>
        </SimpleGrid>

        <Box mt={12}>
          <Heading size="lg">Pricing</Heading>
          <SimpleGrid columns={{base:1, md:3}} spacing={4} mt={4}>
            <Box p={6} borderWidth={1} rounded="md"><Heading size="md">Free</Heading><Text mt={2}>Test ideas</Text></Box>
            <Box p={6} borderWidth={2} rounded="md"><Heading size="md">Pro</Heading><Text mt={2}>Paid & priority</Text></Box>
            <Box p={6} borderWidth={1} rounded="md"><Heading size="md">Agency</Heading><Text mt={2}>White-label</Text></Box>
          </SimpleGrid>
        </Box>

        <Box mt={12}>
          <Heading size="lg">FAQ</Heading>
          <VStack mt={4} align="start" spacing={3}>
            <Box p={4} borderWidth={1} rounded="md"><Text fontWeight="bold">How long to launch?</Text><Text>Under 1 day with this scaffold.</Text></Box>
            <Box p={4} borderWidth={1} rounded="md"><Text fontWeight="bold">Can I add a domain?</Text><Text>Yes, configure in Netlify after deploy.</Text></Box>
          </VStack>
        </Box>
      </Container>
    </Box>
  );
}
`);

  // Clerk - sign-in / sign-up pages using Clerk components
  write(path.join(dir, 'pages/sign-in.tsx'), `import { SignIn } from '@clerk/nextjs';\nexport default function SignInPage(){ return <SignIn routing="path" path="/sign-in" /> }\n`);
  write(path.join(dir, 'pages/sign-up.tsx'), `import { SignUp } from '@clerk/nextjs';\nexport default function SignUpPage(){ return <SignUp routing="path" path="/sign-up" /> }\n`);

  // dashboard - protected
  write(path.join(dir, 'pages/dashboard.tsx'), `import { useUser, SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';
import { Box, Button, Heading, Text } from '@chakra-ui/react';
import { useState } from 'react';

export default function Dashboard() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  return (
    <Box p={8}>
      <SignedIn>
        <Heading>Welcome, {user?.firstName || user?.fullName || 'friend'}</Heading>
        <Text mt={4}>This is your dashboard. Check billing, give feedback, or contact the founder.</Text>
        <Box mt={6}><Button colorScheme="blue" onClick={() => alert('open feedback modal')}>Give feedback</Button></Box>
      </SignedIn>
      <SignedOut>
        <Text>Please sign in to view dashboard.</Text>
        <SignInButton><Button mt={4}>Sign in</Button></SignInButton>
      </SignedOut>
    </Box>
  );
}
`);

  // API route: events/track -> writes to Supabase (server-side)
  write(path.join(dir, 'pages/api/events/track.ts'), `import { createClient } from '@supabase/supabase-js';
export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'supabase not configured' });
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { type, data } = req.body || {};
  const row = { type, data, created_at: new Date().toISOString() };
  const { error } = await sb.from('events').insert([row]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}
`);

  // Stripe create-checkout + webhook
  write(path.join(dir, 'pages/api/stripe/create-checkout.ts'), `import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2022-11-15' });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { priceId } = req.body;
  if (!priceId) return res.status(400).json({ error: 'missing priceId' });
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: process.env.SUCCESS_URL,
    cancel_url: process.env.CANCEL_URL,
  });
  res.json({ url: session.url });
}
`);
  write(path.join(dir, 'pages/api/stripe/webhook.ts'), `import Stripe from 'stripe';
import { buffer } from 'micro';
export const config = { api: { bodyParser: false } };
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2022-11-15' });

export default async function handler(req, res) {
  const sig = req.headers['stripe-signature'];
  const buf = await buffer(req);
  try {
    const evt = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
    // handle events: checkout.session.completed etc
    console.log('stripe event', evt.type);
    res.json({ received: true });
  } catch (err) {
    console.error('webhook error', err);
    res.status(400).send('err');
  }
}
`);

  // Minimal API health
  write(path.join(dir, 'pages/api/health.ts'), `export default function handler(req, res) { res.json({ ok: true, now: Date.now() }); }\n`);

  // Blog listing page (shared hero)
  write(path.join(dir, 'pages/blog/index.tsx'), `import { Box, Heading } from '@chakra-ui/react';
export default function Blog() {
  return (
    <Box p={8}>
      <Heading>Blog</Heading>
      <Box mt={6} bgImage="url('/shared-hero.jpg')" bgSize="cover" h="48" borderRadius="md" />
    </Box>
  );
}
`);
  // public placeholder image
  write(path.join(dir, 'public/shared-hero.jpg'), '');

  // founder dashboard
  write(path.join(dir, 'pages/founder.tsx'), `import { Box, Heading } from '@chakra-ui/react';
export default function Founder() {
  const items = [{title:'Run ad test', desc:'7–14 days'}, {title:'First paid', desc:'Convert a user'}];
  return (<Box p={8}><Heading>Founder Dashboard</Heading><Box mt={4}>{items.map((it,i)=> <Box key={i} p={3} borderWidth={1} rounded="md" mb={2}><b>{it.title}</b><div>{it.desc}</div></Box>)}</Box></Box>)
}
`);

  // netlify functions dir (placeholder) - Netlify handles Next functions via plugin; we include an empty folder
  fs.mkdirSync(path.join(dir, 'netlify'), { recursive: true });

  // GitHub Actions workflow (auto deploy on push to main)
  write(path.join(dir, '.github/workflows/deploy.yml'), `name: Build and Deploy to Netlify
on:
  push:
    branches: [ 'main' ]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 18
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Deploy to Netlify
        uses: nwtgck/actions-netlify@v1.2.4
        with:
          publish-dir: ".next"
          production-deploy: true
        env:
          NETLIFY_AUTH_TOKEN: \${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: \${{ secrets.NETLIFY_SITE_ID }}
`);

  // README with next steps
  write(path.join(dir, 'README.md'), `# ${opts.name}\n\n## Quickstart (local)\n1. Copy .env.staging -> .env.local and fill values (CLERK keys, SUPABASE, STRIPE keys).\n2. Run: npm run dev\n\n## Netlify / GitHub Actions\n- Add NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID to GitHub Secrets. The workflow will auto-deploy on push to main.\n- Create a Netlify site and enable the Next.js plugin (@netlify/plugin-nextjs).\n`);

  console.log('Scaffold files created at', dir);
}

function autoInstall(dir) {
  console.log('Running npm install in', dir);
  try {
    execSync('npm install', { stdio: 'inherit', cwd: dir });
    console.log('npm install finished');
  } catch (e) {
    console.error('npm install failed', e);
  }
}

function destroy(dir) {
  if (!fs.existsSync(dir)) { console.error('dir not found', dir); return; }
  function rmrf(p) {
    if (fs.existsSync(p)) {
      fs.readdirSync(p).forEach(f => {
        const cur = path.join(p, f);
        if (fs.lstatSync(cur).isDirectory()) rmrf(cur); else fs.unlinkSync(cur);
      });
      fs.rmdirSync(p);
    }
  }
  rmrf(dir);
  console.log('Removed', dir);
}

program
  .command('apply')
  .option('--name <name>')
  .option('--dir <dir>')
  .option('--repo <repo>')
  .option('--stripe', 'include stripe', true)
  .option('--db <db>', 'db (supabase)', 'supabase')
  .option('--deploy <target>', 'deploy (netlify)', 'netlify')
  .option('--no-install', 'skip npm install')
  .action(async (opts) => {
    let answers;
    if (!opts.name) {
      answers = await askInteractive(opts);
    } else {
      const dir = opts.dir || path.join(process.cwd(), slugify(opts.name));
      answers = { name: opts.name, dir, repo: opts.repo || '', stripe: !!opts.stripe, auth: 'clerk', db: opts.db, deploy: opts.deploy, autoInstall: opts.install !== false };
    }
    createScaffold(answers.dir, answers);
    if (answers.autoInstall) autoInstall(answers.dir);
    console.log('Scaffold complete. Next steps:\n1) copy .env.staging -> .env.local and fill secrets\n2) npm run dev (if not auto installed) or cd into dir and run npm run dev\n3) create Netlify site and add NETLIFY_SITE_ID & NETLIFY_AUTH_TOKEN to GitHub Secrets for CI deploy.');
  });

program
  .command('destroy')
  .option('--dir <dir>')
  .action((opts) => {
    if (!opts.dir) { console.error('specify --dir'); process.exit(1); }
    destroy(opts.dir);
  });

program.parse(process.argv);
