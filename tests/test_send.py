"""Send to Snowpack (js/send.js): the outbox keeps a profile until an upload reaches the snowpack site, and the
upload carries the fields of that site's observation-upload form."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

SEND = Path(__file__).resolve().parents[1] / "js" / "send.js"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = f"""
const S = require({json.dumps(str(SEND))});
function mem() {{ const d = {{}}; return {{ getItem: k => (k in d ? d[k] : null), setItem: (k, v) => {{ d[k] = String(v); }} }}; }}
const pit = (id, site) => ({{ pitId: id, filename: id + ".caaml.xml", xml: "<x/>", site, location: "Hilda", date: "2026-11-14T10:00", source: "test" }});
"""


def _run(body: str):
    out = subprocess.run([NODE, "-e", PRELUDE + "(async () => {" + body + "})()"], capture_output=True, text=True,
                         check=True)
    return json.loads(out.stdout)


def test_site_guess_matches_the_snowpack_form():
    assert _run("console.log(JSON.stringify(['Goats Eye study plot', 'Simpson', 'bow summit', 'Nakiska', ''].map(S.guessSite)))") == \
        ["goats_eye", "simpson", "bow_summit", "other", "other"]


def test_fields_name_the_form_and_keep_the_location_for_other():
    f = _run("console.log(JSON.stringify(S.fields(pit('a', 'other'))))")
    assert f["form-name"] == "observation-upload" and f["bot-field"] == ""
    assert f["site"] == "other" and f["observed_date"] == "2026-11-14"
    assert f["notes"].startswith("Location: Hilda") and "Snowpack Translator" in f["notes"]


def test_offline_keeps_the_profile_then_sends_it_once():
    r = _run("""
      const st = mem(); let online = false; const got = [];
      const box = S.outbox({ storage: st, post: async (i) => { if (!online) throw new Error('offline'); got.push(i.pitId); } });
      const a = await box.add(pit('p1', 'simpson'));
      await box.add(pit('p1', 'simpson'));          // the same pit again replaces the unsent copy
      await box.add(pit('p2', 'goats_eye'));
      const waiting = box.pending().map(x => x.pitId);
      online = true; const b = await box.flush();
      console.log(JSON.stringify({ a, waiting, b, got, left: box.pending().length }));
    """)
    assert r["a"] == {"sent": 0, "left": 1}
    assert r["waiting"] == ["p1", "p2"]
    assert r["b"] == {"sent": 2, "left": 0} and r["got"] == ["p1", "p2"] and r["left"] == 0
