"""The Snowpack Translator's voice page (web/pit/js): the spoken-observation parser, the observation it builds,
the yellow-flag count, the satellite text and the PDF writer, run in node on dictated sentences."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

JS = Path(__file__).resolve().parents[1] / "js"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = f"""
const P = require({json.dumps(str(JS / "parse.js"))}), M = require({json.dumps(str(JS / "model.js"))}),
      D = require({json.dumps(str(JS / "draw.js"))});
function build(ref, lines) {{
  const m = M.blank(); m.ref = ref; m.site.date = "2026-11-12T14:40"; const said = [];
  lines.forEach(t => M.apply(m, P.parse(t)).forEach(r => said.push([r.ok, !!r.warn, r.say])));
  return {{ m, said }};
}}
"""

# The pit in the owner's Snow Scope screenshot (2026-11-12, Nakiska), spoken the way an observer would.
NAKISKA = [
    "Layer 0 to 35 fist plus rounds 0.3. Layer 35 to 70 four finger plus rounds point five. "
    "Layer 70 to 100 fist facets with depth hoar 1.5 max 2 weak layer",
    "location Nakiska observer Nicholas Sexton aspect north east elevation 7328 feet slope 34 degrees snow depth 100",
    "air temperature minus 7.8 sky broken precip none wind light south west",
    "temperatures 10 minus 3.6, 20 minus 3.5, 30 -3.2, 40 minus 2.9",
    "compression test twenty one Q2 down 88",
]


def _run(body: str):
    out = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def _parse(text: str):
    return _run(f"console.log(JSON.stringify(P.parse({json.dumps(text)})));")


def test_layers_with_hardness_grain_and_size():
    a, b, c = _parse(NAKISKA[0])
    assert (a["a"], a["b"], a["attrs"]) == (0, 35, {"hardTop": "F+", "grain": "RG", "size": 0.3})
    assert (b["a"], b["b"], b["attrs"]) == (35, 70, {"hardTop": "4F+", "grain": "RG", "size": 0.5})
    assert c["attrs"] == {"concern": True, "hardTop": "F", "grain": "FC", "grain2": "DH", "size": 1.5, "sizeMax": 2}


@pytest.mark.parametrize("said, attrs", [
    ("layer 0 2 35 first rounds", {"hardTop": "F", "grain": "RG"}),                 # "to" heard as 2, "fist" as "first"
    ("35-70 4F+ rounds 0.5mm moist", {"wet": "M", "hardTop": "4F+", "grain": "RG", "size": 0.5}),
    ("layer one hundred ten to one hundred thirteen fist surface whore 4 to 8 millimetres label Jan 3rd weak layer",
     {"concern": True, "note": "Jan 3rd", "hardTop": "F", "grain": "SH", "size": 4, "sizeMax": 8}),
    ("layer 40 to 50 pencil minus to knife melt freeze crust", {"hardTop": "P-", "hardBot": "K", "grain": "MFcr"}),
    ("layer 10 to 30 for fingers faucets one and a half", {"hardTop": "4F", "grain": "FC", "size": 1.5}),
])
def test_dictation_quirks(said, attrs):
    (a,) = _parse(said)
    assert a["type"] == "layer" and a["mode"] == "range" and a["attrs"] == attrs and a["unknown"] == []


def test_attributes_without_depths_go_to_the_current_layer():
    r = _run("""const { m, said } = build("depth", ["layer 0 to 35", "fist rounds 0.3", "layer to 70 one finger", "next 20 thick pencil",
      "change layer 1 four finger", "delete layer 2", "the dog ran away"]);
      console.log(JSON.stringify({ L: m.layers.map(l => [l.top, l.bottom, l.hardTop, l.grain]), said }));""")
    assert r["L"] == [[0, 35, "4F", "RG"], [70, 90, "P", ""]]
    assert r["said"][-1] == [False, False, "Not understood: \u201cthe dog ran away\u201d"]


def test_site_weather_and_free_text():
    acts = _parse("location Wawa Ridge West Aspect, elevation twenty two thirty, aspect 315 degrees. "
                  "Wind 30 kilometres south. Snowing S2. Sky overcast. Max temp minus 5 min temp minus 12. "
                  "Foot pen 30 ski pen 15 HN24 5 storm snow 20 blowing snow moderate west. "
                  "Avalanches size 2 natural slab on north aspect at 2400 metres.")
    got = {a["key"]: a.get("value", a.get("text")) for a in acts}
    assert got == {"site.location": "Wawa Ridge West Aspect", "site.elev": 2230, "site.aspect": "NW", "wx.windSpd": "M",
                   "wx.windKmh": 30, "wx.windDir": "S", "wx.precip": "S2", "wx.sky": "OVC", "wx.tmax": -5, "wx.tmin": -12,
                   "surf.foot": 30, "surf.ski": 15, "wx.hn24": 5, "wx.hst": 20, "wx.blow": "M", "wx.blowDir": "W",
                   "avs": "size 2 natural slab on north aspect at 2400 metres"}


def test_stability_tests():
    r = _run("""const { m } = build("depth", ["layer 0 to 60 one finger rounds 1", "layer 60 to 62 fist surface hoar 6 label Jan 3rd", "layer 62 to 100 pencil rounds",
      "compression test twenty one Q2 down 88", "CT12 SP down 60 note clean", "ECTP 22 down 60. E C T N 15 at 45. ECTX",
      "PST 45 of 100 end down 70", "rutschblock 4 whole block down 50", "compression test no result", "deep tap 18 sudden collapse at 62"]);
      console.log(JSON.stringify(m.tests.map(t => [M.testLabel(t), t.depth, t.note])));""")
    assert r == [["CT21Q2", 88, ""], ["CT12SP", 60, "clean"], ["ECTP22", 60, ""], ["ECTN15", 45, ""], ["ECTX", None, ""],
                 ["PST45/100(End)", 70, ""], ["RB4(WB)", 50, ""], ["CTN", None, ""], ["DT18SC", 62, ""]]


def test_ect_on_isolation_and_heights_spoken_as_up():
    r = _run("""const { m } = build("height", ["snow depth 120", "ECTPV up 40", "extended column test on isolation at 35", "CT 12 SP up 60"]);
      console.log(JSON.stringify(m.tests.map(t => [M.testLabel(t), t.depth])));""")
    assert r == [["ECTPV", 80], ["ECTPV", 85], ["CT12SP", 60]]


def test_snow_depth_cannot_drop_below_what_is_recorded():
    """Heights are measured from the ground, so a lower HS would lift recorded layers above the surface."""
    r = _run("""const { m, said } = build("height", ["layer 150 to 141 fist new snow", "snow depth 120", "snow depth 160"]);
      console.log(JSON.stringify({ said: said.map(s => s[0]), hs: m.surf.hs, top: M.toRef(m, m.layers[0].top), conflict: [M.hsConflict(m, 140), M.hsConflict(m, 150)] }));""")
    assert r == {"said": [True, False, True], "hs": 160, "top": 150, "conflict": [150, None]}


def test_snow_scope_pit_flags_and_satellite_text():
    r = _run(f"""const {{ m, said }} = build("depth", {json.dumps(NAKISKA)});
      const text = M.satText(m);
      console.log(JSON.stringify({{ bad: said.filter(s => !s[0] || s[1]), flags: M.flags(m).max, temps: m.temps.map(t => [t.depth, t.t]),
        text, info: M.textInfo(text), sms: M.smsLink("+1 403 555 0123", "Sky BKN, Ta -7.8", true), unit: m.site.elevUnit }}));""")
    assert r["bad"] == [] and r["unit"] == "ft"
    assert r["flags"]["n"] == 6 and r["flags"]["depth"] == 70      # as Snow Scope shows for this pit: 6 at 70 cm
    assert r["temps"] == [[10, -3.6], [20, -3.5], [30, -3.2], [40, -2.9]]
    assert r["text"] == ("12Nov 1440 Nakiska 7328ft NE 34deg. Sky BKN, Pcp NIL, Wind L SW, Ta -7.8. HS 100, Surf RG 0.3. "
                         "Pit: CT21Q2 dn88 FC1.5-2.0; 6 flags dn70")
    assert r["info"] == {"chars": len(r["text"]), "gsm": True, "parts": 1}
    assert r["sms"] == "sms:+14035550123&body=Sky%20BKN%2C%20Ta%20-7.8"


def test_yellow_flag_thresholds():
    """Jamieson and Schweizer (2005): size > 1 mm, softer than 1F, persistent grains, size difference > 0.5 mm,
    hardness difference > 1 step, interface 20 to 85 cm deep."""
    r = _run("""const f = lines => M.flags(build("depth", lines).m).list.map(o => [o.depth, o.n, Object.keys(o.f).filter(k => o.f[k]).sort()]);
      console.log(JSON.stringify([
        f(["layer 0 to 30 pencil rounds 0.5", "layer 30 to 60 pencil rounds 1"]),
        f(["layer 0 to 30 one finger rounds 1", "layer 30 to 60 four finger rounds 1"]),
        f(["layer 0 to 10 pencil rounds 0.5", "layer 10 to 60 four finger minus depth hoar 2 to 4"]),
      ]));""")
    assert r[0] == [[30, 1, ["depth"]]]
    assert r[1] == [[30, 2, ["depth", "hard"]]]          # exactly one step apart is not "more than one"
    assert r[2] == [[10, 5, ["dHard", "dSize", "hard", "size", "type"]]]


def test_heights_from_the_ground():
    r = _run("""const { m } = build("height", ["layer 150 to 141 fist new snow 2", "layer 141 to 115 four finger decomposing",
      "to 100 one finger rounds", "snow depth 155", "CT12 at 141", "temperature 150 minus 6"]);
      console.log(JSON.stringify({ L: m.layers.map(l => [l.top, l.bottom, M.toRef(m, l.top)]), hs: m.surf.hs, test: m.tests[0].depth, temp: m.temps[0].depth,
        text: M.satText(m) }));""")
    assert r["L"] == [[5, 14, 150], [14, 40, 141], [40, 55, 115]] and r["hs"] == 155  # heights kept when HS is corrected
    assert r["test"] == 14 and r["temp"] == 5 and "CT12 up141 DF" in r["text"]


def test_pdf_and_svg_are_complete():
    r = _run(f"""const {{ m }} = build("depth", {json.dumps(NAKISKA)});
      const pdf = Buffer.from(D.profilePdf(m, new Date(2026, 10, 12, 14, 40))).toString("latin1");
      const xref = +/startxref\\n(\\d+)/.exec(pdf)[1], offs = pdf.slice(xref).split("\\n").slice(3).filter(l => / n $/.test(l)).map(l => +l.slice(0, 10));
      const svg = D.svg(D.screen(m, 358, 470, "dark"));
      console.log(JSON.stringify({{ head: pdf.slice(0, 8), eof: pdf.trimEnd().slice(-5), pages: (pdf.match(/\\/Type \\/Page /g) || []).length,
        objsOk: offs.every((o, i) => pdf.slice(o, o + String(i + 1).length + 6) === (i + 1) + " 0 obj"), n: offs.length,
        text: ["(CT21Q2)", "(Nicholas Sexton)", "(Hand Hardness)", "(7328 ft)"].map(t => pdf.includes(t)),
        svg: [svg.startsWith("<svg"), svg.endsWith("</svg>"), (svg.match(/class="lay"/g) || []).length, svg.includes(">CT21Q2<")],
        caaml: M.caaml(m).includes("<caaml:hardness uom=\\"\\">4F+</caaml:hardness>"), empty: D.profilePdf(M.blank()).length > 1000 }}));""")
    assert r["head"] == "%PDF-1.4" and r["eof"] == "%%EOF" and r["pages"] == 2
    assert r["objsOk"] and r["n"] >= 9 and all(r["text"])
    assert r["svg"] == [True, True, 3, True] and r["caaml"] and r["empty"]


def test_bars_from_the_right_and_an_empty_height_grid():
    """Mirror mode puts the table on the right, as the phone recorder does; with no HS a height axis has no numbers yet."""
    r = _run(f"""const {{ m }} = build("depth", {json.dumps(NAKISKA)});
      const head = o => +/<text x="([\\d.]+)"[^>]*>Grain</.exec(D.svg(D.screen(m, 358, 470, "dark", o)))[1];
      const blank = M.blank(); blank.ref = "height"; const empty = D.svg(D.screen(blank, 358, 470, "dark"));
      const pdf = Buffer.from(D.profilePdf(m, new Date(2026, 10, 12), {{ mirror: true }})).toString("latin1");
      console.log(JSON.stringify({{ left: head({{}}), right: head({{ mirror: true }}), empty: [empty.includes(">-10<"), empty.includes(">HS<"), empty.includes(">Hand Hardness<")],
        pdf: pdf.includes("(CT21Q2)") }}));""")
    assert r["left"] < 179 < r["right"] and r["empty"] == [False, False, True] and r["pdf"]


def test_voice_page_has_every_element_its_script_drives():
    pit = JS.parent
    html, js = (pit / "voice.html").read_text(), (JS / "voice.js").read_text()
    ids = set(re.findall(r'\bid="([^"]+)"', html))
    used = set(re.findall(r'(?<!\$)\$\("([A-Za-z0-9_-]+)"\)', js)) | set(re.findall(r'(?:open|close)Sheet\("([A-Za-z0-9_-]+)"\)', js))
    assert len(used) > 60 and used <= ids, sorted(used - ids)
    assert set(re.findall(r'data-k="([^"]+)"', html)) >= {"name", "site.date", "site.location", "surf.hs", "wx.sky", "avs", "notes"}


def test_service_worker_caches_every_file_the_pages_load():
    pit = JS.parent
    shell = set(re.findall(r'"\./([^"]*)"', re.search(r"const SHELL = \[(.*?)\];", (pit / "sw.js").read_text(), re.S).group(1)))
    for page in ("index.html", "voice.html"):
        html = (pit / page).read_text()
        local = {s for s in re.findall(r'<script[^>]* src="([^"]+)"', html) + re.findall(r'<link rel="stylesheet" href="([^"]+)"', html) if "//" not in s}
        assert page in shell and {"css/app.css", "js/theme.js"} <= local <= shell, (page, local - shell)
    assert all((pit / f).is_file() for f in shell if f)


def test_photo_page_links_to_voice_and_satellite_text_and_offline_copies_are_plain():
    """The Translator's first screen leads to both new features. The service worker stores plain copies, because a
    host that redirects voice.html to /voice hands back a redirected response, which cannot answer a page load."""
    pit = JS.parent
    nav = re.search(r'<nav class="tabs".*?</nav>', (pit / "index.html").read_text(), re.S).group(0)
    assert re.findall(r'href="([^"]+)"', nav) == ["./", "voice.html", "voice.html#sat"]
    sw = (pit / "sw.js").read_text()
    assert "addAll" not in sw and "res.redirected" in sw and ".then(plain)" in sw and "plain(res.clone())" in sw


def test_all_three_pages_share_one_look_and_one_light_dark_switch():
    """Voice and Sat text use the photo page's stylesheet, header and tabs. The theme script sits in <head> so the
    right colours are there from the first frame, and each page carries the same Light / Dark switch."""
    pit = JS.parent
    for page in ("index.html", "voice.html"):
        html = (pit / page).read_text()
        head = html[: html.index("</head>")]
        assert '<link rel="stylesheet" href="css/app.css">' in head and '<script src="js/theme.js"></script>' in head, page
        assert "data-theme=" not in re.search(r"<html[^>]*>", html).group(0), page  # no page forces a theme of its own
        nav = re.search(r'<nav class="tabs".*?</nav>', html, re.S).group(0)
        assert re.findall(r'href="([^"]+)"', nav) == ["./", "voice.html", "voice.html#sat"], page
        assert re.findall(r'data-theme-set="([^"]+)"', html) == ["light", "dark"], page
    css = (pit / "css" / "app.css").read_text()
    assert ':root[data-theme="dark"]' in css and ':root:not([data-theme="light"])' in css
    # colours come from the shared stylesheet only: the voice page defines none of its own
    assert not re.search(r"--(bg|panel|ink|accent)\s*:", (pit / "voice.html").read_text())


def test_theme_choice_is_kept_and_shared_and_follows_the_phone_until_chosen():
    """js/theme.js on a stand-in page. Nothing stored follows the phone. A choice is stored, marks <html> and tells the
    page to redraw. A light choice made on the old voice page carries over; anything else stored is ignored."""
    r = _run(f"""const src = require("fs").readFileSync({json.dumps(str(JS / "theme.js"))}, "utf8");
      function boot(store, phoneDark) {{
        const attrs = {{}}, events = [], handlers = {{}};
        const root = {{ setAttribute: (k, v) => {{ attrs[k] = v; }}, removeAttribute: k => {{ delete attrs[k]; }}, dispatchEvent: e => {{ events.push(e.detail); }} }};
        const document = {{ documentElement: root, querySelector: () => null, querySelectorAll: () => [], addEventListener: (t, f) => {{ handlers[t] = f; }} }};
        const window = {{ matchMedia: () => ({{ matches: phoneDark, addEventListener() {{}} }}), addEventListener() {{}} }};
        const localStorage = {{ getItem: k => (k in store ? store[k] : null), setItem: (k, v) => {{ store[k] = String(v); }} }};
        class CustomEvent {{ constructor(t, o) {{ this.type = t; this.detail = o.detail; }} }}
        new Function("window", "document", "localStorage", "CustomEvent", src)(window, document, localStorage, CustomEvent);
        return {{ attrs, events, store, handlers, T: window.SnowTheme }};
      }}
      const a = boot({{}}, true), first = [a.T.get(), a.attrs["data-theme"] || ""];
      a.T.set("light"); const chosen = [a.T.get(), a.attrs["data-theme"], a.store["snowpack-theme"], a.events.join()];
      a.T.set("sepia"); const bad = a.T.get();
      a.handlers.click({{ target: {{ closest: () => ({{ getAttribute: () => "dark" }}) }} }}); const tapped = [a.T.get(), a.store["snowpack-theme"]];
      const b = boot({{ "snowpack-theme": "dark" }}, false), c = boot({{ "snowpack-voice-settings-v1": JSON.stringify({{ theme: "light" }}) }}, true);
      const d = boot({{ "snowpack-voice-settings-v1": JSON.stringify({{ theme: "dark" }}) }}, false), e = boot({{ "snowpack-theme": "purple" }}, false);
      console.log(JSON.stringify({{ first, chosen, bad, tapped, b: [b.T.get(), b.attrs["data-theme"]], c: [c.T.get(), c.store["snowpack-theme"]],
        d: [d.T.get(), d.attrs["data-theme"] || ""], e: [e.T.get(), e.attrs["data-theme"] || ""] }}));""")
    assert r["first"] == ["dark", ""] and r["chosen"] == ["light", "light", "light", "light"] and r["bad"] == "light"
    assert r["tapped"] == ["dark", "dark"] and r["b"] == ["dark", "dark"] and r["c"] == ["light", "light"]
    assert r["d"] == ["light", ""] and r["e"] == ["light", ""]


def test_on_screen_graph_has_page_coloured_day_and_night_palettes():
    """The graph on the page is drawn in the page's own colours; the PDF and the saved chart stay on white paper."""
    r = _run(f"""const {{ m }} = build("depth", {json.dumps(NAKISKA)});
      const bg = t => /<rect[^>]*fill="(#[0-9a-f]+)"/.exec(D.svg(D.screen(m, 358, 470, t)))[1];
      console.log(JSON.stringify({{ day: bg("day"), night: bg("night"), paper: bg("light"),
        keys: ["day", "night"].map(t => Object.keys(D.THEMES[t]).sort().join() === Object.keys(D.THEMES.light).sort().join()) }}));""")
    assert r["day"] == "#fbfdfe" and r["night"] == "#141f27" and r["paper"] == "#ffffff" and r["keys"] == [True, True]


