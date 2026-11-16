import { describe, expect, it } from 'vitest';
import {
  confluenceSpacesOf,
  describeProductEvent,
  jiraProjectOf,
  repositoriesOf,
} from './product-settings';

describe('Team settings › Product in words', () => {
  it('reads a Jira project key as typed, upper-cased, empty as none', () => {
    expect(jiraProjectOf(' proj ')).toEqual({ value: 'PROJ' });
    expect(jiraProjectOf('')).toEqual({ value: null });
    expect(jiraProjectOf('PROJ-1')).toEqual({
      problem: 'A Jira project key, such as PROJ: letters and digits.',
    });
  });

  it('reads Confluence space keys separated by commas or spaces, each once, at most 10', () => {
    expect(confluenceSpacesOf('BILL, PROD BILL')).toEqual({
      value: ['BILL', 'PROD'],
    });
    expect(confluenceSpacesOf('')).toEqual({ value: [] });
    expect(confluenceSpacesOf('BILL, P/D')).toEqual({
      problem: 'P/D is not a Confluence space key, such as BILL.',
    });
    expect(
      confluenceSpacesOf(
        Array.from({ length: 11 }, (_, i) => `S${i}`).join(',')
      )
    ).toEqual({ problem: 'At most 10 spaces.' });
  });

  it('reads repository names separated by commas or spaces, each once, at most 3', () => {
    expect(repositoriesOf('web, api web')).toEqual({ value: ['web', 'api'] });
    expect(repositoriesOf('')).toEqual({ value: [] });
    expect(repositoriesOf('web api docs app')).toEqual({
      problem: 'At most 3 repositories.',
    });
  });

  it('says what a change did, and nothing for another section', () => {
    expect(
      describeProductEvent('product_settings.updated', {
        changes: {
          jiraProject: { from: null, to: 'PROJ' },
          repositories: { from: ['web'], to: [] },
        },
      })
    ).toBe('Jira project: none → PROJ; Repositories: web → none');
    expect(describeProductEvent('product_settings.updated', {})).toBe(
      'Saved the Product defaults'
    );
    expect(describeProductEvent('meeting_settings.updated', {})).toBe(
      undefined
    );
  });
});
