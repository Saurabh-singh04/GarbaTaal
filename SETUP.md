# Third-party setup

Everything GarbaTaal depends on outside this repo. Ordered by what blocks
launch, not by what's interesting.

**Launch: 11 October 2026.** Only one item on this list takes days. Do that
one first.

---

## The critical path

| # | Service | For | Cost | Card? | Time |
|---|---------|-----|------|-------|------|
| 1 | **Razorpay** | ₹99 pass | 2% per txn | KYC docs | **1–4 days** |
| 2 | Supabase | DB, auth, realtime | Free | No | done |
| 3 | Google Cloud | Google sign-in | Free | No | 15 min |
| 4 | Vercel | Frontend hosting | Free | No | 10 min |
| 5 | GitHub secrets | Keepalive, backups | Free | No | 5 min |
| 6 | Supabase Storage | Profile photos | Free | No | none |
| 7 | Render / Fly | .NET API | Free tier | Varies | optional |
| 8 | Firebase FCM | Push notifications | Free | No | skip for v1 |

Items 2–6 are an afternoon. Item 1 is the one that can miss the festival.

---

## 1. Razorpay — start today

Everything else can be done the night before. This can't.

Sole proprietorship KYC now needs **two** business documents (it used to be
one), and review takes 1–4 business days. Ten days to launch means you want
this submitted now, not next week.

**Documents**
- PAN card (yours)
- Aadhaar / Passport / Voter ID
- Bank account in the same name — cancelled cheque or statement
- **Two** of: UDYAM/MSME certificate · GST certificate · Shop &
  Establishment licence · IEC · postpaid mobile bill

UDYAM registration is free, online, and issues instantly at
<https://udyamregistration.gov.in>. If you have no business documents, get
UDYAM first, then use a postpaid mobile bill as the second.

**Steps**
1. Sign up: <https://dashboard.razorpay.com/signup>
2. Submit KYC. Use a **personal** email, not the work one.
3. While KYC is pending, work with **test mode** keys — the whole payment
   flow can be built and tested against them.
4. On approval, generate live keys at
   <https://dashboard.razorpay.com/app/keys>
5. Webhook: <https://dashboard.razorpay.com/app/webhooks>
   - URL: `https://<your-api>/webhooks/razorpay`
   - Events: `payment.captured`, `payment.failed`, `order.paid`
   - Save the webhook secret — it is **not** the same as the key secret

```
RAZORPAY_KEY_ID=rzp_test_...      # public; reaches the browser
RAZORPAY_KEY_SECRET=...           # server only
RAZORPAY_WEBHOOK_SECRET=...       # server only, different from the above
```

---

## 2. Supabase — done

Project `ufnnymmxocwdlnzmhcpv`, region ap-south-1, free tier.

**Outstanding:** re-paste `supabase/ALL_IN_ONE.sql` into
<https://supabase.com/dashboard/project/ufnnymmxocwdlnzmhcpv/sql/new>.
The live schema predates the location model.

Free tier: 500 MB database · 5 GB egress · 50k MAU · 2 projects.

**The trap:** free projects pause after **7 days without activity**. Not
billing — inactivity. `keepalive.yml` prevents it, but only once its secrets
are set (item 5).

Still `TODO` in `.env`: `SUPABASE_DB_PASSWORD`, `DATABASE_URL`. Needed only
for `backup.yml` and the .NET API. Get the password at
Settings → Database → Reset password. Use the **pooler on port 6543**, never
5432.

---

## 3. Google Cloud — Google sign-in

Free, no billing account, no card. Do **not** reuse the CareerAI project:
the consent screen would show the wrong app name, and it ties the startup to
work-account IP.

1. New project: <https://console.cloud.google.com/projectcreate> — personal
   account, dismiss the billing prompt
2. OAuth consent screen → External → name `GarbaTaal`, support email,
   **no logo** (a logo triggers brand verification and delays you)
3. Credentials → OAuth client ID → Web application
4. Authorized redirect URI, exactly:
   `https://ufnnymmxocwdlnzmhcpv.supabase.co/auth/v1/callback`
5. **Publish app** — without this you are capped at 100 users and tokens
   expire every 7 days. Non-sensitive scopes need no verification review.