# ---- reading dictation with the OGRS vocabulary ----

def _read(mode: str, hs, lines: list[str]) -> str:
    """Everything the page reads back for these spoken pieces: "✓" understood, "~" understood with a caution, "✗" not."""
    return _run(f"""const m = M.blank(); m.ref = {json.dumps(mode)}; m.site.date = "2026-11-14T10:00"; if ({json.dumps(hs)} != null) M.setHS(m, {json.dumps(hs)});
      const out = []; {json.dumps(lines)}.forEach(t => M.apply(m, P.parse(t)).forEach(r => out.push((r.ok ? (r.warn ? "~ " : "✓ ") : "✗ ") + r.say)));
      console.log(JSON.stringify(out.join("\\n")));""")


@pytest.mark.parametrize("said, read", [
    # every IACS grain class by name, by code and by spelled code
    ("layer 100 to 83 4F+ FCxr 1.5", "✓ Layer 100–83 cm: 4F+, rounding facets, 1.5 mm"),
    ("layer 100 to 83 fist D H C P 4", "✓ Layer 100–83 cm: F, hollow cups, 4.0 mm"),
    ("layer 100 to 83 P K rounds", "✓ Layer 100–83 cm: P to K, rounded grains"),
    ("layer 100 to 83 one F plus R G 1", "✓ Layer 100–83 cm: 1F+, rounded grains, 1.0 mm"),
    ("layer 100 to 83 fist+ near surface facets 1", "✓ Layer 100–83 cm: F+, near-surface facets, 1.0 mm"),
    ("layer 100 to 83 knife basal ice", "✓ Layer 100–83 cm: K, basal ice"),
    # tests, with the shovel shear test and the result codes
    ("C T M 15 resistant planar at 30", "✓ CT15RP at 30 cm"),
    ("ECT P22 at 30", "✓ ECTP22 at 30 cm"),
    ("compression test hard 25 progressive compression at 30", "✓ CT25PC at 30 cm"),
    ("shovel shear test easy at 30", "✓ STE at 30 cm"),
    ("compression test no result", "✓ CTN"),
    # weather: OGRS codes, a linking word, the value said first, or no lead word at all
    ("sky B K N", "✓ Sky: BKN (broken)"),
    ("the sky is overcast", "✓ Sky: OVC (overcast)"),
    ("broken sky", "✓ Sky: BKN (broken)"),
    ("overcast", "✓ Sky: OVC (overcast)"),
    ("no precipitation", "✓ Precipitation: NIL (no precipitation)"),
    ("precipitation freezing rain", "✓ Precipitation: ZR (freezing rain)"),
    ("precipitation graupel", "✓ Precipitation: G (graupel or hail)"),
    ("snowing 2 cm an hour", "✓ Precipitation: S2 (snow, moderate (2 cm/h))"),
    ("light rain", "✓ Precipitation: RL (rain, light)"),
    ("wind L SW", "✓ Wind: L (light)\n✓ Wind from: SW"),
    ("light winds from the southwest", "✓ Wind: L (light)\n✓ Wind from: SW"),
    ("North East aspect", "✓ Aspect: NE"),
    ("maximum minus 2 minimum minus 11", "✓ Max temperature: -2 °C\n✓ Min temperature: -11 °C"),
    ("new snow 12 cm", "✓ New snow, 24 h (HN24): 12 cm"),
    ("temperature minus 12", "✓ Air temperature: -12 °C"),
    ("surface temperature minus 8", "✓ Surface temperature -8 °C"),
])
def test_ogrs_terms_and_codes(said, read):
    assert _read("height", 100, [said]) == read


