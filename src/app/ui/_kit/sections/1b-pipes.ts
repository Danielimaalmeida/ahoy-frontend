import { Component } from "@angular/core";
import { Api, Nowrap, Table } from "@ui/table/table";
import { ActorPipe } from "@ui/pipes/actor.pipe";
import { AiuPipe } from "@ui/pipes/aiu.pipe";
import { CLOCK } from "@ui/pipes/clock";
import { DateTimePipe } from "@ui/pipes/date-time.pipe";
import { RelativePipe } from "@ui/pipes/relative.pipe";

/** The moment "now" is in this section, so the gallery reads the same whenever it is opened. */
const NOW = new Date(2026, 9, 7, 10, 10);

/** Gallery: what each pipe makes of a value. The section's clock stands still at Wed 10:10. */
@Component({
  selector: "ah-kit-pipes",
  imports: [ActorPipe, AiuPipe, Api, DateTimePipe, Nowrap, RelativePipe, Table],
  providers: [{ provide: CLOCK, useValue: () => NOW }],
  template: `
    <div class="kit-scroll">
      <table ahTable>
        <thead>
          <tr>
            <th>Pipe</th>
            <th>Value</th>
            <th>Shows</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td ahNowrap><span ahApi>ahAiu</span></td>
            <td ahNowrap class="ah-mono">12_400_000_000</td>
            <td ahNowrap>{{ nano | ahAiu }} · {{ nano | ahAiu: 2 }} · {{ nano | ahAiu: 0 }}</td>
          </tr>
          <tr>
            <td ahNowrap><span ahApi>ahRelative</span></td>
            <td ahNowrap class="ah-mono">Wed 09:48</td>
            <td ahNowrap>{{ at | ahRelative }} · {{ at | ahRelative: "waiting" }}</td>
          </tr>
          <tr>
            <td ahNowrap><span ahApi>ahDateTime</span></td>
            <td ahNowrap class="ah-mono">Wed 09:48</td>
            <td ahNowrap>{{ at | ahDateTime }}</td>
          </tr>
          <tr>
            <td ahNowrap><span ahApi>ahActor</span></td>
            <td ahNowrap class="ah-mono">ahoy-reconciler · alex&#64;example.com</td>
            <td ahNowrap>{{ "ahoy-reconciler" | ahActor }} · {{ "alex@example.com" | ahActor }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class KitPipes {
  protected readonly nano = 12_400_000_000;
  protected readonly at = new Date(2026, 9, 7, 9, 48);
}
