import type { PipeTransform } from '@angular/core';
import { Pipe } from '@angular/core';
import { actorLabel } from '@domain/identifiers';

/** Names who did something: the system's `ahoy-reconciler` reads "Ahoy", everyone else shows as their e-mail. */
@Pipe({ name: 'ahActor' })
export class ActorPipe implements PipeTransform {
  transform(actor: string | null | undefined): string {
    return actor === null || actor === undefined || actor === ''
      ? '—'
      : actorLabel(actor);
  }
}
