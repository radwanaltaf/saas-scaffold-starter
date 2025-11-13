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

# Optional Ad Pixels
NEXT_PUBLIC_META_PIXEL_ID=
NEXT_PUBLIC_LINKEDIN_ID=
NEXT_PUBLIC_TIKTOK_ID=

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

  // Safe Clerk Wrapper to avoid SSR crashes
  write(path.join(dir, 'lib/safeClerk.tsx'), `import React from "react";

const hasClerk =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 20;

let RealClerk: any = null;
if (hasClerk) {
  try {
    RealClerk = require("@clerk/nextjs");
  } catch (err) {
    console.warn("Clerk failed to load:", err);
  }
}

function NoopProvider({ children }) {
  return <>{children}</>;
}

const noop = () => ({
  isLoaded: false,
  isSignedIn: false,
  user: null,
});

export const SafeClerkProvider = ({ children }) => {
  if (hasClerk && RealClerk?.ClerkProvider) {
    return (
      <RealClerk.ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
        {children}
      </RealClerk.ClerkProvider>
    );
  }
  return <NoopProvider>{children}</NoopProvider>;
};

export const useUser =
  hasClerk && RealClerk?.useUser ? RealClerk.useUser : noop;
export const SignedIn =
  hasClerk && RealClerk?.SignedIn ? RealClerk.SignedIn : ({ children }) => null;
export const SignedOut =
  hasClerk && RealClerk?.SignedOut ? RealClerk.SignedOut : ({ children }) => children;
export const SignInButton =
  hasClerk && RealClerk?.SignInButton
    ? RealClerk.SignInButton
    : ({ children }) => <>{children}</>;
`);


  // Optional: add minimal example API route using this client
  write(path.join(dir, 'pages/api/signups/add.ts'), `// pages/api/signups/add.ts
import { supabase } from '../../../lib/supabaseClient'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { email, source, utm } = req.body || {}
    if (!email) return res.status(400).json({ error: 'Missing email' })

    const metadata = {
      source: source || 'landing',
      utm: utm || null,
      ua: req.headers['user-agent'],
      ts: new Date().toISOString()
    }

    const { error } = await supabase.from('signups').insert([{ email, metadata }])
    if (error) return res.status(500).json({ error: error.message })

    // Optional: Trigger Meta "Lead" pixel event if available
    if (process.env.NEXT_PUBLIC_META_PIXEL_ID) {
      try {
        // Return JS snippet that executes fbq('track', 'Lead') on client
        return res.status(200).json({
          ok: true,
          metaEvent: true,
          message: 'Signup tracked + Meta Lead event fired'
        })
      } catch (e) {
        console.warn('Meta pixel error', e.message)
      }
    }

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
}

`);

  // next.config.js
  write(path.join(dir, 'next.config.js'), `/** @type {import('next').NextConfig} */\nmodule.exports = { reactStrictMode: true };\n`);

  // pages/_app.tsx - wraps Clerk + Chakra providers
  write(path.join(dir, 'pages/_app.tsx'), `// pages/_app.tsx
import '../styles/globals.css';
import { ChakraProvider } from '@chakra-ui/react';
import { useEffect } from 'react';
import { SafeClerkProvider } from '../lib/safeClerk';
import { injectAnalytics } from '../lib/analytics';
import { injectAdPixels } from '../lib/ads';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    injectAnalytics();
    injectAdPixels();
  }, []);

  // Capture UTM params globally
  useEffect(() => {
    const url = new URL(window.location.href);
    const utmKeys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
    const params = {};
    utmKeys.forEach(k => {
      const v = url.searchParams.get(k);
      if (v) {
        localStorage.setItem(k, v);
        params[k] = v;
      }
    });
    window.__UTM__ = params;
  }, []);

  return (
    <SafeClerkProvider>
      <ChakraProvider>
        <Component {...pageProps} />
      </ChakraProvider>
    </SafeClerkProvider>
  );
}
`);


  // -------------------------------------------
  // Analytics snippets: GA + MS Clarity
  // -------------------------------------------
  write(path.join(dir, 'lib/analytics.ts'), `// lib/analytics.ts
export const injectAnalytics = () => {
  if (typeof window === 'undefined') return;
  // Google Analytics
  const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID;
  if (GA_MEASUREMENT_ID && !window['ga-init']) {
    const s = document.createElement('script');
    s.src = \`https://www.googletagmanager.com/gtag/js?id=\${GA_MEASUREMENT_ID}\`;
    s.async = true;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag(){window.dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID);
    window['ga-init'] = true;
  }

  // Microsoft Clarity
  const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;
  if (CLARITY_ID && !window['clarity-init']) {
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      c[a]('consent');
    })(window, document, "clarity", "script", CLARITY_ID);
    window['clarity-init'] = true;
  }
};
`);


  // -------------------------------------------
  // Ads Pixel injection helper (Meta, LinkedIn, TikTok)
  // -------------------------------------------
  write(path.join(dir, 'lib/ads.ts'), `// lib/ads.ts
export const injectAdPixels = () => {
  if (typeof window === 'undefined') return;

  // Meta Pixel
  const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (META_PIXEL_ID && !window['fbq-init']) {
    !(function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)})(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
    window['fbq-init'] = true;
    console.log('✅ Meta Pixel injected');
  }

  // LinkedIn Insight Tag
  const LINKEDIN_ID = process.env.NEXT_PUBLIC_LINKEDIN_ID;
  if (LINKEDIN_ID && !window['li-init']) {
    const s = document.createElement('script');
    s.type = 'text/javascript';
    s.innerHTML = \`_linkedin_partner_id = "\${LINKEDIN_ID}";
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(_linkedin_partner_id);\`;
    document.head.appendChild(s);
    const t = document.createElement('script');
    t.type = 'text/javascript';
    t.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
    t.async = true;
    document.head.appendChild(t);
    window['li-init'] = true;
    console.log('✅ LinkedIn pixel injected');
  }

  // TikTok Pixel (optional)
  const TIKTOK_ID = process.env.NEXT_PUBLIC_TIKTOK_ID;
  if (TIKTOK_ID && !window['ttq-init']) {
    !(function (w, d, t) {
      w.TiktokAnalyticsObject = t;
      var ttq = (w[t] = w[t] || []);
      ttq.methods = ["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie"];
      ttq.setAndDefer = function(t, e) {
        t[e] = function() {
          t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
        };
      };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.instance = function(t) {
        var e = ttq._i[t] || [];
        for (var n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
        return e;
      };
      ttq.load = function(e, n) {
        var i = "https://analytics.tiktok.com/i18n/pixel/events.js";
        ttq._i = ttq._i || {};
        ttq._i[e] = [];
        ttq._i[e]._u = i;
        ttq._t = ttq._t || {};
        ttq._t[e] = +new Date();
        ttq._o = ttq._o || {};
        ttq._o[e] = n || {};
        var o = document.createElement("script");
        o.type = "text/javascript";
        o.async = true;
        o.src = i + "?sdkid=" + e + "&lib=" + t;
        var a = document.getElementsByTagName("script")[0];
        a.parentNode.insertBefore(o, a);
      };
      ttq.load(TIKTOK_ID);
      ttq.page();
      window['ttq-init'] = true;
      console.log('✅ TikTok pixel injected');
    })(window, document, 'ttq');
  }
};
`);


  // styles/globals.css
  write(path.join(dir, 'styles/globals.css'), `/* Minimal global styles - Chakra handles rest */\nhtml,body,#__next{height:100%;}\nbody{margin:0;font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue'}\n`);

  // pages/index.tsx - Chakra landing + hero + pricing + FAQ + CTA
  write(path.join(dir, 'pages/index.tsx'), `// pages/index.tsx
import {
  Box, Container, Heading, Text, Stack, Button,
  SimpleGrid, Flex, VStack, Input, useColorModeValue
} from '@chakra-ui/react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState } from 'react';
import Head from 'next/head';

const MotionBox = motion(Box);

export default function Home() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    setLoading(true);
    const utm = typeof window !== 'undefined' ? window.__UTM__ || {} : {};
    const res = await fetch('/api/signups/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'landing', utm }),
    });
    const data = await res.json();
    if (data.ok) {
      if (typeof window !== 'undefined' && window.fbq) window.fbq('track', 'Lead');
      alert('Thanks! You’re on the waitlist 🚀');
      setEmail('');
    } else {
      alert('Error: ' + data.error);
    }
    setLoading(false);
  }

  return (
    <>
      <Head>
        <title>Launch SaaS Ideas Fast | OnboardKit Scaffold</title>
        <meta name="description" content="Validate SaaS ideas in days, not weeks. Full-stack Next.js + Stripe + Supabase scaffold." />
        <meta property="og:title" content="Launch SaaS Ideas Fast" />
        <meta property="og:description" content="Full-stack SaaS starter kit with auth, billing, and analytics prewired." />
        <meta property="og:image" content="/og-cover.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <Box
        as="main"
        py={16}
        bgGradient={useColorModeValue(
          'linear(to-b, gray.50, white)',
          'linear(to-b, gray.900, gray.800)'
        )}
        minH="100vh"
      >
        <Container maxW="6xl">
          <Stack spacing={10} textAlign="center">
            <MotionBox
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Heading
                size="2xl"
                bgGradient="linear(to-r, blue.500, teal.400)"
                bgClip="text"
              >
                Turn ideas into paying users in days
              </Heading>
              <Text mt={4} fontSize="xl" color={useColorModeValue('gray.600', 'gray.300')}>
                One command → live SaaS with auth, billing, analytics & hosting.
              </Text>
            </MotionBox>

            <Flex justify="center" gap={2}>
              <Input
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxW="300px"
                bg="white"
                color="black"
                _placeholder={{ color: 'gray.500' }}
              />
              <Button
                colorScheme="blue"
                onClick={handleSignup}
                isLoading={loading}
              >
                Join Waitlist
              </Button>
            </Flex>

            <Text fontSize="sm" color="gray.500">
              Join 100+ founders validating faster ⚡
            </Text>
          </Stack>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={8} mt={20} id="features">
            {[
              {
                title: '1-min Install',
                desc: 'Next.js scaffold deploys to Netlify instantly.',
              },
              {
                title: 'Clerk + Stripe + Supabase',
                desc: 'Pre-wired auth, billing, and analytics.',
              },
              {
                title: 'Pixel-Ready',
                desc: 'Meta, LinkedIn, and GA tracking auto-enabled.',
              },
            ].map((f, i) => (
              <MotionBox
                key={i}
                p={8}
                borderWidth={1}
                rounded="2xl"
                shadow="md"
                bg={useColorModeValue('white', 'gray.700')}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.2 }}
              >
                <Heading size="md" mb={2}>{f.title}</Heading>
                <Text color="gray.500">{f.desc}</Text>
              </MotionBox>
            ))}
          </SimpleGrid>

          <Box mt={20} textAlign="center" id="pricing">
            <Heading size="lg">Simple Pricing</Heading>
            <Text color="gray.500" mt={2}>
              Start free, upgrade only when you launch.
            </Text>

            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} mt={8}>
              {['Free', 'Pro', 'Enterprise'].map((plan, i) => (
                <MotionBox
                  key={plan}
                  p={8}
                  borderWidth={i === 1 ? 2 : 1}
                  rounded="2xl"
                  shadow={i === 1 ? 'lg' : 'md'}
                  bg={useColorModeValue('white', 'gray.700')}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.15 }}
                >
                  <Heading size="md">{plan}</Heading>
                  <Text mt={2} color="gray.500">
                    {plan === 'Free'
                      ? 'Test ideas quickly'
                      : plan === 'Pro'
                      ? 'Grow with analytics'
                      : 'Scale & integrate deeply'}
                  </Text>
                  <Button
                    mt={6}
                    colorScheme="blue"
                    variant={plan === 'Pro' ? 'solid' : 'outline'}
                    as={Link}
                    href="/sign-up"
                  >
                    {plan === 'Free' ? 'Start Free' : 'Get Started'}
                  </Button>
                </MotionBox>
              ))}
            </SimpleGrid>
          </Box>

          <Box mt={24} textAlign="center" id="faq">
            <Heading size="lg">Frequently Asked Questions</Heading>
            <VStack mt={6} spacing={4} align="stretch">
              {[
                {
                  q: 'How fast can I launch?',
                  a: 'Under 1 day. Everything (auth, billing, analytics) is prewired.',
                },
                {
                  q: 'Do I need a backend?',
                  a: 'No, serverless functions handle all API logic for you.',
                },
                {
                  q: 'Can I add my domain?',
                  a: 'Yes — connect it easily in Netlify after deployment.',
                },
              ].map((faq, i) => (
                <MotionBox
                  key={i}
                  p={5}
                  borderWidth={1}
                  rounded="xl"
                  bg={useColorModeValue('white', 'gray.700')}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                >
                  <Text fontWeight="bold">{faq.q}</Text>
                  <Text color="gray.500">{faq.a}</Text>
                </MotionBox>
              ))}
            </VStack>
          </Box>
        </Container>
      </Box>
    </>
  );
}
`);

  // Clerk - sign-in / sign-up pages using Clerk components
  write(path.join(dir, 'pages/sign-in.tsx'), `import { useUser, SignedIn, SignedOut, SignInButton } from '../lib/safeClerk';\nexport default function SignInPage(){ return <SignIn routing="path" path="/sign-in" /> }\n`);
  write(path.join(dir, 'pages/sign-up.tsx'), `import { useUser, SignedIn, SignedOut, SignInButton } from '../lib/safeClerk';\nexport default function SignUpPage(){ return <SignUp routing="path" path="/sign-up" /> }\n`);

  // dashboard - protected
  write(path.join(dir, 'pages/dashboard.tsx'), `// pages/dashboard.tsx
import { useUser, SignedIn, SignedOut, SignInButton } from '../lib/safeClerk';\nimport { Box, Button, Heading, Text, VStack } from '@chakra-ui/react';
import { supabase } from '../lib/supabaseClient';
import FeedbackModal from '../components/FeedbackModal';
import { useState } from 'react';

export default function Dashboard() {
  const { user } = useUser();
  const [feedbacks, setFeedbacks] = useState([]);

  async function submitFeedback(text) {
    if (!text) return;
    await supabase.from('events').insert([{ type: 'feedback', data: { text } }]);
    setFeedbacks([...feedbacks, text]);
  }

  return (
    <Box p={8}>
      <SignedIn>
        <Heading>Welcome, {user?.firstName || user?.fullName || 'friend'} 👋</Heading>
        <Text mt={4}>
          This is your dashboard. You can share feedback, check billing, or contact the founder.
        </Text>
        <VStack mt={6} spacing={4} align="start">
          <FeedbackModal onSubmit={submitFeedback} />
          {feedbacks.length > 0 && (
            <Box>
              <Text fontWeight="bold" mb={2}>Recent Feedback:</Text>
              {feedbacks.map((fb, i) => (
                <Text key={i} fontSize="sm" color="gray.600">• {fb}</Text>
              ))}
            </Box>
          )}
        </VStack>
      </SignedIn>
      <SignedOut>
        <Text>Please sign in to view dashboard.</Text>
        <SignInButton>
          <Button mt={4}>Sign in</Button>
        </SignInButton>
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

  // -------------------------------------------
  // Drip Email Sequence Template
  // -------------------------------------------
  write(path.join(dir, 'drip/sequence.json'), JSON.stringify([
    {
      day: 0,
      subject: "Welcome to {{app_name}} 🎉",
      body: "Hey {{first_name}},\n\nThanks for joining {{app_name}}. Here’s how to get started today..."
    },
    {
      day: 2,
      subject: "How {{app_name}} helps you hit your goal faster 🚀",
    },
    {
      day: 5,
      subject: "Don’t miss this: exclusive early user bonus 🔥",
      body: "We’re closing early access soon. Secure your spot before it’s gone → {{cta_link}}"
    }
  ], null, 2));


  // -------------------------------------------
  // Outreach templates
  // -------------------------------------------
  write(path.join(dir, 'outreach/templates/email.txt'), `Subject: {{first_name}}, quick question about {{pain_point}}

Hey {{first_name}},

Noticed you {{context}} — built something that helps {{persona}} solve {{pain_point}} faster.

Would you be open to a 5-min demo? It’s built for {{persona}}s like you.

{{signature}}
`);

  write(path.join(dir, 'outreach/templates/twitter-dm.txt'), `Hey {{first_name}} 👋 saw your post about {{topic}}.  
We just launched {{app_name}} — helps {{persona}} save {{benefit}}.  
Want early access?`);


  // -------------------------------------------
  // Feedback Modal component
  // -------------------------------------------
  write(path.join(dir, 'components/FeedbackModal.tsx'), `import { useState } from 'react';
import { Box, Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, Textarea } from '@chakra-ui/react';
export default function FeedbackModal({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [isOpen, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <Box>
      <Button onClick={()=>setOpen(true)}>💬 Feedback</Button>
      <Modal isOpen={isOpen} onClose={()=>setOpen(false)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Share Feedback</ModalHeader>
          <ModalBody>
            <Textarea placeholder="What's on your mind?" value={msg} onChange={e=>setMsg(e.target.value)} />
            <Button mt={4} colorScheme="blue" onClick={()=>{onSubmit(msg);setMsg('');setOpen(false);}}>Submit</Button>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}`);



  // -------------------------------------------
  // Launch templates
  // -------------------------------------------
  const launchDir = path.join(dir, 'marketing/launch');
  fs.mkdirSync(launchDir, { recursive: true });
  write(path.join(launchDir, 'twitter-thread.txt'), `🔥 Just launched {{app_name}} 🚀

One command → full SaaS stack:
Next.js + Chakra + Clerk + Supabase + Stripe
+ Netlify auto-deploy.

Built to validate ideas FAST.

Try it: {{app_url}}
`);
  write(path.join(launchDir, 'product-hunt.txt'), `We built {{app_name}} to help founders launch faster 🚀
• 2-min setup
• Built-in auth + billing
• Live in one command
Join early access 👉 {{app_url}}
`);
  write(path.join(launchDir, 'indiehackers.txt'), `Hey IH 👋 just shipped {{app_name}}!
Full SaaS scaffold: Auth, Billing, Deploy pre-wired.
Would love feedback: {{app_url}}`);


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
