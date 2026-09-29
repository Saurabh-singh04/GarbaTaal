# GarbaTaal

Find your dance crew for Navratri — matched by nights, ground, style and skill.

**Positioning:** dance-first, crew-friendly, venue-anchored. Not a dating app.
This distinction is a product decision, a legal posture and a marketing message
at the same time — see `docs/` before changing any user-facing copy.

---

## Structure

```
backend/            .NET 9 Web API — batch jobs, admin, payment processing
frontend/           Angular 18 PWA — the whole user-facing product
supabase/migrations Schema + RLS + functions. THE source of truth for the DB.
.github/workflows   Keep-alive, festival cron, backups
docs/               Architecture and product decisions
```

One repo, not two. A schema change, the API that uses it and the UI that calls
it land in a single commit.

---

## The one architectural rule

> **Nothing a user waits on may depend on the .NET container being awake.**

Free hosting spins the API down after ~15 minutes idle and takes 30–60s to wake.
So Postgres is the application server on the critical path, and .NET is a batch
worker.

| Always works (Supabase) | Can be slow (.NET) |
|---|---|
| Login, profile, photos | Deck rebuild (cron) |
| Discovery (reads precomputed `deck_cache`) | Admin & moderation |
| Send/accept request (`send_request` RPC) | Payment reconciliation |
| Chat (Realtime + triggers) | Nightly cleanup |
| Report / block | Analytics |

Payment *checkout* runs in a Supabase Edge Function, not .NET — a 40-second cold
start at the moment someone wants to pay ₹99 is a lost sale.

---

## Setup

```bash
cp .env.example .env          # then fill it in

# Database — apply migrations in order
npx supabase link --project-ref <ref>
npx supabase db push

# Backend
cd backend && dotnet run

# Frontend
cd frontend && npm install && npm start
```

---

## Non-negotiables

1. **RLS on every table.** The Angular client talks to Postgres directly, so
   RLS *is* the authorization layer. Write a policy test for every new table.
2. **`SUPABASE_SERVICE_KEY` never reaches the browser.** It bypasses RLS entirely.
3. **Never trust a client payment callback.** The signed webhook is the source of
   truth; the fast path exists only so the UI feels instant.
4. **`requests` and `matches` have no INSERT policy.** They are written only
   through the SECURITY DEFINER functions, which enforce quota, blocks and the
   atomic mutual-match transaction.
5. **Never name the other person on a payment screen.** "Unlock all your matches"
   is a feature. "Unlock chat with Priya" is a fee for access to a person — which
   is the thing currently under police scrutiny in this category.
6. **Don't delete `.github/workflows/keepalive.yml`.** Supabase pauses free
   projects after ~7 days idle and this app is dormant ~355 days a year.

---

## Monetisation

| Product | Price | What it is |
|---|---|---|
| Free (women) | ₹0 | Everything, unlimited. They are the supply side. |
| Free (men) | ₹0 | 10 requests day one, then 5/day. 2 conversations. |
| **Navratri Pass** | **₹99** | Unlimited requests + all matches, whole festival, one payment |
| Verified badge | ₹49 | Selfie-verified tick — revenue and safety in one feature |
| Venue sponsorship | ₹15k–75k | **The actual business.** One venue outearns a thousand users. |

---

## Status

Scaffolding only. Nothing is implemented yet, and the go/no-go gate has not
been passed: **300 waitlist signups in one district and one venue saying yes.**
Build past this scaffold only if that test clears.
