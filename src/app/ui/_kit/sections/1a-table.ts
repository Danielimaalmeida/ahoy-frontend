import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '@ui/button/button';
import { Panel } from '@ui/panel/panel';
import { Api, CellSub, Key, Nowrap, Table } from '@ui/table/table';
import { Source } from '@ui/tags/source';

/**
 * Gallery: the DataTable preview with the table helpers, and the source tags. The badges are the bundle's raw classes
 * and the budget has no meter until lane 1B adds `ah-status-badge` and `ah-budget-meter`.
 */
@Component({
  selector: 'ah-kit-table',
  imports: [
    Api,
    Button,
    CellSub,
    Key,
    Nowrap,
    Panel,
    RouterLink,
    Source,
    Table,
  ],
  template: `
    <ah-panel>
      <div class="kit-scroll">
        <table ahTable>
          <thead>
            <tr>
              <th>Status</th>
              <th>Voyage</th>
              <th>Phase</th>
              <th>Budget (AIU)</th>
              <th>Waiting</th>
              <th><span class="ah-sr">Action</span></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td ahNowrap>
                <span class="ah-badge ah-badge--input"
                  ><i class="ah-badge__dot"></i>Crew asks</span
                >
              </td>
              <td>
                <a ahKey routerLink="/voyages/PROJ-131/questions">PROJ-131</a
                >Let customers download receipts as PDF
                <span ahCellSub
                  >Cartographer asked 3 questions · 1 answered</span
                >
              </td>
              <td class="ah-mono">planning</td>
              <td ahNowrap><span class="ah-mono">6.1 / 25</span></td>
              <td ahNowrap>48 m</td>
              <td ahNowrap>
                <a
                  ahButton="primary"
                  size="sm"
                  routerLink="/voyages/PROJ-131/questions"
                  >Answer</a
                >
              </td>
            </tr>
            <tr>
              <td ahNowrap>
                <span class="ah-badge ah-badge--decision"
                  ><i class="ah-badge__dot"></i>Your orders</span
                >
              </td>
              <td>
                <a ahKey routerLink="/voyages/PROJ-123/plan">PROJ-123</a>Show
                invoice due date on the billing page
                <span ahCellSub>Gate plan_accepted · round 2 of 4</span>
              </td>
              <td class="ah-mono">plan_review</td>
              <td ahNowrap><span class="ah-mono">12.4 / 30</span></td>
              <td ahNowrap>22 m</td>
              <td ahNowrap>
                <a
                  ahButton="primary"
                  size="sm"
                  routerLink="/voyages/PROJ-123/plan"
                  >Review plan</a
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </ah-panel>
    <div class="kit-row">
      <span>Your orders <span ahApi>awaiting_decision</span></span>
      <ah-source>Server default</ah-source>
      <ah-source chosen>Chosen for this voyage</ah-source>
    </div>
  `,
})
export class KitTable {}