@pytest.mark.parametrize("said, read", [
    # a known mishearing is read as the term, and the read-back says so
    ("Later 100 to 83 fist rounds", "✓ Layer 100–83 cm: F, rounded grains (heard “Later” as layer)"),
    ("layer 100 to 83, first, rounds, .5 mm", "✓ Layer 100–83 cm: F, rounded grains, 0.5 mm (heard “first” as fist)"),
    ("layer 100 to 83 fist surface her 5 mm", "✓ Layer 100–83 cm: F, surface hoar, 5.0 mm (heard “surface her” as surface hoar)"),
    ("layer 100 to 83 fist death or 3", "✓ Layer 100–83 cm: F, depth hoar, 3.0 mm (heard “death or” as depth hoar)"),
    ("layer 100 to 83 night crust", "✓ Layer 100–83 cm: K, melt-freeze crust (heard “night” as knife)"),
    ("easy TP 22 at 30", "✓ ECTP22 at 30 cm (heard “easy TP” as ect p)"),
    ("rush block 4 hole block at 30", "✓ RB4(WB) at 30 cm (heard “rush block” as rutschblock, “hole block” as whole block)"),
    ("precip Neil", "✓ Precipitation: NIL (no precipitation) (heard “Neil” as nil)"),
    ("wind com", "✓ Wind: C (calm) (heard “com” as calm)"),
    ("ski pin 15", "✓ Ski penetration: 15 cm (heard “ski pin” as ski penetration)"),
    ("Snow death 150", "✓ Snow depth (HS): 150 cm (heard “Snow death” as snow depth)"),
    # a word that only sounds like a term is read as it too, with a caution mark
    ("layer 100 to 83 pensil crust", "~ Layer 100–83 cm: P, melt-freeze crust (heard “pensil” as pencil)"),
    ("compression test 21 sudden planner at 30", "✓ CT21SP at 30 cm (heard “planner” as planar)"),
    ("compression test 12 brake at 30", "✓ CT12BRK at 30 cm (heard “brake” as break)"),
    ("sky broke in", "✓ Sky: BKN (broken) (heard “broke in” as broken)"),
    ("layer 100 283 fist rounds", "~ Layer 100–83 cm: F, rounded grains (heard “283” as to 83)"),
])
def test_mishearings_are_read_as_the_term_and_said_back(said, read):
    assert _read("height", 100, [said]) == read


