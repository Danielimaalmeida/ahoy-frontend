import { Component, afterNextRender, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icon } from '@ui/icon/icon';
import { SettingsSummary, type SectionState } from './settings-summary';

/** One section of the side navigation. */
interface Section {
  readonly path: string;
  readonly label: string;
  readonly state: () => SectionState | null;
}

/**
 * The frame of Team settings: the title, whether the person is an admin, and the sections in a side navigation with
 * each one's state ("2 servers", "On"). The section itself is the routed page. 0 AIU.
 */
@Component({
  selector: 'ah-settings-shell',
  imports: [Icon, RouterLink, RouterLinkActive, RouterOutlet],
  providers: [SettingsSummary],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
    }
    .head__text {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .head h1 {
      margin: 0;
      font-size: 30px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .head p {
      margin: 0;
      max-width: 680px;
    }
    .crumbs {
      font-size: 12px;
    }
    .admin {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    .frame {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      align-items: flex-start;
    }
    .nav {
      flex: 0 0 196px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .nav__group {
      padding: 10px 10px 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ink-muted);
    }
    .nav__item {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 0 10px;
      border-radius: 8px;
      color: var(--ink-soft);
      font-weight: 600;
      text-decoration: none;
    }
    .nav__item:hover {
      background: var(--surface-hover);
      color: var(--ink);
    }
    .nav__item--current {
      background: var(--surface);
      color: var(--accent-text);
      box-shadow: var(--shadow-selected);
    }
    .nav__state {
      margin-left: auto;
      font-size: 11.5px;
      font-weight: 500;
      color: var(--ink-muted);
    }
    .nav__state--off {
      color: var(--ink-disabled);
    }
    .section {
      flex: 1 1 640px;
      min-width: 0;
    }
  `,
  template: `
    <div class="head">
      <div class="head__text">
        <span class="crumbs ah-muted">Account › Team settings</span>
        <h1>Team settings</h1>
        <p class="ah-muted">
          What the team's integrations use. Anyone in Ahoy can read them; admins
          change them, and every change is recorded with who made it.
        </p>
      </div>
      @if (summary.admin()) {
        <span class="ah-tag ah-tag--accent admin"
          ><ah-icon name="check" [size]="12" />You can change these ·
          admin</span
        >
      }
    </div>

    <div class="frame">
      <nav class="nav" aria-label="Settings sections">
        <span class="nav__group">Team</span>
        @for (s of sections; track s.path) {
          <a
            class="nav__item"
            [routerLink]="s.path"
            routerLinkActive="nav__item--current"
            ariaCurrentWhenActive="page"
            >{{ s.label }}
            @if (s.state(); as state) {
              <span class="nav__state" [class.nav__state--off]="state.off">{{
                state.label
              }}</span>
            }
          </a>
        }
      </nav>
      <div class="section">
        <router-outlet />
      </div>
    </div>
  `,
})
export class SettingsShell {
  protected readonly summary = inject(SettingsSummary);
  protected readonly sections: readonly Section[] = [
    { path: 'sonar', label: 'SonarQube', state: () => this.summary.sonar() },
    { path: 'jira', label: 'Jira', state: () => this.summary.jira() },
  ];

  constructor() {
    // After the first render, which creates the routed section, so it has claimed the settings it reads itself.
    afterNextRender(() => void this.summary.load());
  }
}
