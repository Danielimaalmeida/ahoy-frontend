import addCrewMember from '@testing/fixtures/addCrewMember.json';
import addCrewTimeOff from '@testing/fixtures/addCrewTimeOff.json';
import getCrew from '@testing/fixtures/getCrew.json';
import updateCrewMember from '@testing/fixtures/updateCrewMember.json';
import { withField, withoutField } from '@testing/fixtures/mutate';
import { isCrew, isCrewMember, isCrewTimeOff } from './guards';

describe('crew guards', () => {
  it('accept every crew answer the contract documents, as the fixtures hold them', () => {
    expect(isCrew.explain(getCrew)).toBeNull();
    expect(isCrewMember(addCrewMember)).toBe(true);
    expect(isCrewMember(updateCrewMember)).toBe(true);
    expect(isCrewTimeOff(addCrewTimeOff)).toBe(true);
  });

  it('accept a crew with no members and no sprints, as before Jira is set up', () => {
    expect(
      isCrew({
        ...getCrew,
        jiraConfigured: false,
        members: [],
        sprints: [],
      })
    ).toBe(true);
  });

  it('refuse a role or a sprint state the contract does not list', () => {
    expect(
      isCrewMember(withField(addCrewMember, 'roles', ['scrum_master']))
    ).toBe(false);
    const sprint = withField(getCrew.sprints[0]!, 'state', 'planned');
    expect(isCrew({ ...getCrew, sprints: [sprint] })).toBe(false);
  });

  it('refuse a day that is not YYYY-MM-DD and a time off without its note field', () => {
    expect(isCrewTimeOff(withField(addCrewTimeOff, 'startsOn', '9 Nov'))).toBe(
      false
    );
    expect(isCrewTimeOff(withoutField(addCrewTimeOff, 'note'))).toBe(false);
  });

  it('refuse a recorded change of mode restart: the server records it as the new start, not as a change', () => {
    const [current] = getCrew.sprints;
    const [, lunch] = current!.assignments;
    const change = { ...lunch!.change!, mode: 'restart' };
    const sprint = { ...current!, assignments: [{ ...lunch!, change }] };
    expect(isCrew({ ...getCrew, sprints: [sprint] })).toBe(false);
  });

  it('name the field that broke the crew', () => {
    const member = withField(getCrew.members[0]!, 'id', 'alex');
    expect(isCrew.explain({ ...getCrew, members: [member] })).toContain('id');
  });
});
