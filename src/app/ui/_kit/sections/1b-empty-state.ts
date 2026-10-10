import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Panel } from '@ui/panel/panel';

/** Gallery: the EmptyState preview ("Calm seas"), and the empty result of a filter with a way to clear it. */
@Component({
  selector: 'ah-kit-empty-state',
  imports: [Button, EmptyState, Panel, RouterLink],
  template: `
    <ah-panel>
      <ah-empty-state heading="Calm seas">
        Nothing needs you right now. Questions, decisions and anchored voyages
        show up here.
        <a ahButton ahEmptyAction routerLink="/voyages">See all voyages</a>
      </ah-empty-state>
    </ah-panel>
    <ah-panel>
      <ah-empty-state heading="No anchored voyages" icon="compass">
        Every voyage is moving or in port.
        <a ahButton ahEmptyAction routerLink="/voyages">Show all statuses</a>
      </ah-empty-state>
    </ah-panel>
  `,
})
export class KitEmptyState {}
