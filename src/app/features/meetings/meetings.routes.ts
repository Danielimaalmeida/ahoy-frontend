import type { Routes } from '@angular/router';
import { MeetingView } from './meeting-view';
import { MeetingsShell } from './meetings-shell';

/** Meetings: the shell (list and store) with the open meeting, by default or by id. 0 AIU. */
export const MEETINGS_ROUTES: Routes = [
  {
    path: '',
    component: MeetingsShell,
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Meetings · Ahoy',
        component: MeetingView,
      },
      { path: ':id', title: 'Meeting · Ahoy', component: MeetingView },
    ],
  },
];
