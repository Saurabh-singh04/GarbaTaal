import {
  Component, ElementRef, inject, input, output, signal, effect, viewChild, PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SafetyService, REPORT_REASONS, ReportReason } from '../core/services/safety.service';

/**
 * Block-and-report sheet, openable from a deck card, a chat, or a profile.
 *
 * Two deliberate choices about how it behaves:
 *
 * Blocking never needs a reason. Someone who wants out should get out in one
 * tap, without filling in a form about why — requiring justification is how
 * you make people give up and just stop using the app instead.
 *
 * Reporting always blocks too. Leaving a reported person able to message you
 * while a human reviews it is the wrong default for whoever just told us
 * something is wrong.
 */
@Component({
  selector: 'gt-report-sheet',
  standalone: true,
  template: `
<dialog #dlg class="sheet" (close)="onClose()" (click)="onBackdrop($event)">
  <div class="inner">

    <button type="button" class="x" (click)="close()" aria-label="Close">✕</button>

    @if (step() === 'choose') {
      <h2 class="title">{{ name() }}</h2>

      <button type="button" class="row block" [disabled]="safety.busy()" (click)="justBlock()">
        <strong>Block</strong>
        <span>They disappear from your deck and cannot message you. They are not told.</span>
      </button>

      <button type="button" class="row" (click)="step.set('report')">
        <strong>Block and report</strong>
        <span>Tell us what happened. A person reads every report.</span>
      </button>

      <p class="fine">
        If someone asks you for money, report it. We never take money for
        meeting a person, and nobody on GarbaTaal should either.
      </p>
    }

    @if (step() === 'report') {
      <h2 class="title">What happened?</h2>

      <div class="reasons" role="radiogroup" aria-label="Reason">
        @for (r of reasons; track r.value) {
          <button type="button" class="reason"
                  role="radio"
                  [attr.aria-checked]="reason() === r.value"
                  [class.on]="reason() === r.value"
                  (click)="reason.set(r.value)">
            <strong>{{ r.label }}</strong>
            @if (r.hint) { <span>{{ r.hint }}</span> }
          </button>
        }
      </div>

      <label class="detail-label" for="details">Anything else? (optional)</label>
      <textarea id="details" class="detail" rows="3" maxlength="500"
                [value]="details()"
                (input)="details.set($any($event.target).value)"
                placeholder="What they said or did."></textarea>

      <div class="actions">
        <button type="button" class="btn ghost" (click)="step.set('choose')">Back</button>
        <button type="button" class="btn danger"
                [disabled]="!reason() || safety.busy()"
                (click)="submit()">
          {{ safety.busy() ? 'Sending…' : 'Block and report' }}
        </button>
      </div>
    }

    @if (step() === 'done') {
      <h2 class="title">Done</h2>
      <p class="done-note">
        {{ name() }} can no longer see you or message you.
        @if (reason()) { A person will read your report. }
      </p>
      <button type="button" class="btn ghost wide" (click)="close()">Close</button>
    }

    @if (safety.error(); as e) {
      <p class="err" role="alert">{{ e }}</p>
    }
  </div>
</dialog>
  `,
  styles: [`
    .sheet {
      border: none; padding: 0; background: transparent;
      max-width: 26rem; width: calc(100% - 2rem); color: #f6eeff;
    }
    .sheet::backdrop { background: #0a0410cc; backdrop-filter: blur(4px); }

    .inner {
      position: relative;
      background: linear-gradient(180deg, #1b0f2a 0%, #14091f 100%);
      border: 1px solid #ffffff1f; border-radius: 1rem;
      padding: 1.5rem 1.25rem 1.25rem;
    }

    .x {
      position: absolute; top: .6rem; right: .6rem;
      width: 2rem; height: 2rem; border-radius: 50%;
      border: none; background: #ffffff12; color: #cbb8e0;
      font-size: .85rem; cursor: pointer;
    }
    .x:focus-visible { outline: 2px solid #f59e0b; outline-offset: 2px; }

    .title { margin: 0 0 1rem; font-size: 1.1rem; }

    .row {
      display: grid; gap: .2rem; text-align: left; width: 100%;
      padding: .85rem; margin-bottom: .6rem;
      background: #ffffff0d; border: 1px solid #ffffff1a;
      border-radius: .7rem; color: inherit; font: inherit; cursor: pointer;
    }
    .row:hover { background: #ffffff16; }
    .row:focus-visible { outline: 2px solid #f59e0b; outline-offset: 2px; }
    .row strong { font-size: .95rem; }
    .row span { font-size: .78rem; color: #a992c4; line-height: 1.5; }

    .reasons { display: grid; gap: .45rem; margin-bottom: 1rem; }
    .reason {
      display: grid; gap: .15rem; text-align: left;
      padding: .7rem .8rem;
      background: #ffffff0d; border: 1px solid #ffffff1a;
      border-radius: .6rem; color: inherit; font: inherit; cursor: pointer;
    }
    .reason.on { border-color: #f59e0b; background: #f59e0b1a; }
    .reason:focus-visible { outline: 2px solid #f59e0b; outline-offset: 2px; }
    .reason strong { font-size: .88rem; font-weight: 600; }
    .reason span { font-size: .74rem; color: #a992c4; line-height: 1.45; }

    .detail-label { display: block; font-size: .8rem; color: #cbb8e0; margin-bottom: .35rem; }
    .detail {
      width: 100%; padding: .6rem .7rem; border-radius: .6rem;
      border: 1px solid #ffffff22; background: #ffffff0d;
      color: #f6eeff; font: inherit; font-size: 16px; resize: vertical;
    }
    .detail:focus-visible { outline: 2px solid #f59e0b; }

    .actions { display: flex; gap: .5rem; margin-top: 1rem; }
    .btn {
      flex: 1; padding: .7rem; border-radius: .6rem;
      font: inherit; font-weight: 600; cursor: pointer; border: 1px solid;
    }
    .btn:disabled { opacity: .45; cursor: default; }
    .btn:focus-visible { outline: 2px solid #f59e0b; outline-offset: 2px; }
    .ghost  { background: transparent; border-color: #ffffff2a; color: #cbb8e0; }
    .danger { background: #ff4d6d; border-color: #ff4d6d; color: #2a0410; }
    .wide   { width: 100%; }

    .fine, .done-note {
      margin: 1rem 0 0; font-size: .78rem;
      color: #a992c4; line-height: 1.6;
    }
    .done-note { margin-bottom: 1rem; }

    .err {
      margin: .85rem 0 0; padding: .6rem .7rem;
      background: #7f1d1d33; border: 1px solid #ef444455;
      border-radius: .5rem; font-size: .8rem;
    }

    @media (max-width: 30rem) {
      .sheet { margin: auto auto 0; width: 100%; max-width: none; }
      .inner {
        border-radius: 1rem 1rem 0 0;
        padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));
      }
    }
  `]
})
export class ReportSheetComponent {
  readonly safety = inject(SafetyService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly dlg = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  readonly open = input(false);
  readonly userId = input.required<string>();
  readonly name = input('this person');

  /** Emitted once the block has actually been written, so callers can remove
   *  them from a deck or leave a chat. */
  readonly blocked = output<string>();
  readonly closed = output<void>();

  readonly reasons = REPORT_REASONS;
  readonly step = signal<'choose' | 'report' | 'done'>('choose');
  readonly reason = signal<ReportReason | null>(null);
  readonly details = signal('');

  constructor() {
    effect(() => {
      const el = this.dlg()?.nativeElement;
      if (!this.isBrowser || !el) return;
      if (this.open() && !el.open) el.showModal();
      else if (!this.open() && el.open) el.close();
    });
  }

  async justBlock(): Promise<void> {
    const ok = await this.safety.blockAndReport(this.userId());
    if (ok) {
      this.blocked.emit(this.userId());
      this.step.set('done');
    }
  }

  async submit(): Promise<void> {
    const r = this.reason();
    if (!r) return;

    const ok = await this.safety.blockAndReport(this.userId(), r, this.details());
    if (ok) {
      this.blocked.emit(this.userId());
      this.step.set('done');
    }
  }

  close(): void {
    this.dlg()?.nativeElement.close();
  }

  onClose(): void {
    this.closed.emit();
    // Reset for the next person, or the previous report's reason and text
    // would be pre-filled against someone else.
    this.step.set('choose');
    this.reason.set(null);
    this.details.set('');
    this.safety.error.set(null);
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === this.dlg()?.nativeElement) this.close();
  }
}
