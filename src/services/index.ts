import { LiveDeedService } from "./live";
import type { DeedService } from "./types";

let instance: DeedService | null = null;

/** The one place that creates the backend the UI talks to. */
export function getService(): DeedService {
  return (instance ??= new LiveDeedService());
}

export type { DeedService } from "./types";
