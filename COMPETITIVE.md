# Competitive analysis — Play Garba vs GarbaTaal

Written 1 October 2026, ten days before Navratri. Facts pulled from
playgarba.in, garbamatch.in and the Ahmedabad Cyber Crime Cell advisory on
the same day; re-verify before relying on the pricing.

---

## 1. What Play Garba actually is

Not a thin MVP. A shipped, complete product.

> "Find your Garba partner in Navratri 2026"
> "Swipe through people dancing at your ground, on your night. Match, chat,
> and meet at the main entrance."

Live in **Ahmedabad, Gandhinagar, Vadodara, Surat** — Gujarat only, with
"more cities in India will follow."

Note: `playgarba.com` is an unrelated Gujarati music streaming site. The
competitor is `playgarba.in`. Easy to analyse the wrong company.

Shipped features: swipe deck with private likes · mutual match opens chat ·
four intent categories · saved grounds · location check-ins that expire at
midnight · in-chat plan tools (ground, time, public meeting point) · photo
verification by private selfie · block, report, pause · Google sign-in with
no phone number · referral rewards.

---

## 2. The feature matrix

| | Play Garba | GarbaTaal |
|---|---|---|
| Swipe deck, private likes | shipped | shipped |
| Mutual match opens chat | shipped | **SQL only, no UI** |
| Chat | shipped | **SQL only, no UI** |
| See who liked you | ₹199 tier | **data exists, no UI** |
| Intent categories | 4 | 3 (`user_intent`) |
| Nights selection | yes | yes (9-bit mask) |
| **Dance style / skill / tempo / steps** | **no** | **shipped** |
| Location model | saved grounds | **city + area + travel radius** |
| Proximity scoring | not stated | `location_affinity()` |
| Photo upload | shipped | **util written, not wired** |
| Photo verification (selfie) | shipped | **not built** |
| Check-ins | shipped | not built |
| Plan tools in chat | shipped | table only |
| Block / report / pause | shipped | **tables only, no UI** |
| Anti-scam message policy | not advertised | **shipped (trigger)** |
| Referral rewards | shipped | not built |
| Cities | 4 (Gujarat) | 34 seeded, 10 live |
| Ticketing / venue listings | no | no (deliberate) |

---

## 3. Where they are ahead — plainly

They have a working product and we have five screens.

The three gaps that matter are **chat, the matches inbox and photo upload**.
Without those the core loop — discover → request → match → chat → meet —
does not close. Everything underneath is built and tested; the screens that
use it are not.

Photo verification is their strongest safety feature and we have nothing
equivalent. `profiles.is_verified` exists as a flag with no flow behind it.

Check-ins and referrals are real but second-order. Do not chase them.

---

## 4. Where we are ahead

**Dance-first matching is genuinely unique.** Play Garba matches on intent,
nights, ground and age. It does not match on how you dance. GarbaTaal has
`style`, `skill`, `tempo` and six named steps (2-taali, 3-taali, dodhiyu,
hinch, popatiyu, trikoniya) in `preferences`, and surfaces them as match
reasons.

This was the original thesis and it survives contact with the competitor.
A dancer who wants a fast Dodhiyu partner cannot express that on Play Garba.

**The location model is better for a country than for a state.** Grounds
require a curated venue directory per city — that is why they are in four
cities. Area plus travel radius needs only a city and area list, which
scales to 34 cities with no venue research and no organiser relationships.

**The message policy trigger is a real moat** and section 7 explains why.

---

## 5. The pricing collision

| | Play Garba | GarbaTaal |
|---|---|---|
| Free | women unlimited; men 15 day-one, 5/day | women unlimited; men 10 day-one, 5/day |
| Paid | **₹199/mo**, ₹499/mo | **₹99 one-time** |

Our free tier is within a swipe of theirs — convergent design, not
imitation; it is the standard shape.

The paid tier is where we differ, and we are better positioned:

**A monthly subscription for a nine-day festival is a mental-model
mismatch.** Navratri runs 11–19 October. Asking ₹199/month for an event
that ends in nine days invites the question "am I going to get charged
again in November?" A one-time **₹99 Navratri Pass** answers that before it
is asked, and is half the price.

Do not match their tiers. Our single pass is the cleaner offer and the
cheaper one. Compete on framing, not on features-per-rupee.

One thing to steal: **"see who liked you" is their ₹199 hook and it is the
highest-converting surface in this category.** We already store the data —
`requests` rows where `to_user_id = me and status = 'pending'`. The matches
inbox we must build anyway *is* that feature. Build it once, use it twice.

---

## 6. The geographic opening

Play Garba is Gujarat-only. GarbaMatch (garbamatch.in) claims Ahmedabad,
Vadodara, Surat, Mumbai and Delhi NCR but is **waitlist-only** — not
shipped. Someone else sees the pan-India opening and has not taken it yet.

