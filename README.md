# Snowpack Translator

Turn a photo of a snow pit wall, or your spoken observations, into a snow profile, a PDF and a satellite text. A phone-first web app that installs to the home screen and works with no signal.

Live: https://snowpack-translator.netlify.app (Netlify publishes `main` on every merge).

- `index.html`: photo page. Ruler scale, layer boundaries from pixel brightness and texture (no AI), hand hardness entry, CAAML 6.0.3 export.
- `voice.html` + `js/`: Voice and Sat text, two views of one page. A fixed word list turns dictated sentences into a profile (`js/parse.js`, `js/model.js`), drawn to SVG and PDF (`js/draw.js`); Sat text composes a message for Messages.
- `css/app.css`: the one look all three pages share (colours, type, panels, tabs, buttons). A page keeps only what is its own in a small inline style.
- `js/theme.js`: the Light / Dark switch. It follows the phone until a choice is made, then keeps that choice on the device for every page.
- `sw.js`: offline cache. Bump `VERSION` whenever a cached file changes.

The only link to the Banff Snowpack app (benfirth-parks/banff-snowpack) is profiles: pits recorded here are sent to its observation upload and read by its daily update.

Moved here on 2026-11-14 from `banff-snowpack/web/pit/`, where its history is.

## Test

    python3 -m pytest tests          # needs node
    python3 -m http.server           # then open http://localhost:8000 at 390 px wide