def test_ordinary_words_are_not_turned_into_terms():
    """Names and notes keep their words, a lead word needs its value after it, and chatter stays "not understood"."""
    assert _read("height", 100, ["location First Lake Wind Ridge", "observer Skye Later"]) == "✓ Location: First Lake Wind Ridge\n✓ Observer: Skye Later"
    assert _read("height", 100, ["note the first one failed later when the wind picked up"]) == "✓ Note: the first one failed later when the wind picked up"
    assert _read("height", 100, ["layer 100 to 83 fist rounds", "when I got there it was later"]).endswith("✗ Not understood: “when I got there it was later”")
    assert _read("height", 100, ["layer 100 to 83 pencil wind slab"]) == "✓ Layer 100–83 cm: P, wind packed"
    assert _read("height", 100, ["layer 100 to 83 fist rounds label March 3 rain crust"]) == "✓ Layer 100–83 cm: F, rounded grains, “March 3 rain crust”"
    assert _read("height", 100, ["the first one failed"]) == "✗ Not understood: “the first one failed”"
    assert _read("height", 100, ["wind"]) == "✗ Not understood: “wind”"


@pytest.mark.parametrize("mode, hs, said, read", [
    # "depth" and "down" are always below the surface, "up" always above the ground, whichever way the page is set
    ("height", 100, ["compression test 21 sudden planar depth 30"], "✓ CT21SP at 30 cm below the surface (height 70 cm)"),
    ("height", 100, ["compression test 21 sudden planar down 30"], "✓ CT21SP at 30 cm below the surface (height 70 cm)"),
    ("height", 100, ["compression test 21 sudden planar 30 cm deep"], "✓ CT21SP at 30 cm below the surface (height 70 cm)"),
    ("height", 100, ["compression test 21 sudden planar at 30"], "✓ CT21SP at 30 cm"),
    ("depth", 100, ["compression test 21 sudden planar depth 30"], "✓ CT21SP at 30 cm"),
    ("depth", 100, ["compression test 21 sudden planar up 30"], "✓ CT21SP at 30 cm above the ground (depth 70 cm)"),
    ("height", 100, ["temperature at depth 20 minus 3"], "✓ Temperature -3 °C at 20 cm below the surface (height 80 cm)"),
    ("height", 100, ["depth 30 to 50 four finger facets"], "✓ Layer 70–50 cm: 4F, faceted crystals (said as depths below the surface)"),
    ("height", 100, ["layer 30 to the ground fist depth hoar"], "✓ Layer 30–0 cm: F, depth hoar"),
    ("height", None, ["depth 150"], "✓ Snow depth (HS): 150 cm"),
    ("height", None, ["death 150"], "✓ Snow depth (HS): 150 cm (heard “death” as depth)"),
    # the microphone hands a sentence over in pieces when the speaker pauses
    ("height", 100, ["compression test 21 sudden planar", "depth 30"],
     "~ CT21SP: now say where it failed, for example “down 30”.\n✓ CT21SP at 30 cm below the surface (height 70 cm)"),
    ("height", 100, ["layer 100 to 83", "fist", "rounds", "half a millimetre"],
     "✓ Layer 100–83 cm\n✓ Layer 100–83 cm: F\n✓ Layer 100–83 cm: F, rounded grains\n✓ Layer 100–83 cm: F, rounded grains, 0.5 mm"),
])
def test_depth_words_and_sentences_split_by_a_pause(mode, hs, said, read):
    assert _read(mode, hs, said) == read


