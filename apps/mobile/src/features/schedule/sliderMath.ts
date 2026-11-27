/** Pure math for the duration slider: 5-minute snapping between a step's min and max. */
export const SLIDER_SNAP_MIN = 5;
export const SLIDER_NUDGE_MIN = 15;

export const clampMinutes = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Snaps to the 5-minute grid anchored at `min`, never past `max`. */
export function snapMinutes(value: number, min: number, max: number): number {
  const snapped = min + Math.round((value - min) / SLIDER_SNAP_MIN) * SLIDER_SNAP_MIN;
  return clampMinutes(snapped, min, max);
}

/** Fraction 0..1 of the track for a value. */
export const fractionOf = (value: number, min: number, max: number): number =>
  max <= min ? 0 : (clampMinutes(value, min, max) - min) / (max - min);

/** Value for a touch at `x` pixels along a track `width` wide. */
export function valueAt(x: number, width: number, min: number, max: number): number {
  if (width <= 0) return min;
  const fraction = Math.min(1, Math.max(0, x / width));
  return snapMinutes(min + fraction * (max - min), min, max);
}
