import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type {
  Crew,
  CrewChangeRequest,
  CrewMember,
  CrewMemberRequest,
  CrewRole,
  CrewTimeOff,
  CrewTimeOffRequest,
  UpdateCrewMemberRequest,
} from '@core/api/types';

/**
 * The state of the Crew page: the crew as the API last answered it, and whether it is being read. Every command is
 * answered by reading the crew again, since a change to one sprint moves the turns after it. 0 AIU.
 */
@Injectable()
export class CrewStore {
  private readonly api = inject(ApiClient);

  /** The crew, once read. */
  readonly crew = signal<Crew | null>(null);
  /** Why the crew could not be read. */
  readonly loadError = signal<ApiError | null>(null);
  /** Whether the crew is being read. */
  readonly loading = signal(false);

  /** The current sprint, first of the list; null before the crew is read or when no sprint is known. */
  readonly current = computed(() => this.crew()?.sprints[0] ?? null);
  /** The members alphabetically. */
  readonly members = computed(() => this.crew()?.members ?? []);

  /** Reads the crew; a failure keeps what was shown and says why. */
  async load(): Promise<void> {
    this.loading.set(true);
    const result = await this.api.getCrew();
    this.loading.set(false);
    if (!result.ok) {
      this.loadError.set(result.error);
      return;
    }
    this.loadError.set(null);
    this.crew.set(result.value);
  }

  /** The members who take a role, alphabetically. */
  membersFor(role: CrewRole): CrewMember[] {
    return this.members().filter((m) => m.roles.includes(role));
  }

  /** Changes who is on for a role in a sprint, then reads the crew again. */
  async change(
    startsOn: string,
    role: CrewRole,
    body: CrewChangeRequest
  ): Promise<ApiResult<null>> {
    return this.reloadAfter(this.api.changeCrewSprint(startsOn, role, body));
  }

  /** Undoes a sprint's change for a role, then reads the crew again. */
  async undo(startsOn: string, role: CrewRole): Promise<ApiResult<null>> {
    return this.reloadAfter(this.api.clearCrewSprintChange(startsOn, role));
  }

  /** Adds a member, then reads the crew again. */
  async addMember(body: CrewMemberRequest): Promise<ApiResult<CrewMember>> {
    return this.reloadAfter(this.api.addCrewMember(body));
  }

  /** Renames a member or changes their turns, then reads the crew again. */
  async updateMember(
    memberId: string,
    body: UpdateCrewMemberRequest
  ): Promise<ApiResult<CrewMember>> {
    return this.reloadAfter(this.api.updateCrewMember(memberId, body));
  }

  /** Removes a member, then reads the crew again. */
  async removeMember(memberId: string): Promise<ApiResult<null>> {
    return this.reloadAfter(this.api.deleteCrewMember(memberId));
  }

  /** Records a time off, then reads the crew again. */
  async addTimeOff(
    memberId: string,
    body: CrewTimeOffRequest
  ): Promise<ApiResult<CrewTimeOff>> {
    return this.reloadAfter(this.api.addCrewTimeOff(memberId, body));
  }

  /** Removes a time off, then reads the crew again. */
  async removeTimeOff(timeOffId: string): Promise<ApiResult<null>> {
    return this.reloadAfter(this.api.deleteCrewTimeOff(timeOffId));
  }

  private async reloadAfter<T>(
    request: Promise<ApiResult<T>>
  ): Promise<ApiResult<T>> {
    const result = await request;
    if (result.ok) await this.load();
    return result;
  }
}
