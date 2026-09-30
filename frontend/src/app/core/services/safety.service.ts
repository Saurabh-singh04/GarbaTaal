import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

/**
 * Blocking and reporting.
 *
 * Both are free and always available — a safety control behind a paywall is
 * not a safety control. The landing page promises "block or report anyone,
 * from anywhere", and this is what makes that true rather than marketing.
 *
 * A block is symmetric in effect: is_blocked_pair() in migration 0002 hides
 * each from the other, so blocking never tells the blocked person they were
 * blocked. That asymmetry — visible to them, invisible in its cause — is what
 * stops a block becoming a message.
 */

export type ReportReason =
  | 'asking_money'
  | 'fake_profile'
  | 'harassment'
  | 'nudity'
  | 'underage'
  | 'other';

/**
 * Ordered by what actually gets reported and what matters most, not
 * alphabetically. Money first: it is the scam the cyber cell advisory
 * describes and the one with a real-world cost.
 */
export const REPORT_REASONS: ReadonlyArray<{
  value: ReportReason;
  label: string;
  hint: string;
}> = [
  { value: 'asking_money',  label: 'Asked me for money',
    hint: 'Advance payment, booking fee, UPI request — anything like it.' },
  { value: 'harassment',    label: 'Harassment or abuse',
    hint: 'Threats, insults, or messages that would not stop.' },
  { value: 'fake_profile',  label: 'Fake profile',
    hint: 'Photos of someone else, or an invented person.' },
  { value: 'nudity',        label: 'Sexual or explicit content', hint: '' },
  { value: 'underage',      label: 'Looks under 18',
    hint: 'We check these first, every time.' },
  { value: 'other',         label: 'Something else', hint: '' }
];

@Injectable({ providedIn: 'root' })
export class SafetyService {
  private readonly supabase = inject(SupabaseService);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Blocks, and files a report in the same call when a reason is given.
   *
   * Reporting without blocking leaves someone still able to message you while
   * a human looks at it, which is the wrong default for the person who just
   * told us something is wrong. Blocking is always applied.
   */
  async blockAndReport(
    userId: string,
    reason?: ReportReason,
    details?: string
  ): Promise<boolean> {
    const me = this.supabase.session()?.user?.id;
    if (!me) {
      this.error.set('Sign in to block or report.');
      return false;
    }
    if (me === userId) return false;

    this.busy.set(true);
    this.error.set(null);

    try {
      // Block first. If the report insert fails, the person is still blocked —
      // the reverse would leave them reachable after being told they were not.
      const { error: blockErr } = await this.supabase.db
        .from('blocks')
        .upsert({ blocker_id: me, blocked_id: userId }, { onConflict: 'blocker_id,blocked_id' });

      if (blockErr) throw blockErr;

      if (reason) {
        const { error: reportErr } = await this.supabase.db
          .from('reports')
          .insert({
            reporter_id: me,
            reported_id: userId,
            reason,
            details: details?.trim() || null
          });

        // The block succeeded, which is the part that protects them. Say so
        // rather than reporting a failure that implies nothing happened.
        if (reportErr) {
          this.error.set('Blocked. The report did not send — please try reporting again.');
          return true;
        }
      }

      return true;
    } catch {
      this.error.set('Could not complete that. Check your connection and try again.');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async unblock(userId: string): Promise<boolean> {
    const me = this.supabase.session()?.user?.id;
    if (!me) return false;

    this.busy.set(true);
    try {
      const { error } = await this.supabase.db
        .from('blocks')
        .delete()
        .eq('blocker_id', me)
        .eq('blocked_id', userId);

      if (error) throw error;
      return true;
    } catch {
      this.error.set('Could not unblock. Try again.');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async blockedIds(): Promise<string[]> {
    const me = this.supabase.session()?.user?.id;
    if (!me) return [];

    const { data } = await this.supabase.db
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', me);

    return (data ?? []).map((r: { blocked_id: string }) => r.blocked_id);
  }
}
