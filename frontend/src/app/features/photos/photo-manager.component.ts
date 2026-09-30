import {
  Component, inject, signal, OnInit, PLATFORM_ID, computed
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PhotoService, MAX_PHOTOS } from '../../core/services/photo.service';

@Component({
  selector: 'gt-photo-manager',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
<div class="photos-layout">

  <header class="app-bar">
    <a routerLink="/profile/dance" class="back" aria-label="Back">←</a>
    <h1>Your photos</h1>
  </header>

  <div class="body">

    @if (photos.isPreview()) {
      <p class="preview-banner">
        This is a preview. <a routerLink="/">Sign in</a> to add your own photos.
      </p>
    }

    <p class="lede">
      One clear photo of your face does more than three of anything else.
      People skip profiles they cannot picture dancing with.
    </p>

    <div class="grid">
      @for (slot of slots(); track slot.position) {
        <div class="slot" [class.filled]="slot.photo" [class.primary]="slot.position === 1">

          @if (slot.photo) {
            <img class="shot" [src]="slot.photo.url" [alt]="'Photo ' + slot.position">

            @if (!slot.photo.is_approved) {
              <span class="badge review" title="Waiting for review">In review</span>
            }
            @if (slot.position === 1) {
              <span class="badge main">Main</span>
            }

            <button class="remove" type="button"
                    [disabled]="photos.busyPosition() === slot.position"
                    (click)="remove(slot.position)"
                    [attr.aria-label]="'Remove photo ' + slot.position">✕</button>

          } @else {
            <label class="add" [class.busy]="photos.busyPosition() === slot.position">
              <input type="file" accept="image/*" hidden
                     [disabled]="photos.isPreview() || photos.busyPosition() !== null"
                     (change)="pick($event, slot.position)">
              @if (photos.busyPosition() === slot.position) {
                <span class="spinner" aria-hidden="true"></span>
                <span class="add-text">Uploading…</span>
              } @else {
                <span class="plus" aria-hidden="true">＋</span>
                <span class="add-text">
                  {{ slot.position === 1 ? 'Main photo' : 'Add photo' }}
                </span>
              }
            </label>
          }
        </div>
      }
    </div>

    @if (photos.error(); as e) {
      <p class="error" role="alert">{{ e }}</p>
    }

    <section class="notes">
      <h2>What happens to them</h2>
      <ul>
        <li>
          <strong>Resized on your phone before upload.</strong> A 3 MB photo
          becomes about 45 KB, so this works on festival-ground mobile data.
        </li>
        <li>
          <strong>Reviewed before anyone else sees them.</strong> Your photo
          shows here straight away; it appears in other people's decks once a
          human has checked it.
        </li>
        <li>
          <strong>Yours to delete, any time.</strong> Removing a photo deletes
          the file, not just the link to it.
        </li>
        <li>
          <strong>No screenshots of other people.</strong> Photos that are not
          of you get removed, and repeat attempts get the account banned.
        </li>
      </ul>
    </section>
  </div>
</div>
  `,
  styles: [`
    :host {
      --night: #12091d; --night-card: #1b0f2a;
      --kesari: #c2410c; --marigold: #f59e0b;
      --diya: #fffbf0; --like-color: #10b981;
    }
    * { box-sizing: border-box; }

    .photos-layout {
      min-height: 100svh;
      background:
        radial-gradient(40rem 30rem at 50% 5%, #681b4f44, transparent 75%),
        linear-gradient(180deg, #0e0517 0%, var(--night) 100%);
      color: #f6eeff;
      padding-bottom: 3rem;
    }

    .app-bar {
      display: flex; align-items: center; gap: .75rem; padding: 1rem;
      position: sticky; top: 0; z-index: 5;
      background: color-mix(in srgb, var(--night) 88%, transparent);
      backdrop-filter: blur(8px);
    }
    .app-bar h1 { font-size: 1.1rem; margin: 0; font-weight: 600; }
    .back {
      color: var(--diya); text-decoration: none; font-size: 1.4rem;
      line-height: 1; padding: .2rem .5rem; border-radius: .5rem;
    }
    .back:focus-visible { outline: 2px solid var(--marigold); }

    .body { padding: 0 1rem; max-width: 34rem; margin: 0 auto; }

    .preview-banner {
      margin: 0 0 1rem; padding: .6rem .75rem;
      background: #f59e0b1f; border: 1px solid #f59e0b44;
      border-radius: .6rem; font-size: .8rem; text-align: center; color: #ffe9bd;
    }
    .preview-banner a { color: var(--marigold); }

    .lede { margin: 0 0 1.25rem; color: #cbb8e0; font-size: .9rem; line-height: 1.6; }

    .grid {
      display: grid; gap: .75rem;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    }

    .slot {
      position: relative;
      aspect-ratio: 3 / 4;
      border-radius: .9rem; overflow: hidden;
      background: var(--night-card);
      border: 1px solid #ffffff14;
    }
    .slot.primary { border-color: #f59e0b66; }

    .shot { width: 100%; height: 100%; object-fit: cover; display: block; }

    .add {
      width: 100%; height: 100%;
      display: grid; place-content: center; gap: .35rem; justify-items: center;
      cursor: pointer; color: #a992c4;
      border: 2px dashed #ffffff1f; border-radius: .9rem;
    }
    .add:hover { color: var(--diya); border-color: var(--marigold); }
    .add:focus-within { outline: 2px solid var(--marigold); outline-offset: 2px; }
    .add.busy { cursor: default; }
    .plus { font-size: 1.6rem; line-height: 1; }
    .add-text { font-size: .78rem; }

    .badge {
      position: absolute; top: .4rem; left: .4rem;
      padding: .15rem .45rem; border-radius: .4rem;
      font-size: .65rem; font-weight: 600;
    }
    .badge.main   { background: var(--marigold); color: #3a2410; }
    .badge.review { background: #000000aa; color: #ffe9bd; left: auto; right: 2.2rem; }

    .remove {
      position: absolute; top: .4rem; right: .4rem;
      width: 1.6rem; height: 1.6rem; border-radius: 50%;
      border: none; background: #000000aa; color: #fff;
      font-size: .75rem; cursor: pointer;
    }
    .remove:disabled { opacity: .4; cursor: default; }
    .remove:focus-visible { outline: 2px solid var(--marigold); }

    .spinner {
      width: 1.2rem; height: 1.2rem; border-radius: 50%;
      border: 2px solid #ffffff33; border-top-color: var(--marigold);
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }

    .error {
      margin: 1rem 0 0; padding: .75rem;
      background: #7f1d1d33; border: 1px solid #ef444455;
      border-radius: .6rem; font-size: .85rem;
    }

    .notes { margin-top: 2rem; }
    .notes h2 { font-size: .95rem; margin: 0 0 .75rem; }
    .notes ul { margin: 0; padding: 0; list-style: none; display: grid; gap: .75rem; }
    .notes li {
      font-size: .82rem; line-height: 1.55; color: #a992c4;
      padding-left: .9rem; position: relative;
    }
    .notes li::before {
      content: '·'; position: absolute; left: 0; color: var(--marigold);
    }
    .notes strong { color: #e6d9f5; font-weight: 600; }
  `]
})
export class PhotoManagerComponent implements OnInit {
  readonly photos = inject(PhotoService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Fixed number of slots, filled or not, so the grid never reflows. */
  readonly slots = computed(() =>
    Array.from({ length: MAX_PHOTOS }, (_, i) => ({
      position: i + 1,
      photo: this.photos.photos().find((p) => p.position === i + 1) ?? null
    }))
  );

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return;
    await this.photos.load();
  }

  async pick(event: Event, position: number): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    // Reset immediately: without this, choosing the same file again after a
    // failure fires no change event and looks like the button is dead.
    input.value = '';

    if (file) await this.photos.upload(file, position);
  }

  async remove(position: number): Promise<void> {
    await this.photos.remove(position);
  }
}
