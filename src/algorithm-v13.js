'use strict';

// Pure, deterministic local prediction. No records are created or modified.
// Numerical parameters are engineering priors, not clinical thresholds or
// calibrated probabilities. Real-world accuracy still requires validation.
function createPeriodV13() {
  const DAY = 86400000;
  const median = values => {
    const a = values.slice().sort((a, b) => a - b), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  function dayOf(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const d = new Date(value + 'T00:00:00Z');
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value ? +d / DAY : NaN;
  }
  // Student-t (df=4), with the shared normalizing constant omitted.
  const density = (x, mean, scale) => Math.pow(1 + Math.pow((x - mean) / scale, 2) / 4, -2.5) / scale;
  function normalize(a) {
    const total = a.reduce((s, x) => s + x, 0);
    return total > 0 && Number.isFinite(total) ? a.map(x => x / total) : null;
  }
  function quantile(a) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) { sum += a[i]; if (sum >= 0.5) return i + 1; }
    return a.length;
  }
  function baseDistribution(gaps) {
    const center = median(gaps);
    // Bounded grid is a computational limit. Extreme histories use the
    // unmodified median fallback, never a clamped 'normal' cycle length.
    if (center > 400 || gaps.length > 2000) return null;
    const adjacent = gaps.slice(1).map((x, i) => Math.abs(x - gaps[i]));
    const scale = Math.max(1.5, Math.min(1.4826 * median(gaps.map(x => Math.abs(x - center))), median(adjacent)));
    const size = Math.min(1024, Math.max(90, Math.ceil(center * 2 + 6 * scale)));
    let state = Array(size).fill(1 / size);
    for (let i = 0; i < gaps.length; i++) {
      const prior = state.map((p, j) => {
        let local = p * 0.4;
        for (const [offset, weight] of [[-2, .1], [-1, .2], [1, .2], [2, .1]]) {
          local += state[Math.max(0, Math.min(size - 1, j + offset))] * weight;
        }
        return .96 * local + .04 / size;
      });
      const allowSkips = i >= 3;
      state = normalize(prior.map((p, j) => {
        const mean = j + 1;
        let likelihood = density(gaps[i], mean, scale);
        // Marginalize 0/1/2 missed starts. Do not manufacture samples.
        if (allowSkips) likelihood = .944 * likelihood
          + .05 * density(gaps[i], 2 * mean, scale * Math.sqrt(2))
          + .006 * density(gaps[i], 3 * mean, scale * Math.sqrt(3));
        // Broad observation component keeps one unusual entry from making
        // every alternative impossible; it is not a diagnosis of mislogging.
        return p * (.98 * likelihood + .02 / size);
      }));
      if (!state) return null;
    }
    // Predict the next biological cycle, not the next potentially missed log.
    return normalize(Array.from({length: size}, (_, d) => state.reduce(
      (sum, p, j) => sum + p * density(d + 1, j + 1, scale), 0)));
  }
  function distribution(gaps) {
    const base = baseDistribution(gaps);
    if (!base || gaps.length < 7) return base;
    const center = median(gaps);
    // Ambiguous missing events cannot establish a reliable odd/even phase.
    if (gaps.some(x => x > center * 1.5 || x < center * .5)) return base;
    let baseError = 0, phaseError = 0, trials = 0;
    for (let i = Math.max(4, gaps.length - 8); i < gaps.length; i++) {
      const history = gaps.slice(0, i);
      const b = baseDistribution(history);
      if (!b) continue;
      const phase = history.filter((_, j) => j % 2 === i % 2);
      phaseError += Math.abs(median(phase) - gaps[i]);
      baseError += Math.abs(quantile(b) - gaps[i]);
      trials++;
    }
    const even = gaps.filter((_, i) => i % 2 === 0), odd = gaps.filter((_, i) => i % 2 === 1);
    const separation = Math.abs(median(even) - median(odd));
    if (trials < 3 || separation < 3 || phaseError >= baseError * .75) return base;
    const phase = gaps.filter((_, i) => i % 2 === gaps.length % 2);
    const phaseCenter = median(phase);
    const spread = Math.max(1.5, 1.4826 * median(phase.map(x => Math.abs(x - phaseCenter))));
    const alt = normalize(base.map((_, i) => density(i + 1, phaseCenter, spread)));
    const weight = Math.min(.8, (1 - phaseError / Math.max(1, baseError)) * trials / (trials + 1));
    return base.map((p, i) => (1 - weight) * p + weight * alt[i]);
  }
  function predict(records) {
    if (!Array.isArray(records)) return null;
    const valid = records.map(r => ({record: r, day: dayOf(r && r.startDate)}))
      .filter(x => Number.isFinite(x.day)).sort((a, b) => a.day - b.day)
      .filter((x, i, a) => !i || x.day !== a[i - 1].day);
    if (valid.length < 2) return null;
    const gaps = valid.slice(1).map((x, i) => x.day - valid[i].day);
    let cycle = median(gaps);
    const probabilities = gaps.length > 1 && !gaps.every(x => x === gaps[0]) ? distribution(gaps) : null;
    if (probabilities) cycle = quantile(probabilities);
    cycle = Math.max(1, Math.round(cycle));
    const last = valid[valid.length - 1];
    const date = new Date((last.day + cycle) * DAY);
    if (!Number.isFinite(+date) || date.getUTCFullYear() > 9999) return null;
    const durations = valid.map(x => dayOf(x.record.endDate) - x.day + 1).filter(x => Number.isFinite(x) && x >= 1);
    return {
      predictedStartDate: date.toISOString().slice(0, 10), avgCycleLength: cycle,
      avgPeriodDuration: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 7,
      periodCount: valid.length, lastPeriodStart: last.record.startDate,
    };
  }
  return {predict, dayOf};
}

if (typeof module !== 'undefined') module.exports = createPeriodV13;
