> **Source Available — All Rights Reserved. Commercial use, deployment, redistribution, and AI/ML training are prohibited. See [`LICENSE`](./LICENSE).**

## Algorithm v1.3

v1.3 is the default prediction engine. On the first upgraded launch, built-in
selections migrate to v1.3; custom selections are preserved. Subsequent manual
version selections persist. Recording, dragging boundaries, deleting and backup
retain their existing interactions.

- `src/algorithm-v13.js`: deterministic prediction from actual start dates.
- `src/algorithm-v13-cards.js`: explanation cards matching the implemented rules.
- `scripts/patch-v13.cjs`: integrates readable sources into the legacy Vue bundle.
- `node patch-pwa.js`: regenerates both shipped bundles and increments web/native
  asset versions; also works without the private original APK/PWA ZIP.
- `node test-v13.cjs`: numerical, calendar, purity and bundle regression checks.
- `node preview-server.cjs`, then `node test-v13-ui.cjs`: browser checks; requires
  Playwright and Chromium. Set `CHROME_PATH` for a custom browser executable.
- `CHROME_PATH=/path/to/chrome node test-pwa.cjs`: existing recording/deletion
  regression checks (the harness fixes its calendar to November 2026).

### Model and limits

The engine uses a bounded day grid for the current cycle baseline, a robust
history-dependent variation scale (minimum 1.5 days), Student-t observation
likelihoods, and a transition prior with local movement and a 4% reset component.
After three prior intervals, an observation marginalizes zero, one or two missed
starts with fixed weights 0.944 / 0.05 / 0.006. Multiple-cycle likelihoods use a
scaled Student-t approximation, not reconstructed independent observations.
A broad 2% observation component limits the leverage of isolated unusual data.
These are engineering priors, not learned personal adherence rates or clinically
calibrated probabilities. The variation scale is re-estimated from the available
history on every prediction; no future records are used in historical replay.

The next-cycle distribution excludes future skipped reporting. Alternation is
considered after at least seven intervals, at three or more forward prediction
points. It requires at least a 3-day phase separation and at least a 25% reduction
in cumulative absolute error over the base model. Its weight rises with evidence
and is capped at 0.8. Ambiguous skipped-event phases disable this component.
The final day is the median of the mixture distribution. Exact constant histories
return their observed interval without treating the underlying uncertainty as zero.

Very large histories/baselines and failed numerical normalization fall back to the
median of valid positive intervals. This is a computational fallback, not a
physiological cutoff. Invalid dates and duplicate starts are excluded in a working
view only. The latest valid actual start remains the anchor; original records are
never rewritten. Default seven-day ends affect only the existing duration field,
not next-start prediction. No date advances merely because today changes.

Automated tests cover engineering behavior and illustrative scenarios. They do
not establish real-world accuracy superiority over v1.2. That requires independent
consecutive-cycle data and user-level held-out evaluation, including irregular,
changing, long-cycle and incomplete tracking histories.