def test_stored_depths_for_spoken_depths_and_heights():
    r = _run("""const { m } = build("height", ["snow depth 120", "CT 12 SP down 20", "CT 14 SP up 20", "CT 16 SP at 20", "temperature 10 down minus 4", "surface temperature minus 9"]);
      console.log(JSON.stringify({ tests: m.tests.map(t => t.depth), temps: m.temps.map(t => [t.depth, t.t]) }));""")
    assert r == {"tests": [20, 100, 100], "temps": [[0, -9], [10, -4]]}


def test_a_statement_still_waiting_for_its_value_is_held_back():
    """From the microphone, "snow depth" with no number yet is kept for the next words; and of several versions of one
    sentence the recogniser offers, the page takes the one that reads best."""
    r = _run("""const tail = t => { const a = P.parse(t); return [a.tail, a.tailCount, a.length]; };
      console.log(JSON.stringify({ a: tail("sky broken snow depth"), b: tail("sky broken wind"), c: tail("layer 100 to"), d: tail("sky broken"), e: tail("temperature 90"),
        best: [P.best(["later 100 to 83 fissed rounds", "layer 100 to 83 fist rounds"]), P.best(["sky broken", "sky broke in"]), P.best(["the dog", "the dug"])] }));""")
    assert r["a"] == ["snow depth", 1, 2] and r["b"] == ["wind", 1, 2] and r["c"] == ["layer 100 to", 1, 1]
    assert r["d"] == ["", 0, 1] and r["e"] == ["temperature 90", 1, 1] and r["best"] == [1, 0, 0]


