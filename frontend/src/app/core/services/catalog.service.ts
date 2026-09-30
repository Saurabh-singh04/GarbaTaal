import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface City { id: number; name: string; state: string; slug: string; is_live: boolean; }
export interface Area { id: number; city_id: number; name: string; slug: string; }

/**
 * Cities and areas. Readable without signing in, because the prerendered
 * /garba-partner/<city> SEO pages are built with no session.
 *
 * There is no venue catalog on purpose. GarbaTaal matches people by where they
 * are, not by which event they are attending — we list no grounds, sell no
 * tickets and take no organiser money.
 *
 * Cached in memory for the session — this data changes a few times a year and
 * refetching it on every screen wastes the free tier's egress budget.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly supabase = inject(SupabaseService);

  readonly cities = signal<City[]>([]);
  private readonly areaCache = new Map<number, Area[]>();

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

  /** Area name for display, e.g. "Satellite". Null if the id is unknown. */
  async areaName(cityId: number, areaId: number | null): Promise<string | null> {
    if (areaId === null) return null;
    const areas = await this.areasFor(cityId);
    return areas.find((a) => a.id === areaId)?.name ?? null;
  }
}
