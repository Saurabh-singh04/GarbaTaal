import { Component, inject, signal, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  MatchesService,
  IncomingRequest,
  MiniProfile
} from '../../core/services/matches.service';

type Tab = 'requests' | 'matches' | 'sent';

@Component({
  selector: 'gt-matches',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
<div class="inbox-layout">

  <header class="app-bar">
    <a routerLink="/discover" class="back" aria-label="Back to discover">←</a>
    <h1>Your people</h1>
  </header>

  <nav class="tabs" role="tablist">
    <button role="tab" class="tab" [class.active]="tab() === 'requests'"
            [attr.aria-selected]="tab() === 'requests'"
            (click)="tab.set('requests')">
      Requests
      @if (svc.pendingCount() > 0) {
        <span class="badge">{{ svc.pendingCount() }}</span>
      }
    </button>
    <button role="tab" class="tab" [class.active]="tab() === 'matches'"
            [attr.aria-selected]="tab() === 'matches'"
            (click)="tab.set('matches')">
      Matches
    </button>
    <button role="tab" class="tab" [class.active]="tab() === 'sent'"
            [attr.aria-selected]="tab() === 'sent'"
            (click)="tab.set('sent')">
      Sent
    </button>
  </nav>

  @if (svc.isPreview()) {
    <p class="preview-banner">
      These are examples, not real people.
      <a routerLink="/">Sign in</a> to see who actually wants to dance with you.
    </p>
  }

  @if (svc.error(); as err) {
    <p class="error" role="alert">{{ err }}</p>
  }

  @if (svc.loading()) {
    <div class="skeletons" aria-hidden="true">
      @for (i of [1,2,3]; track i) { <div class="skeleton"></div> }
    </div>
  } @else {

    <!-- ── Requests ─────────────────────────────────────────────────── -->
    @if (tab() === 'requests') {
      @if (svc.incoming().length === 0) {
        <div class="empty">
          <p class="empty-big">No requests waiting</p>
          <p class="empty-note">
            When someone asks to dance with you, they will show up here first.
            You always decide before any chat opens.
          </p>
          <a routerLink="/discover" class="cta">Find dancers</a>
        </div>
      } @else {
        <ul class="list">
          @for (r of svc.incoming(); track r.id) {
            <li class="card">
              <div class="who">
                <img class="avatar" [src]="avatar(r.from)" alt="" loading="lazy">
                <div class="who-text">
                  <p class="name">
                    {{ r.from.first_name }}@if (r.from.age) { <span class="age">, {{ r.from.age }}</span> }
                    @if (r.from.is_verified) { <span class="tick" title="Photo verified">✓</span> }
                  </p>
                  <p class="meta">{{ expiryLabel(r.expires_at) }}</p>
                </div>
              </div>

              @if (r.note) { <p class="note">“{{ r.note }}”</p> }

              <div class="actions">
                <button class="btn pass" (click)="decline(r)" [disabled]="busy() === r.id">
                  Not now
                </button>
                <button class="btn like" (click)="accept(r)" [disabled]="busy() === r.id">
                  {{ busy() === r.id ? '…' : 'Say yes' }}
                </button>
              </div>
            </li>
          }
        </ul>
      }
    }

    <!-- ── Matches ──────────────────────────────────────────────────── -->
    @if (tab() === 'matches') {
      @if (svc.matches().length === 0) {
        <div class="empty">
          <p class="empty-big">No matches yet</p>
          <p class="empty-note">
            A match happens when you both say yes. Only then does a chat open.
          </p>
          <a routerLink="/discover" class="cta">Find dancers</a>
        </div>
      } @else {
        <ul class="list">
          @for (m of svc.matches(); track m.match_id) {
            <li>
              <a class="row" [routerLink]="['/chat', m.match_id]">
                <img class="avatar" [src]="avatar(m.other)" alt="" loading="lazy">
                <div class="row-text">
                  <p class="name">
                    {{ m.other.first_name }}
                    @if (m.other.is_verified) { <span class="tick" title="Photo verified">✓</span> }
                  </p>
                  <p class="preview" [class.unread]="m.their_turn">
                    {{ m.last_message ?? 'Say hello — matches go quiet fast.' }}
                  </p>
                </div>
                @if (m.their_turn) { <span class="dot" aria-label="Their turn"></span> }
              </a>
            </li>
          }
        </ul>
      }
    }

    <!-- ── Sent ─────────────────────────────────────────────────────── -->
    @if (tab() === 'sent') {
      @if (svc.outgoing().length === 0) {
        <div class="empty">
          <p class="empty-big">Nothing sent yet</p>
          <p class="empty-note">Requests you send show here until they answer.</p>
          <a routerLink="/discover" class="cta">Find dancers</a>
        </div>
      } @else {
        <ul class="list">
          @for (r of svc.outgoing(); track r.id) {
            <li class="row static">
              <img class="avatar" [src]="avatar(r.to)" alt="" loading="lazy">
              <div class="row-text">
                <p class="name">{{ r.to.first_name }}</p>
                <p class="preview">Waiting — {{ expiryLabel(r.expires_at) }}</p>
              </div>
            </li>
          }
        </ul>
        <p class="foot-note">
          They see your request without knowing you are waiting. Nobody is told
          when a request is declined.
        </p>
      }
    }
  }
</div>
  `,
  styles: [`
    :host {
      --night:       #12091d;
      --night-card:  #1b0f2a;
      --kesari:      #c2410c;
      --marigold:    #f59e0b;
      --diya:        #fffbf0;
      --pass-color:  #ff4d6d;
      --like-color:  #10b981;
    }

    * { box-sizing: border-box; }

    .inbox-layout {
      min-height: 100svh;
      background:
        radial-gradient(40rem 30rem at 50% 10%, #681b4f44, transparent 75%),
        linear-gradient(180deg, #0e0517 0%, var(--night) 100%);
      color: #f6eeff;
      padding-bottom: 3rem;
    }

    .app-bar {
      display: flex; align-items: center; gap: .75rem;
      padding: 1rem;
      position: sticky; top: 0; z-index: 5;
      background: color-mix(in srgb, var(--night) 85%, transparent);
      backdrop-filter: blur(8px);
    }
    .app-bar h1 { font-size: 1.1rem; margin: 0; font-weight: 600; }
    .back {
      color: var(--diya); text-decoration: none; font-size: 1.4rem;
      line-height: 1; padding: .25rem .5rem; border-radius: .5rem;
    }
    .back:focus-visible { outline: 2px solid var(--marigold); }

    .tabs {
      display: flex; gap: .25rem; padding: 0 1rem 1rem;
      /* The three lists are short; a scrollable tab strip would be worse than
         letting them share the width. */
    }
    .tab {
      flex: 1; padding: .6rem .5rem; border-radius: .6rem;
      border: 1px solid #ffffff1a; background: transparent;
      color: #cbb8e0; font: inherit; font-size: .85rem; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: .35rem;
    }
    .tab.active {
      background: var(--night-card); color: var(--diya);
      border-color: var(--marigold);
    }
    .tab:focus-visible { outline: 2px solid var(--marigold); outline-offset: 2px; }

    .badge {
      background: var(--kesari); color: #fff;
      border-radius: 999px; padding: .05rem .4rem;
      font-size: .7rem; font-weight: 700;
    }

    .list { list-style: none; margin: 0; padding: 0 1rem; display: grid; gap: .75rem; }

    .card {
      background: var(--night-card); border: 1px solid #ffffff14;
      border-radius: .9rem; padding: 1rem;
    }

    .who { display: flex; align-items: center; gap: .75rem; }
    .who-text { min-width: 0; }

    .avatar {
      width: 3rem; height: 3rem; border-radius: 50%;
      object-fit: cover; background: #2a1840; flex: none;
    }

    .name { margin: 0; font-weight: 600; }
    .age  { font-weight: 400; color: #cbb8e0; }
    .tick { color: var(--like-color); font-size: .8rem; margin-left: .2rem; }
    .meta { margin: .15rem 0 0; font-size: .78rem; color: #a992c4; }

    .note {
      margin: .75rem 0 0; padding: .6rem .75rem;
      background: #ffffff0d; border-radius: .6rem;
      font-size: .9rem; color: #e6d9f5;
    }

    .actions { display: flex; gap: .5rem; margin-top: 1rem; }
    .btn {
      flex: 1; padding: .7rem; border-radius: .6rem; cursor: pointer;
      font: inherit; font-weight: 600; border: 1px solid;
      background: transparent;
    }
    .btn:disabled { opacity: .5; cursor: default; }
    .btn:focus-visible { outline: 2px solid var(--marigold); outline-offset: 2px; }
    .pass { color: var(--pass-color); border-color: var(--pass-color); }
    .like { color: #05281c; background: var(--like-color); border-color: var(--like-color); }

    .row {
      display: flex; align-items: center; gap: .75rem;
      padding: .75rem; border-radius: .9rem;
      background: var(--night-card); border: 1px solid #ffffff14;
      text-decoration: none; color: inherit;
    }
    .row:focus-visible { outline: 2px solid var(--marigold); }
    .row.static { cursor: default; }
    .row-text { min-width: 0; flex: 1; }

    .preview {
      margin: .15rem 0 0; font-size: .85rem; color: #a992c4;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .preview.unread { color: var(--diya); font-weight: 500; }

    .dot {
      width: .55rem; height: .55rem; border-radius: 50%;
      background: var(--marigold); flex: none;
    }

    .empty { text-align: center; padding: 3rem 1.5rem; }
    .empty-big { font-size: 1.1rem; font-weight: 600; margin: 0 0 .5rem; }
    .empty-note { color: #a992c4; font-size: .9rem; margin: 0 0 1.5rem; line-height: 1.5; }

    .cta {
      display: inline-block; padding: .7rem 1.4rem;
      background: var(--kesari); color: #fff;
      border-radius: .6rem; text-decoration: none; font-weight: 600;
    }
    .cta:focus-visible { outline: 2px solid var(--marigold); outline-offset: 2px; }

    .foot-note {
      margin: 1.5rem 1rem 0; font-size: .8rem;
      color: #a992c4; text-align: center; line-height: 1.5;
    }

    .preview-banner {
      margin: 0 1rem 1rem; padding: .6rem .75rem;
      background: #f59e0b1f; border: 1px solid #f59e0b44;
      border-radius: .6rem; font-size: .8rem;
      text-align: center; color: #ffe9bd; line-height: 1.5;
    }
    .preview-banner a { color: var(--marigold); }

    .error {
      margin: 0 1rem 1rem; padding: .75rem;
      background: #7f1d1d33; border: 1px solid #ef444455;
      border-radius: .6rem; font-size: .85rem;
    }

    .skeletons { padding: 0 1rem; display: grid; gap: .75rem; }
    .skeleton {
      height: 5rem; border-radius: .9rem;
      background: linear-gradient(90deg, #1b0f2a, #2a1840, #1b0f2a);
      background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite;
    }
    @keyframes shimmer {
      from { background-position: 200% 0; }
      to   { background-position: -200% 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .skeleton { animation: none; }
    }
  `]
})
export class MatchesComponent implements OnInit {
  readonly svc = inject(MatchesService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tab = signal<Tab>('requests');
  readonly busy = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    // No network during prerender: the same thing that hung the SSR build.
    if (!this.isBrowser) return;
    await this.svc.load();

    // Land on whichever tab has something in it. Opening on an empty
    // Requests list when there are three live chats is a worse default.
    if (this.svc.incoming().length === 0 && this.svc.matches().length > 0) {
      this.tab.set('matches');
    }
  }

  avatar(p: MiniProfile): string {
    return p.photo_url || '/dancer-placeholder.svg';
  }

  /**
   * Requests expire after 48 hours. Saying so turns a stale list into a
   * reason to open the app, and it is the honest explanation for why someone
   * disappears from it.
   */
  expiryLabel(expiresAt: string): string {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return 'Expired';

    const hours = Math.floor(ms / 3_600_000);
    if (hours >= 24) return 'Expires tomorrow';
    if (hours >= 1) return `${hours}h left`;
    return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
  }

  async accept(r: IncomingRequest): Promise<void> {
    this.busy.set(r.id);
    await this.svc.respond(r, true);
    this.busy.set(null);
    if (this.svc.matches().length) this.tab.set('matches');
  }

  async decline(r: IncomingRequest): Promise<void> {
    this.busy.set(r.id);
    await this.svc.respond(r, false);
    this.busy.set(null);
  }
}
