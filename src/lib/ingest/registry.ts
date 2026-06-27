/**
 * The set of venue adapters the pipeline runs. One per seed venue as they are
 * built; The Woodlands is the first. Adding a venue means adding its adapter
 * here.
 */
import type { Adapter } from "./types.ts";
import { woodlandsAdapter } from "./adapters/woodlands.ts";

export const adapters: Adapter[] = [woodlandsAdapter];
