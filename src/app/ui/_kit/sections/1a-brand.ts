import { Component } from "@angular/core";
import { Button } from "@ui/button/button";
import { Icon } from "@ui/icon/icon";
import { ICON_NAMES } from "@ui/icon/icons";
import { Logo } from "@ui/logo/logo";

/** Gallery: the logo, the app icon and the 16 icons at their three sizes. */
@Component({
  selector: "ah-kit-brand",
  imports: [Button, Icon, Logo],
  template: `
    <div class="kit-row">
      <ah-logo />
      <img src="favicon.svg" width="48" height="48" alt="Ahoy app icon" />
    </div>
    <ul class="kit-icons" aria-label="Icons">
      @for (name of names; track name) {
        <li class="kit-icon"><ah-icon [name]="name" />{{ name }}</li>
      }
    </ul>
    <div class="kit-row">
      <span class="kit-icon"><ah-icon name="anchor" [size]="12" />12</span>
      <span class="kit-icon"><ah-icon name="anchor" />16</span>
      <span class="kit-icon"><ah-icon name="anchor" [size]="18" />18</span>
      <button ahButton="ghost" size="sm" type="button" aria-label="Reset to default"><ah-icon name="reset" /></button>
      <button ahButton="ghost" size="sm" type="button"><ah-icon name="close" label="Close" /></button>
    </div>
  `,
})
export class KitBrand {
  protected readonly names = ICON_NAMES;
}
