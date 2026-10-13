import { Component, computed, inject } from '@angular/core';
import { Banner } from '@ui/banner/banner';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { ciWait } from '../context/ci-wait';
import { VoyageContext } from '../context/voyage-context';
import { pullRequestLabel } from './voyage-header';

/**
 * "Waiting for CI": shown while Ahoy waits for a pull request's checks, never while an agent runs. The implementer has
 * finished; the `child_ready` gate found checks still running and will be asked again. It names each pull request (a
 * link when the state records it, the repositories it could be in when several record its number), how many checks are
 * still running and their names, as the gate listed them. The API gives no time for the next check, so none is shown.
 *
 * It follows the event stream through the page's context: the next gate verdict, a run, a halt, a resume, a decision
 * or a phase change replaces it or takes it away.
 */
@Component({
  selector: 'ah-ci-wait-banner',
  imports: [Banner, RelativePipe],
  styles: `
    :host {
      display: contents;
    }

    .ci-wait__list {
      margin: var(--space-1) 0 0;
      padding-left: var(--space-4);
    }

    .ci-wait__list li {
      overflow-wrap: anywhere;
    }
  `,
  template: `
    @if (view(); as v) {
      <ah-banner
        variant="info"
        icon="refresh"
        announce="status"
        heading="Waiting for CI on the pull request"
        tech="child_ready · fail · checks still running"
        >The implementer has finished; no agent is running. Ahoy is waiting for
        the pull request's checks to finish and checks again on its own.
        <ul class="ci-wait__list">
          @for (pr of v.pullRequests; track $index) {
            <li>
              @if (pr.url; as url) {
                <a [href]="url" target="_blank" rel="noopener noreferrer">{{
                  pr.label
                }}</a>
              } @else {
                <span class="ah-mono">{{ pr.label }}</span>
              }
              · {{ pr.count }}{{ pr.names !== '' ? ': ' + pr.names : '' }}
            </li>
          }
        </ul>
        <span class="ah-hint">Seen {{ v.seenAt | ahRelative }}.</span>
      </ah-banner>
    }
  `,
})
export class CiWaitBanner {
  private readonly context = inject(VoyageContext);

  protected readonly view = computed(() => {
    const wait = ciWait(
      this.context.story(),
      this.context.events(),
      this.context.state()?.pullRequests ?? []
    );
    if (wait === null) return null;
    return {
      seenAt: wait.seenAt,
      pullRequests: wait.pullRequests.map((pending) => ({
        url: pending.pullRequest?.url ?? null,
        label:
          pending.pullRequest !== null
            ? pullRequestLabel(pending.pullRequest)
            : pending.candidateRepos.length > 0
              ? `PR #${pending.prNumber} in ${pending.candidateRepos.join(' or ')}`
              : `PR #${pending.prNumber}`,
        count:
          pending.pendingCount === 1
            ? '1 check still running'
            : `${pending.pendingCount} checks still running`,
        names: pending.pendingChecks.join(', '),
      })),
    };
  });
}
