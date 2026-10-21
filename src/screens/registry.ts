import { createElement, type ComponentType } from "react";
import { manifest, type Group, type ManifestEntry } from "./manifest";
import ScreenStub from "./ScreenStub";
import * as applications from "./applications";
import * as firstRun from "./first-run";
import * as home from "./home";
import * as practice from "./practice";
import * as results from "./results";
import * as settings from "./settings";
import * as states from "./states";
import * as stories from "./stories";

const groups: Record<Group, { routes: Record<string, ComponentType>; extras: ManifestEntry[] }> = {
  "first-run": firstRun,
  home,
  practice,
  results,
  stories,
  applications,
  settings,
  states,
};

/** The 46 designed screens plus every group's extra screens. */
export const allScreens: ManifestEntry[] = [...manifest, ...Object.values(groups).flatMap((g) => g.extras)];

/** Screen id to component. A screen nobody has built yet gets a stub (listed in `stubIds`). */
export const registry: Record<string, ComponentType> = {};
export const stubIds: string[] = [];

for (const s of allScreens) {
  const built = groups[s.group].routes[s.id];
  if (built) {
    registry[s.id] = built;
  } else {
    stubIds.push(s.id);
    registry[s.id] = () => createElement(ScreenStub, { id: s.id });
  }
}
