import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * Temporary. Routes that exist so navigation works end to end, but whose
 * features are not built yet (modules 4 and 6).
 *
 * Deliberately says so rather than showing an empty screen — a blank page looks
 * like a bug, and this is clearer during development.
 */
@Component({
  selector: 'gt-placeholder',
  standalone: true,
  template: `
    <main class="container centre">
      <h1>{{ heading }}</h1>
      <p class="hint">{{ note }}</p>
      <p class="badge">Not built yet</p>
    </main>
  `,
  styles: [`
    .centre {
      min-height: 70vh;
      display: grid; place-content: center; justify-items: center;
      text-align: center; gap: .5rem;
    }
    .badge {
      margin-top: 1rem;
      padding: .35rem .85rem;
      background: var(--surface-alt);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: .8125rem;
      color: var(--text-muted);
    }
  `]
})
export class PlaceholderComponent {
  private readonly route = inject(ActivatedRoute);

  readonly heading = this.route.snapshot.data['heading'] ?? 'Coming soon';
  readonly note = this.route.snapshot.data['note'] ?? '';
}
