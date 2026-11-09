import type { Routes } from '@angular/router';
import { ConversationView } from './conversation-view';
import { ProductShell } from './product-shell';

/** Product: the shell (list and store) with the open conversation, or an introduction when none is. */
export const PRODUCT_ROUTES: Routes = [
  {
    path: '',
    component: ProductShell,
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Product · Ahoy',
        component: ConversationView,
      },
      {
        path: ':id',
        title: 'Conversation · Ahoy',
        component: ConversationView,
      },
    ],
  },
];
