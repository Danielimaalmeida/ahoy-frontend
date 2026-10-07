import { Component, inject } from "@angular/core";
import { Button } from "@ui/button/button";
import { Icon } from "@ui/icon/icon";
import { ToastHost, ToastService } from "@ui/toast/toast";

/**
 * Gallery: the Toast preview as a static sample, and a button that shows a real one through `ToastService`. The
 * section has its own service and host, so the toast shows here and never doubles the app shell's.
 */
@Component({
  selector: "ah-kit-toast",
  imports: [Button, Icon, ToastHost],
  providers: [ToastService],
  template: `
    <div class="kit-row">
      <div class="ah-toast">
        <ah-icon name="check" />
        <span>Answer to Q2 sent. 1 question left.</span>
      </div>
    </div>
    <div class="kit-row">
      <button ahButton size="sm" type="button" (click)="show()">Show a toast</button>
      <span class="ah-hint">It goes after about 5 seconds and never holds an action.</span>
    </div>
    <ah-toast-host />
  `,
})
export class KitToast {
  private readonly toasts = inject(ToastService);

  protected show(): void {
    this.toasts.show("Models saved. Applies from each phase's next run.");
  }
}
