import {
  Component, ElementRef, inject, input, output, effect, viewChild, PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GoogleSigninButtonComponent } from './google-signin-button.component';

/**
 * Sign-in dialog, in the shape of ResumeMatcher's auth modal — opened from
 * every call to action rather than sending people to a separate page.
 *
 * What it deliberately does NOT carry: passwords, OTP, and role selection.
 * Google-only is a safety decision, not a shortcut. No password means nothing
 * to reuse or leak, and no phone number is ever collected or displayed —
 * which is the first question a woman asks about an app like this.
 *
 * Built on <dialog> rather than a div with a high z-index, so focus trapping,
 * Escape, inertness of the page behind it and the top layer are the browser's
 * job instead of ours.
 */
@Component({
  selector: 'gt-auth-modal',
  standalone: true,
  imports: [GoogleSigninButtonComponent],
  template: `
<dialog #dlg class="sheet" (close)="closed.emit()" (click)="onBackdrop($event)">
  <div class="inner">

    <button type="button" class="x" (click)="close()" aria-label="Close">✕</button>

    <p class="kicker">Navratri 2026 · 11–19 October</p>
    <h2 class="title">{{ heading() }}</h2>
    <p class="lede">
      One tap with Google. No password to remember, and your phone number is
      never asked for or shown.
    </p>

    <gt-google-signin [next]="next()" (signedIn)="close()" />

    <ul class="assure">
      <li><span aria-hidden="true">✓</span> 18+ only, checked at sign-up</li>
      <li><span aria-hidden="true">✓</span> Free to join — pay nothing to match</li>
      <li><span aria-hidden="true">✓</span> Block or report anyone, from anywhere</li>
    </ul>

    <p class="fine">
      We never take money for meeting a person, and we never share your
      location. By continuing you agree to our community rules.
    </p>
  </div>
</dialog>
  `,
  styles: [`
    .sheet {
      border: none; padding: 0; background: transparent;
      max-width: 26rem; width: calc(100% - 2rem);
      color: #f6eeff;
    }
    .sheet::backdrop {
      background: #0a0410cc;
      backdrop-filter: blur(4px);
    }

    .inner {
      position: relative;
      background: linear-gradient(180deg, #1b0f2a 0%, #14091f 100%);
      border: 1px solid #ffffff1f;
      border-radius: 1rem;
      padding: 1.75rem 1.5rem 1.5rem;
      text-align: center;
    }

    .x {
      position: absolute; top: .6rem; right: .6rem;
      width: 2rem; height: 2rem; border-radius: 50%;
      border: none; background: #ffffff12; color: #cbb8e0;
      font-size: .85rem; cursor: pointer;
    }
    .x:hover { background: #ffffff1f; color: #fff; }
    .x:focus-visible { outline: 2px solid #f59e0b; outline-offset: 2px; }

    .kicker {
      margin: 0 0 .5rem; font-size: .72rem; letter-spacing: .06em;
      text-transform: uppercase; color: #f59e0b; font-weight: 700;
    }
    .title { margin: 0 0 .5rem; font-size: 1.3rem; line-height: 1.25; }
    .lede {
      margin: 0 0 1.25rem; font-size: .88rem;
      color: #cbb8e0; line-height: 1.6;
    }

    .assure {
      list-style: none; margin: 1.25rem 0 0; padding: 0;
      display: grid; gap: .45rem; text-align: left;
    }
    .assure li {
      font-size: .82rem; color: #cbb8e0;
      display: flex; gap: .5rem; align-items: baseline;
    }
    .assure span { color: #10b981; font-weight: 700; }

    .fine {
      margin: 1.25rem 0 0; font-size: .7rem;
      color: #8b76a8; line-height: 1.55;
    }

    @media (max-width: 30rem) {
      /* Bottom sheet on phones — the thumb is at the bottom of the screen. */
      .sheet {
        margin: auto auto 0; width: 100%; max-width: none;
      }
      .inner {
        border-radius: 1rem 1rem 0 0;
        padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
      }
    }
  `]
})
export class AuthModalComponent {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly dlg = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  readonly open = input(false);
  readonly next = input('/discover');
  readonly heading = input('Find your Navratri crew');

  readonly closed = output<void>();

  constructor() {
    effect(() => {
      const el = this.dlg()?.nativeElement;
      if (!this.isBrowser || !el) return;

      if (this.open() && !el.open) {
        // showModal, not show: it is what makes the page behind inert and
        // puts the dialog in the top layer above any stacking context.
        el.showModal();
      } else if (!this.open() && el.open) {
        el.close();
      }
    });
  }

  close(): void {
    this.dlg()?.nativeElement.close();
  }

  /**
   * <dialog> counts a backdrop click as a click on the dialog element itself,
   * so comparing the target is how you tell "clicked outside" from "clicked
   * the panel" without wrapping everything in a stop-propagation.
   */
  onBackdrop(event: MouseEvent): void {
    if (event.target === this.dlg()?.nativeElement) this.close();
  }
}
