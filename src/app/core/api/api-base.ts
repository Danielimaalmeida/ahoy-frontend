import { InjectionToken } from "@angular/core";

/** Base path of the Ahoy API. Always relative and same-origin (F9): the dev proxy or the Ingress routes it. */
export const API_BASE = new InjectionToken<string>("API_BASE");
