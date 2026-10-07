import { Component } from "@angular/core";
import { Button } from "@ui/button/button";
import { Panel, PanelBody, PanelFoot, PanelHead } from "@ui/panel/panel";

/** Gallery: the Panel preview. */
@Component({
  selector: "ah-kit-panel",
  imports: [Button, Panel, PanelBody, PanelFoot, PanelHead],
  template: `
    <ah-panel>
      <ah-panel-head heading="Before you sail" subtitle="PROJ-145">
        <button ahButton size="sm" type="button" ahPanelActions>Edit</button>
      </ah-panel-head>
      <ah-panel-body>
        <span>Runs bill your Copilot account, up to 25 AIU. Nothing beyond the cap is spent.</span>
        <span class="ah-hint">The crew stops for questions and at every human gate.</span>
      </ah-panel-body>
      <ah-panel-foot>
        <span class="ah-hint">Owner: alex&#64;example.com</span>
        <button ahButton="primary" type="button">Set sail · up to 25 AIU</button>
      </ah-panel-foot>
    </ah-panel>
  `,
})
export class KitPanel {}
