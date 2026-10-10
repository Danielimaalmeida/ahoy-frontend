import { Component } from '@angular/core';
import { Panel, PanelBody } from '@ui/panel/panel';
import type { SkeletonColumn } from '@ui/skeleton/skeleton';
import { Skeleton, SkeletonRows } from '@ui/skeleton/skeleton';

/** Gallery: the Skeleton preview as placeholder rows, then single bars. */
@Component({
  selector: 'ah-kit-skeleton',
  imports: [Panel, PanelBody, Skeleton, SkeletonRows],
  template: `
    <ah-panel>
      <ah-panel-body
        ><ah-skeleton-rows [rows]="3" [columns]="columns"
      /></ah-panel-body>
    </ah-panel>
    <div class="kit-stack">
      <ah-skeleton width="85%" />
      <ah-skeleton width="40%" />
      <ah-skeleton width="80px" [height]="20" />
    </div>
  `,
})
export class KitSkeleton {
  protected readonly columns: readonly SkeletonColumn[] = [
    { track: '80px', height: 20 },
    { track: 'minmax(0, 1fr)' },
    { track: '90px' },
    { track: '60px' },
  ];
}
