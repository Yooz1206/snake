/**
 * Fixed-timestep accumulator.
 *
 * `dt` and the accumulator are in **seconds**; `intervalMs` is in
 * **milliseconds**. Mixing the two up is a classic silent bug — the game
 * simply never ticks — so the conversion lives in exactly one place and is
 * covered by a test.
 *
 * @param {number} accumulator leftover seconds from the previous frame
 * @param {number} dt elapsed seconds this frame
 * @param {number} intervalMs milliseconds per simulation step
 * @param {number} maxSteps safety valve for long frames (tab regains focus)
 * @returns {{ accumulator: number, steps: number }}
 */
export function advance(accumulator, dt, intervalMs, maxSteps = 5) {
  const stepSeconds = intervalMs / 1000;
  let remaining = accumulator + dt;
  let steps = 0;

  while (remaining >= stepSeconds && steps < maxSteps) {
    remaining -= stepSeconds;
    steps += 1;
  }

  return { accumulator: remaining, steps };
}
