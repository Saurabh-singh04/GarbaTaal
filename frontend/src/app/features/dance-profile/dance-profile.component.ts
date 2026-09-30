import { Component, OnInit, computed, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PreferencesService } from '../../core/services/preferences.service';
import { ProfileService } from '../../core/services/profile.service';
import { CatalogService, Venue } from '../../core/services/catalog.service';
import {
  DanceStyle, SkillLevel, TempoPref, UserIntent, GarbaStep,
  STYLE_LABELS, SKILL_LABELS, TEMPO_LABELS, STEP_LABELS, INTENT_LABELS
} from '../../core/models/profile.model';
import { NIGHTS, hasNight, toggleNight, maskToNights, formatNightLabel } from '../../core/utils/nights';
import { environment } from '../../../environments/environment';

/**
 * The dance profile. Everything here feeds the match score, and the UI says so
 * next to each field — a user who understands why a question is asked answers
 * it honestly, and honest skill data is what makes the matching worth anything.
 */
@Component({
  selector: 'gt-dance-profile',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="container dance">
      <header>
        <h1>Your dance profile</h1>
        <p class="hint">This is what we match on. The more you fill in, the better your matches.</p>
      </header>

      <!-- ── Nights: the single most important field ───────────────────── -->
      <section class="card">
        <h2>Which nights are you going?</h2>
        <p class="hint">Shared nights count for the most in your matches.</p>

        <div class="nights">
          @for (n of nights; track n) {
            <button type="button" class="night"
                    [attr.aria-pressed]="isNightOn(n)"
                    (click)="toggleNight(n)">
              <span class="num">{{ n }}</span>
              <span class="date">{{ nightLabel(n) }}</span>
            </button>
          }
        </div>

        <div class="night-actions">
          <button type="button" class="btn-ghost" (click)="selectAllNights()">All 9 nights</button>
          @if (nightsMask() > 0) {
            <button type="button" class="btn-ghost" (click)="clearNights()">Clear</button>
          }
        </div>

        @if (nightsMask() === 0) {
          <p class="warn">Pick at least one night — we can't match you otherwise.</p>
        }
      </section>

      <!-- ── Grounds ───────────────────────────────────────────────────── -->
      @if (venues().length) {
        <section class="card">
          <h2>Which grounds?</h2>
          <p class="hint">People going to the same ground are shown to you first.</p>

          <div class="chip-row">
            @for (v of venues(); track v.id) {
              <button type="button" class="chip"
                      [attr.aria-pressed]="venueIds().includes(v.id)"
                      (click)="toggleVenue(v.id)">
                {{ v.name }}
                @if (v.is_featured) { <span class="star" aria-label="Partner ground">★</span> }
              </button>
            }
          </div>
        </section>
      }

      <!-- ── Style & skill ─────────────────────────────────────────────── -->
      <section class="card">
        <h2>How you dance</h2>

        <div class="field">
          <span class="label">Style</span>
          <div class="chip-row">
            @for (s of styles; track s) {
              <button type="button" class="chip"
                      [attr.aria-pressed]="style() === s"
                      (click)="style.set(s)">{{ styleLabel(s) }}</button>
            }
          </div>
        </div>

        <div class="field">
          <span class="label">Skill level</span>
          <div class="chip-row">
            @for (s of skills; track s) {
              <button type="button" class="chip"
                      [attr.aria-pressed]="skill() === s"
                      (click)="skill.set(s)">{{ skillLabel(s) }}</button>
            }
          </div>
          <p class="hint">Be honest — you'll be matched with people at a similar level.</p>
        </div>

        <div class="field">
          <span class="label">Steps you know</span>
          <div class="chip-row">
            @for (s of steps; track s) {
              <button type="button" class="chip"
                      [attr.aria-pressed]="knownSteps().includes(s)"
                      (click)="toggleStep(s)">{{ stepLabel(s) }}</button>
            }
          </div>
        </div>

        <div class="field">
          <span class="label">Tempo you prefer</span>
          <div class="chip-row">
            @for (t of tempos; track t) {
              <button type="button" class="chip"
                      [attr.aria-pressed]="tempo() === t"
                      (click)="tempo.set(t)">{{ tempoLabel(t) }}</button>
            }
          </div>
        </div>
      </section>

      <!-- ── Intent ────────────────────────────────────────────────────── -->
      <section class="card">
        <h2>What you're looking for</h2>
        <p class="hint">You'll only be shown people who picked the same thing.</p>

        <div class="stack">
          @for (i of intents; track i) {
            <button type="button" class="option"
                    [attr.aria-pressed]="intent() === i"
                    (click)="intent.set(i)">
              {{ intentLabel(i) }}
            </button>
          }
        </div>

        <label class="check">
          <input type="checkbox" [(ngModel)]="wantsGroupModel" />
          <span>I'd rather go as a group than one-on-one</span>
        </label>

        <label class="check">
          <input type="checkbox" [(ngModel)]="goingWithFriendsModel" />
          <span>I'm already going with friends</span>
        </label>
      </section>

      <!-- ── Safety control ────────────────────────────────────────────── -->
      <section class="card">
        <h2>Safety</h2>
        <label class="check">
          <input type="checkbox" [(ngModel)]="verifiedOnlyModel" />
          <span>Only verified profiles can message me</span>
        </label>
        <p class="hint">
          Fewer matches, but everyone who reaches you has passed a photo check.
        </p>
      </section>

      @if (error(); as e) { <p class="error" role="alert">{{ e }}</p> }

      <div class="actions">
        <button type="button" class="btn btn-primary"
                [disabled]="saving() || nightsMask() === 0"
                (click)="save()">
          {{ saving() ? 'Saving…' : 'Save and find matches' }}
        </button>
      </div>
    </main>
  `,
  styles: [`
    .dance { padding: 2rem 16px 4rem; }
    header { margin-bottom: 1.5rem; }
    section { margin-bottom: 1.25rem; }
    section h2 { font-size: 1.05rem; margin-bottom: .25rem; }

    .nights {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: .5rem;
      margin-top: 1rem;
    }
    @media (min-width: 480px) {
      .nights { grid-template-columns: repeat(5, 1fr); }
    }

    .night {
      display: grid; gap: .1rem;
      padding: .6rem .25rem;
      min-height: 60px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font: inherit; cursor: pointer;
      color: var(--text);
      transition: background .15s, border-color .15s;
    }
    .night[aria-pressed='true'] {
      background: var(--primary-soft);
      border-color: var(--primary);
      color: var(--primary);
    }
    .night .num { font-weight: 700; font-size: 1.05rem; }
    .night .date { font-size: .7rem; color: var(--text-muted); }
    .night[aria-pressed='true'] .date { color: var(--primary); }

    .night-actions { display: flex; gap: 1rem; margin-top: .75rem; }
    .night-actions button { font-size: .875rem; cursor: pointer; padding: .25rem 0; }

    .warn {
      margin-top: .75rem; margin-bottom: 0;
      font-size: .8125rem; color: var(--danger);
    }

    .star { color: var(--primary); margin-left: .2rem; }

    .stack { display: grid; gap: .5rem; }
    .option {
      text-align: left;
      min-height: 48px;
      padding: .75rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font: inherit; color: var(--text); cursor: pointer;
    }
    .option[aria-pressed='true'] {
      background: var(--primary-soft);
      border-color: var(--primary);
      color: var(--primary);
      font-weight: 600;
    }

    .check {
      display: flex; align-items: center; gap: .6rem;
      margin-top: .75rem;
      font-size: .9375rem; cursor: pointer;
    }
    .check input { width: 20px; height: 20px; accent-color: var(--primary); }

    .actions { margin-top: 1.5rem; }
  `]
})
export class DanceProfileComponent implements OnInit {
  private readonly prefs = inject(PreferencesService);
  private readonly profiles = inject(ProfileService);
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);

  readonly nights = NIGHTS;
  readonly styles: DanceStyle[] = ['garba', 'dandiya', 'both'];
  readonly skills: SkillLevel[] = ['beginner', 'can_manage', 'good', 'pro'];
  readonly tempos: TempoPref[] = ['traditional', 'medium', 'fast'];
  readonly steps: GarbaStep[] = ['2_taali', '3_taali', 'dodhiyu', 'hinch', 'popatiyu', 'trikoniya'];
  readonly intents: UserIntent[] = ['dance_only', 'dance_friends', 'open'];

  readonly nightsMask = signal(0);
  readonly venueIds = signal<number[]>([]);
  readonly venues = signal<Venue[]>([]);
  readonly style = signal<DanceStyle>('both');
  readonly skill = signal<SkillLevel>('beginner');
  readonly tempo = signal<TempoPref>('medium');
  readonly knownSteps = signal<GarbaStep[]>([]);
  readonly intent = signal<UserIntent>('dance_only');
  readonly wantsGroup = signal(false);
  readonly goingWithFriends = signal(false);
  readonly verifiedOnly = signal(false);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly selectedNights = computed(() => maskToNights(this.nightsMask()));

  // ngModel needs plain accessors; the signals stay the source of truth.
  get wantsGroupModel() { return this.wantsGroup(); }
  set wantsGroupModel(v: boolean) { this.wantsGroup.set(v); }
  get goingWithFriendsModel() { return this.goingWithFriends(); }
  set goingWithFriendsModel(v: boolean) { this.goingWithFriends.set(v); }
  get verifiedOnlyModel() { return this.verifiedOnly(); }
  set verifiedOnlyModel(v: boolean) { this.verifiedOnly.set(v); }

  styleLabel = (s: DanceStyle) => STYLE_LABELS[s];
  skillLabel = (s: SkillLevel) => SKILL_LABELS[s];
  tempoLabel = (t: TempoPref) => TEMPO_LABELS[t];
  stepLabel = (s: GarbaStep) => STEP_LABELS[s];
  intentLabel = (i: UserIntent) => INTENT_LABELS[i];

  nightLabel(n: number): string {
    return formatNightLabel(n, environment.festival.startDate).split('·')[1]?.trim() ?? '';
  }

  isNightOn(n: number): boolean { return hasNight(this.nightsMask(), n); }
  toggleNight(n: number): void { this.nightsMask.update(m => toggleNight(m, n)); }
  selectAllNights(): void { this.nightsMask.set(0b111111111); }
  clearNights(): void { this.nightsMask.set(0); }

  toggleStep(s: GarbaStep): void {
    this.knownSteps.update(list =>
      list.includes(s) ? list.filter(x => x !== s) : [...list, s]);
  }

  toggleVenue(id: number): void {
    this.venueIds.update(list =>
      list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  }

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return;   // see onboarding: no network during prerender

    await this.prefs.load();

    const p = this.prefs.preferences();
    if (p) {
      this.style.set(p.style);
      this.skill.set(p.skill);
      this.tempo.set(p.tempo);
      this.knownSteps.set(p.steps ?? []);
      this.intent.set(p.intent);
      this.wantsGroup.set(p.wants_group);
      this.goingWithFriends.set(p.going_with_friends);
      this.verifiedOnly.set(p.verified_only_messages);
    }

    const a = this.prefs.availability();
    if (a) {
      this.nightsMask.set(a.nights_mask);
      this.venueIds.set(a.venue_ids ?? []);
    }

    const cityId = this.profiles.profile()?.city_id;
    if (cityId) {
      this.venues.set(await this.catalog.venuesFor(cityId));
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);

    try {
      // Sequential on purpose: if preferences save but availability fails, the
      // user is still unmatched and the error tells them so. The reverse would
      // leave them matchable with stale dance data.
      await this.prefs.savePreferences({
        style: this.style(),
        skill: this.skill(),
        tempo: this.tempo(),
        steps: this.knownSteps(),
        intent: this.intent(),
        wants_group: this.wantsGroup(),
        going_with_friends: this.goingWithFriends(),
        verified_only_messages: this.verifiedOnly()
      });

      await this.prefs.saveAvailability(this.nightsMask(), this.venueIds());

      await this.router.navigate(['/discover']);
    } catch {
      this.error.set('Could not save your dance profile. Please try again.');
      this.saving.set(false);
    }
  }
}
