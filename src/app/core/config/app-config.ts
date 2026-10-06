/** Runtime configuration, read from `/config.json` at start-up (lane 2A fills in the loading). */
export interface AppConfig {
  readonly apiBase: string;
  /** Who the UI says you are. Must match the `AHOY_ACTOR` the dev proxy sends as `X-Ahoy-Actor`. */
  readonly actor: string;
  /** Base URL for "Open in Jira"; without it the button stays hidden (G13). */
  readonly jiraBaseUrl?: string;
}

/** Values used when `/config.json` is missing or invalid. */
export const DEFAULT_APP_CONFIG: AppConfig = {
  apiBase: "/api/v1",
  actor: "dev@example.com",
};

/** App initializer for the AppConfig. Does nothing yet: lane 2A reads `/config.json` here. */
export function initAppConfig(): void {
  // Placeholder until lane 2A.
}
