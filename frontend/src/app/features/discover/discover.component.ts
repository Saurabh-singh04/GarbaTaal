import {
  Component,
  inject,
  signal,
  OnInit,
  computed,
  PLATFORM_ID,
  ElementRef,
  viewChild
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DiscoveryService } from '../../core/services/discovery.service';
import { ProfileService } from '../../core/services/profile.service';
import {
  DeckCandidate,
  SKILL_LABELS,
  STYLE_LABELS,
  TEMPO_LABELS,
  STEP_LABELS,
  INTENT_LABELS
} from '../../core/models/profile.model';
import { maskToNights } from '../../core/utils/nights';

@Component({
  selector: 'gt-discover',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
<div class="discover-layout">
  <!-- ─── TOP APP BAR ──────────────────────────────────────────────────────── -->
  <header class="app-bar">
    <div class="app-bar__inner">
      <a routerLink="/" class="brand" aria-label="GarbaTaal Home">
        <span class="brand__mark">ગ</span>
        <span class="brand__title">GarbaTaal</span>
      </a>

      <div class="festival-pill">
        <span class="festival-pill__dot"></span>
        <span>Navratri 2026</span>
      </div>

      <a routerLink="/profile/dance" class="profile-btn" aria-label="My Dance Profile" title="Edit Dance Profile">
        <span class="profile-icon">💃</span>
      </a>
    </div>
  </header>

  <!-- ─── MAIN SWIPE STAGE ──────────────────────────────────────────────────── -->
  <main class="stage-container">
    <!-- Signed-out preview. Says so plainly and permanently: someone must never
         be able to mistake an illustrative card for a real person. -->
    @if (discovery.isPreview()) {
      <div class="preview-banner" role="status">
        <strong>Preview</strong>
        <span>These are example dancers. Sign in to see real people at your grounds.</span>
      </div>
    }

    @if (discovery.loading() && candidates().length === 0) {
      <div class="deck-loader">
        <div class="spinner"></div>
        <p>Finding dancers for your nights &amp; grounds…</p>
      </div>
    } @else {
      @if (current(); as candidate) {
        <div class="deck-wrapper">
        <!-- Card Stack behind -->
        @if (candidates()[2]; as c2) {
          <div class="deck-card deck-card--back-2" aria-hidden="true"></div>
        }
        @if (candidates()[1]; as c1) {
          <div class="deck-card deck-card--back-1" aria-hidden="true">
            <img [src]="c1.photo_url || '/dancer-placeholder.svg'" alt="" class="card-bg" />
            <div class="card-gradient"></div>
            <div class="card-peek-info">
              <span class="peek-name">{{ c1.first_name }}, {{ c1.age }}</span>
            </div>
          </div>
        }

        <!-- Active Top Card (Draggable) -->
        <div
          #activeCard
          class="deck-card deck-card--active"
          [style.transform]="cardTransform()"
          [style.transition]="isDragging() ? 'none' : 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)'"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp()"
          (pointercancel)="onPointerUp()"
        >
          <!-- Swipe Stamp Overlays -->
          <div class="stamp stamp--like" [style.opacity]="likeOpacity()">
            <span>TAALI! ♥</span>
          </div>
          <div class="stamp stamp--pass" [style.opacity]="passOpacity()">
            <span>PASS ✕</span>
          </div>

          <!-- Card Background Media -->
          <img
            [src]="candidate.photo_url || '/dancer-placeholder.svg'"
            [alt]="candidate.first_name + ' dancing at Garba'"
            class="card-bg"
            draggable="false"
          />
          <div class="card-gradient"></div>

          <!-- Top Chips Overlay -->
          <div class="card-top-chips">
            <span class="chip chip--nights">
              {{ formatNights(candidate.availability.nights_mask) }}
            </span>
            @if (candidate.is_verified) {
              <span class="chip chip--verified" title="Human likeness verified">
                ✓ Verified
              </span>
            }
          </div>

          <!-- Card Content -->
          <div class="card-content">
            <!-- Why You Matched Chips -->
            <div class="reasons-row">
              @for (reason of candidate.reasons; track reason) {
                <span class="reason-pill">{{ reason }}</span>
              }
            </div>

            <!-- Dancer Name & Age -->
            <div class="name-row">
              <h2 class="dancer-name">{{ candidate.first_name }}, {{ candidate.age }}</h2>
              <button
                type="button"
                class="info-trigger-btn"
                (click)="openDetails(candidate, $event)"
                aria-label="View dance details"
                title="View dance details"
              >
                ℹ️
              </button>
            </div>

            <!-- Dance Signals Summary -->
            <p class="dance-meta">
              {{ styleLabel(candidate.preferences.style) }} ·
              {{ skillLabel(candidate.preferences.skill) }} ·
              {{ tempoLabel(candidate.preferences.tempo) }}
            </p>

            @if (candidate.bio) {
              <p class="bio-snippet">{{ candidate.bio }}</p>
            }
          </div>
        </div>
      </div>

      <!-- Action Buttons Floating Bar -->
      <nav class="action-bar" aria-label="Swipe actions">
        <button
          type="button"
          class="btn-act btn-act--rewind"
          [disabled]="!discovery.lastSwiped()"
          (click)="rewind()"
          title="Rewind last pass"
          aria-label="Rewind last pass"
        >
          <span>↺</span>
        </button>

        <button
          type="button"
          class="btn-act btn-act--pass"
          (click)="swipe(false)"
          title="Pass"
          aria-label="Pass"
        >
          <span>✕</span>
        </button>

        <button
          type="button"
          class="btn-act btn-act--info"
          (click)="openDetails(candidate)"
          title="View dance profile"
          aria-label="View dance profile"
        >
          <span>ℹ</span>
        </button>

        <button
          type="button"
          class="btn-act btn-act--like"
          (click)="swipe(true)"
          title="Taali / Match"
          aria-label="Taali / Like"
        >
          <span>♥</span>
        </button>
      </nav>
      } @else {
        <!-- Empty deck. Three different reasons, three different things to say
             and to do. "All caught up" shown to someone in an empty city is a
             lie that costs us the user. -->
        <div class="empty-deck">
          @switch (discovery.deckState()) {

            @case ('no_nights') {
              <div class="empty-art">🌙</div>
              <h2>Pick your nights first</h2>
              <p>
                Matching starts with when you're going. Choose your nights and
                grounds and we'll find people who'll be there too.
              </p>
              <div class="empty-actions">
                <a routerLink="/profile/dance" class="btn-empty btn-empty--primary">
                  Choose nights &amp; grounds
                </a>
              </div>
            }

            @case ('thin_city') {
              <div class="empty-art">🪔</div>
              <h2>You're early here</h2>
              <p>
                Not many dancers in your area yet. Invite a couple of friends —
                garba works better with a crew anyway, and you'll be first in
                line as more people join.
              </p>
              <div class="empty-actions">
                <button type="button" class="btn-empty btn-empty--primary" (click)="shareInvite()">
                  Invite friends on WhatsApp
                </button>
                <a routerLink="/profile/dance" class="btn-empty btn-empty--outline">
                  Add more nights
                </a>
              </div>
            }

            @default {
              <div class="empty-art">✨</div>
              <h2>You're all caught up</h2>
              <p>
                You've seen everyone matching your nights and grounds for now.
                New dancers join every day.
              </p>
              <div class="empty-actions">
                <button type="button" class="btn-empty btn-empty--primary" (click)="reloadDeck()">
                  ↻ Check again
                </button>
                <a routerLink="/profile/dance" class="btn-empty btn-empty--outline">
                  Update nights &amp; grounds
                </a>
              </div>
            }
          }
        </div>
      }
    }
  </main>

  <!-- ─── FULL DANCE PROFILE MODAL / SHEET ───────────────────────────────────── -->
  @if (selectedCandidate(); as detail) {
    <div class="modal-backdrop" (click)="closeDetails()">
      <div class="profile-sheet" (click)="$event.stopPropagation()">
        <header class="sheet-head">
          <div class="sheet-title">
            <h3>{{ detail.first_name }}, {{ detail.age }}</h3>
            <span class="sheet-sub">{{ styleLabel(detail.preferences.style) }} Dancer</span>
          </div>
          <button type="button" class="btn-close" (click)="closeDetails()" aria-label="Close">✕</button>
        </header>

        <div class="sheet-body">
          @if (detail.bio) {
            <div class="sheet-section">
              <h4>About</h4>
              <p class="sheet-bio">{{ detail.bio }}</p>
            </div>
          }

          <div class="sheet-section">
            <h4>Attending Nights</h4>
            <div class="nights-grid">
              @for (n of [1,2,3,4,5,6,7,8,9]; track n) {
                <div class="night-cell" [class.night-cell--active]="isAttendingNight(detail.availability.nights_mask, n)">
                  <span class="night-n">N{{ n }}</span>
                  <span class="night-label">{{ isAttendingNight(detail.availability.nights_mask, n) ? 'Going' : '—' }}</span>
                </div>
              }
            </div>
          </div>

          <div class="sheet-section">
            <h4>Dance Style &amp; Steps</h4>
            <div class="tags-cloud">
              <span class="tag-item">🎭 {{ styleLabel(detail.preferences.style) }}</span>
              <span class="tag-item">⭐ {{ skillLabel(detail.preferences.skill) }}</span>
              <span class="tag-item">⚡ {{ tempoLabel(detail.preferences.tempo) }}</span>
              @for (step of detail.preferences.steps; track step) {
                <span class="tag-item tag-item--step">💃 {{ stepLabel(step) }}</span>
              }
            </div>
          </div>

          <div class="sheet-section">
            <h4>Preferred Grounds</h4>
            <div class="grounds-list">
              @for (venue of detail.availability.venue_names; track venue) {
                <span class="ground-item">🏟️ {{ venue }}</span>
              }
            </div>
          </div>

          <div class="sheet-section">
            <h4>Intent</h4>
            <p class="intent-text">
              {{ intentLabel(detail.preferences.intent) }}
              @if (detail.preferences.going_with_friends) {
                <span class="intent-sub">(Dancing with a group of friends)</span>
              }
            </p>
          </div>
        </div>

        <footer class="sheet-footer">
          <button type="button" class="sheet-act-btn sheet-act-btn--pass" (click)="swipeFromSheet(false)">
            Pass ✕
          </button>
          <button type="button" class="sheet-act-btn sheet-act-btn--like" (click)="swipeFromSheet(true)">
            Taali ♥
          </button>
        </footer>
      </div>
    </div>
  }

  <!-- ─── "IT'S A MATCH!" CELEBRATION MODAL ─────────────────────────────────── -->
  @if (celebrateMatch(); as match) {
    <div class="modal-backdrop modal-backdrop--celebrate">
      <div class="match-modal">
        <div class="match-confetti" aria-hidden="true">🎉 ✨ 💃 🥢 ✨ 🎉</div>
        <h2 class="match-headline">It's a Match!</h2>
        <p class="match-subline">
          You and <strong>{{ match.first_name }}</strong> both liked each other's rhythm.
        </p>

        <div class="match-avatars">
          <div class="avatar-ring avatar-ring--me">
            <span class="avatar-emoji">🕺</span>
          </div>
          <div class="match-heart">♥</div>
          <div class="avatar-ring avatar-ring--partner">
            <img [src]="match.photo_url || '/dancer-placeholder.svg'" [alt]="match.first_name" />
          </div>
        </div>

        <div class="match-reasons-summary">
          <p>🌙 Matched for {{ formatNights(match.availability.nights_mask) }}</p>
          <p>🏟️ Coordinate your meeting point at the Garba ground</p>
        </div>

        <div class="match-actions">
          <button
            type="button"
            class="match-btn match-btn--primary"
            (click)="continueAfterMatch()"
          >
            Start Chatting
          </button>
          <button
            type="button"
            class="match-btn match-btn--ghost"
            (click)="continueAfterMatch()"
          >
            Keep Swiping
          </button>
        </div>
      </div>
    </div>
  }
</div>
  `,
  styles: [`
    /* ─── Tokens ────────────────────────────────────────────────────────── */
    :host {
      --night:       #12091d;
      --night-card:  #1b0f2a;
      --kesari:      #c2410c;
      --kesari-hov:  #ea580c;
      --marigold:    #f59e0b;
      --marigold-glow: rgba(245, 158, 11, 0.35);
      --diya:        #fffbf0;
      --pass-color:  #ff4d6d;
      --like-color:  #10b981;
      --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    * { box-sizing: border-box; }

    .discover-layout {
      min-height: 100svh;
      background:
        radial-gradient(40rem 30rem at 50% 10%, #681b4f44, transparent 75%),
        linear-gradient(180deg, #0e0517 0%, var(--night) 100%);
      color: #f6eeff;
      display: flex;
      flex-direction: column;
      user-select: none;
      -webkit-user-select: none;
      overflow-x: hidden;
    }

    /* ─── Top App Bar ───────────────────────────────────────────────────── */
    .app-bar {
      position: sticky;
      top: 0;
      z-index: 20;
      background: color-mix(in srgb, var(--night) 85%, transparent);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid #f6eeff12;
      height: 3.75rem;
    }
    .app-bar__inner {
      max-width: 32rem;
      height: 100%;
      margin-inline: auto;
      padding-inline: 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: .45rem;
      text-decoration: none;
      color: inherit;
    }
    .brand__mark {
      width: 30px; height: 30px;
      background: var(--kesari);
      border-radius: 8px;
      display: grid; place-items: center;
      font-weight: 700; font-size: 1.1rem;
      color: white;
    }
    .brand__title {
      font-weight: 700;
      font-size: 1.05rem;
      letter-spacing: -.01em;
    }
    .festival-pill {
      display: flex;
      align-items: center;
      gap: .4rem;
      background: #f6eeff0e;
      border: 1px solid #f6eeff18;
      border-radius: 999px;
      padding: .2rem .7rem .18rem;
      font-size: .75rem;
      font-weight: 600;
      color: var(--marigold);
    }
    .festival-pill__dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--marigold);
      box-shadow: 0 0 8px var(--marigold);
    }
    .profile-btn {
      width: 34px; height: 34px;
      border-radius: 50%;
      background: #f6eeff14;
      display: grid; place-items: center;
      font-size: 1.1rem;
      text-decoration: none;
      border: 1px solid #f6eeff22;
      transition: transform .2s;
    }
    .profile-btn:hover { transform: scale(1.08); }

    /* ─── Main Stage ────────────────────────────────────────────────────── */
    .stage-container {
      flex: 1;
      max-width: 32rem;
      width: 100%;
      margin-inline: auto;
      padding: .75rem 1rem 1.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .deck-wrapper {
      position: relative;
      width: 100%;
      height: clamp(30rem, 74vh, 42rem);
      max-height: calc(100svh - 11rem);
    }

    /* ─── Deck Cards Stack ──────────────────────────────────────────────── */
    .deck-card {
      position: absolute;
      inset: 0;
      border-radius: 26px;
      overflow: hidden;
      background: var(--night-card);
      border: 1px solid #f6eeff1a;
      box-shadow: 0 20px 50px -15px rgba(0, 0, 0, 0.8);
      touch-action: none;
    }

    .deck-card--back-2 {
      transform: scale(0.9) translateY(1.5rem);
      opacity: 0.45;
      z-index: 1;
    }
    .deck-card--back-1 {
      transform: scale(0.95) translateY(0.75rem);
      opacity: 0.75;
      z-index: 2;
    }
    .card-peek-info {
      position: absolute;
      bottom: 1rem;
      left: 1.25rem;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.7);
      font-size: .95rem;
    }

    .deck-card--active {
      z-index: 3;
      cursor: grab;
    }
    .deck-card--active:active {
      cursor: grabbing;
    }

    .card-bg {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center 25%;
      display: block;
      pointer-events: none;
    }

    .card-gradient {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        180deg,
        rgba(18, 9, 29, 0.35) 0%,
        rgba(18, 9, 29, 0.1) 40%,
        rgba(18, 9, 29, 0.85) 75%,
        rgba(18, 9, 29, 0.98) 100%
      );
      pointer-events: none;
    }

    /* ─── Swipe Stamp Overlays ──────────────────────────────────────────── */
    .stamp {
      position: absolute;
      top: 2rem;
      padding: .45rem 1.25rem;
      border-radius: 12px;
      border: 3.5px solid;
      font-size: 1.45rem;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
      z-index: 10;
      pointer-events: none;
      backdrop-filter: blur(4px);
    }
    .stamp--like {
      right: 1.5rem;
      color: var(--like-color);
      border-color: var(--like-color);
      transform: rotate(14deg);
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.4);
    }
    .stamp--pass {
      left: 1.5rem;
      color: var(--pass-color);
      border-color: var(--pass-color);
      transform: rotate(-14deg);
      box-shadow: 0 0 20px rgba(255, 77, 109, 0.4);
    }

    /* ─── Top Chips ─────────────────────────────────────────────────────── */
    .card-top-chips {
      position: absolute;
      top: 1rem;
      left: 1rem;
      right: 1rem;
      display: flex;
      justify-content: space-between;
      gap: .5rem;
      z-index: 5;
      pointer-events: none;
    }
    .chip {
      padding: .3rem .75rem .25rem;
      border-radius: 999px;
      font-size: .75rem;
      font-weight: 700;
      letter-spacing: .02em;
      backdrop-filter: blur(10px);
    }
    .chip--nights {
      background: rgba(245, 158, 11, 0.9);
      color: #12091d;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
    }
    .chip--verified {
      background: rgba(16, 185, 129, 0.85);
      color: white;
    }

    /* ─── Card Content ──────────────────────────────────────────────────── */
    .card-content {
      position: absolute;
      inset: auto 0 0;
      padding: 1.25rem 1.25rem 1rem;
      z-index: 6;
      display: flex;
      flex-direction: column;
      gap: .35rem;
      pointer-events: none;
    }

    .reasons-row {
      display: flex;
      flex-wrap: wrap;
      gap: .35rem;
      margin-bottom: .25rem;
    }
    .reason-pill {
      background: rgba(246, 238, 255, 0.15);
      border: 1px solid rgba(246, 238, 255, 0.22);
      border-radius: 999px;
      padding: .2rem .65rem;
      font-size: .725rem;
      font-weight: 600;
      color: #fff;
    }

    .name-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .dancer-name {
      font-size: 1.85rem;
      font-weight: 800;
      margin: 0;
      line-height: 1.1;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
    }
    .info-trigger-btn {
      pointer-events: auto;
      background: rgba(246, 238, 255, 0.2);
      border: 1px solid rgba(246, 238, 255, 0.3);
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 50%;
      display: grid;
      place-items: center;
      cursor: pointer;
      font-size: 1.05rem;
      transition: transform .2s;
    }
    .info-trigger-btn:hover { transform: scale(1.1); }

    .dance-meta {
      font-size: .875rem;
      font-weight: 600;
      color: var(--marigold);
      margin: 0;
    }
    .bio-snippet {
      font-size: .825rem;
      color: rgba(246, 238, 255, 0.85);
      margin: .25rem 0 0;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* ─── Floating Actions Bar ──────────────────────────────────────────── */
    .action-bar {
      margin-top: 1rem;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1.1rem;
    }
    .btn-act {
      width: 3.6rem;
      height: 3.6rem;
      border-radius: 50%;
      border: 2px solid;
      background: #1d0f2f;
      display: grid;
      place-items: center;
      font-size: 1.35rem;
      font-weight: 800;
      cursor: pointer;
      transition: transform .2s var(--ease-spring), box-shadow .2s;
      box-shadow: 0 8px 24px -6px rgba(0, 0, 0, 0.6);
    }
    .btn-act:hover:not(:disabled) {
      transform: scale(1.12);
    }
    .btn-act:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .btn-act--rewind {
      width: 3rem; height: 3rem;
      font-size: 1.1rem;
      border-color: #ffd166;
      color: #ffd166;
    }
    .btn-act--pass {
      border-color: var(--pass-color);
      color: var(--pass-color);
    }
    .btn-act--pass:hover:not(:disabled) {
      box-shadow: 0 0 24px rgba(255, 77, 109, 0.4);
    }
    .btn-act--info {
      width: 3rem; height: 3rem;
      font-size: 1.1rem;
      border-color: #a78bfa;
      color: #a78bfa;
    }
    .btn-act--like {
      width: 4rem; height: 4rem;
      font-size: 1.6rem;
      border-color: var(--marigold);
      background: linear-gradient(135deg, var(--kesari), var(--marigold));
      color: white;
      box-shadow: 0 0 24px var(--marigold-glow);
    }
    .btn-act--like:hover:not(:disabled) {
      box-shadow: 0 0 32px rgba(245, 158, 11, 0.6);
    }

    /* ─── Empty Deck View ───────────────────────────────────────────────── */
    /* Preview banner. Deliberately not dismissible — the moment it can be
       hidden, an example dancer starts looking like a real one. */
    .preview-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: .5rem;
      margin: 0 auto .75rem;
      max-width: 420px;
      padding: .6rem .9rem;
      border: 1px solid var(--primary, #c2410c);
      border-radius: 10px;
      background: var(--primary-soft, #fff1e6);
      color: var(--primary, #c2410c);
      font-size: .8125rem;
      line-height: 1.4;
    }

    .preview-banner strong {
      text-transform: uppercase;
      letter-spacing: .04em;
      font-size: .6875rem;
    }

    .empty-deck {
      text-align: center;
      padding: 3rem 1.5rem;
      max-width: 24rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .75rem;
    }
    .empty-art {
      font-size: 4.5rem;
      margin-bottom: .5rem;
      animation: float-flame 2.5s ease-in-out infinite alternate;
    }
    @keyframes float-flame {
      0%   { transform: translateY(0) scale(1); }
      100% { transform: translateY(-8px) scale(1.05); }
    }
    .empty-deck h2 {
      font-size: 1.6rem;
      margin: 0;
      color: var(--marigold);
    }
    .empty-deck p {
      font-size: .925rem;
      color: rgba(246, 238, 255, 0.75);
      line-height: 1.55;
      margin: 0 0 1rem;
    }
    .empty-actions {
      display: flex;
      flex-direction: column;
      gap: .65rem;
      width: 100%;
    }
    .btn-empty {
      padding: .85rem 1.5rem;
      border-radius: 999px;
      font: inherit;
      font-weight: 700;
      font-size: .95rem;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      transition: transform .2s;
    }
    .btn-empty--primary {
      background: var(--kesari);
      color: white;
      border: none;
    }
    .btn-empty--outline {
      background: transparent;
      border: 1px solid rgba(246, 238, 255, 0.3);
      color: #f6eeff;
    }

    /* ─── Full Profile Sheet / Modal ────────────────────────────────────── */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(10, 4, 16, 0.75);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .profile-sheet {
      background: #190e28;
      border: 1px solid #f6eeff1f;
      border-radius: 28px 28px 0 0;
      width: 100%;
      max-width: 32rem;
      max-height: 85vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      animation: sheet-slide-up .3s var(--ease-spring);
    }
    @keyframes sheet-slide-up {
      0%   { transform: translateY(100%); }
      100% { transform: translateY(0); }
    }
    .sheet-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem 1rem;
      border-bottom: 1px solid #f6eeff14;
    }
    .sheet-title h3 {
      font-size: 1.4rem;
      margin: 0;
    }
    .sheet-sub {
      font-size: .85rem;
      color: var(--marigold);
      font-weight: 600;
    }
    .btn-close {
      width: 2rem; height: 2rem;
      border-radius: 50%;
      background: #f6eeff14;
      border: none;
      color: white;
      font-size: 1rem;
      cursor: pointer;
    }
    .sheet-body {
      padding: 1.25rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.4rem;
    }
    .sheet-section h4 {
      font-size: .8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--marigold);
      margin: 0 0 .5rem;
    }
    .sheet-bio {
      font-size: .95rem;
      line-height: 1.55;
      color: rgba(246, 238, 255, 0.9);
      margin: 0;
    }
    .nights-grid {
      display: grid;
      grid-template-columns: repeat(9, 1fr);
      gap: .35rem;
    }
    .night-cell {
      border: 1px solid #f6eeff1a;
      border-radius: 8px;
      padding: .4rem .15rem;
      text-align: center;
      background: #f6eeff08;
    }
    .night-cell--active {
      background: var(--kesari);
      border-color: var(--kesari);
      color: white;
      font-weight: 700;
    }
    .night-n { font-size: .75rem; font-weight: 700; display: block; }
    .night-label { font-size: .6rem; opacity: .8; display: block; }

    .tags-cloud {
      display: flex;
      flex-wrap: wrap;
      gap: .5rem;
    }
    .tag-item {
      background: #f6eeff12;
      border: 1px solid #f6eeff1c;
      border-radius: 999px;
      padding: .35rem .85rem .3rem;
      font-size: .825rem;
      font-weight: 600;
    }
    .tag-item--step {
      border-color: var(--marigold);
      color: var(--marigold);
    }
    .grounds-list {
      display: flex;
      flex-direction: column;
      gap: .4rem;
    }
    .ground-item {
      font-size: .925rem;
      color: rgba(246, 238, 255, 0.85);
    }
    .intent-text {
      font-size: .95rem;
      margin: 0;
      color: white;
      font-weight: 600;
    }
    .intent-sub {
      display: block;
      font-size: .8rem;
      font-weight: 400;
      color: rgba(246, 238, 255, 0.7);
      margin-top: .2rem;
    }
    .sheet-footer {
      display: flex;
      gap: 1rem;
      padding: 1rem 1.5rem 1.5rem;
      border-top: 1px solid #f6eeff14;
    }
    .sheet-act-btn {
      flex: 1;
      padding: .85rem;
      border-radius: 999px;
      font: inherit;
      font-weight: 700;
      font-size: 1rem;
      cursor: pointer;
      border: none;
    }
    .sheet-act-btn--pass {
      background: #f6eeff18;
      color: var(--pass-color);
      border: 1px solid var(--pass-color);
    }
    .sheet-act-btn--like {
      background: var(--kesari);
      color: white;
    }

    /* ─── Match Celebration Modal ───────────────────────────────────────── */
    .modal-backdrop--celebrate {
      align-items: center;
      padding: 1.5rem;
    }
    .match-modal {
      background: linear-gradient(160deg, #2b1138 0%, #150a22 100%);
      border: 2px solid var(--marigold);
      box-shadow: 0 0 50px rgba(245, 158, 11, 0.4);
      border-radius: 28px;
      width: 100%;
      max-width: 26rem;
      padding: 2.25rem 1.75rem 2rem;
      text-align: center;
      animation: match-pop .45s var(--ease-spring);
    }
    @keyframes match-pop {
      0%   { opacity: 0; transform: scale(0.7); }
      100% { opacity: 1; transform: scale(1); }
    }
    .match-confetti {
      font-size: 1.5rem;
      margin-bottom: .75rem;
      animation: float-flame 2s infinite alternate;
    }
    .match-headline {
      font-size: 2.35rem;
      font-weight: 900;
      margin: 0 0 .5rem;
      background: linear-gradient(100deg, var(--marigold), #fff, #ffa0b0);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .match-subline {
      font-size: 1rem;
      color: rgba(246, 238, 255, 0.9);
      margin: 0 0 1.5rem;
      line-height: 1.45;
    }
    .match-avatars {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: .75rem;
      margin-bottom: 1.5rem;
    }
    .avatar-ring {
      width: 4.5rem;
      height: 4.5rem;
      border-radius: 50%;
      overflow: hidden;
      border: 3px solid var(--marigold);
      box-shadow: 0 0 16px var(--marigold-glow);
      display: grid;
      place-items: center;
      background: #25143a;
    }
    .avatar-emoji { font-size: 2.2rem; }
    .avatar-ring img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .match-heart {
      font-size: 1.8rem;
      color: var(--pass-color);
      animation: beat .8s infinite alternate;
    }
    @keyframes beat {
      0%   { transform: scale(1); }
      100% { transform: scale(1.3); }
    }
    .match-reasons-summary {
      background: #f6eeff0e;
      border: 1px solid #f6eeff1a;
      border-radius: 14px;
      padding: .85rem;
      margin-bottom: 1.5rem;
    }
    .match-reasons-summary p {
      font-size: .85rem;
      margin: .25rem 0;
      color: var(--marigold);
      font-weight: 600;
    }
    .match-actions {
      display: flex;
      flex-direction: column;
      gap: .65rem;
    }
    .match-btn {
      padding: .85rem;
      border-radius: 999px;
      font: inherit;
      font-weight: 700;
      font-size: 1rem;
      cursor: pointer;
    }
    .match-btn--primary {
      background: var(--kesari);
      color: white;
      border: none;
      box-shadow: 0 8px 20px -6px var(--kesari);
    }
    .match-btn--ghost {
      background: transparent;
      color: rgba(246, 238, 255, 0.7);
      border: 1px solid rgba(246, 238, 255, 0.2);
    }

    /* ─── Loader ────────────────────────────────────────────────────────── */
    .deck-loader {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      color: var(--marigold);
      font-weight: 600;
    }
    .spinner {
      width: 40px; height: 40px;
      border: 3px solid rgba(245, 158, 11, 0.2);
      border-top-color: var(--marigold);
      border-radius: 50%;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class DiscoverComponent implements OnInit {
  readonly discovery = inject(DiscoveryService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly candidates = this.discovery.deck;
  readonly current = this.discovery.currentCandidate;

  readonly selectedCandidate = signal<DeckCandidate | null>(null);
  readonly celebrateMatch = signal<DeckCandidate | null>(null);

  // Gesture state
  readonly isDragging = signal(false);
  private dragStartX = 0;
  private dragStartY = 0;
  private currentX = 0;
  private currentY = 0;

  readonly cardTransform = signal('none');
  readonly likeOpacity = signal(0);
  readonly passOpacity = signal(0);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.discovery.loadDeck();
  }

  // ─── Swipe Gestures ───────────────────────────────────────────────────────
  onPointerDown(event: PointerEvent): void {
    this.isDragging.set(true);
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.currentX = 0;
    this.currentY = 0;
    (event.currentTarget as HTMLElement)?.setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.isDragging()) return;

    this.currentX = event.clientX - this.dragStartX;
    this.currentY = event.clientY - this.dragStartY;

    const rotation = this.currentX * 0.08;
    this.cardTransform.set(`translate(${this.currentX}px, ${this.currentY}px) rotate(${rotation}deg)`);

    // Opacity stamps
    const threshold = 80;
    if (this.currentX > 20) {
      this.likeOpacity.set(Math.min(1, (this.currentX - 20) / threshold));
      this.passOpacity.set(0);
    } else if (this.currentX < -20) {
      this.passOpacity.set(Math.min(1, Math.abs(this.currentX + 20) / threshold));
      this.likeOpacity.set(0);
    } else {
      this.likeOpacity.set(0);
      this.passOpacity.set(0);
    }
  }

  onPointerUp(): void {
    if (!this.isDragging()) return;
    this.isDragging.set(false);

    const threshold = 110;
    if (this.currentX > threshold) {
      this.swipe(true);
    } else if (this.currentX < -threshold) {
      this.swipe(false);
    } else {
      // Snap back to centre
      this.cardTransform.set('translate(0px, 0px) rotate(0deg)');
      this.likeOpacity.set(0);
      this.passOpacity.set(0);
    }
  }

  // ─── Actions ─────────────────────────────────────────────────────────────
  async swipe(liked: boolean): Promise<void> {
    const candidate = this.current();
    if (!candidate) return;

    // Trigger visual throw
    const flyOutX = liked ? 600 : -600;
    this.cardTransform.set(`translate(${flyOutX}px, 50px) rotate(${liked ? 30 : -30}deg)`);
    this.likeOpacity.set(liked ? 1 : 0);
    this.passOpacity.set(liked ? 0 : 1);

    setTimeout(async () => {
      this.cardTransform.set('none');
      this.likeOpacity.set(0);
      this.passOpacity.set(0);

      const result = await this.discovery.swipe(candidate, liked);
      if (result.matched) {
        this.celebrateMatch.set(candidate);
      }
    }, 200);
  }

  async rewind(): Promise<void> {
    await this.discovery.rewind();
  }

  openDetails(candidate: DeckCandidate, event?: Event): void {
    event?.stopPropagation();
    this.selectedCandidate.set(candidate);
  }

  closeDetails(): void {
    this.selectedCandidate.set(null);
  }

  swipeFromSheet(liked: boolean): void {
    this.closeDetails();
    this.swipe(liked);
  }

  continueAfterMatch(): void {
    this.celebrateMatch.set(null);
  }

  reloadDeck(): void {
    this.discovery.loadDeck();
  }

  /**
   * The only honest answer to a thin city: help the user bring people.
   * WhatsApp is where this actually spreads in India, so share to it directly
   * rather than burying an invite link in a settings screen.
   */
  shareInvite(): void {
    const text =
      `Going for Garba this Navratri? I'm on GarbaTaal — it matches you by ` +
      `the nights you're going, the ground, and how you actually dance. ` +
      `Join me: ${location.origin}`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;

    if (navigator.share) {
      navigator.share({ title: 'GarbaTaal', text, url: location.origin }).catch(() => {
        window.open(url, '_blank', 'noopener');
      });
      return;
    }

    window.open(url, '_blank', 'noopener');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  formatNights(mask: number): string {
    const nights = maskToNights(mask);
    if (nights.length === 9) return '🌙 All 9 Nights';
    if (nights.length === 0) return '🌙 Festival Nights';
    return `🌙 Nights ${nights.join(', ')}`;
  }

  isAttendingNight(mask: number, night: number): boolean {
    return (mask & (1 << (night - 1))) !== 0;
  }

  styleLabel(style: any): string {
    return STYLE_LABELS[style as keyof typeof STYLE_LABELS] ?? 'Garba';
  }

  skillLabel(skill: any): string {
    return SKILL_LABELS[skill as keyof typeof SKILL_LABELS] ?? 'Dancer';
  }

  tempoLabel(tempo: any): string {
    return TEMPO_LABELS[tempo as keyof typeof TEMPO_LABELS] ?? 'Traditional';
  }

  stepLabel(step: any): string {
    return STEP_LABELS[step as keyof typeof STEP_LABELS] ?? step;
  }

  intentLabel(intent: any): string {
    return INTENT_LABELS[intent as keyof typeof INTENT_LABELS] ?? 'Dance Partner';
  }
}
