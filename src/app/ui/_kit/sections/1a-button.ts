import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Button } from "@ui/button/button";
import { Icon } from "@ui/icon/icon";

/** Gallery: the Button preview (variants, sizes, disabled), plus buttons on links. */
@Component({
  selector: "ah-kit-button",
  imports: [Button, Icon, RouterLink],
  template: `
    <div class="kit-row">
      <button ahButton="primary" type="button"><ah-icon name="sail" />Set sail</button>
      <button ahButton type="button">Budget</button>
      <button ahButton="soft" type="button">Use recommendation</button>
      <button ahButton="ghost" type="button">Jira ↗</button>
      <button ahButton="danger-outline" type="button">Stop</button>
      <button ahButton="danger" type="button">Stop voyage</button>
    </div>
    <div class="kit-row">
      <button ahButton="primary" size="sm" type="button">Answer</button>
      <button ahButton size="sm" type="button">Review &amp; resume</button>
      <button ahButton="primary" size="lg" type="button">Set sail · up to 25 AIU</button>
      <button ahButton type="button" disabled>Load more</button>
    </div>
    <div class="kit-row">
      <a ahButton size="sm" routerLink="/voyages/PROJ-118/models">Review &amp; resume</a>
      <a ahButton="soft" size="sm" routerLink="/voyages/PROJ-123">Open voyage</a>
      <a ahButton="ghost" size="sm" aria-disabled="true">Link, disabled</a>
    </div>
  `,
})
export class KitButton {}
