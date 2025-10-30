# Privacy Prep

Privacy Prep is a lightweight, browser based photo privacy tool that previews hidden metadata, lets you toggle fields to strip, and downloads a cleaned copy. It is built by [Teda.dev](https://teda.dev), the AI app builder for everyday problems, so you can use it instantly without installs or accounts.

## Highlights
- Private by design: everything runs locally in your browser
- Deep metadata preview with readable labels
- Toggle what to strip with smart presets
- Download a cleaned copy while optionally keeping selected EXIF fields for JPEG
- Optional redaction report as a JSON sidecar

## Usage
1. Open `index.html` for the landing experience, then click Start cleaning photos or open `app.html` directly.
2. Drop a JPEG or PNG file into the app. The metadata will be parsed and shown.
3. Use presets or toggles to choose which fields to strip.
4. Click Download cleaned copy. For JPEG, the app re inserts only the fields you chose to keep; for PNG, all metadata is removed.
5. Optionally include a redaction report that lists what was kept and removed.

## Tech stack
- HTML5, Tailwind CSS (CDN), jQuery 3.7.x
- Modular JavaScript with a single global `window.App`
- Canvas based re encoding to remove metadata
- Embedded minimal `piexifjs` logic for JPEG EXIF read write
- LocalStorage to remember your preferences

## Files
- `index.html` landing page
- `app.html` main application
- `styles/main.css` custom styles
- `scripts/helpers.js` utilities, storage, canvas, and embedded EXIF adapter
- `scripts/ui.js` UI rendering and events
- `scripts/main.js` entry point

## Notes
- Selective keep of metadata is supported for JPEG files. PNG exports are always stripped.
- Orientation is applied to pixels, so the Orientation tag is not preserved after export.

## Accessibility
- Keyboard navigable controls, focus rings, and WCAG conscious color contrast
- Touch friendly targets and responsive layout down to small screens

## Privacy
All processing happens in your browser. Your images are not uploaded or stored anywhere by this app.
