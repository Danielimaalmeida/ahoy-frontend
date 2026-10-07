import type { AhoyEvent, Story } from "@core/api/types";

/** An event for specs; fictional data (PROJ-123, alex@example.com). */
export function anEvent(
  id: number | string,
  type: string,
  payload: Record<string, unknown> = {},
  storyKey = "PROJ-123",
): AhoyEvent {
  return {
    id: String(id),
    storyKey,
    type,
    actor: "ahoy-reconciler",
    payload,
    createdAt: new Date(Date.parse("2026-10-06T09:00:00.000Z") + Number(id) * 1000).toISOString(),
  };
}

/** A story for specs; fictional data. */
export function aStory(key: string, changes: Partial<Story> = {}): Story {
  return {
    key,
    title: `Story ${key}`,
    owner: "alex@example.com",
    phase: "planning",
    status: "running",
    haltReason: null,
    budgetNanoAiu: 30_000_000_000,
    spentNanoAiu: 1_000_000_000,
    controlSha: "a41f9c2bc3feeb1b5eebeaeddd73a3d21b767302",
    currentRunId: null,
    version: 1,
    createdAt: "2026-10-05T10:00:00.000Z",
    updatedAt: "2026-10-06T09:00:00.000Z",
    ...changes,
  };
}
