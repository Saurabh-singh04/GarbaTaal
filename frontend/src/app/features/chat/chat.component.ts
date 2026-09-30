import {
  Component, inject, signal, OnInit, OnDestroy, PLATFORM_ID,
  ElementRef, viewChild, effect
} from '@angular/core';
import { isPlatformBrowser, CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChatService } from '../../core/services/chat.service';

@Component({
  selector: 'gt-chat',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  template: `
<div class="chat-layout">

  <header class="app-bar">
    <a routerLink="/matches" class="back" aria-label="Back to your people">←</a>
    @if (chat.other(); as o) {
      <img class="avatar" [src]="o.photo_url || '/dancer-placeholder.svg'" alt="">
      <div class="who">
        <p class="name">
          {{ o.first_name }}
          @if (o.is_verified) { <span class="tick" title="Photo verified">✓</span> }
        </p>
        <p class="sub">{{ chat.isPreview() ? 'Example conversation' : 'Matched' }}</p>
      </div>
    }
  </header>

  @if (chat.isPreview()) {
    <p class="preview-banner">
      This is an example conversation, not a real person.
      <a routerLink="/">Sign in</a> to start your own.
    </p>
  }

  <div class="thread" #thread>
    @if (chat.loading()) {
      <p class="centred muted">Opening…</p>
    } @else if (chat.error() && chat.messages().length === 0) {
      <p class="centred muted">{{ chat.error() }}</p>
    } @else if (chat.messages().length === 0) {
      <div class="centred empty">
        <p class="empty-big">You matched 🎉</p>
        <p class="muted">
          Say something specific — “which night works for you?” gets a reply,
          “hi” usually does not.
        </p>
      </div>
    } @else {
      @for (m of chat.messages(); track m.id) {
        <div class="line" [class.mine]="m.mine">
          <div class="bubble"
               [class.pending]="m.pending"
               [class.failed]="m.failed"
               [class.held]="m.held_reason">
            <p class="body">{{ m.body }}</p>
            <time class="time" [attr.datetime]="m.created_at">
              {{ m.created_at | date:'shortTime' }}
              @if (m.pending) { · sending }
              @if (m.failed) { · not sent }
            </time>
          </div>

          @if (m.held_reason === 'contact_with_payment') {
            <p class="held-note warn">
              Held for review. Messages that mix contact details with payment
              are how the “rent a partner” scam works, so we check them.
              <strong>Never send money to someone you met here.</strong>
            </p>
          } @else if (m.held_reason === 'contact_too_early') {
            <p class="held-note">
              Held for now. Phone numbers and handles unlock once you have both
              sent 10 messages — {{ chat.myCount() }} from you,
              {{ chat.theirCount() }} from them so far.
            </p>
          }
        </div>
      }
    }
  </div>

  @if (chat.error() && chat.messages().length > 0) {
    <p class="error" role="alert">{{ chat.error() }}</p>
  }

  <form class="composer" (submit)="submit($event)">
    <input
      #input
      class="input"
      type="text"
      name="message"
      autocomplete="off"
      maxlength="2000"
      [disabled]="chat.sending()"
      [placeholder]="chat.isPreview() ? 'Sign in to reply' : 'Message'"
      [value]="draft()"
      (input)="draft.set($any($event.target).value)">
    <button class="send" type="submit"
            [disabled]="chat.sending() || !draft().trim()"
            aria-label="Send">➤</button>
  </form>

  @if (!chat.isPreview() && !chat.contactUnlocked()) {
    <p class="foot-note">
      Numbers and social handles stay hidden until you have both sent 10
      messages. It costs a real pair one evening and costs a spammer forty.
    </p>
  }
</div>
  `,
  styles: [`
    :host {
      --night: #12091d; --night-card: #1b0f2a;
      --kesari: #c2410c; --marigold: #f59e0b;
      --diya: #fffbf0; --like-color: #10b981;
    }
    * { box-sizing: border-box; }

    .chat-layout {
      display: flex; flex-direction: column;
      height: 100svh;
      background:
        radial-gradient(40rem 30rem at 50% 0%, #681b4f33, transparent 75%),
        linear-gradient(180deg, #0e0517 0%, var(--night) 100%);
      color: #f6eeff;
    }

    .app-bar {
      display: flex; align-items: center; gap: .6rem;
      padding: .75rem 1rem; flex: none;
      border-bottom: 1px solid #ffffff12;
      background: color-mix(in srgb, var(--night) 88%, transparent);
      backdrop-filter: blur(8px);
    }
    .back {
      color: var(--diya); text-decoration: none; font-size: 1.4rem;
      line-height: 1; padding: .2rem .4rem; border-radius: .4rem;
    }
    .back:focus-visible { outline: 2px solid var(--marigold); }
    .avatar {
      width: 2.2rem; height: 2.2rem; border-radius: 50%;
      object-fit: cover; background: #2a1840;
    }
    .who { min-width: 0; }
    .name { margin: 0; font-weight: 600; font-size: .95rem; }
    .tick { color: var(--like-color); font-size: .75rem; }
    .sub  { margin: 0; font-size: .72rem; color: #a992c4; }

    .preview-banner {
      margin: 0; padding: .6rem 1rem; flex: none;
      background: #f59e0b1f; border-bottom: 1px solid #f59e0b44;
      font-size: .8rem; text-align: center; color: #ffe9bd;
    }
    .preview-banner a { color: var(--marigold); }

    .thread {
      flex: 1; overflow-y: auto;
      padding: 1rem; display: flex; flex-direction: column; gap: .5rem;
      overscroll-behavior: contain;
    }

    .line { display: flex; flex-direction: column; align-items: flex-start; }
    .line.mine { align-items: flex-end; }

    .bubble {
      max-width: min(78%, 34rem);
      padding: .55rem .8rem;
      border-radius: 1rem 1rem 1rem .25rem;
      background: var(--night-card); border: 1px solid #ffffff14;
    }
    .line.mine .bubble {
      border-radius: 1rem 1rem .25rem 1rem;
      background: #4c1d2e; border-color: #ffffff1f;
    }
    .bubble.pending { opacity: .6; }
    .bubble.failed  { border-color: #ef444488; }
    .bubble.held    { border-color: var(--marigold); background: #3a2410; }

    .body {
      margin: 0; font-size: .95rem; line-height: 1.45;
      white-space: pre-wrap; word-break: break-word;
    }
    .time { display: block; margin-top: .2rem; font-size: .65rem; color: #a992c4; }

    .held-note {
      max-width: min(78%, 34rem);
      margin: .3rem 0 0; padding: .5rem .7rem;
      font-size: .78rem; line-height: 1.5;
      background: #ffffff0d; border-radius: .5rem; color: #d8c6ee;
    }
    .held-note.warn { background: #7f1d1d33; color: #ffd9d9; }

    .centred { margin: auto; text-align: center; max-width: 24rem; }
    .muted { color: #a992c4; font-size: .9rem; line-height: 1.55; }
    .empty-big { font-size: 1.1rem; font-weight: 600; margin: 0 0 .5rem; }

    .error {
      margin: 0 1rem .5rem; padding: .6rem .75rem; flex: none;
      background: #7f1d1d33; border: 1px solid #ef444455;
      border-radius: .5rem; font-size: .82rem;
    }

    .composer {
      flex: none; display: flex; gap: .5rem;
      padding: .75rem 1rem;
      padding-bottom: calc(.75rem + env(safe-area-inset-bottom));
      border-top: 1px solid #ffffff12;
      background: color-mix(in srgb, var(--night) 92%, transparent);
    }
    .input {
      flex: 1; padding: .7rem .9rem;
      border-radius: 1.4rem; border: 1px solid #ffffff22;
      background: #ffffff0d; color: var(--diya);
      font: inherit; font-size: 16px;   /* 16px stops iOS zooming on focus */
    }
    .input:focus-visible { outline: 2px solid var(--marigold); }
    .send {
      width: 2.8rem; border: none; border-radius: 50%;
      background: var(--kesari); color: #fff;
      font-size: 1rem; cursor: pointer;
    }
    .send:disabled { opacity: .4; cursor: default; }
    .send:focus-visible { outline: 2px solid var(--marigold); outline-offset: 2px; }

    .foot-note {
      flex: none; margin: 0; padding: 0 1rem .75rem;
      font-size: .7rem; color: #8b76a8; text-align: center; line-height: 1.5;
    }
  `]
})
export class ChatComponent implements OnInit, OnDestroy {
  readonly chat = inject(ChatService);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');

  readonly draft = signal('');

  constructor() {
    // Keep the newest message in view as the thread grows, including when one
    // arrives over Realtime while you are reading.
    effect(() => {
      this.chat.messages();
      queueMicrotask(() => {
        const el = this.thread()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return;
    const id = this.route.snapshot.paramMap.get('matchId');
    if (id) await this.chat.open(id);
  }

  ngOnDestroy(): void {
    // Without this the Realtime channel outlives the screen and every chat
    // opened in a session keeps streaming.
    this.chat.close();
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    const text = this.draft();
    this.draft.set('');
    await this.chat.send(text);
  }
}
