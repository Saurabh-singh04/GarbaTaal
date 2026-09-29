import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../core/services/profile.service';
import { CatalogService, City, Area } from '../../core/services/catalog.service';
import { Gender } from '../../core/models/profile.model';
import { validateDob, DOB_MESSAGES, latestAdultDob, earliestDob } from '../../core/utils/age';

/**
 * Three steps, no more. Every extra screen between "signed in" and "using the
 * app" costs users, and this product has nine nights to earn them.
 * Dance details are NOT collected here — they come after the user can see
 * the app working.
 */
@Component({
  selector: 'gt-onboarding',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="container onboarding">
      <div class="progress" role="progressbar"
           [attr.aria-valuenow]="step()" aria-valuemin="1" aria-valuemax="3">
        @for (s of [1, 2, 3]; track s) {
          <span class="bar" [class.done]="s <= step()"></span>
        }
      </div>

      @switch (step()) {

        @case (1) {
          <h1>About you</h1>
          <p class="hint">Only your first name and age are shown to others.</p>

          <div class="field">
            <label class="label" for="name">First name</label>
            <input id="name" class="input" type="text" maxlength="40"
                   [(ngModel)]="firstName" autocomplete="given-name"
                   placeholder="Riya" />
          </div>

          <div class="field">
            <label class="label" for="dob">Date of birth</label>
            <input id="dob" class="input" type="date"
                   [class.invalid]="dobError()"
                   [(ngModel)]="dob" [min]="minDob" [max]="maxDob" />
            @if (dobError(); as err) {
              <p class="error" role="alert">{{ err }}</p>
            } @else {
              <!-- Says why up front. Asking for a birth date with no explanation
                   is the most common drop-off point in an onboarding flow. -->
              <p class="hint">GarbaTaal is 18+. Your exact date is never shown — only your age.</p>
            }
          </div>

          <div class="field">
            <span class="label">You are</span>
            <div class="chip-row">
              @for (g of genders; track g.value) {
                <button type="button" class="chip"
                        [attr.aria-pressed]="gender() === g.value"
                        (click)="gender.set(g.value)">{{ g.label }}</button>
              }
            </div>
          </div>

          <div class="field">
            <span class="label">Show me</span>
            <div class="chip-row">
              @for (g of genders; track g.value) {
                <button type="button" class="chip"
                        [attr.aria-pressed]="lookingFor().includes(g.value)"
                        (click)="toggleLookingFor(g.value)">{{ g.label }}</button>
              }
            </div>
          </div>
        }

        @case (2) {
          <h1>Where are you dancing?</h1>
          <p class="hint">Matching only works locally, so we start with your city.</p>

          <div class="field">
            <label class="label" for="city">City</label>
            <select id="city" class="input" [(ngModel)]="cityId" (ngModelChange)="onCityChange($event)">
              <option [ngValue]="null" disabled>Select your city</option>
              @for (c of cities(); track c.id) {
                <option [ngValue]="c.id">{{ c.name }}, {{ c.state }}</option>
              }
            </select>
            @if (!cities().length && !loadingCities()) {
              <p class="hint">
                We haven't launched in your city yet. More districts are coming.
              </p>
            }
          </div>

          @if (areas().length) {
            <div class="field">
              <label class="label" for="area">Area</label>
              <select id="area" class="input" [(ngModel)]="areaId">
                <option [ngValue]="null">Anywhere in the city</option>
                @for (a of areas(); track a.id) {
                  <option [ngValue]="a.id">{{ a.name }}</option>
                }
              </select>
              <p class="hint">Used to show people near you. Never your exact location.</p>
            </div>
          }
        }

        @case (3) {
          <h1>Almost done</h1>
          <p class="hint">
            You can add photos and your dance profile next — they help a lot,
            but you can look around first.
          </p>

          <div class="card summary">
            <div class="row"><span>Name</span><strong>{{ firstName() || '—' }}</strong></div>
            <div class="row"><span>Age</span><strong>{{ ageLabel() }}</strong></div>
            <div class="row"><span>City</span><strong>{{ cityName() || '—' }}</strong></div>
          </div>

          <p class="safety">
            Meet at public grounds. Never send money to anyone you match with.
          </p>

          @if (submitError(); as err) {
            <p class="error" role="alert">{{ err }}</p>
          }
        }
      }

      <div class="actions">
        @if (step() > 1) {
          <button type="button" class="btn btn-secondary" (click)="back()">Back</button>
        }

        @if (step() < 3) {
          <button type="button" class="btn btn-primary"
                  [disabled]="!canContinue()" (click)="next()">Continue</button>
        } @else {
          <button type="button" class="btn btn-primary"
                  [disabled]="saving()" (click)="finish()">
            {{ saving() ? 'Creating your profile…' : 'Start' }}
          </button>
        }
      </div>
    </main>
  `,
  styles: [`
    .onboarding { padding: 2rem 16px 3rem; }

    .progress { display: flex; gap: .4rem; margin-bottom: 2rem; }
    .bar {
      flex: 1; height: 4px;
      background: var(--border); border-radius: 999px;
      transition: background .2s;
    }
    .bar.done { background: var(--primary); }

    .summary .row {
      display: flex; justify-content: space-between;
      padding: .6rem 0;
      border-bottom: 1px solid var(--border);
    }
    .summary .row:last-child { border-bottom: none; }
    .summary span { color: var(--text-muted); }

    .safety {
      margin-top: 1.25rem;
      font-size: .8125rem;
      color: var(--text-muted);
      text-align: center;
    }

    .actions { display: flex; gap: .75rem; margin-top: 2rem; }
  `]
})
export class OnboardingComponent implements OnInit {
  private readonly profiles = inject(ProfileService);
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);

  readonly genders: { value: Gender; label: string }[] = [
    { value: 'female', label: 'Woman' },
    { value: 'male', label: 'Man' },
    { value: 'other', label: 'Other' }
  ];

  readonly minDob = earliestDob();
  readonly maxDob = latestAdultDob();

  readonly step = signal(1);
  readonly firstName = signal('');
  readonly dob = signal('');
  readonly gender = signal<Gender | null>(null);
  readonly lookingFor = signal<Gender[]>([]);
  readonly cityId = signal<number | null>(null);
  readonly areaId = signal<number | null>(null);

  readonly cities = signal<City[]>([]);
  readonly areas = signal<Area[]>([]);
  readonly loadingCities = signal(true);
  readonly saving = signal(false);
  readonly submitError = signal<string | null>(null);

  readonly dobError = computed(() => {
    const value = this.dob();
    if (!value) return null;                   // don't shout before they've typed
    const problem = validateDob(value);
    return problem ? DOB_MESSAGES[problem] : null;
  });

  readonly ageLabel = computed(() => {
    const problem = validateDob(this.dob());
    if (problem) return '—';
    const years = new Date().getFullYear() - new Date(this.dob()).getFullYear();
    return `${years}`;
  });

  readonly cityName = computed(() =>
    this.cities().find(c => c.id === this.cityId())?.name ?? null);

  readonly canContinue = computed(() => {
    if (this.step() === 1) {
      return this.firstName().trim().length >= 2
        && !validateDob(this.dob())
        && this.gender() !== null
        && this.lookingFor().length > 0;
    }
    if (this.step() === 2) return this.cityId() !== null;
    return true;
  });

  async ngOnInit(): Promise<void> {
    try {
      this.cities.set(await this.catalog.loadCities());
    } finally {
      this.loadingCities.set(false);
    }
  }

  toggleLookingFor(g: Gender): void {
    const current = this.lookingFor();
    this.lookingFor.set(
      current.includes(g) ? current.filter(x => x !== g) : [...current, g]
    );
  }

  async onCityChange(cityId: number | null): Promise<void> {
    this.areaId.set(null);
    this.areas.set(cityId ? await this.catalog.areasFor(cityId) : []);
  }

  next(): void { if (this.canContinue()) this.step.update(s => s + 1); }
  back(): void { this.step.update(s => Math.max(1, s - 1)); }

  async finish(): Promise<void> {
    this.saving.set(true);
    this.submitError.set(null);

    try {
      await this.profiles.create({
        first_name: this.firstName(),
        date_of_birth: this.dob(),
        gender: this.gender(),
        looking_for: this.lookingFor(),
        city_id: this.cityId(),
        area_id: this.areaId(),
        photo: null
      });

      await this.router.navigate(['/profile/dance']);
    } catch (err: unknown) {
      // under_18 can only appear here if someone bypassed the client check, so
      // say so plainly rather than pretending it was a network problem.
      const code = err instanceof Error ? err.message : '';
      this.submitError.set(
        code === 'under_18'
          ? 'You must be 18 or older to use GarbaTaal.'
          : 'Could not create your profile. Please try again.'
      );
      this.saving.set(false);
    }
  }
}
