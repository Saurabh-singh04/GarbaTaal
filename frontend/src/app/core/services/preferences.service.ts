import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Preferences, Availability } from '../models/profile.model';
import { ALL_NIGHTS_MASK } from '../utils/nights';

/**
 * The dance profile: style, skill, steps, tempo, intent — plus which of the
 * nine nights the user is going and to which grounds.
 *
 * This is the data no live competitor matches on. Play Garba ranks by intent
 * and swiping; ranking by how someone actually dances is what makes this a
 * dance app rather than a dating app with a festival theme.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly supabase = inject(SupabaseService);

  readonly preferences = signal<Preferences | null>(null);
  readonly availability = signal<Availability | null>(null);
  readonly loading = signal(false);

  async load(): Promise<void> {
    const userId = this.supabase.session()?.user?.id;
    if (!userId) return;

    this.loading.set(true);
    try {
      // One round trip each, in parallel. Two sequential awaits here is a
      // visible stall on a slow connection at a garba ground.
      const [prefs, avail] = await Promise.all([
        this.supabase.db.from('preferences').select('*').eq('user_id', userId).maybeSingle(),
        this.supabase.db.from('availability').select('*').eq('user_id', userId).maybeSingle()
      ]);

      if (prefs.error) throw prefs.error;
      if (avail.error) throw avail.error;

      this.preferences.set(prefs.data as Preferences | null);
      this.availability.set(avail.data as Availability | null);
    } finally {
      this.loading.set(false);
    }
  }

  async savePreferences(changes: Partial<Preferences>): Promise<void> {
    const userId = this.supabase.session()?.user?.id;
    if (!userId) throw new Error('not_signed_in');

    // Upsert, not update: onboarding creates the row, but a user who signed up
    // before that change (or whose insert failed) must still be able to save.
    const { data, error } = await this.supabase.db
      .from('preferences')
      .upsert({ user_id: userId, ...changes, updated_at: new Date().toISOString() })
      .select()
      .single();

    if (error) throw error;
    this.preferences.set(data as Preferences);
  }

  async saveAvailability(
    nightsMask: number,
    areaIds: number[],
    travelKm: number
  ): Promise<void> {
    const userId = this.supabase.session()?.user?.id;
    if (!userId) throw new Error('not_signed_in');

    // Clamp to the 9 valid bits. A wider value would be stored, then silently
    // fail the schema's CHECK (nights_mask between 0 and 511).
    const mask = nightsMask & ALL_NIGHTS_MASK;

    // Clamp to the schema's CHECK (travel_km between 1 and 50) rather than
    // letting the database reject the whole save over a slider edge case.
    const km = Math.min(50, Math.max(1, Math.round(travelKm)));

    const { data, error } = await this.supabase.db
      .from('availability')
      .upsert({
        user_id: userId,
        nights_mask: mask,
        area_ids: areaIds,
        travel_km: km,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    this.availability.set(data as Availability);
  }

  /**
   * A dance profile is "complete" once the user has said which nights they are
   * going. Without that, they cannot be matched at all — shared nights is the
   * heaviest term in the score and a zero mask overlaps with nobody.
   */
  isComplete(): boolean {
    return (this.availability()?.nights_mask ?? 0) > 0;
  }

  clear(): void {
    this.preferences.set(null);
    this.availability.set(null);
  }
}