6. Paste client ID + secret into
   <https://supabase.com/dashboard/project/ufnnymmxocwdlnzmhcpv/auth/providers>
7. Auth → URL Configuration → add `http://localhost:4200` and the Vercel URL

Nothing goes in `.env` — Supabase holds the secret server-side.

---

## 4. Vercel — frontend

Free hobby tier, no card. Angular SSR runs as a serverless function.

1. <https://vercel.com/new> → import `Saurabh-singh04/GarbaTaal`
2. Root directory: `frontend`
3. Framework preset: Angular
4. Deploy, then add the domain to Supabase Auth → URL Configuration

`environment.prod.ts` holds the anon key and is safe in the bundle — RLS is
what protects the data.

---

## 5. GitHub secrets

<https://github.com/Saurabh-singh04/GarbaTaal/settings/secrets/actions>

| Secret | Used by |
|---|---|
| `SUPABASE_URL` | keepalive, festival-jobs |
| `SUPABASE_ANON_KEY` | keepalive |
| `SUPABASE_SERVICE_KEY` | festival-jobs |
| `SUPABASE_DB_HOST` | backup |
| `SUPABASE_DB_USER` | backup |
| `SUPABASE_DB_PASSWORD` | backup |
| `API_BASE_URL` | keepalive, festival-jobs |
| `JOB_TOKEN` | festival-jobs (any long random string) |

Set the first two today — that is what stops the database pausing. The rest
can wait for the API.

---

## 6. Photos — Supabase Storage, not R2

R2 requires a card on file even inside the free tier. It is avoidable, and
the reason to avoid it is architectural rather than financial.

Supabase Storage uploads go **straight from the browser**, authorized by the
user's own JWT against the policies in migration 0006. ImageKit and
Cloudinary both need a server to mint a signed upload token, which puts the
sleeping .NET container back on a path a user waits on.

Free tier: 1 GB storage, and **separate** 5 GB uncached / 5 GB cached egress
quotas — images cache well, so roughly 10 GB/month in practice.

The provider is not what decides whether this holds. Compression is:

```
raw phone photo   ~3 MB    1 GB = 330 photos, egress gone in an afternoon
600x800 WebP      ~45 KB   1 GB = thousands, ~20,000 deck sessions/month
```

That is ~500-1,000 active dancers through the nine nights.
`frontend/src/app/core/utils/image.ts` does the compression; the 2 MB bucket
ceiling is a backstop, not the plan.

**Setup:** none. Migration 0006 creates the bucket and its policies when you
paste `ALL_IN_ONE.sql`. No account, no card, no env vars.

Move to ImageKit (20 GB bandwidth, 3 GB storage, no card, URL-param
transforms) when egress becomes a real constraint. By then you will have
revenue and a card is a non-question.

## 7. The .NET API — not on the launch path

By design, nothing a user waits on touches it. Discovery, requests, matching
and chat are all Postgres functions the Angular client calls directly, so
the API can be asleep or absent and the product still works.

It is needed only for the nightly deck rebuild and payment reconciliation.
Two options:

- **Deploy it** to Render or Fly free tier and set `API_BASE_URL`
- **Skip it** and move both jobs into Supabase (pg_cron + an Edge Function),
  which removes a whole service from the stack

Either way this is a post-launch decision, not a blocker.

---

## 8. Firebase FCM — skip

Web push on iOS Safari requires the user to install the PWA first, so reach
is poor in exactly the audience that matters. Realtime already covers
in-session notifications. Revisit after Navratri.

---

## Known gaps in this repo

Honest list of what is declared but not yet built:

- `/jobs/rebuild-decks` is called by `festival-jobs.yml` but does not exist
  in `Program.cs` — only `/health` does
- Razorpay: signature verification exists (`RazorpaySignature.cs`), order
  creation and the webhook handler do not
- R2 upload: no code, only env placeholders
- FCM: no code, only an env placeholder
- No Vercel or Render deploy config committed

---

## Order of work

```
today      Razorpay KYC  ·  re-paste SQL  ·  2 GitHub secrets
this week  Google OAuth  ·  Vercel  ·  R2
then       Razorpay order + webhook endpoints
before 11  end-to-end payment test in Razorpay test mode
```
