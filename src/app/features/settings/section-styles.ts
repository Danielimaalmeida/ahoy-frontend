/** The layout every settings section shares: the heading, the main column and the history beside it, and the lists. */
export const SECTION_STYLES = `
  :host {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .head h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
  }
  .main {
    flex: 999 1 560px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .side {
    flex: 1 1 300px;
    min-width: 0;
  }
  .loading {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
  }
  .dl {
    display: grid;
    grid-template-columns: 168px minmax(0, 1fr);
    margin: 0;
  }
  .dl dt {
    padding: 11px 16px;
    font-weight: 600;
    color: var(--ink-soft);
    border-top: 1px solid var(--line-soft);
  }
  .dl dd {
    margin: 0;
    padding: 11px 16px 11px 0;
    border-top: 1px solid var(--line-soft);
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: baseline;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .dl > :nth-child(1),
  .dl > :nth-child(2) {
    border-top: 0;
  }
  .body {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .secret,
  .ok,
  .bad {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  .ok {
    color: var(--status-done-fg);
    font-weight: 600;
  }
  .bad {
    color: var(--danger-text);
    font-weight: 600;
  }
  .foot {
    justify-content: flex-end;
    width: 100%;
  }
  @media (max-width: 560px) {
    .dl {
      grid-template-columns: minmax(0, 1fr);
    }
    .dl dd {
      border-top: 0;
      padding: 0 16px 11px;
    }
  }
`;