The seed already reflects the right strategy: Ahmedabad, Gandhinagar,
Vadodara and Surat are seeded but `is_live = false`. Fighting for the four
cities where the incumbent holds indexed pages wastes the one structural
advantage we have.

**Caveat worth stating once.** Matching markets are density markets: fifty
dancers in one city beats five hundred across thirty. Ten live cities with
early traffic risks every one of them feeling empty. The architecture
already handles this honestly — `is_live`, the `thin_city` deck state,
per-city waitlists — so this is a marketing-allocation question, not an
architecture one. Concentrate launch effort on two or three cities while
the schema keeps serving all ten.

---

## 7. The regulatory read

The **Ahmedabad Cyber Crime Cell** (DCP Dr. Lavina Sinha) issued an advisory
before Navratri 2026. Read it carefully: it is **not** aimed at matching
apps. It targets "rent a garba partner" companion services — Instagram posts
selling ₹1,000/₹1,500/₹2,000 packages — and flags:

- advance payment demanded through unknown links or accounts
- phishing via messenger attachments
- financial transactions disguised as bookings
- **AI-generated fake accounts** rather than real users

Three of our existing decisions are now validated rather than merely
defensible:

1. **No per-match payment.** The original "₹99 when they both say yes"
   model reads as paying for a person. A one-time pass for app access does
   not. This is the difference between the advisory describing us and not.
2. **The `enforce_message_policy` trigger.** It holds any message combining
   contact details with payment language — literally the scam shape the
   advisory describes — and logs one-to-many contact sharing in
   `contact_share_log`. That is the mechanism that tells a real pair from a
   person working forty profiles.
3. **Never showing an invented dancer.** "AI-generated fake accounts" is
   named in the advisory. Sample profiles appear only signed-out, are
   flagged `is_sample`, and are labelled in the UI.

**Turn this into positioning.** A blunt FAQ entry — *"Is this rent-a-partner?
No. We never take money for meeting a person, we hold messages that mix
contact details with payment, and here is what we do if someone asks you for
money"* — is trust our competitor is not currently buying, in the exact week
the press is running the story.

---

## 8. What not to build

Ruthlessly, given ten days:

- **Check-ins.** Second-order. Needs density to mean anything.
- **Referral rewards.** Growth loop for a product that already retains.
- **Undo / rewind.** A paid-tier feature with no strategic value.
- **Photo verification.** Their best safety feature and genuinely valuable,
  but it needs a review queue and a human. Ship the report flow instead —
  it covers the same failure at a fraction of the cost.
- **The .NET API.** Nothing a user waits on touches it.
- **FCM push.** iOS requires PWA install first; reach is poor.

---

## 9. What this means architecturally

Nothing here changes the design. It sharpens the priority order.

The matches inbox is the highest-leverage object in the system: it closes
the core loop, it is "see who liked you", and it is the natural paywall
surface. `respond_to_request()` is written, tested and unused.

Chat is the largest remaining piece and the one everything else is pointless
without. The SQL is complete — RLS, rate limiting, conversation limits,
contact-sharing delay, scam detection. It needs a screen and a Realtime
subscription.

Photo upload is small: `image.ts` and the storage bucket both exist, and the
onboarding step is the only missing wiring.

---

## 10. The ten-day plan

```
Days 1-3   Matches inbox + chat        closes the loop; unlocks "who liked you"
Day  4     Photo upload                wire image.ts into onboarding
Day  5     Deploy to Vercel            something real to test on
Day  6     Report + block UI           safety, and the FAQ claim needs it
Day  7     "Is this rent-a-partner?"   positioning, while the story is live
Days 8-10  Paywall if Razorpay clears  otherwise launch free

In parallel, and not by me: Razorpay KYC, Google OAuth, GitHub secrets,
re-paste ALL_IN_ONE.sql.
```

**Launch free if the payment flow is not ready.** Users without revenue is
recoverable; payment infrastructure without users is not. `has_active_pass()`
and the entitlements ledger already exist, so switching the ₹99 on mid-
festival is a UI change, not an architectural one.

---

## Sources

- <https://playgarba.in/> — features, pricing, cities
- <https://garbamatch.in/garba-partner> — second entrant, waitlist only
- <https://indiaobservers.com/garba-partner-apps-navratri-police-advisory/> —
  Ahmedabad Cyber Crime Cell advisory
- <https://www.india.com/viral/rs-2000-for-an-entire-night-rent-a-garba-partner-package-details-ads-go-viral-ahead-of-navratri-ahmedabad-cyber-cell-issue-warning-8528663/>
  — the packages the advisory responds to
