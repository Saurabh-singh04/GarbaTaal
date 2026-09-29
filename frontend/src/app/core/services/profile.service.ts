import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile, OnboardingDraft } from '../models/profile.model';
import { isAdult } from '../utils/age';

export type ProfileState = 'loading' | 'signed_out' | 'needs_onboarding' | 'ready' | 'banned';

/**
 * The signed-in user's own profile.
 *
 * Reads and writes go straight to Supabase rather than through the .NET API,
 * because that container sleeps on the free tier and a 40-second cold start
 * during onboarding loses the user. RLS restricts every query here to the
 * caller's own row.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly supabase = inject(SupabaseService);

  readonly profile = signal<Profile | null>(null);
  readonly loading = signal(true);

  readonly state = computed<ProfileState>(() => {
    if (this.loading()) return 'loading';
    if (!this.supabase.session()) return 'signed_out';

    const p = this.profile();
    if (!p) return 'needs_onboarding';
    if (p.is_banned) return 'banned';
    return 'ready';
  });

  /** True while the ₹99 Navratri Pass is active. */
  readonly hasPass = computed(() => {
    const expires = this.profile()?.pass_expires_at;
    return !!expires && new Date(expires) > new Date();
  });

  async load(): Promise<Profile | null> {
    this.loading.set(true);
    try {
      const userId = this.supabase.session()?.user?.id;
      if (!userId) {
        this.profile.set(null);
        return null;
      }

      // maybeSingle(), not single(): a user who has signed in but not completed
      // onboarding has no row yet, and that is a normal state, not an error.
      const { data, error } = await this.supabase.db
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      this.profile.set(data as Profile | null);
      return data as Profile | null;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Writes the profile row after onboarding.
   *
   * The 18+ check here is a courtesy so the user gets a clear message; the
   * database CHECK constraint is the gate that actually holds. Never remove one
   * because the other exists.
   */
  async create(draft: OnboardingDraft): Promise<Profile> {
    const userId = this.supabase.session()?.user?.id;
    if (!userId) throw new Error('not_signed_in');

    if (!draft.gender) throw new Error('gender_required');
    if (!draft.city_id) throw new Error('city_required');
    if (!isAdult(draft.date_of_birth)) throw new Error('under_18');

    const row = {
      id: userId,
      first_name: draft.first_name.trim(),
      date_of_birth: draft.date_of_birth,
      gender: draft.gender,
      looking_for: draft.looking_for.length ? draft.looking_for : ['male', 'female', 'other'],
      city_id: draft.city_id,
      area_id: draft.area_id
    };

    const { data, error } = await this.supabase.db
      .from('profiles')
      .insert(row)
      .select()
      .single();

    if (error) throw error;

    // Create the dance profile alongside it, so discovery never has to handle a
    // profile with no preferences row.
    await this.supabase.db.from('preferences').insert({ user_id: userId });
    await this.supabase.db.from('availability').insert({ user_id: userId, nights_mask: 0 });

    this.profile.set(data as Profile);
    return data as Profile;
  }

  async update(changes: Partial<Profile>): Promise<void> {
    const userId = this.supabase.session()?.user?.id;
    if (!userId) throw new Error('not_signed_in');

    // Columns a user must never set on themselves. RLS allows the update, so
    // this is the guard that stops a careless caller granting a pass or a badge.
    const forbidden = ['id', 'is_banned', 'is_verified', 'pass_expires_at', 'created_at'];
    const safe = Object.fromEntries(
      Object.entries(changes).filter(([k]) => !forbidden.includes(k))
    );

    const { data, error } = await this.supabase.db
      .from('profiles')
      .update(safe)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    this.profile.set(data as Profile);
  }

  async touchLastActive(): Promise<void> {
    const userId = this.supabase.session()?.user?.id;
    if (!userId) return;
    // Feeds the "recent activity" term in the match score. Fire and forget —
    // a failure here must never block the UI.
    await this.supabase.db
      .from('profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', userId);
  }

  clear(): void {
    this.profile.set(null);
  }
}
