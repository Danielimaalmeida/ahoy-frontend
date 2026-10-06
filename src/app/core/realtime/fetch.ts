import { InjectionToken } from "@angular/core";

/** The `fetch` behind the event stream (F6). Tests and the mock backend replace it with a fake. */
export const FETCH = new InjectionToken<typeof fetch>("FETCH");
