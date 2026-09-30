import { Component, inject, signal, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthModalComponent } from '../../shared/auth-modal.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'gt-landing',
  standalone: true,
  imports: [AuthModalComponent],
  template: `
<!-- ─── STICKY NAV ──────────────────────────────────────────────────────── -->
<header class="nav" [class.nav--solid]="scrolled()">
  <div class="nav__inner">
    <a href="/" class="nav__brand" aria-label="GarbaTaal home">
      <span class="nav__mark" aria-hidden="true">ગ</span>
      <span class="nav__name">GarbaTaal</span>
    </a>
    <nav class="nav__links" aria-label="Site navigation">
      <a href="#how">How it works</a>
      <a href="#difference">Why us</a>
      <a href="#safety">Safety</a>
      <a href="#plans">Plans</a>
      <a href="#faq">FAQ</a>
    </nav>
    <button class="nav__cta btn-pill" type="button" [disabled]="busy()" (click)="openAuth()">
      Find your crew
    </button>
  </div>
</header>

<!-- ─── HERO ──────────────────────────────────────────────────────────────── -->
<section class="hero">
  <!-- Animated falling petals -->
  <div class="petals" aria-hidden="true">
    @for (p of petals; track p.i) {
      <div class="petal" [style]="p.style"></div>
    }
  </div>

  <!-- Ambient glow blobs -->
  <div class="aura aura--a" aria-hidden="true"></div>
  <div class="aura aura--b" aria-hidden="true"></div>

  <div class="hero__inner wrap">
    <div class="hero__copy">
      <div class="hero__badge">
        <span class="hero__badge-dot"></span>
        Navratri 2026 · 11–19 October · Pan India
      </div>
      <h1 class="hero__title">
        <span class="hero__line">Your taal.</span>
        <span class="hero__line hero__line--glow">Your crew.</span>
        <span class="hero__line">Your Navratri.</span>
      </h1>
      <p class="hero__lede">
        GarbaTaal connects you with dance partners matched by your nights, your area,
        and how you actually dance — not just a photo. Across major Garba cities in India.
      </p>
      <div class="hero__actions">
        <button class="btn-hero" type="button" (click)="openAuth()">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Start free with Google
        </button>
        <div class="hero__trust">
          <span>✓ 18+ verified</span>
          <span>✓ No app to download</span>
          <span>✓ 100% free to join</span>
        </div>
      </div>
    </div>

    <!-- Dancing couple banner -->
    <div class="hero__stage">
      <img
        class="hero__couple"
        src="/garba-couple.webp"
        alt="A couple dancing Dandiya under festive lights during Navratri"
        width="600"
        height="800"
        loading="eager"
      />
      <!-- Floating match chip overlay -->
      <div class="hero__match-chip" aria-hidden="true">
        <span>🎉</span> It's a match!
      </div>
      <!-- Floating reason chips -->
      <div class="hero__reason-chips" aria-hidden="true">
        <span class="reason-chip">🌙 Nights 4 &amp; 7 matched</span>
        <span class="reason-chip">📍 Both in Satellite</span>
        <span class="reason-chip">💃 Dodhiyu &amp; 3-Taali pro</span>
      </div>
    </div>
  </div>

  <!-- Scroll cue -->
  <div class="hero__scroll" aria-hidden="true">
    <span>Explore</span>
    <div class="scroll-line"></div>
  </div>
</section>

<!-- ─── FESTIVAL RHYTHM TICKER SLIDER ──────────────────────────────────── -->
<div class="festival-ticker" aria-hidden="true">
  <div class="ticker-track">
    @for (item of tickerItems; track $index) {
      <div class="ticker-pill">
        <span class="ticker-icon">{{ item.icon }}</span>
        <span class="ticker-text">{{ item.text }}</span>
      </div>
    }
    @for (item of tickerItems; track 'b' + $index) {
      <div class="ticker-pill">
        <span class="ticker-icon">{{ item.icon }}</span>
        <span class="ticker-text">{{ item.text }}</span>
      </div>
    }
  </div>
</div>

<!-- ─── THE PROBLEM WE SOLVE ──────────────────────────────────────────────── -->
<section class="section section--light section--problem">
  <div class="wrap">
    <div class="problem-grid">
      <div class="problem__copy">
        <span class="eyebrow">The Navratri Dilemma</span>
        <h2>Endless WhatsApp groups.<br>Awkward solo arrivals.<br>Mismatched dance styles.</h2>
        <p>
          You love Dodhiyu at fast tempo. They only know 2-Taali.
          You are free on nights 3, 5 and 8. Your friends are resting those nights.
          GarbaTaal eliminates the guesswork by matching you on real festival parameters.
        </p>
        <button class="btn-outline" type="button" (click)="openAuth()">Create your dance profile →</button>
      </div>
      <div class="problem__stats">
        <div class="stat-card">
          <div class="stat-card__num">9</div>
          <div class="stat-card__label">Nights of Navratri synchronized</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__num">6+</div>
          <div class="stat-card__label">Dance signals matched (style, skill, tempo, steps)</div>
        </div>
        <div class="stat-card stat-card--accent">
          <div class="stat-card__num">0</div>
          <div class="stat-card__label">Phone numbers exposed. Private &amp; secure by default.</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ─── HOW IT WORKS ──────────────────────────────────────────────────────── -->
<section class="section section--dark" id="how">
  <div class="wrap">
    <div class="section-head section-head--light">
      <span class="eyebrow eyebrow--genda">Simple &amp; Fast</span>
      <h2>From signup to the dance circle in 3 easy steps.</h2>
    </div>
    <div class="flow-steps">
      <div class="flow-step">
        <div class="flow-step__track">
          <div class="flow-step__dot">1</div>
          <div class="flow-step__line"></div>
        </div>
        <div class="flow-step__body">
          <h3>Sign in with Google</h3>
          <p>No password to remember. No phone number revealed. Works seamlessly directly in your mobile browser.</p>
        </div>
      </div>
      <div class="flow-step">
        <div class="flow-step__track">
          <div class="flow-step__dot">2</div>
          <div class="flow-step__line"></div>
        </div>
        <div class="flow-step__body">
          <h3>Set your dance profile &amp; nights</h3>
          <p>Select your style (Garba, Dandiya, or both), skill level, tempo preference, the nights you are free, and how far across your city you will travel.</p>
        </div>
      </div>
      <div class="flow-step">
        <div class="flow-step__track">
          <div class="flow-step__dot">3</div>
        </div>
        <div class="flow-step__body">
          <h3>Swipe, match &amp; coordinate</h3>
          <p>Every profile highlights why you match. When there is mutual interest, chat opens so the two of you can agree on a public place to meet.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ─── DIFFERENTIATORS (DANCE-FIRST) ────────────────────────────────────── -->
<section class="section section--light" id="difference">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Built for Navratri</span>
      <h2>A platform shaped around how India actually dances.</h2>
    </div>
    <div class="diff-grid">
      <div class="diff-card">
        <div class="diff-card__icon">🌙</div>
        <h3>Night-by-night matching</h3>
        <p>Pick any combination of the 9 nights. We only pair you with people active on the exact same dates.</p>
      </div>
      <div class="diff-card">
        <div class="diff-card__icon">🏟️</div>
        <h3>Neighbourhood-first</h3>
        <p>Set your area and how far you will travel. Dancers close to you come first, because people actually turn up for someone ten minutes away.</p>
      </div>
      <div class="diff-card">
        <div class="diff-card__icon">💃</div>
        <h3>Rhythm &amp; step compatibility</h3>
        <p>Whether you dance traditional slow Garba, intense Dodhiyu, 3-Taali, or Sanedo — match with dancers who keep your pace.</p>
      </div>
      <div class="diff-card">
        <div class="diff-card__icon">👥</div>
        <h3>Solo or group friendly</h3>
        <p>Attending solo or need a few more people to complete your circle? Set your preference and find dancers with matching vibes.</p>
      </div>
      <div class="diff-card">
        <div class="diff-card__icon">📍</div>
        <h3>Strictly public places</h3>
        <p>Plan cards let the two of you agree on a public landmark — never personal addresses, never live location.</p>
      </div>
      <div class="diff-card">
        <div class="diff-card__icon">💡</div>
        <h3>Transparent match reasons</h3>
        <p>Every card says why: “Shares 4 nights · Also in Satellite · Both know Dodhiyu.” No mystery algorithm.</p>
      </div>
    </div>
  </div>
</section>

<!-- ─── INTENT SECTION ─────────────────────────────────────────────────────── -->
<section class="section section--warm">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Clear Expectations</span>
      <h2>Choose your intent upfront. No guessing games.</h2>
      <p class="section-lede">
        Select what you are looking for during onboarding. You will only be paired with dancers who share compatible intentions.
      </p>
    </div>
    <div class="intent-grid">
      <div class="intent-card intent-card--active">
        <span class="intent-icon">💃</span>
        <h3>Just a dance partner</h3>
        <p>Here strictly for the music, the steps, and the joy of dancing together throughout Navratri.</p>
      </div>
      <div class="intent-card">
        <span class="intent-icon">🤝</span>
        <h3>Dance partner + friends</h3>
        <p>Looking to dance together, hang out with a festival group, and stay friends beyond the 9 nights.</p>
      </div>
      <div class="intent-card">
        <span class="intent-icon">👥</span>
        <h3>Complete your crew</h3>
        <p>Going with friends? Find 1 or 2 more dancers who know your steps to complete your circle.</p>
      </div>
    </div>
  </div>
</section>

<!-- ─── SAFETY ─────────────────────────────────────────────────────────────── -->
<section class="section section--dark" id="safety">
  <div class="wrap">
    <div class="section-head section-head--light">
      <span class="eyebrow eyebrow--genda">Safety &amp; Respect</span>
      <h2>Designed with thoughtful safeguards from day one.</h2>
    </div>
    <div class="safety-grid">
      <div class="safety-item">
        <div class="safety-item__icon">🔒</div>
        <div>
          <h3>Zero phone numbers</h3>
          <p>Login is handled via Google OAuth. Your mobile number is never stored, displayed, or shared with other members.</p>
        </div>
      </div>
      <div class="safety-item">
        <div class="safety-item__icon">✅</div>
        <div>
          <h3>Selfie verification badge</h3>
          <p>Dancers can submit a private selfie for manual human likeness review to earn a verified tick on their card.</p>
        </div>
      </div>
      <div class="safety-item">
        <div class="safety-item__icon">🛡️</div>
        <div>
          <h3>Automated moderation</h3>
          <p>Built-in database policies immediately flag and hold unsolicited contact sharing or commercial language.</p>
        </div>
      </div>
      <div class="safety-item">
        <div class="safety-item__icon">📍</div>
        <div>
          <h3>No GPS or location tracking</h3>
          <p>We never track where you are. The finest location we store is your area — precise enough to match on, useless for finding you.</p>
        </div>
      </div>
      <div class="safety-item">
        <div class="safety-item__icon">🛑</div>
        <div>
          <h3>One-tap block &amp; report</h3>
          <p>Maintain total control over your experience. Block or report any user directly from chat or profile view.</p>
        </div>
      </div>
      <div class="safety-item">
        <div class="safety-item__icon">⚖️</div>
        <div>
          <h3>Strict anti-companionship policy</h3>
          <p>GarbaTaal is a peer dance-coordination platform. Paid companionship or partner-for-hire solicitations result in immediate bans.</p>
        </div>
      </div>
    </div>

    <div class="disclaimer-box">
      <strong>Important Community Safeguard</strong>
      GarbaTaal does not rent, sell, or provide paid partners. All interactions are voluntary peer connections. Never send money to anyone offering paid accompaniment.
    </div>
  </div>
</section>

<!-- ─── PLANS ──────────────────────────────────────────────────────────────── -->
<section class="section section--light" id="plans">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Fair &amp; Transparent</span>
      <h2>Free for casual dancers. Pro for festival regulars.</h2>
      <p class="section-lede">
        Match, chat, and coordinate for all 9 nights. Upgrade anytime for unlimited swipes.
      </p>
    </div>
    <div class="plans-grid">
      <!-- Free -->
      <div class="plan-card">
        <div class="plan-card__head">
          <h3>Taali</h3>
          <div class="plan-card__price">Free</div>
          <p class="plan-card__sub">Essential festival discovery</p>
        </div>
        <ul class="plan-card__features">
          <li><span class="check">✓</span> 10 initial swipes, 5 daily thereafter</li>
          <li><span class="check">✓</span> Full chat access with mutual matches</li>
          <li><span class="check">✓</span> 9-night calendar &amp; travel radius</li>
          <li><span class="check">✓</span> Agree a public meeting point in chat</li>
          <li><span class="check">✓</span> Complete safety &amp; blocking tools</li>
        </ul>
        <button class="plan-btn plan-btn--outline" type="button" (click)="openAuth()">Start free</button>
      </div>

      <!-- Mid (Featured) -->
      <div class="plan-card plan-card--featured">
        <div class="plan-card__badge">Most Popular</div>
        <div class="plan-card__head">
          <h3>GarbaTaal Pro</h3>
          <div class="plan-card__price">₹99</div>
          <p class="plan-card__sub">One-time payment for all 9 nights</p>
        </div>
        <ul class="plan-card__features">
          <li><span class="check check--gold">✓</span> <strong>Unlimited swipes</strong> for all 9 nights</li>
          <li><span class="check check--gold">✓</span> See dancers who already liked you</li>
          <li><span class="check check--gold">✓</span> Rewind accidental left passes</li>
          <li><span class="check check--gold">✓</span> Priority placement in discovery decks</li>
          <li><span class="check check--gold">✓</span> Send a direct note with your like</li>
          <li><span class="check check--gold">✓</span> Includes all Taali features</li>
        </ul>
        <button class="plan-btn plan-btn--primary" type="button" (click)="openAuth()">Get Pro (₹99)</button>
      </div>

      <!-- Verified Badge -->
      <div class="plan-card">
        <div class="plan-card__head">
          <h3>Verified Badge</h3>
          <div class="plan-card__price">₹49</div>
          <p class="plan-card__sub">Lifetime profile verification</p>
        </div>
        <ul class="plan-card__features">
          <li><span class="check">✓</span> Manual human review of selfie likeness</li>
          <li><span class="check">✓</span> Blue verified tick on your profile</li>
          <li><span class="check">✓</span> Priority placement in discovery decks</li>
          <li><span class="check">✓</span> Unlocks "verified-only" chat queues</li>
          <li><span class="check">✓</span> One-time verification — stays forever</li>
        </ul>
        <button class="plan-btn plan-btn--outline" type="button" (click)="openAuth()">Get Verified Badge</button>
      </div>
    </div>
  </div>
</section>

<!-- ─── FAQ ────────────────────────────────────────────────────────────────── -->
<section class="section section--warm" id="faq">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Frequently Asked</span>
      <h2>Common questions answered.</h2>
    </div>
    <div class="faq-list">
      @for (faq of faqs; track faq.q; let i = $index) {
        <div class="faq-item" [class.faq-item--open]="openFaq() === i">
          <button class="faq-q" type="button" (click)="toggleFaq(i)"
                  [attr.aria-expanded]="openFaq() === i">
            {{ faq.q }}
            <span class="faq-arrow" aria-hidden="true">{{ openFaq() === i ? '−' : '+' }}</span>
          </button>
          @if (openFaq() === i) {
            <p class="faq-a">{{ faq.a }}</p>
          }
        </div>
      }
    </div>
  </div>
</section>

<!-- ─── FINAL CTA ──────────────────────────────────────────────────────────── -->
<section class="section section--dark section--cta">
  <div class="aura aura--cta" aria-hidden="true"></div>
  <div class="wrap cta-wrap">
    <h2 class="cta-title">
      Sharad Navratri 2026 starts<br>
      <span class="cta-date">11 October 2026.</span>
    </h2>
    <p class="cta-sub">
      9 festive nights across India. Find your rhythm and coordinate your circle before the first beat drops.
    </p>
    @if (error()) {
      <p class="error-msg" role="alert">{{ error() }}</p>
    }
    <button class="btn-hero btn-hero--large" type="button"
            [disabled]="busy()" (click)="openAuth()">
      {{ busy() ? 'Opening Google…' : 'Find your dance crew →' }}
    </button>
    <p class="cta-fine">18+ only · Free to join · Operates in your browser</p>
  </div>
</section>

<!-- ─── FOOTER ─────────────────────────────────────────────────────────────── -->
<footer class="footer">
  <div class="wrap">
    <div class="footer__top">
      <div class="footer__brand">
        <div class="footer__logo-line">
          <span class="nav__mark" aria-hidden="true">ગ</span>
          <span class="nav__name">GarbaTaal</span>
        </div>
        <p>India's dedicated festival dance partner &amp; crew coordination platform.<br>Matched by rhythm, area, and availability.</p>
      </div>
      <nav class="footer__links" aria-label="Footer links">
        <div class="footer__col">
          <h4>Navigation</h4>
          <a href="#how">How it works</a>
          <a href="#difference">Why us</a>
          <a href="#plans">Plans &amp; Pricing</a>
          <a href="/profile/dance">Dance profile</a>
        </div>
        <div class="footer__col">
          <h4>Safety &amp; Legal</h4>
          <a href="#safety">Safety features</a>
          <a href="/safety">Safety guidelines</a>
          <a href="/terms">Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
        </div>
      </nav>
    </div>
    <div class="footer__bottom">
      <p>© 2026 GarbaTaal. Built for Navratri across India.</p>
      <p class="footer__legal">GarbaTaal does not rent, sell or supply companions.</p>
    </div>
  </div>
</footer>

<!-- ─── STICKY BOTTOM CTA (MOBILE) ────────────────────────────────────────── -->
<div class="sticky-cta" [class.sticky-cta--visible]="scrolled()">
  <p>Navratri 2026 · Starts 11 Oct</p>
  <button class="sticky-btn" type="button" [disabled]="busy()" (click)="openAuth()">
    Join free →
  </button>
</div>
  
<gt-auth-modal
  [open]="authOpen()"
  [next]="nextUrl()"
  (closed)="authOpen.set(false)" />
`,
  styles: [`
    /* ── Design Tokens ──────────────────────────────────────────────────── */
    :host {
      --night:        #12091d;
      --night-2:      #1c0f2d;
      --plum:         #681b4f;
      --kesari:       #c2410c;
      --kesari-2:     #ea580c;
      --marigold:     #f59e0b;
      --diya:         #fffbf0;
      --ink:          #1d1526;
      --ink-soft:     #5e4a6e;
      --on-dark:      #f6eeff;
      --on-dark-soft: #c4add6;
      --ease:         cubic-bezier(.2,.7,.2,1);
      --ease-spring:  cubic-bezier(.34,1.56,.64,1);
    }

    * { box-sizing: border-box; }
    :host { display: block; background: var(--diya); color: var(--ink); overflow-x: hidden; }

    .wrap {
      width: 100%;
      max-width: 80rem;
      margin-inline: auto;
      padding-inline: clamp(1rem, 4vw, 3rem);
    }

    /* ── Nav ───────────────────────────────────────────────────────────── */
    .nav {
      position: fixed;
      inset: 0 0 auto;
      z-index: 50;
      transition: background .3s var(--ease), box-shadow .3s var(--ease);
    }
    .nav--solid {
      background: color-mix(in srgb, var(--night) 94%, transparent);
      backdrop-filter: blur(14px);
      box-shadow: 0 1px 0 #f6eeff14;
    }
    .nav__inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      height: 4.5rem;
      max-width: 80rem;
      margin-inline: auto;
      padding-inline: clamp(1rem, 4vw, 3rem);
    }
    .nav__brand {
      display: flex;
      align-items: center;
      gap: .5rem;
      text-decoration: none;
      color: var(--diya);
    }
    .nav__mark {
      width: 36px; height: 36px;
      display: grid; place-items: center;
      background: var(--kesari);
      border-radius: 10px;
      font-size: 1.25rem; font-weight: 700;
      color: white;
      flex-shrink: 0;
    }
    .nav__name {
      font-weight: 700;
      font-size: 1.15rem;
      color: var(--on-dark);
      letter-spacing: -.01em;
    }
    .nav__links {
      display: flex;
      gap: .25rem;
    }
    .nav__links a {
      color: var(--on-dark-soft);
      text-decoration: none;
      padding: .5rem .85rem;
      border-radius: 999px;
      font-size: .9375rem;
      transition: background .2s, color .2s;
    }
    .nav__links a:hover {
      background: #f6eeff1a;
      color: var(--on-dark);
    }
    @media (max-width: 768px) { .nav__links { display: none; } }

    .btn-pill {
      background: var(--kesari);
      color: white;
      border: none;
      border-radius: 999px;
      padding: .55rem 1.2rem .5rem;
      font: inherit;
      font-weight: 650;
      font-size: .9375rem;
      cursor: pointer;
      transition: background .2s, transform .2s;
      white-space: nowrap;
    }
    .btn-pill:hover:not(:disabled) { background: var(--kesari-2); transform: translateY(-1px); }
    .btn-pill:disabled { opacity: .5; cursor: not-allowed; }

    /* ── Hero ──────────────────────────────────────────────────────────── */
    .hero {
      min-height: 100svh;
      background:
        radial-gradient(55rem 38rem at 75% 55%, #c2410c30, transparent 65%),
        radial-gradient(35rem 30rem at 10% 15%, #681b4f66, transparent 70%),
        linear-gradient(180deg, #0d0615 0%, var(--night) 45%, var(--night-2) 100%);
      color: var(--on-dark);
      position: relative;
      overflow: hidden;
      padding-top: 7rem;
      padding-bottom: 3rem;
    }
    .hero__inner {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
      align-items: center;
      gap: clamp(1.5rem, 4vw, 4rem);
      min-height: calc(100svh - 10rem);
    }
    @media (max-width: 860px) {
      .hero__inner {
        grid-template-columns: 1fr;
        min-height: 0;
      }
    }

    /* Ambient effects */
    .petals { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
    .petal {
      position: absolute;
      top: -8%;
      width: .6rem;
      height: .95rem;
      background: linear-gradient(160deg, var(--marigold), var(--kesari));
      border-radius: 60% 60% 55% 55% / 75% 75% 40% 40%;
      opacity: 0;
      animation: petal-fall var(--t, 16s) linear var(--delay, 0s) infinite;
    }
    @keyframes petal-fall {
      0%   { opacity: 0; transform: translate(0,0) rotate(0deg); }
      8%   { opacity: .7; }
      85%  { opacity: .5; }
      100% { opacity: 0; transform: translate(var(--dx, 2rem), 95vh) rotate(400deg); }
    }

    .aura {
      position: absolute;
      border-radius: 50%;
      pointer-events: none;
      animation: 22s ease-in-out infinite alternate aura-drift;
    }
    .aura--a {
      width: 36rem; height: 36rem;
      background: radial-gradient(closest-side, #681b4f77, transparent);
      top: 2rem; left: -8rem;
    }
    .aura--b {
      width: 30rem; height: 30rem;
      background: radial-gradient(closest-side, #c2410c55, transparent);
      animation-delay: -8s;
      top: 30%; right: -5rem;
    }
    @keyframes aura-drift {
      0% { transform: translate(-2%, 2%); }
      100% { transform: translate(3%, -5%); }
    }

    /* Hero Content */
    .hero__copy { position: relative; z-index: 1; }
    .hero__badge {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      background: #f6eeff18;
      border: 1px solid #f6eeff28;
      border-radius: 999px;
      padding: .35rem .85rem .3rem;
      font-size: .8rem;
      font-weight: 650;
      color: var(--marigold);
      letter-spacing: .02em;
      margin-bottom: 1.25rem;
    }
    .hero__badge-dot {
      width: 8px; height: 8px;
      background: var(--marigold);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--marigold);
      animation: pulse-dot 1.8s infinite;
    }
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: .4; transform: scale(.85); }
    }

    .hero__title {
      font-size: clamp(2.8rem, 8.5vw, 5.25rem);
      font-weight: 800;
      line-height: .98;
      letter-spacing: -.02em;
      margin: 0 0 1.5rem;
    }
    .hero__line { display: block; }
    .hero__line--glow {
      background: linear-gradient(100deg, var(--marigold) 0%, #fff3dd 45%, #ffa0b0 75%, var(--marigold) 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .hero__lede {
      font-size: clamp(1rem, 2.3vw, 1.2rem);
      color: var(--on-dark-soft);
      max-width: 32rem;
      line-height: 1.55;
      margin-bottom: 2rem;
    }
    .hero__actions { display: flex; flex-direction: column; gap: .75rem; max-width: 22rem; }
    .hero__trust {
      display: flex;
      flex-wrap: wrap;
      gap: .75rem;
      font-size: .8rem;
      color: var(--on-dark-soft);
      opacity: .85;
      margin-top: .25rem;
    }

    .btn-hero {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .65rem;
      min-height: 3.5rem;
      padding: .85rem 1.75rem;
      background: white;
      color: var(--ink);
      border: none;
      border-radius: 999px;
      font: inherit;
      font-weight: 700;
      font-size: 1.0625rem;
      cursor: pointer;
      transition: transform .25s var(--ease), box-shadow .25s var(--ease);
      box-shadow: 0 10px 30px -10px #00000066;
    }
    .btn-hero:hover:not(:disabled) {
      transform: translateY(-3px);
      box-shadow: 0 18px 40px -12px #00000088;
    }
    .btn-hero:disabled { opacity: .5; cursor: not-allowed; }
    .btn-hero--large { font-size: 1.125rem; min-height: 3.75rem; padding: 1rem 2rem; }

    /* Hero Right Stage */
    .hero__stage {
      position: relative;
      height: clamp(28rem, 52vw, 44rem);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
    }
    @media (max-width: 860px) {
      .hero__stage { height: min(32rem, 95vw); margin-top: 1.5rem; }
    }

    .hero__couple {
      height: 100%;
      width: auto;
      max-width: 100%;
      object-fit: contain;
      object-position: center bottom;
      border-radius: 28px;
      box-shadow:
        0 0 0 1px #f6eeff14,
        0 40px 80px -30px #00000099,
        0 0 60px -10px #c2410c44;
      animation: couple-float 7s ease-in-out infinite alternate;
      display: block;
    }
    @keyframes couple-float {
      0%   { transform: translateY(-.5rem); }
      100% { transform: translateY(.7rem); }
    }

    .hero__match-chip {
      position: absolute;
      bottom: 2.5rem;
      left: -1rem;
      background: var(--marigold);
      color: var(--night);
      font-weight: 800;
      font-size: .95rem;
      padding: .55rem 1.1rem .5rem .85rem;
      border-radius: 999px;
      display: flex;
      align-items: center;
      gap: .45rem;
      box-shadow: 0 12px 30px -8px #f59e0baa;
      animation: chip-pop .7s var(--ease-spring) 1s both;
    }
    @keyframes chip-pop {
      0%   { opacity: 0; transform: scale(.7) translateY(10px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }

    .hero__reason-chips {
      position: absolute;
      top: 1.5rem;
      right: -1rem;
      display: flex;
      flex-direction: column;
      gap: .45rem;
      animation: chips-slide .8s var(--ease-spring) 1.4s both;
    }
    @keyframes chips-slide {
      0%   { opacity: 0; transform: translateX(16px); }
      100% { opacity: 1; transform: translateX(0); }
    }
    .reason-chip {
      background: color-mix(in srgb, var(--night) 88%, transparent);
      backdrop-filter: blur(10px);
      border: 1px solid #f6eeff22;
      color: var(--on-dark);
      font-size: .78rem;
      font-weight: 600;
      border-radius: 999px;
      padding: .35rem .85rem .3rem;
      white-space: nowrap;
      box-shadow: 0 4px 14px #00000044;
    }

    .hero__scroll {
      position: absolute;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .4rem;
      color: var(--on-dark-soft);
      font-size: .75rem;
      letter-spacing: .1em;
      text-transform: uppercase;
      opacity: .6;
    }
    .scroll-line {
      width: 1px;
      height: 2.5rem;
      background: linear-gradient(var(--on-dark-soft), transparent);
      animation: scroll-pulse 2s ease-in-out infinite;
    }
    @keyframes scroll-pulse {
      0%, 100% { opacity: .3; }
      50% { opacity: 1; }
    }

    /* ── Festival Ticker Slider ───────────────────────────────────────── */
    .festival-ticker {
      background: #150a22;
      border-block: 1px solid #f6eeff18;
      padding-block: .95rem;
      overflow: hidden;
      mask-image: linear-gradient(90deg, transparent, black 6% 94%, transparent);
      -webkit-mask-image: linear-gradient(90deg, transparent, black 6% 94%, transparent);
    }
    .ticker-track {
      display: flex;
      gap: 1rem;
      width: max-content;
      animation: ticker-slide 32s linear infinite;
    }
    .ticker-track:hover {
      animation-play-state: paused;
    }
    .ticker-pill {
      display: inline-flex;
      align-items: center;
      gap: .55rem;
      background: #f6eeff0e;
      border: 1px solid #f6eeff1c;
      border-radius: 999px;
      padding: .45rem 1.15rem .4rem;
      color: var(--on-dark);
      font-size: .875rem;
      font-weight: 600;
      white-space: nowrap;
      transition: background .2s, border-color .2s;
    }
    .ticker-pill:hover {
      background: #f6eeff18;
      border-color: var(--marigold);
    }
    .ticker-icon {
      font-size: 1.05rem;
    }
    .ticker-text {
      color: var(--on-dark);
      letter-spacing: .01em;
    }
    @keyframes ticker-slide {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }

    /* ── Problem Section ───────────────────────────────────────────────── */
    .section--problem {
      background: #fffdf8;
    }
    .problem-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
      gap: clamp(2rem, 5vw, 4rem);
      align-items: center;
    }
    @media (max-width: 860px) {
      .problem-grid { grid-template-columns: 1fr; }
    }
    .problem__copy h2 {
      font-size: clamp(1.75rem, 4vw, 2.6rem);
      line-height: 1.15;
      margin-bottom: 1rem;
    }
    .problem__copy p {
      font-size: 1.05rem;
      color: var(--ink-soft);
      line-height: 1.6;
      margin-bottom: 1.75rem;
    }
    .btn-outline {
      background: transparent;
      border: 2px solid var(--kesari);
      color: var(--kesari);
      font: inherit;
      font-weight: 700;
      font-size: .95rem;
      padding: .75rem 1.4rem;
      border-radius: 999px;
      cursor: pointer;
      transition: background .2s, color .2s;
    }
    .btn-outline:hover {
      background: var(--kesari);
      color: white;
    }
    .problem__stats {
      display: grid;
      gap: 1rem;
    }
    .stat-card {
      background: white;
      border: 1px solid #ecdfc9;
      border-radius: 18px;
      padding: 1.4rem 1.6rem;
      box-shadow: 0 4px 18px -4px rgba(29, 21, 38, .05);
    }
    .stat-card--accent {
      background: #fff5ea;
      border-color: #ffd6ad;
    }
    .stat-card__num {
      font-size: 2.25rem;
      font-weight: 800;
      color: var(--kesari);
      line-height: 1;
      margin-bottom: .35rem;
    }
    .stat-card__label {
      font-size: .95rem;
      color: var(--ink-soft);
      font-weight: 550;
    }

    /* ── Sections Common ───────────────────────────────────────────────── */
    .section {
      padding-block: clamp(4.5rem, 9vw, 7.5rem);
    }
    .section--light { background: var(--diya); }
    .section--dark {
      background: linear-gradient(180deg, var(--night) 0%, var(--night-2) 100%);
      color: var(--on-dark);
    }
    .section--warm { background: #fff8ed; }
    .section--cta {
      position: relative;
      overflow: hidden;
      text-align: center;
    }
    .aura--cta {
      width: 40rem; height: 40rem;
      background: radial-gradient(closest-side, #c2410c44, transparent);
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
    }

    .section-head { max-width: 44rem; margin-bottom: clamp(2.5rem, 5vw, 3.5rem); }
    .section-head h2 { font-size: clamp(1.65rem, 4vw, 2.75rem); line-height: 1.15; }
    .section-head--light h2 { color: var(--on-dark); }
    .section-lede {
      font-size: 1.05rem;
      color: var(--ink-soft);
      margin-top: 1rem;
      line-height: 1.55;
    }
    .section--dark .section-lede { color: var(--on-dark-soft); }

    .eyebrow {
      display: inline-block;
      font-size: .8125rem;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--kesari);
      margin-bottom: .75rem;
    }
    .eyebrow--genda { color: var(--marigold); }

    /* ── Flow Steps ────────────────────────────────────────────────────── */
    .flow-steps {
      display: grid;
      gap: 1.5rem;
      max-width: 52rem;
    }
    .flow-step {
      display: flex;
      gap: 1.5rem;
      align-items: flex-start;
    }
    .flow-step__track {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
    }
    .flow-step__dot {
      width: 2.75rem; height: 2.75rem;
      border-radius: 50%;
      background: var(--kesari);
      color: white;
      display: grid;
      place-items: center;
      font-weight: 800;
      font-size: 1.15rem;
      box-shadow: 0 0 0 4px #c2410c22;
    }
    .flow-step__line {
      width: 2px;
      height: 3rem;
      background: #f6eeff22;
      margin-top: .5rem;
    }
    .flow-step__body h3 {
      font-size: 1.15rem;
      color: var(--on-dark);
      margin-bottom: .35rem;
    }
    .flow-step__body p {
      font-size: .95rem;
      color: var(--on-dark-soft);
      margin: 0;
      line-height: 1.55;
    }

    /* ── Differentiators ───────────────────────────────────────────────── */
    .diff-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1.25rem;
    }
    .diff-card {
      background: white;
      border: 1px solid #ecdfc9;
      border-radius: 20px;
      padding: 1.75rem 1.5rem;
      box-shadow: 0 2px 10px rgba(29, 21, 38, .04);
      transition: transform .2s var(--ease), box-shadow .2s var(--ease);
    }
    .diff-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 24px -6px rgba(29, 21, 38, .08);
    }
    .diff-card__icon { font-size: 2rem; margin-bottom: .75rem; display: block; }
    .diff-card h3 { font-size: 1.1rem; margin-bottom: .5rem; }
    .diff-card p { font-size: .925rem; color: var(--ink-soft); margin: 0; line-height: 1.55; }

    /* ── Intent ────────────────────────────────────────────────────────── */
    .intent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.25rem;
    }
    .intent-card {
      border: 2px solid #ecdfc9;
      border-radius: 20px;
      padding: 1.75rem 1.5rem;
      background: white;
      transition: border-color .2s, box-shadow .2s;
    }
    .intent-card--active {
      border-color: var(--kesari);
      box-shadow: 0 0 0 3px #c2410c18;
    }
    .intent-icon { font-size: 2.2rem; display: block; margin-bottom: .85rem; }
    .intent-card h3 { font-size: 1.1rem; margin-bottom: .4rem; }
    .intent-card p { font-size: .925rem; color: var(--ink-soft); margin: 0; line-height: 1.5; }

    /* ── Safety ────────────────────────────────────────────────────────── */
    .safety-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.75rem;
      margin-bottom: 3rem;
    }
    .safety-item {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
    }
    .safety-item__icon {
      font-size: 1.75rem;
      flex-shrink: 0;
      width: 2.75rem;
      text-align: center;
      margin-top: .1rem;
    }
    .safety-item h3 { font-size: 1.05rem; color: var(--on-dark); margin-bottom: .35rem; }
    .safety-item p { font-size: .9rem; color: var(--on-dark-soft); margin: 0; line-height: 1.55; }

    .disclaimer-box {
      background: #f6eeff0e;
      border: 1px solid #f6eeff20;
      border-radius: 16px;
      padding: 1.4rem 1.6rem;
      color: var(--on-dark-soft);
      font-size: .9rem;
      line-height: 1.6;
      max-width: 48rem;
    }
    .disclaimer-box strong { color: var(--marigold); display: block; margin-bottom: .25rem; }

    /* ── Plans ─────────────────────────────────────────────────────────── */
    .plans-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      align-items: start;
    }
    .plan-card {
      background: white;
      border: 2px solid #ecdfc9;
      border-radius: 22px;
      padding: 2rem 1.6rem;
      position: relative;
    }
    .plan-card--featured {
      border-color: var(--kesari);
      box-shadow: 0 0 0 4px #c2410c18, 0 20px 50px -20px #c2410c44;
    }
    .plan-card__badge {
      position: absolute;
      top: -1px; left: 50%;
      transform: translateX(-50%);
      background: var(--kesari);
      color: white;
      font-size: .725rem;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      padding: .25rem .95rem .2rem;
      border-radius: 0 0 10px 10px;
    }
    .plan-card__head { margin-bottom: 1.5rem; text-align: center; }
    .plan-card__head h3 { font-size: 1.3rem; margin-bottom: .4rem; }
    .plan-card__price {
      font-size: 2.35rem;
      font-weight: 800;
      line-height: 1;
      margin-bottom: .25rem;
      color: var(--kesari);
    }
    .plan-card__sub { font-size: .825rem; color: var(--ink-soft); margin: 0; }
    .plan-card__features {
      list-style: none;
      margin: 0 0 1.75rem;
      padding: 0;
      display: grid;
      gap: .65rem;
    }
    .plan-card__features li {
      font-size: .9rem;
      display: flex;
      gap: .5rem;
      align-items: flex-start;
      color: var(--ink-soft);
    }
    .check { color: var(--kesari); font-weight: 800; flex-shrink: 0; }
    .check--gold { color: var(--marigold); }
    .plan-btn {
      width: 100%;
      min-height: 3rem;
      border-radius: 999px;
      font: inherit;
      font-weight: 700;
      font-size: .9375rem;
      cursor: pointer;
      transition: background .2s, transform .2s;
      border: 2px solid;
    }
    .plan-btn:hover { transform: translateY(-2px); }
    .plan-btn--primary {
      background: var(--kesari);
      color: white;
      border-color: var(--kesari);
      box-shadow: 0 10px 28px -10px #c2410c88;
    }
    .plan-btn--primary:hover { background: var(--kesari-2); }
    .plan-btn--outline {
      background: transparent;
      color: var(--kesari);
      border-color: var(--kesari);
    }
    .plan-btn--outline:hover { background: #c2410c0d; }

    /* ── FAQ ───────────────────────────────────────────────────────────── */
    .faq-list {
      max-width: 52rem;
      border-top: 1px solid #ecdfc9;
    }
    .faq-item {
      border-bottom: 1px solid #ecdfc9;
    }
    .faq-q {
      width: 100%;
      background: none;
      border: none;
      padding: 1.35rem 0;
      text-align: left;
      font: inherit;
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--ink);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    .faq-arrow {
      font-size: 1.5rem;
      font-weight: 400;
      color: var(--kesari);
      flex-shrink: 0;
      line-height: 1;
    }
    .faq-a {
      padding: 0 0 1.35rem;
      color: var(--ink-soft);
      font-size: .95rem;
      line-height: 1.65;
      margin: 0;
      max-width: 46rem;
    }

    /* ── CTA Final ─────────────────────────────────────────────────────── */
    .cta-wrap {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .cta-title {
      font-size: clamp(2rem, 5.5vw, 3.75rem);
      color: var(--on-dark);
      text-align: center;
      line-height: 1.1;
      margin-bottom: 1rem;
    }
    .cta-date { color: var(--marigold); }
    .cta-sub {
      font-size: 1.1rem;
      color: var(--on-dark-soft);
      text-align: center;
      margin-bottom: 2rem;
      max-width: 32rem;
      line-height: 1.5;
    }
    .cta-fine {
      margin-top: 1rem;
      font-size: .825rem;
      color: var(--on-dark-soft);
      opacity: .7;
    }
    .error-msg {
      color: #ff6b8a;
      font-size: .9rem;
      margin-bottom: .75rem;
    }

    /* ── Footer ────────────────────────────────────────────────────────── */
    .footer {
      background: var(--night);
      color: var(--on-dark-soft);
      padding-block: 4.5rem;
    }
    .footer__top {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 2fr);
      gap: 3rem;
      margin-bottom: 3rem;
    }
    @media (max-width: 680px) { .footer__top { grid-template-columns: 1fr; } }
    .footer__brand {
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }
    .footer__logo-line {
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    .footer__brand p {
      font-size: .9rem;
      color: var(--on-dark-soft);
      margin: .75rem 0 0;
      line-height: 1.6;
    }
    .footer__links {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 2rem;
    }
    .footer__col {
      display: flex;
      flex-direction: column;
      gap: .55rem;
    }
    .footer__col h4 {
      font-size: .825rem;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--marigold);
      margin-bottom: .35rem;
    }
    .footer__col a {
      color: var(--on-dark-soft);
      text-decoration: none;
      font-size: .925rem;
      transition: color .2s;
    }
    .footer__col a:hover { color: var(--on-dark); }
    .footer__bottom {
      border-top: 1px solid #f6eeff14;
      padding-top: 1.75rem;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: .5rem;
      font-size: .825rem;
    }
    .footer__legal { color: var(--on-dark-soft); opacity: .6; }

    /* ── Sticky Bottom CTA (Mobile) ────────────────────────────────────── */
    .sticky-cta {
      position: fixed;
      bottom: calc(.75rem + env(safe-area-inset-bottom));
      left: .75rem; right: .75rem;
      z-index: 40;
      background: color-mix(in srgb, var(--night) 94%, transparent);
      backdrop-filter: blur(12px);
      border-radius: 999px;
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: .75rem;
      padding: .5rem .5rem .5rem 1.25rem;
      box-shadow: 0 18px 40px -12px #16102299, inset 0 0 0 1px #f6eeff1f;
      transform: translateY(160%);
      transition: transform .4s var(--ease);
      color: var(--on-dark);
    }
    .sticky-cta--visible { transform: translateY(0); }
    @media (max-width: 640px) { .sticky-cta { display: flex; } }
    .sticky-cta p { font-size: .875rem; font-weight: 600; margin: 0; }
    .sticky-btn {
      background: var(--kesari);
      color: white;
      border: none;
      border-radius: 999px;
      padding: .6rem 1.25rem .55rem;
      font: inherit;
      font-weight: 700;
      font-size: .9rem;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .sticky-btn:disabled { opacity: .5; }

    @media (prefers-reduced-motion: reduce) {
      .petal, .aura, .hero__couple, .hero__badge-dot,
      .hero__match-chip, .hero__reason-chips, .scroll-line, .ticker-track { animation: none !important; }
      .hero__match-chip, .hero__reason-chips { opacity: 1; transform: none; }
    }
  `]
})
export class LandingComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);

  readonly busy = signal(false);

  /**
   * Where to land after signing in. Preserves ?next= so someone bounced off a
   * guarded route returns to it rather than to the generic deck.
   */
  readonly authOpen = signal(false);

  /** Opened by every call to action, so nobody leaves the page to sign in. */
  openAuth(): void {
    this.authOpen.set(true);
  }

  nextUrl(): string {
    return this.route.snapshot.queryParamMap.get('next') ?? '/discover';
  }
  readonly error = signal<string | null>(null);
  readonly scrolled = signal(false);
  readonly openFaq = signal<number | null>(null);

  readonly petals = Array.from({ length: 12 }, (_, i) => ({
    i,
    style: `
      left: ${8 + i * 7.5}%;
      --t: ${14 + (i % 5) * 3}s;
      --delay: ${-i * 1.3}s;
      --dx: ${(i % 2 === 0 ? 1 : -1) * (1 + i % 3)}rem;
    `
  }));

  readonly tickerItems = [
    { icon: '💃', text: 'Dodhiyu Steps' },
    { icon: '🥢', text: 'Raas & Dandiya' },
    { icon: '👏', text: '3-Taali & 2-Taali' },
    { icon: '⚡', text: 'Fast & Traditional Tempos' },
    { icon: '🌙', text: '9 Festive Nights' },
    { icon: '🥁', text: 'Hinch & Sanedo' },
    { icon: '📍', text: 'Area Matching' },
    { icon: '✨', text: 'Popatiyu & Trikoniya' },
    { icon: '👥', text: 'Solo & Group Circles' },
    { icon: '🎵', text: 'Find Your Rhythm' },
    { icon: '🛡️', text: 'Women-First Safety' },
    { icon: '🎊', text: 'Navratri 2026' }
  ];

  readonly faqs = [
    {
      q: 'How is GarbaTaal different from typical matchmaking apps?',
      a: 'GarbaTaal is engineered specifically around Garba & Dandiya culture. Rather than shallow swiping, we match dancers on real festival logistics: which specific nights you plan to attend, which part of your city you are in and how far you will travel, your preferred tempo (traditional or Dodhiyu), skill level, and shared dance steps. It is a festival coordination platform first.'
    },
    {
      q: 'Is GarbaTaal available across all cities in India?',
      a: 'Yes. GarbaTaal is open to dancers attending Navratri events across India — including Ahmedabad, Vadodara, Surat, Rajkot, Mumbai, Indore, Jaipur, Pune, Delhi NCR, and Bengaluru. You simply select your city and area, and tell us how far you are willing to travel.'
    },
    {
      q: 'Does GarbaTaal charge or provide "partners on rent"?',
      a: 'Absolutely not. GarbaTaal strictly prohibits paid companionship or partner rental listings. All participants are genuine dancers connecting by mutual consent. If anyone requests payment to dance or accompany you, report them immediately.'
    },
    {
      q: 'Can I find people if I already dance with a group of friends?',
      a: 'Yes! Many Garba dancers already have a circle of friends but need one or two more dancers to complete a round or keep up with fast steps. You can set your preference as "going with friends / looking for a crew".'
    },
    {
      q: 'Is GarbaTaal free to use?',
      a: 'Yes. GarbaTaal is free to join with daily swipes, mutual matching, chat, and all safety features included. For festival regulars who want unlimited swipes for all 9 nights, see who liked them, and rewind passes, GarbaTaal Pro is available for a one-time ₹99.'
    },
    {
      q: 'Do I need to download an application from the app store?',
      a: 'No download is required. GarbaTaal is built as a responsive Progressive Web App that works directly inside any mobile browser (Chrome, Safari, etc.). You can save it to your home screen for quick 1-tap access.'
    },
    {
      q: 'How does GarbaTaal protect female dancers?',
      a: 'Safety is central to the platform: sign-in is managed via Google (no phone number published), plans are restricted to public landmarks the two of you agree on (never live GPS tracking), chat includes automatic moderation against unsolicited contact sharing, and members can enable "verified-only" message filters.'
    },
    {
      q: 'When are the dates for Sharad Navratri 2026?',
      a: 'Sharad Navratri 2026 commences on Sunday, 11 October (Night 1) and culminates on Monday, 19 October 2026 (Night 9).'
    }
  ];

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    window.addEventListener('scroll', () => {
      this.scrolled.set(window.scrollY > 80);
    }, { passive: true });
  }

  toggleFaq(i: number): void {
    this.openFaq.set(this.openFaq() === i ? null : i);
  }

  async signIn(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const next = this.route.snapshot.queryParamMap.get('next') ?? '/discover';
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await this.supabase.signInWithGoogle(redirectTo);
      if (error) throw error;
    } catch {
      this.error.set('Could not open Google sign-in. Check your connection and try again.');
      this.busy.set(false);
    }
  }
}
