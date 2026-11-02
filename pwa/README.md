# Maintained PWA boundaries

The original app is shipped as a Vue bundle; the original Vue project is not in
this repository. These files maintain the calendar and its store actions as
readable source without replacing the rest of the app or its prediction logic.

- `calendar.js`: one selection state drives preview, action, hint and drag.
- `calendar.css`: scoped styles; existing brand colors and circular +/× remain.
- `period-actions.js`: shared range validation for previews and commits. The
  store writes to localStorage before publishing new reactive records.
- `../patch-pwa.js`: replaces named boundaries, parses the whole output, updates
  both shipped bundles and versions the service-worker and Expo assets. It can
  also bootstrap from the repository's original bundle without `Period-PWA.zip`.

Run `npm run build:pwa`. Repeated runs with identical source do not change files
or versions. Do not edit the two generated bundles independently. The adapter at
the top of `calendar.js` maps the existing bundle's Vue/date/store symbols;
updating the upstream bundle requires checking this adapter and patch anchors.

The UI keeps one normal path: select a start date → + → seven inclusive days.
Repeat click, double-click and long press all use the same commit. Only selecting
a recorded period reveals adjustment handles and ×; deleting still confirms.
Drafts and cancelled drags never persist. A drag saves once on release, while
keyboard arrows adjust a selected endpoint by one day (up/down: one week).

For browser tests, install Playwright as a local development tool:
`npm install --no-save playwright` and `npx playwright install chromium`, then
`npm run test:pwa`. The suite starts its own preview server and uses isolated
browser contexts with a fixed calendar date. `CHROME_PATH` can select an existing
Chromium, and `TEST_SCREENSHOTS` can save QA screenshots outside the repository.
