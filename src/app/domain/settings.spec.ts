import { describe, expect, it } from 'vitest';
import { describeSettingsEvent, projectKeyLabel, tokenLabel } from './settings';

describe('settings in words', () => {
  it('shows a token only as its last four characters, or as set when none were kept', () => {
    expect(tokenLabel('cdef')).toBe('…cdef');
    expect(tokenLabel('')).toBe('set');
  });

  it('says the reconciler finds a project key the row leaves out', () => {
    expect(projectKeyLabel('acme_web')).toBe('acme_web');
    expect(projectKeyLabel(null)).toBe('found by the reconciler');
  });

  it('describes each entry of the history in plain words', () => {
    expect(
      describeSettingsEvent('sonar_server.created', {
        name: 'Main',
        hostUrl: 'https://sonar.example.com',
        isDefault: true,
        tokenHint: '1b2c',
      })
    ).toBe(
      'Added SonarQube server Main (https://sonar.example.com), the default, token …1b2c'
    );
    expect(
      describeSettingsEvent('sonar_server.updated', {
        name: 'Main',
        changes: { tokenHint: { from: '1b2c', to: '9f3a' } },
      })
    ).toBe('Changed SonarQube server Main: token …1b2c → …9f3a');
    expect(
      describeSettingsEvent('sonar_repository.created', {
        repository: 'acme/web',
        server: 'Main',
        projectKey: 'acme_web',
      })
    ).toBe('Put acme/web on Main, project key acme_web');
  });

  it('names each field a change moves, and the server by name', () => {
    expect(
      describeSettingsEvent('sonar_repository.updated', {
        repository: 'acme/web',
        changes: {
          server: { from: 'A', to: 'B' },
          projectKey: { from: 'acme_web', to: null },
        },
      })
    ).toBe(
      'Changed acme/web: server A → B, project key acme_web → found by the reconciler'
    );
    expect(
      describeSettingsEvent('sonar_server.updated', {
        name: 'B',
        changes: {
          name: { from: 'A', to: 'B' },
          isDefault: { from: false, to: true },
        },
      })
    ).toBe('Changed SonarQube server B: name A → B, default no → yes');
  });

  it('reads a removal, and an entry it does not know as its type, whatever the payload', () => {
    expect(describeSettingsEvent('sonar_server.deleted', { name: 'Old' })).toBe(
      'Removed SonarQube server Old'
    );
    expect(
      describeSettingsEvent('sonar_repository.deleted', { repository: 'web' })
    ).toBe('Took web off its server');
    expect(describeSettingsEvent('jira.updated', null)).toBe('jira.updated');
    expect(describeSettingsEvent('sonar_server.updated', 'x')).toBe(
      'Saved SonarQube server a server'
    );
  });
});
