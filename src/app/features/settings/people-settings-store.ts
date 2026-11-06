import { Injectable } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type { MemberRole, PeoplePage } from '@core/api/types';
import { SectionStore } from './section-store';
import type { SettingsSummary } from './settings-summary';

/** The state of the People section: who may use Ahoy, their roles and the history. */
@Injectable()
export class PeopleSettingsStore extends SectionStore<PeoplePage> {
  protected readonly section = 'people' as const;

  protected read(): Promise<ApiResult<PeoplePage>> {
    return this.api.getPeopleSettings();
  }

  protected tell(summary: SettingsSummary, page: PeoplePage): void {
    summary.peopleRead(page);
  }

  /** Lets someone in with a role, or changes their role; then the page and its history are read again. */
  put(qnumber: string, role: MemberRole): Promise<ApiResult<PeoplePage>> {
    return this.reloadAfter(this.api.putPerson(qnumber, { role }));
  }

  /** Stops someone using Ahoy; then the page and its history are read again. */
  remove(qnumber: string): Promise<ApiResult<PeoplePage>> {
    return this.reloadAfter(this.api.removePerson(qnumber));
  }
}
