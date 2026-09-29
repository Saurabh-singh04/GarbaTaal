/**
 * Types mirroring the Postgres enums in supabase/migrations/0001_init_schema.sql.
 *
 * These are kept as string-literal unions rather than TS enums so the values
 * serialise to exactly what Postgres expects — a TS enum would send `0` where
 * the database wants `'garba'`.
 */

export type Gender = 'male' | 'female' | 'other';
export type DanceStyle = 'garba' | 'dandiya' | 'both';
export type SkillLevel = 'beginner' | 'can_manage' | 'good' | 'pro';
export type TempoPref = 'traditional' | 'medium' | 'fast';
export type UserIntent = 'dance_only' | 'dance_friends' | 'open';

/** Garba steps, matching `preferences.steps` in the schema. */
export type GarbaStep =
  | '2_taali' | '3_taali' | 'dodhiyu' | 'hinch' | 'popatiyu' | 'trikoniya';

export interface Profile {
  id: string;
  first_name: string;
  date_of_birth: string;        // ISO date. Stored for the 18+ gate, never displayed.
  gender: Gender;
  looking_for: Gender[];
  city_id: number;
  area_id: number | null;
  bio: string | null;
  primary_photo_url: string | null;
  pass_expires_at: string | null;
  is_verified: boolean;
  is_banned: boolean;
  is_paused: boolean;
  last_active_at: string;
  created_at: string;
}

export interface Preferences {
  user_id: string;
  style: DanceStyle;
  skill: SkillLevel;
  tempo: TempoPref;
  steps: GarbaStep[];
  intent: UserIntent;
  wants_group: boolean;
  going_with_friends: boolean;
  verified_only_messages: boolean;
}

export interface Availability {
  user_id: string;
  /** 9-bit mask; bit N (1-indexed) = night N. See nightsToMask(). */
  nights_mask: number;
  venue_ids: number[];
}

/** What onboarding collects before a profile row can be written. */
export interface OnboardingDraft {
  first_name: string;
  date_of_birth: string;
  gender: Gender | null;
  looking_for: Gender[];
  city_id: number | null;
  area_id: number | null;
  photo: File | null;
}

// ── Display labels ────────────────────────────────────────────────────────
// Kept next to the types so a new enum value fails to compile until it has a
// label, rather than rendering as a raw database string in the UI.

export const SKILL_LABELS: Record<SkillLevel, string> = {
  beginner: 'Beginner',
  can_manage: 'Can manage',
  good: 'Good',
  pro: 'Pro (Dodhiyu)'
};

export const STYLE_LABELS: Record<DanceStyle, string> = {
  garba: 'Garba',
  dandiya: 'Dandiya',
  both: 'Both'
};

export const TEMPO_LABELS: Record<TempoPref, string> = {
  traditional: 'Traditional / slow',
  medium: 'Medium',
  fast: 'Fast / Dodhiyu'
};

export const STEP_LABELS: Record<GarbaStep, string> = {
  '2_taali': '2 Taali',
  '3_taali': '3 Taali',
  dodhiyu: 'Dodhiyu',
  hinch: 'Hinch',
  popatiyu: 'Popatiyu',
  trikoniya: 'Trikoniya'
};

/**
 * Intent labels. Dance-first options come first and are the default — this
 * ordering is a product decision, not cosmetics: it keeps the app reading as a
 * dance app rather than a dating app, which is both better positioning and a
 * safer legal posture in this category.
 */
export const INTENT_LABELS: Record<UserIntent, string> = {
  dance_only: 'Just a dance partner',
  dance_friends: 'Dance partner + friends',
  open: 'Open to more'
};
