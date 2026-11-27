/**
 * Feature flags for screens whose routes land in a later task. A control that would lead to a
 * route that does not exist yet stays hidden (DR1-03) instead of opening "Page not found".
 * Flip each flag in the task that adds the route.
 */
export const flags: {
  /** `bake/schedule/plan` (RN-06): "Schedule this recipe" and the list menu's "Schedule". */
  scheduling: boolean;
  /** `settings/cost` (RN-10): "Change markup" on the cost screen. */
  costSettings: boolean;
} = {
  scheduling: false,
  costSettings: false,
};
