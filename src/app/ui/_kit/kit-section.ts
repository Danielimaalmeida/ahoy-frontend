import type { Type } from '@angular/core';

/** One gallery section: a component showing every variant of a design-system component. */
export interface KitSection {
  /** Anchor id, unique in the gallery. */
  readonly id: string;
  /** The component's name, as in `docs/design/design-system/components/`. */
  readonly title: string;
  /** The lane that owns the component. */
  readonly lane: string;
  /** The component that renders the section's content. */
  readonly component: Type<unknown>;
}
