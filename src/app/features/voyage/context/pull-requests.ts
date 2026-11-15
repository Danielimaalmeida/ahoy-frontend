import type { StoryPullRequest } from '@core/api/story-state';

/** "billing-api #7": the repository alias and the pull request number, or the URL when the state names neither. */
export function pullRequestLabel(pr: StoryPullRequest): string {
  const name = pr.repo !== '' ? pr.repo : pr.url;
  return pr.number !== undefined ? `${name} #${pr.number}` : name;
}
