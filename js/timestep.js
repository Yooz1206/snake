export function advance(accumulator, dt, intervalMs, maxSteps = 5) {
  const step = intervalMs / 1000;
  let rest = accumulator + dt;
  let steps = 0;

  while (rest >= step && steps < maxSteps) {
    rest -= step;
    steps += 1;
  }

  return { accumulator: rest, steps };
}