def test_closest_match_needs_the_same_sound():
    r = _run("""const L = ["facets", "fists", "pencil", "knife", "rounds", "crust", "moist", "planar", "broken", "overcast"];
      console.log(JSON.stringify(["fossets", "pensil", "planner", "brocken", "overcasts", "rounds", "pounds", "trust", "mast", "fish", "the"].map(w => P.closest(w, L))));""")
    assert r == ["facets", "pencil", "planar", "broken", "overcast", None, None, None, None, None, None]


def test_words_a_statement_did_not_use_are_said_back_not_dropped():
    assert _read("height", 100, ["wind calm the dog"]) == "✓ Wind: C (calm)\n✗ Not understood: “the dog”"
    assert _read("height", 100, ["sky broken and something else wind light"]) == "✓ Sky: BKN (broken)\n✗ Not understood: “and something else”\n✓ Wind: L (light)"
    assert _read("height", 100, ["temperature 20 minus 3 banana"]) == "✓ Temperature -3 °C at 20 cm\n✗ Not understood: “banana”"
    assert _read("height", 100, ["elevation 2080 metres above sea level, slope 28 degrees"]) == "✓ Elevation: 2080 m\n✓ Slope: 28°"
    assert _read("height", 100, ["wind strong west gusting extreme"]) == "✓ Wind: S (strong)\n✓ Wind from: W"
