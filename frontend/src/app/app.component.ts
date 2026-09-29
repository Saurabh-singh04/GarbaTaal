import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SupabaseService } from './core/services/supabase.service';
import { ProfileService } from './core/services/profile.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class AppComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly profiles = inject(ProfileService);

  async ngOnInit(): Promise<void> {
    // Load the profile once at startup so guards can answer synchronously
    // afterwards instead of awaiting a round trip on every navigation.
    if (this.supabase.session()) {
      await this.profiles.load();
    } else {
      this.profiles.clear();
    }
  }
}
