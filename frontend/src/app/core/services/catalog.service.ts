import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface City { id: number; name: string; state: string; slug: string; is_live: boolean; }
export interface Area { id: number; city_id: number; name: string; slug: string; }
export interface Venue {
  id: number; city_id: number; area_id: number | null;
  name: string; slug: string; address: string | null;
  organizer: string | null; pass_price_inr: number | null;
  nights_mask: number; is_featured: boolean;
}

/**
 * Cities, areas and venues. Readable without signing in, because the
 * prerendered /garba-partner/<city> SEO pages are built with no session.
 *
 * Cached in memory for the session — this data changes a few times a year and
 * refetching it on every screen wastes the free tier's egress budget.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly supabase = inject(SupabaseService);

  readonly cities = signal<City[]>([]);
  private readonly areaCache = new Map<number, Area[]>();
  private readonly venueCache = new Map<number, Venue[]>();

  async loadCities(): Promise<City[]> {
    if (this.cities().length) return this.cities();

    const { data, error } = await this.supabase.db
      .from('cities')
      .select('*')
      // Only launched districts. Matching below local density is worthless, so
      // a city nobody has been onboarded into must not be selectable.
      .eq('is_live', true)
      .order('name');

    if (error) throw error;

    this.cities.set((data ?? []) as City[]);
    return this.cities();
  }

  async areasFor(cityId: number): Promise<Area[]> {
    const cached = this.areaCache.get(cityId);
    if (cached) return cached;

    const { data, error } = await this.supabase.db
      .from('areas')
      .select('*')
      .eq('city_id', cityId)
      .order('name');

    if (error) throw error;

    const areas = (data ?? []) as Area[];
    this.areaCache.set(cityId, areas);
    return areas;
  }

  async venuesFor(cityId: number): Promise<Venue[]> {
    const cached = this.venueCache.get(cityId);
    if (cached) return cached;

    const { data, error } = await this.supabase.db
      .from('venues')
      .select('*')
      .eq('city_id', cityId)
      // Sponsored grounds first — this ordering is the thing a venue pays for.
      .order('is_featured', { ascending: false })
      .order('name');

    if (error) throw error;

    const venues = (data ?? []) as Venue[];
    this.venueCache.set(cityId, venues);
    return venues;
  }
}
