import { inject } from '@angular/core';
import type { Routes } from '@angular/router';
import { ApiClient } from '@core/api/api-client';
import { ARTIFACT_READER, ArtifactReader } from './artifact-reader';
import { ArtifactsTab } from './artifacts-tab';

/**
 * Artifacts: view and compare the revisions of the voyage's file set (lane 5C). The reader is provided by the route, not by
 * the tab, so what it has read survives leaving the tab and coming back: the tab is recreated, the cache is not.
 */
export const ARTIFACTS_ROUTES: Routes = [
  {
    path: '',
    title: 'Artifacts · Ahoy',
    component: ArtifactsTab,
    providers: [
      {
        provide: ARTIFACT_READER,
        useFactory: () => {
          const api = inject(ApiClient);
          return new ArtifactReader((key, query) =>
            api.getArtifactContent(key, query)
          );
        },
      },
    ],
  },
];
