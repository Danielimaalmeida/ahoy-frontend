import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import { AppConfigStore } from '@core/config/app-config';

/** An http(s) URL without its trailing slashes, or null for anything else. */
export function jiraBaseOf(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return null;
  } catch {
    return null;
  }
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}

/**
 * Links to an issue's page in the team's Jira, for the Backlog and the voyage header: the Jira connected in Settings, else
 * `jiraBaseUrl` from `/config.json`, else none. Settings are read once, the first time a page asks (again after a failed
 * read); until then, and when they cannot be read, the `/config.json` base is used. 0 AIU.
 */
@Injectable({ providedIn: 'root' })
export class JiraLinks {
  private readonly api = inject(ApiClient);
  private readonly config = inject(AppConfigStore);
  /** The base URL set in Settings → Jira, or null while it is unread, off or not an http(s) URL. */
  private readonly settingsBase = signal<string | null>(null);
  private loading: Promise<void> | null = null;

  /** The Jira base URL in force, or null when there is none. */
  readonly base = computed(
    () => this.settingsBase() ?? this.config.config().jiraBaseUrl ?? null
  );

  /** Reads Settings → Jira the first time it is called; later calls wait for that read, or read again after a failure. */
  load(): Promise<void> {
    this.loading ??= this.api.getJiraSettings().then((result) => {
      if (!result.ok) {
        this.loading = null;
        return;
      }
      const jira = result.value.jira;
      if (jira !== null)
        this.settingsBase.set(jiraBaseOf(jira.connection.baseUrl));
    });
    return this.loading;
  }

  /** The issue's page (`<base>/browse/<key>`), or null when no Jira is known. */
  issueUrl(key: string): string | null {
    const base = this.base();
    return base === null ? null : `${base}/browse/${encodeURIComponent(key)}`;
  }
}
