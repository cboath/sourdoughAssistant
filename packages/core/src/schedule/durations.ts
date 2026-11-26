// Chosen durations (docs/core-api.md 5.2, ADR 0008, ADR 0010 section 4).
// Precedence: user override > temperature adjustment > recipe default.

import { err, ok, roundToStep, type Id, type Minutes, type Result } from '../types';
import { temperatureMultiplier, type TempTableRow } from './temperature';
import {
  foldDerivedMin,
  validateSteps,
  type StepTemplate,
  type StepValidationError,
} from './validate';

export type DurationSource = 'default' | 'temperature' | 'user' | 'derived';

export interface DurationChoice {
  stepId: Id;
  minutes: Minutes;
  source: DurationSource; // 'derived' for fold steps
  clamped: boolean;
  unclampedMinutes: Minutes | null; // set when the temperature result was clamped
}

export interface DurationOptions {
  kitchenTempC?: number | null;
  overrides?: Readonly<Record<Id, Minutes>>; // slider values; must be within range
  tempTable?: readonly TempTableRow[];
}

/** Temperature results are rounded to the nearest 5 minutes (ADR 0008). */
const TEMP_STEP_MIN = 5;

export function chooseDurations(
  steps: readonly StepTemplate[],
  opts: DurationOptions = {},
): Result<Record<Id, DurationChoice>, StepValidationError[]> {
  const valid = validateSteps(steps);
  if (!valid.ok) return err(valid.error);

  const errors: StepValidationError[] = [];
  const out: Record<Id, DurationChoice> = {};
  const temp = opts.kitchenTempC;
  const hasTemp = temp !== null && temp !== undefined && Number.isFinite(temp);

  for (const s of steps) {
    const derived = foldDerivedMin(s);
    const override = opts.overrides?.[s.id];

    if (derived !== null) {
      // A fold step has no slider: its range is count x interval (ADR 0010 section 3).
      if (override !== undefined && override !== derived) {
        errors.push({ code: 'overrideOutOfRange', stepId: s.id, minutes: override });
        continue;
      }
      out[s.id] = {
        stepId: s.id,
        minutes: derived,
        source: 'derived',
        clamped: false,
        unclampedMinutes: null,
      };
      continue;
    }

    if (override !== undefined) {
      if (!Number.isInteger(override) || override < s.minMin || override > s.maxMin) {
        errors.push({ code: 'overrideOutOfRange', stepId: s.id, minutes: override });
        continue;
      }
      out[s.id] = {
        stepId: s.id,
        minutes: override,
        source: 'user',
        clamped: false,
        unclampedMinutes: null,
      };
      continue;
    }

    if (s.tempSensitive && hasTemp) {
      // From the recipe default, not the previous slider value (ADR 0008).
      const raw = s.durationMin * temperatureMultiplier(temp, opts.tempTable);
      const rounded = roundToStep(raw, TEMP_STEP_MIN);
      const minutes = Math.min(s.maxMin, Math.max(s.minMin, rounded));
      const clamped = minutes !== rounded;
      out[s.id] = {
        stepId: s.id,
        minutes,
        source: 'temperature',
        clamped,
        unclampedMinutes: clamped ? rounded : null,
      };
      continue;
    }

    out[s.id] = {
      stepId: s.id,
      minutes: s.durationMin,
      source: 'default',
      clamped: false,
      unclampedMinutes: null,
    };
  }

  return errors.length > 0 ? err(errors) : ok(out);
}
