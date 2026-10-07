import { Component } from "@angular/core";
import { Banner } from "@ui/banner/banner";

/** Gallery: the Banner preview (notice, error with a technical line, cost), plus the info variant. */
@Component({
  selector: "ah-kit-banner",
  imports: [Banner],
  template: `
    <ah-banner heading="This voyage changed since you opened it"
      >priya&#64;example.com raised the budget to 35 AIU. We refreshed the page and kept your text; check it and send
      again.</ah-banner
    >
    <ah-banner
      variant="error"
      heading="Anchored: the planning run failed before it started"
      tech="run_failed · r-03 · preflight: model not enabled for this account"
      ><span
        >The owner's Copilot account can't use gpt-5.6-terra. No prompt was sent and no AIU was spent.</span
      ></ah-banner
    >
    <ah-banner variant="cost" heading="This may spend up to 10.2 AIU"
      >The rest of the voyage's 20 AIU budget, billed to sam&#64;example.com's Copilot account.</ah-banner
    >
    <ah-banner variant="info" heading="The Docks is a planned screen"
      >These backlog rows are examples until the API lists Jira stories.</ah-banner
    >
  `,
})
export class KitBanner {}
