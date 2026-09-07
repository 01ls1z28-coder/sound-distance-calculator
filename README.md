# Sound Distance Calculator

Static web recreation of the desktop Sound Distance Calculator (WinForms) app.

## Requirements

- Modern browser with JavaScript enabled
- No HTTP server needed — open `index.html` directly (double-click / `file://`)
- No CDN or network access required (Chart.js and suppressor data are local)

## Open locally

Double-click `index.html`, or open it from your file manager / browser.

No Python, Node, or static server is required. Suppressor data is baked into `js/suppressors-data.js`, and Chart.js is vendored at `js/chart.umd.min.js`.

## Files

| Path | Purpose |
|------|---------|
| `index.html` | Page shell / three-panel layout |
| `css/styles.css` | WinForms-like styling + SPL color bands |
| `js/app.js` | Cascading selects, live SPL math, table, Chart.js |
| `js/suppressors-data.js` | Baked-in suppressor dataset (`window.SUPPRESSOR_DATA`) |
| `js/chart.umd.min.js` | Local Chart.js 4.4.1 (offline) |
| `data/suppressors.json` | Source JSON used to generate the baked data file |
| `DATA_SOURCE.txt` | Notes on which Excel workbook rebuilt the data |

## Defaults

On first load the app selects:

- Caliber: `22 LR - Bolt Action TBS2024`
- Manufacturer: `AAC`
- Model: `Element 3`
- Starting dB: that model's `ml_dba` formatted to one decimal (F1), e.g. `113.7`
- Reference: always **1 meter** (hardcoded Form1 mil-spec math; no reference UI)

There is **no Generate button**. The table and chart recalculate live whenever caliber, manufacturer, model, ranked-list selection, or starting dB changes.

There is **no MIL-SPEC Mode checkbox** and **no reference distance / unit controls** — mil-spec falloff (1 m reference) is always on.

## Math (matches Form1.cs mil-spec)

1. Reference is always 1 meter, converted to yards: `refYards = 1 * 1.09361`
2. For each distance `dist` in yards (5..1000 step 5):
   - `SPL = startDb - 20 * log10(dist / refYards)`
   - meters display = `dist * 0.9144`

Falloff is **yards-based after converting the fixed 1 m reference**.

## SPL row colors (always applied by SPL value)

| SPL | Background | Text |
|-----|------------|------|
| ≥ 120 | red | white |
| ≥ 85 | yellow | black |
| ≥ 40 | light green | black |
| else | light gray | black |
