import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { CONVERSATION_RECIPES, type ConversationRecipe } from '@core/api/types';
import { AccessControl } from '@core/auth/access-control';
import { CurrentUser } from '@core/auth/current-user';
import { normalizeQnumber } from '@domain/access';
import {
  conversationGroups,
  conversationSub,
  RECIPE_WORDS,
} from '@domain/conversations';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { Skeleton } from '@ui/skeleton/skeleton';
import {
  NewConversationDialog,
  type NewConversationData,
} from './new-conversation-dialog';
import { conversationErrorView } from './product-errors';
import { ProductStore } from './product-store';

/**
 * Product (`/product`): conversations with an agent that reads the backlog, meetings, defects, designs and code, and
 * proposes. The left column starts one (blank or from a recipe) and lists the person's own and those shared with the
 * team; the right shows the one in the address. The shell reads the list once and provides the `ProductStore` the
 * conversation view shares. Starting one and reading are 0 AIU; only asking spends.
 */
@Component({
  selector: 'ah-product-shell',
  imports: [
    Banner,
    Button,
    NgTemplateOutlet,
    RouterLink,
    RouterOutlet,
    Skeleton,
  ],
  providers: [ProductStore],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .lead {
      display: flex;
      align-items: baseline;
      gap: 10px;
      flex-wrap: wrap;
    }
    .lead h1 {
      margin: 0;
      font-size: 20px;
    }
    .body {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    aside {
      width: 270px;
      flex: none;
    }
    .group {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--ink-muted);
      padding: 12px 10px 4px;
      margin: 0;
    }
    nav ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    nav {
      padding: 0 6px 6px;
    }
    a.line,
    button.recipe {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px;
      border-radius: var(--radius-md);
      color: var(--ink);
      text-decoration: none;
      width: 100%;
      text-align: left;
      background: none;
      border: 0;
      font: inherit;
      cursor: pointer;
    }
    a.line:hover,
    button.recipe:hover {
      background: var(--surface-hover);
      color: var(--ink);
    }
    a.line[aria-current='page'] {
      background: var(--accent-soft);
    }
    .title {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .loading {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px 16px;
    }
    .status-line {
      padding: 4px 10px 8px;
      margin: 0;
    }
    /* Not a <main>: the app shell already has the page's one main landmark. */
    .product-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    @media (max-width: 760px) {
      .body {
        flex-direction: column;
        align-items: stretch;
      }
      aside {
        width: auto;
        max-height: 45vh;
        overflow-y: auto;
      }
    }
  `,
  template: `
    <div class="lead">
      <h1>Product</h1>
      <span class="ah-muted"
        >Product work with an agent: it reads the backlog, meetings, defects,
        designs and code, and proposes. Nothing changes until you press a
        button.</span
      >
    </div>
    <div class="body">
      <aside class="ah-panel" aria-labelledby="product-heading">
        <div class="ah-panel__head">
          <h2 class="ah-panel__title" id="product-heading">Conversations</h2>
          <div class="ah-panel__actions">
            <button
              ahButton="primary"
              size="sm"
              type="button"
              (click)="start(null)"
            >
              New conversation
            </button>
          </div>
        </div>
        <nav aria-label="Conversations">
          <h3 class="group">Recipes</h3>
          <ul>
            @for (r of recipes; track r) {
              <li>
                <button type="button" class="recipe" (click)="start(r)">
                  <span class="title">{{ words[r].label }}</span>
                  <span class="ah-hint">{{ words[r].hint }}</span>
                </button>
              </li>
            }
          </ul>
          @if (store.loading() && !store.loaded()) {
            <div class="loading" aria-label="Loading conversations">
              <ah-skeleton width="70%" />
              <ah-skeleton width="50%" />
            </div>
          } @else if (store.loaded()) {
            <h3 class="group">My conversations</h3>
            @if (groups().mine.length === 0) {
              <p class="status-line ah-hint">
                None yet. Start one above, blank or from a recipe.
              </p>
            } @else {
              <ul>
                @for (c of groups().mine; track c.id) {
                  <ng-container
                    *ngTemplateOutlet="
                      lineTpl;
                      context: { $implicit: c, mine: true }
                    "
                  />
                }
              </ul>
            }
            @if (groups().shared.length > 0) {
              <h3 class="group">Shared with the team</h3>
              <ul>
                @for (c of groups().shared; track c.id) {
                  <ng-container
                    *ngTemplateOutlet="
                      lineTpl;
                      context: { $implicit: c, mine: false }
                    "
                  />
                }
              </ul>
            }
          }
        </nav>
        <ng-template #lineTpl let-c let-mine="mine">
          <li>
            <a
              class="line"
              [routerLink]="['/product', c.id]"
              [attr.aria-current]="c.id === store.openId() ? 'page' : null"
            >
              <span class="title">{{ c.title }}</span>
              <span class="ah-hint">{{ sub(c, mine) }}</span>
            </a>
          </li>
        </ng-template>
      </aside>
      <div class="product-main">
        @if (listFailure(); as problem) {
          <ah-banner
            [variant]="problem.variant"
            [heading]="problem.heading"
            [tech]="problem.tech ?? ''"
          >
            {{ problem.text }}
            <button ahButton size="sm" type="button" (click)="store.load()">
              Try again
            </button>
          </ah-banner>
        }
        <router-outlet />
      </div>
    </div>
  `,
})
export class ProductShell {
  protected readonly store = inject(ProductStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);
  private readonly access = inject(AccessControl);
  private readonly user = inject(CurrentUser);

  protected readonly recipes = CONVERSATION_RECIPES;
  protected readonly words = RECIPE_WORDS;
  protected readonly sub = conversationSub;

  /** The person's own conversations (by the id the API records: an e-mail locally, the qnumber signed in) and the team's. */
  protected readonly groups = computed(() => {
    const me = this.access.qnumber();
    return conversationGroups(
      this.store.conversations(),
      (owner) =>
        this.user.is(owner) || (me !== null && normalizeQnumber(owner) === me)
    );
  });
  protected readonly listFailure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : conversationErrorView(error);
  });

  constructor() {
    void this.store.load();
  }

  /** Starts a conversation, blank or from a recipe, and opens it. */
  protected start(recipe: ConversationRecipe | null): void {
    this.store.dismissError();
    const ref = this.dialogs.open<string, NewConversationData>(
      NewConversationDialog,
      { data: { store: this.store, recipe }, width: '520px' }
    );
    ref.closed.subscribe((id) => {
      if (id !== undefined) void this.router.navigate(['/product', id]);
    });
  }
}
