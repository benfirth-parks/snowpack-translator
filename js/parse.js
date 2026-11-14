/* Snowpack Translator: spoken observation parser.
   Turns the words a phone's dictation wrote down into observation actions. No model, no LLM. It reads with:
   - the vocabulary of the CAA's Observation Guidelines and Recording Standards (OGRS) and the IACS 2009 grain
     classes: every term by its spoken name and by its code ("facets", "FC", "F C");
   - a list of known mishearings ("surface whore", "faucets", "later 100 to 83");
   - a closest-match rule: a word that sounds like a term expected at that point of the sentence is read as that term.
   Every word read as something else is reported back ("heard"), and a word it does not know comes back as
   "not understood", so the observer always sees what was done with what they said.
   Works in the browser (window.SnowSpeak) and in Node (tests). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SnowSpeak = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- vocabulary ---------- */
  const PHRASES = [], NAME = {}; // [words[], kind, value, misheard]; NAME: how a term is named in the read-back
  // "~" in front of an alternate marks a known mishearing: it is read as the term, and the read-back says so
  const add = (kind, value, alts) => alts.split("|").forEach(a => {
    a = a.trim(); if (!a) return;
    const mis = a[0] === "~", words = (mis ? a.slice(1) : a).split(/\s+/), key = kind + ":" + value;
    if (!(key in NAME)) NAME[key] = words.join(" ");
    PHRASES.push([words, kind, value, mis]);
  });

  // IACS 2009 grain classes and subclasses, as OGRS lists them, with the names observers say
  const GRAINS = [
    ["PP", "precipitation particles|precip particles|new snow|fresh snow"],
    ["PPco", "columns"], ["PPnd", "needles"], ["PPpl", "plates"],
    ["PPsd", "stellar dendrites|stellars|stellar|dendrites|~stellers|~stella"],
    ["PPir", "irregular crystals|irregulars"],
    ["PPgp", "graupel|~grapple|~gropple|~grouple|~graple|~growpel|~group l|~group el|~grow pull|~gro pull"],
    ["PPhl", "hail"], ["PPip", "ice pellets"], ["PPrm", "rime|rimed particles|rimed"],
    ["MM", "machine made|machine made snow|man made snow|artificial snow"],
    ["MMrp", "round polycrystalline particles|round polycrystalline"], ["MMci", "crushed ice"],
    ["DF", "decomposing fragments|decomposing and fragmented particles|decomposing and fragmented|decomposing fragmented|decomposing|decomposed|fragmented|fragments"],
    ["DFdc", "partly decomposed|partly decomposed particles|partially decomposed"],
    ["DFbk", "wind broken|wind broken particles|broken particles"],
    ["RG", "rounded grains|round grains|rounds|rounded|round"],
    ["RGsr", "small rounds|small rounded|small rounded particles"], ["RGlr", "large rounds|large rounded|large rounded particles"],
    ["RGwp", "wind packed|wind packed rounds|wind slab grains|wind slab|wind pack|wind pressed"],
    ["RGxf", "faceted rounds|faceting rounds|faceted rounded particles"],
    ["FC", "faceted crystals|facets|facet|faceted grains|faceted|basal facets|sugary facets|sugar facets|~faucets|~faucet|~fawcetts|~fawcett|~fossets|~fosset"],
    ["FCso", "solid facets|solid faceted|solid faceted particles"],
    ["FCsf", "near surface facets|near surface faceted|near surface faceted particles|surface facets"],
    ["FCxr", "rounding facets|rounded facets|rounding faceted|rounding faceted particles|mixed forms"],
    ["DH", "depth hoar|sugar snow"],
    ["DHcp", "hollow cups|cup crystals|cups|cup shaped depth hoar"], ["DHpr", "hollow prisms|prisms"],
    ["DHch", "chains of depth hoar|depth hoar chains|chains"], ["DHla", "large striated crystals|large striated|striated"],
    ["DHxr", "rounding depth hoar|rounded depth hoar"],
    ["SH", "surface hoar|hoar frost|hoarfrost|buried surface hoar|~whore frost"],
    ["SHsu", ""], ["SHcv", "cavity hoar|crevasse hoar"], ["SHxr", "rounding surface hoar|rounded surface hoar"],
    ["MF", "melt forms|melt form|melt freeze|melt freeze grains|wet grains|corn snow|corn"],
    ["MFcl", "clustered rounds|clustered rounded grains|clusters|clustered"],
    ["MFpc", "polycrystals|rounded polycrystals|melt freeze polycrystals|poly crystals"],
    ["MFsl", "slush"], ["MFcr", "melt freeze crust|meltfreeze crust|melt crust|crust"],
    ["IF", "ice formation|ice formations|ice lens|ice lense|ice crust"],
    ["IFil", "ice layer|horizontal ice layer"], ["IFic", "ice column|ice columns|ice pipe"], ["IFbi", "basal ice"],
    ["IFrc", "rain crust"], ["IFsc", "sun crust|firnspiegel"]
  ];
  // every grain code can also be said or typed as its code; IF and MM alone are ordinary words ("if", "mm")
  GRAINS.forEach(([code, alts]) => add("grain", code, alts + (code === "IF" || code === "MM" ? "" : "|" + code.toLowerCase())));

  add("hard", "F", "fist|fists");
  add("hard", "4F", "four finger|four fingers|4 finger|4 fingers|4f|four f|4 f|~for finger|~for fingers|~fore finger|~forefinger");
  add("hard", "1F", "one finger|one fingers|1 finger|1 fingers|1f|one f|1 f|~won finger|~wan finger");
  add("hard", "P", "pencil|pencils");
  add("hard", "K", "knife|knives|knifes");
  add("hard", "I", "ice");

  add("wet", "V", "very wet");
  add("wet", "D", "dry");
  add("wet", "M", "moist");
  add("wet", "W", "wet");
  add("wet", "S", "soaked|slushy");

  add("concern", true, "layer of concern|weak layer|problem layer|persistent weak layer|pwl|of concern|failure layer|critical layer|~week layer");

  const DIR_WORDS = { north: "N", south: "S", east: "E", west: "W" };
  ["north", "south"].forEach(a => ["east", "west"].forEach(b => {
    const c = DIR_WORDS[a] + DIR_WORDS[b];
    add("dir", c, `${a} ${b}|${a}${b}|${c.toLowerCase()}`);
    add("dir", DIR_WORDS[a] + c, `${a} ${a} ${b}|${a} ${a}${b}|${(DIR_WORDS[a] + c).toLowerCase()}`);
    add("dir", DIR_WORDS[b] + c, `${b} ${a} ${b}|${b} ${a}${b}|${(DIR_WORDS[b] + c).toLowerCase()}`);
  }));
  Object.keys(DIR_WORDS).forEach(w => add("dir", DIR_WORDS[w], w));

  // lead words: each starts a new statement
  add("lead", "layer", "layer|next layer|new layer|then layer|add layer|~later|~lair|~lawyer|~liar|~player|~slayer|~leia|~lay her");
  add("lead", "next", "next|then");
  add("lead", "edit", "change layer|edit layer|fix layer|correct layer|correction layer");
  add("lead", "dellayer", "delete layer|remove layer");
  add("lead", "temp", "temperature|temperatures|temp|temps|snow temperature|snow temperatures|snow temp|snow temps|t");
  add("lead", "tsurf", "surface temperature|surface temp|snow surface temperature|snow surface temp|t surface");
  add("lead", "air", "air temperature|air temp|air|air temperatures|present temperature|present temp|current temperature|current temp|outside temperature");
  add("lead", "tmax", "max temperature|max temp|maximum temperature|maximum temp|t max|tmax|max air|high temperature|daytime high|maximum|max");
  add("lead", "tmin", "min temperature|min temp|minimum temperature|minimum temp|t min|tmin|min air|low temperature|overnight low|minimum|min");
  add("lead", "ct", "compression test|compression tests|compression|ct|~city");
  add("lead", "ect", "extended column test|extended column|ect");
  add("lead", "pst", "propagation saw test|propagation saw|prop saw test|prop saw|saw test|pst");
  add("lead", "rb", "rutschblock|rutschblock test|rutsch block|rootch block|rb|~rush block|~roach block|~rooch block|~roots block|~root block|~ruch block|~rouge block|~rich block|~rutch block");
  add("lead", "dt", "deep tap test|deep tap|dt");
  add("lead", "st", "shovel shear test|shovel shear|shovel test|shear test|st");
  add("lead", "location", "location|site|site name");
  add("lead", "observer", "observer|observers|observed by");
  add("lead", "org", "organization|organisation|operation|org");
  add("lead", "name", "profile name|pit name|profile title|title");
  add("lead", "aspect", "aspect");
  add("lead", "elev", "elevation|altitude");
  add("lead", "slope", "slope|slope angle|incline");
  add("lead", "hs", "snow depth|total depth|total snow depth|height of snow|height of snowpack|height of the snowpack|snowpack height|snow pack height|snowpack depth|snow pack depth|snow height|depth of snow|depth of snowpack|depth of the snowpack|hs|~snow death|~snow dept|~snow debt|~snow depths|~no depth|~snowdepth|~snow deaths");
  add("lead", "sky", "sky|sky cover|sky condition|sky conditions|skies|cloud cover|clouds|cloud|~skye|~ski");
  add("lead", "precip", "precipitation|precip|snowfall rate|precipitation rate|precipitation type|~precept|~participation|~percipitation");
  add("lead", "snowing", "snowing");
  add("lead", "raining", "raining");
  add("lead", "wind", "wind|wind speed|winds|~wins|~win|~when|~wynn");
  add("lead", "blow", "blowing snow|snow transport|drifting snow|wind transport");
  add("lead", "hn24", "hn24|hn 24|24 hour snow|24 hour snowfall|24 hour new snow|overnight snow|new snow amount|snowfall");
  add("lead", "hst", "hst|storm snow|storm total|storm snow total");
  add("lead", "foot", "foot penetration|foot pen|boot penetration|boot pen|pf|~foot pin|~foot pan|~foot pain|~boot pin|~footpen");
  add("lead", "ski", "ski penetration|ski pen|ps|~ski pin|~ski pan|~ski pain|~skipping|~skip in|~skippin");
  add("lead", "surf", "surface grain|surface form|surface snow");
  add("lead", "avs", "avalanches|avalanche|avalanche activity|avalanche observations|avs");
  add("lead", "note", "note|notes|comment|comments|remark|remarks");
  add("lead", "lnote", "layer note|layer name|layer comment|label|called");
  add("lead", "undo", "scratch that|undo that|undo|delete that|cancel that");

  // weather said without its lead word: "overcast", "light rain"
  add("ilead", "sky", "overcast|obscured|partly cloudy|mostly cloudy");
  add("ilead", "precip", "very light rain|light rain|moderate rain|heavy rain|very light snow|light snow|moderate snow|heavy snow|very heavy snow|light snowfall|moderate snowfall|heavy snowfall|" +
    "flurries|snow flurries|light flurries|drizzle|freezing rain|mixed rain and snow|rain and snow|snow and rain");

  const BY_FIRST = {};
  PHRASES.sort((a, b) => b[0].length - a[0].length).forEach(p => { (BY_FIRST[p[0][0]] = BY_FIRST[p[0][0]] || []).push(p); });

  const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  const TEENS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const isNumWord = w => w in UNITS || w in TEENS || w in TENS || w === "hundred" || w === "thousand";
  const DIGITS = /^-?(\d+\.?\d*|\.\d+)$/;
  const FILL = new Set(("the a an is are was at of and with on in it its from size sized grain grains hardness about around roughly um uh " +
    "okay ok then to too down by for cm centimetre centimetres centimeter centimeters mm millimetre millimetres millimeter " +
    "millimeters mil mils degrees degree celsius c metres meters m that this there has have had got im i we approximately " +
    "up form forms type snow layer hard hand resistance depth deep high tall long kmh km kilometres kilometers kilometre kilometer per hour").split(" "));
  // little words that may sit between a lead word and its value: "sky is broken", "wind is light from the south west"
  const LINK = new Set("is are was were of the a an at from to its it about around roughly approximately equals reading reads now currently today and with be".split(" "));
  const MINUS = new Set(["minus", "negative", "below"]);
  const PLUS = new Set(["plus", "positive", "above"]);
  const SKY = { clear: "CLR", clr: "CLR", sunny: "CLR", few: "FEW", scattered: "SCT", sct: "SCT", broken: "BKN", bkn: "BKN", overcast: "OVC", ovc: "OVC", cloudy: "OVC", obscured: "X", fog: "X", foggy: "X", whiteout: "X" };
  const WINDSPD = { calm: "C", light: "L", moderate: "M", strong: "S", extreme: "X", variable: "VAR" };
  const NONE = /^(none|nil|no|nothing|zero|0)$/, NONE1 = /^(none|nil|no|nothing)$/;
  const PRECIP_RE = /^(none|nil|no|nothing|snow|rain|light|moderate|heavy|very|flurries|mixed|freezing|drizzle|as|s-?\d+|r[vlmhs]|zr|g|s)$/;

  // spelled codes: "f c" -> fc, "e c t p" -> ect + p, "h s" -> hs
  const RUNS = [];
  const run = (code, emit) => RUNS.push([code.split(""), emit || [code]]);
  GRAINS.forEach(([c]) => { if (c !== "IF" && c !== "MM") run(c.toLowerCase()); });
  [["ect", ["pv", "p", "n", "x"]], ["ct", ["n", "e", "m", "h", "v"]], ["dt", ["n", "e", "m", "h"]], ["st", ["c", "v", "e", "m", "h", "n"]]]
    .forEach(([b, sx]) => { run(b); sx.forEach(s => run(b + s, [b, s])); });
  ["pst", "rb", "hs", "hst", "hn", "pf", "ps", "bkn", "ovc", "sct", "clr"].forEach(c => run(c));
  RUNS.sort((a, b) => b[0].length - a[0].length);

  // mishearings that are more than one word: read as the words on the right
  const DEPTHISH = new Set("depth depths death deaths dept debt debts def deaf deft deph depp tepth".split(" "));
  const SURFACEISH = new Set("surface service surfaced surfaces serface".split(" "));
  const HOARISH = new Set("hoar hore whore whores hor horror or ore oar her hair hoare hoard horde hoe ho war wore door hoer whoa hoarse horse hall haul hora hoor hoars hors".split(" "));
  const REPAIR = {};
  [["easy tpv", "ect pv"], ["easy tp", "ect p"], ["easy tn", "ect n"], ["easy tx", "ect x"], ["easy t", "ect"], ["e ct", "ect"], ["ec t", "ect"],
    ["over cast", "overcast"], ["broke in", "broken"], ["plan are", "planar"], ["plane are", "planar"], ["plain are", "planar"], ["plan r", "planar"], ["plane r", "planar"],
    ["hole block", "whole block"], ["whole black", "whole block"]]
    .forEach(([from, to]) => { const w = from.split(" "); (REPAIR[w[0]] = REPAIR[w[0]] || []).push([w, to.split(" ")]); });
  Object.keys(REPAIR).forEach(k => REPAIR[k].sort((a, b) => b[0].length - a[0].length));

  /* ---------- closest match: sound and spelling ---------- */
  function sound(w) { // a rough spoken shape: silent letters and vowels dropped, voiced and unvoiced pairs merged
    let s = String(w).toLowerCase().replace(/[^a-z]/g, "");
    s = s.replace(/^kn/, "n").replace(/^wr/, "r").replace(/^wh/, "w").replace(/^ps/, "s").replace(/alm/g, "am").replace(/tch/g, "ch").replace(/sch/g, "sh")
      .replace(/ph/g, "f").replace(/gh/g, "").replace(/ck/g, "k").replace(/c(?=[eiy])/g, "s").replace(/c/g, "k").replace(/q/g, "k").replace(/x/g, "ks").replace(/z/g, "s").replace(/mb$/, "m");
    if (!s) return "";
    const k = (/[aeiou]/.test(s[0]) ? "a" : s[0]) + s.slice(1).replace(/[aeiouyhw]/g, "");
    return k.replace(/b/g, "p").replace(/d/g, "t").replace(/g/g, "k").replace(/v/g, "f").replace(/(.)\1+/g, "$1");
  }
  function dist(a, b) { // edit distance, counting two swapped letters as one change
    const d = []; for (let i = 0; i <= a.length; i++) d.push([i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }
  const SOUND = {};
  // The one term in the list that the word sounds like, or null: same first sound and one letter out (two for long words),
  // or the same spoken shape. Short words must match on both. Two equally close terms mean no match.
  function closest(word, list) {
    if (word.length < 4 || /\d/.test(word)) return null;
    const key = sound(word), beats = w => (w.match(/[aeiouy]+/g) || []).length; let best = null, score = 9, tie = false;
    for (const v of list) {
      if (v === word) return null;
      const kv = SOUND[v] || (SOUND[v] = sound(v)); if (!kv || kv[0] !== key[0]) continue;
      const d = dist(word, v), same = kv === key && key.length >= 3, short = Math.min(word.length, v.length) <= 4;
      let s;
      if (short) { if (!(same && d <= 1)) continue; s = d; }
      else if (same && d <= 3) s = Math.min(d, 1);
      else if (d <= (Math.min(word.length, v.length) >= 7 ? 2 : 1)) s = d;
      else continue;
      s += 0.1 * Math.abs(beats(word) - beats(v)); // of two terms as close, the one with as many syllables
      if (s < score) { best = v; score = s; tie = false; } else if (s === score && v !== best) tie = true;
    }
    return tie ? null : best;
  }

  // what each kind of statement expects, for the closest-match rule; "alias" are known mishearings
  const TEST_WORDS = "sudden planar collapse resistant progressive compression break whole block most edge propagation propagates isolation fracture arrest quality moderate easy result depth".split(" ");
  const STOP = new Set("snow large small near made form forms grains crystals particles with and of layer".split(" "));
  const phraseWords = kinds => { const s = new Set(); PHRASES.forEach(p => { if (!p[3] && kinds.indexOf(p[1]) >= 0) p[0].forEach(w => { if (w.length >= 4 && !STOP.has(w) && !/\d/.test(w)) s.add(w); }); }); return Array.from(s); };
  const CTX = {
    layer: { list: phraseWords(["grain", "hard", "wet"]), alias: { first: "fist", fest: "fist", night: "knife", knight: "knife", nife: "knife" } },
    sky: { list: Object.keys(SKY).filter(w => w.length >= 4), alias: { clare: "clear", claire: "clear", brocken: "broken" } },
    wind: { list: Object.keys(WINDSPD).filter(w => w.length >= 4), alias: { com: "calm", come: "calm", cam: "calm", kam: "calm", lite: "light" } },
    precip: { list: "none light moderate heavy flurries rain snow freezing mixed drizzle".split(" "), alias: { neil: "nil", kneel: "nil", nill: "nil", neal: "nil", null: "nil", lite: "light", reign: "rain", rein: "rain" } },
    blow: { list: "none previous light moderate intense strong heavy unknown".split(" "), alias: { neil: "nil", kneel: "nil", nill: "nil", neal: "nil", null: "nil", lite: "light" } },
    test: { list: TEST_WORDS, alias: { planner: "planar", plainer: "planar", planer: "planar", plain: "planar", brake: "break", brakes: "break", breaks: "break", broke: "break", hole: "whole", resistance: "resistant",
      death: "depth", dept: "depth", debt: "depth", depths: "depth" } }
  };
  const KNOWN = new Set(); // every word that already means something: never read as another word
  PHRASES.forEach(p => { if (!p[3]) p[0].forEach(w => KNOWN.add(w)); });
  [SKY, WINDSPD, UNITS, TEENS, TENS, DIR_WORDS].forEach(o => Object.keys(o).forEach(w => KNOWN.add(w)));
  Object.keys(CTX).forEach(c => CTX[c].list.forEach(w => KNOWN.add(w)));
  ("density max maximum kg per cubic metre meter thick thickness plus minus negative positive below above point half hundred thousand test tests tap taps score results fracture character " +
    "release type cut column pops pop drops drop end arrest arrested self slab most edge only isolation isolating propagate propagated propagating initiation partly mostly very " +
    "prev none nil nothing through until till surface ground").split(" ").forEach(w => KNOWN.add(w));
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function ctxWord(ctx, n) { // [the term, sure] for a word that is not itself a term here, or null
    const C = CTX[ctx];
    if (has(C.alias, n)) return [C.alias[n], true];
    if (KNOWN.has(n) || FILL.has(n) || LINK.has(n)) return null;
    const c = closest(n, C.list); return c ? [c, false] : null;
  }
  const plain = x => !!x && !x.k;
  function ctxFix(ctx, toks) {
    return toks.map(t => {
      if (!plain(t)) return t;
      const c = ctxWord(ctx, t.n);
      return c ? Object.assign({}, t, { n: c[0], fz: t.n, h: [t.r, c[0], c[1]] }) : t;
    });
  }
  const unfix = t => { const o = Object.assign({}, t, { n: t.fz }); delete o.fz; delete o.h; return o; };

  /* ---------- tokens ---------- */
  function tokenize(text) {
    const out = []; let sb = false; // sb: a comma or full stop came before this word
    const push = (...toks) => { if (sb && toks[0]) { toks[0].sb = true; sb = false; } toks.forEach(x => out.push(x)); };
    String(text || "").replace(/[\u2212\u2013\u2014]/g, "-").replace(/[°º]/g, " degrees ").split(/\n+/).forEach((line, li) => {
      if (li) { out.push({ k: "nl", n: "\n", r: "" }); sb = false; }
      line.split(/\s+/).forEach(piece => {
        if (!piece) return;
        const ends = /[,.;:!?]["')\u201d\u2019]?$/.test(piece);
        let n = piece.toLowerCase().replace(/['\u2019]/g, "").replace(/(\d),(?=\d{3}\b)/g, "$1");
        n = n.replace(/^[^a-z0-9+\-.]+/, "").replace(/[^a-z0-9+\-]+$/, "");
        n = n.replace(/^\.(?!\d)/, "").replace(/^[+-]+$/, m => m[0]);
        if (!n) { if (ends) sb = true; return; }
        if (/^(km\/h|kmh|kph|km\/hr|kmhr)$/.test(n)) n = "kmh";
        const raw = piece.replace(/^[("\u201c]+|[)"\u201d]+$/g, "");
        let m;
        if ((m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(n))) { // 0-35, 10-3.6
          push({ n: m[1], r: m[1] }, { n: "to", r: "-", dash: true }, { n: m[2], r: m[2] });
        } else if ((m = /^(-?\d*\.?\d+)(cm|mm|m|ft|km|kmh|kg|c)$/.exec(n))) {
          push({ n: m[1], r: m[1] }, { n: m[2], r: m[2] });
        } else if ((m = /^(ectpv|ectp|ectn|ectx|ect|ctn|ctv|cte|ctm|cth|ct|dtn|dte|dtm|dth|dt|stc|stv|ste|stm|sth|stn|pst|rb)(\d{1,3})?(q[123]|sp|sc|rp|pc|bk|brk|b)?$/.exec(n)) && (m[2] || m[3] || m[1].length > 2)) {
          const base = /^ect/.test(m[1]) ? "ect" : /^(ct|dt|st)/.test(m[1]) ? m[1].slice(0, 2) : m[1], toks = [{ n: base, r: raw }];
          if (m[1].length > base.length) toks.push({ n: m[1].slice(base.length), r: "" });
          if (m[2]) toks.push({ n: m[2], r: "" });
          if (m[3]) toks.push({ n: m[3], r: "" });
          push(...toks);
        } else if ((m = /^t(\d{1,3})$/.exec(n))) { // "T20": the temperature at 20
          push({ n: "t", r: raw }, { n: m[1], r: "" });
        } else if ((m = /^([a-z]{3,})([+-])$/.exec(n))) { // "fist+"
          push({ n: m[1], r: raw.replace(/[+-][^a-z0-9]*$/i, "") }, { n: m[2], r: m[2] });
        } else if (/^[a-z]+(-[a-z]+)+$/.test(n)) {
          const rs = raw.split("-"); push(...n.split("-").map((w, i) => ({ n: w, r: rs[i] || w })));
        } else push({ n, r: raw });
        if (ends) sb = true;
      });
    });
    return out;
  }

  function repair(t) { // known mishearings of two or more words, before anything else reads them
    const out = [];
    for (let i = 0; i < t.length; i++) {
      const a = t[i], b = t[i + 1], bn = plain(b) ? b.n : "";
      if (a.k) { out.push(a); continue; }
      let rep = null, used = 1;
      if (HOARISH.has(bn) && (DEPTHISH.has(a.n) || SURFACEISH.has(a.n)) && !(bn === "hoar" && (a.n === "depth" || a.n === "surface"))) { rep = [DEPTHISH.has(a.n) ? "depth" : "surface", "hoar"]; used = 2; }
      else if (REPAIR[a.n]) for (const [seq, to] of REPAIR[a.n]) {
        if (seq.every((w, j) => plain(t[i + j]) && t[i + j].n === w)) { rep = to; used = seq.length; break; }
      }
      if (!rep) { out.push(a); continue; }
      const raw = t.slice(i, i + used).map(x => x.r).filter(Boolean).join(" ");
      rep.forEach((n, k) => { const tok = { n, r: k ? "" : raw, h: [raw, rep.join(" "), true] }; if (!k && a.sb) tok.sb = true; out.push(tok); });
      i += used - 1;
    }
    return out;
  }

  function joinLetters(t) { // "e c t p" -> ect + p, "h s" -> hs, "f c" -> fc
    const out = [];
    for (let i = 0; i < t.length; i++) {
      const hit = plain(t[i]) && t[i].n.length === 1 ? RUNS.find(R => R[0].every((c, j) => plain(t[i + j]) && t[i + j].n === c)) : null;
      if (!hit) { out.push(t[i]); continue; }
      const r = t.slice(i, i + hit[0].length).map(x => x.r).join(" ");
      hit[1].forEach((n, k) => { const tok = { n, r: k ? "" : r }; if (!k && t[i].sb) tok.sb = true; out.push(tok); });
      i += hit[0].length - 1;
    }
    return out;
  }

  function phrases(t, kinds) { // kinds: read only these kinds of term (a second pass over one statement)
    const out = [];
    for (let i = 0; i < t.length; i++) {
      const tok = t[i];
      if (tok.k) { out.push(tok); continue; }
      let m;
      if ((m = /^(4f|1f|f|p|k|i)([+-])$/.exec(tok.n))) { out.push({ k: "hard", v: m[1].toUpperCase(), mod: m[2], n: "h:" + m[1], r: tok.r, src: [tok] }); continue; }
      const cand = BY_FIRST[tok.n]; let hit = null;
      if (cand) for (const p of cand) {
        if ((!kinds || kinds.indexOf(p[1]) >= 0) && p[0].every((w, j) => plain(t[i + j]) && t[i + j].n === w)) { hit = p; break; }
      }
      if (!hit) { out.push(tok); continue; }
      const src = t.slice(i, i + hit[0].length), r = src.map(x => x.r).filter(Boolean).join(" "), hs = src.filter(x => x.h);
      const nt = { k: hit[1], v: hit[2], n: hit[1][0] + ":" + hit[2], r, w: hit[0].join(" "), src };
      if (hit[3] || hs.length) nt.h = [r, NAME[hit[1] + ":" + hit[2]], hs.every(x => x.h[2])];
      if (hit[3]) nt.mis = true;
      if (tok.sb) nt.sb = true;
      out.push(nt);
      i += hit[0].length - 1;
    }
    return out;
  }

  function numbers(t) {
    const out = [];
    const fraction = j => { // digits after "point"
      let s = "", used = 0;
      while (plain(t[j + used])) {
        const w = t[j + used].n;
        if (w in UNITS) s += UNITS[w]; else if (/^\d+$/.test(w)) s += w; else break;
        used++;
      }
      return { s, used };
    };
    for (let i = 0; i < t.length; i++) {
      const tok = t[i];
      if (tok.k) { out.push(tok); continue; }
      let v = null, j = i, w = tok.n;
      if (DIGITS.test(w)) { v = parseFloat(w); j = i + 1; }
      else if (isNumWord(w) || (w === "a" && plain(t[i + 1]) && t[i + 1].n === "hundred")) {
        let cur = 0, total = 0, last = null; if (w === "a") j++;
        for (; plain(t[j]); j++) {
          const x = t[j].n;
          if (x in UNITS) { if (last === "unit" || last === "teen") break; cur += UNITS[x]; last = "unit"; }
          else if (x in TEENS) { if (last === "unit" || last === "teen" || last === "ten") break; cur += TEENS[x]; last = "teen"; }
          else if (x in TENS) { if (last === "unit" || last === "teen" || last === "ten") break; cur += TENS[x]; last = "ten"; }
          else if (x === "hundred") { cur = (cur || 1) * 100; last = "hundred"; }
          else if (x === "thousand") { total += (cur || 1) * 1000; cur = 0; last = "thousand"; }
          else if (x === "and" && (last === "hundred" || last === "thousand") && plain(t[j + 1]) && isNumWord(t[j + 1].n)) continue;
          else break;
        }
        v = total + cur;
      } else if (w === "point" && plain(t[i + 1]) && (t[i + 1].n in UNITS || /^\d+$/.test(t[i + 1].n))) { v = 0; j = i; }
      else if (w === "half" && plain(t[i + 1]) && /^(a|an|mm|mil|mils|millimet(re|er)s?|of)$/.test(t[i + 1].n)) { v = 0.5; j = i + 1; }
      if (v === null) { out.push(tok); continue; }
      if (plain(t[j]) && t[j].n === "point") {
        const f = fraction(j + 1);
        if (f.used) { v = parseFloat((v < 0 ? "-" : "") + Math.abs(Math.trunc(v)) + "." + f.s); j += 1 + f.used; }
      }
      if (plain(t[j]) && t[j].n === "and" && plain(t[j + 1]) && t[j + 1].n === "a" && plain(t[j + 2]) && t[j + 2].n === "half") { v += 0.5; j += 3; }
      const nt = { k: "num", v, n: String(v), r: t.slice(i, j).map(x => x.r).filter(Boolean).join(" ") };
      if (tok.sb) nt.sb = true;
      out.push(nt);
      i = j - 1;
    }
    return out;
  }

  const isNum = t => !!t && t.k === "num";
  const isTo = t => plain(t) && (t.n === "to" || t.n === "too" || t.n === "through" || t.n === "until" || t.n === "till");
  const isMinus = t => plain(t) && (MINUS.has(t.n) || t.n === "-");
  const numish = x => isNum(x) || isMinus(x) || (plain(x) && PLUS.has(x.n));
  const LAYERISH = /^(layer|next|edit|dellayer)$/, TESTISH = /^(ct|ect|pst|rb|dt|st)$/, NAMEY = /^(location|observer|org|name)$/, FREE = /^(note|avs)$/;
  const RESULT_RE = /^(no|nil|none|negative|easy|moderate|hard|very|sudden|resistant|progressive|break|propagat\w*|x|n|p|pv|e|m|h|v|c|whole|most|edge|end|collapse|on|test|tests)$/;
  const STRICT = new Set(["t", "st", "max", "maximum", "min", "minimum"]); // lead words that are also ordinary sounds: they need their value right after

  const nextIdx = (t, i) => { let j = i + 1; while (plain(t[j]) && LINK.has(t[j].n)) j++; return j; };
  function win(t, i, n) { // the next n words that carry meaning
    const out = [];
    for (let j = i + 1; j < t.length && out.length < n; j++) { if (t[j].k === "nl") break; if (plain(t[j]) && LINK.has(t[j].n) && !isMinus(t[j])) continue; out.push(t[j]); }
    return out;
  }

  function validLead(tok, i, t, cur) {
    const v = tok.v, nx = t[nextIdx(t, i)], lv = cur.lead ? cur.lead.v : null, near = n => win(t, i, n);
    const inLayer = !!lv && (LAYERISH.test(lv) || TESTISH.test(lv));
    const strict = !!tok.mis || STRICT.has(tok.w);
    if (v === "note" || v === "lnote") return !inLayer;
    if (v === "layer") return !strict || isNum(nx);
    if (v === "next") return isNum(nx) || isTo(t[i + 1]) || (!!nx && (nx.k === "hard" || nx.k === "grain"));
    if (v === "temp") { const w = near(4); return strict ? isNum(w[0]) && w.slice(1).some(numish) : w.slice(0, 3).some(numish); }
    if (v === "tsurf") return near(3).some(numish);
    if (/^(air|tmax|tmin|elev|slope|hs|hn24|hst|foot|ski)$/.test(v)) {
      if (strict && (inLayer || !numish(nx))) return false;
      return near(2).some(numish);
    }
    if (v === "aspect") return !!nx && (nx.k === "dir" || isNum(nx) || (plain(nx) && /^[nsew]{1,3}$/.test(nx.n)));
    if (v === "sky") return !!nx && ((nx.k === "ilead" && nx.v === "sky") || (plain(nx) && (has(SKY, nx.n) || nx.n === "partly" || nx.n === "mostly" || (!strict && !!ctxWord("sky", nx.n)))));
    if (v === "wind") return !!nx && (nx.k === "dir" || (isNum(nx) && !strict) || (plain(nx) && (has(WINDSPD, nx.n) || NONE.test(nx.n) || (!strict && (/^[clmsxnew]$/.test(nx.n) || !!ctxWord("wind", nx.n))))));
    if (v === "precip") return !!nx && (isNum(nx) || (nx.k === "ilead" && nx.v === "precip") || (nx.k === "grain" && /^PP(gp|hl|ip)$/.test(nx.v)) || (plain(nx) && (PRECIP_RE.test(nx.n) || (!strict && !!ctxWord("precip", nx.n)))));
    if (NAMEY.test(v)) return !!t[i + 1] && t[i + 1].k !== "nl";
    if (TESTISH.test(v)) {
      if (tok.w === "compression" && plain(t[i - 1]) && t[i - 1].n === "progressive") return false; // "progressive compression" is a fracture character
      return !strict || near(3).some(x => isNum(x) || (plain(x) && RESULT_RE.test(x.n)));
    }
    return true;
  }

  // a word that sounds like a lead word, with that lead's value after it: "lager 100 to 83", "compresion 21"
  const LEAD_OF = {};
  PHRASES.forEach(p => { if (p[1] === "lead" && !p[3] && p[0].length === 1 && p[0][0].length >= 5 && !NAMEY.test(p[2]) && !FREE.test(p[2]) && !/^(lnote|undo|next|surf)$/.test(p[2])) LEAD_OF[p[0][0]] = p[2]; });
  const LEAD_LIST = Object.keys(LEAD_OF);
  function soundsLikeLead(tok, i, t, cur) {
    if (tok.n.length < 5 || KNOWN.has(tok.n) || FILL.has(tok.n) || LINK.has(tok.n)) return null;
    const c = closest(tok.n, LEAD_LIST); if (!c) return null;
    const cand = { k: "lead", v: LEAD_OF[c], n: "l:" + LEAD_OF[c], r: tok.r, w: c, mis: true, src: [tok], h: [tok.r, c, false] };
    if (tok.sb) cand.sb = true;
    return validLead(cand, i, t, cur) ? cand : null;
  }

  // a value said before its lead word: "broken sky", "north east aspect", "light winds", "no precipitation"
  const BORROW = {
    aspect: x => x.k === "dir",
    sky: x => plain(x) && has(SKY, x.n),
    wind: x => x.k === "dir" || (plain(x) && (has(WINDSPD, x.n) || NONE1.test(x.n))),
    precip: x => plain(x) && NONE1.test(x.n),
    blow: x => plain(x) && NONE1.test(x.n),
    avs: x => plain(x) && NONE1.test(x.n)
  };
  const USES = { wind: "dir spd", blow: "dir spd", aspect: "dir", sky: "sky", precip: "spd", snowing: "spd", raining: "spd", ct: "spd", dt: "spd", st: "spd" };
  const kindOf = x => x.k === "dir" ? "dir" : !plain(x) ? "" : NONE1.test(x.n) ? "none" : has(WINDSPD, x.n) ? "spd" : has(SKY, x.n) ? "sky" : "";
  function borrow(v, cur, hasValue) {
    const pred = BORROW[v], lv = cur.lead ? cur.lead.v : null;
    if (!pred || (lv && (NAMEY.test(lv) || FREE.test(lv)))) return [];
    let k = cur.toks.length; const got = [];
    while (k > 0 && got.length < 2 && pred(cur.toks[k - 1]) && !(got.length && kindOf(got[0]) === "none")) got.unshift(cur.toks[--k]);
    if (!got.length) return [];
    const uses = (lv && USES[lv]) || "";
    for (const x of got) { // the statement before keeps a word it needs itself, unless a comma set it apart
      const kind = kindOf(x);
      if (kind === "none") { if (lv && k === 0) return []; }
      else if (uses.indexOf(kind) >= 0 && (hasValue || !(x.sb || cur.toks.slice(0, k).some(y => kindOf(y) === kind)))) return [];
    }
    cur.toks.length = k;
    return got;
  }

  function segment(t) {
    const segs = []; let cur = { lead: null, toks: [] };
    const close = () => { if (cur.lead || cur.toks.length) segs.push(cur); };
    const start = (lead, toks) => { close(); cur = { lead, toks: toks || [] }; };
    const describes = () => cur.toks.some(x => x.k === "hard" || x.k === "grain" || x.k === "wet");
    for (let i = 0; i < t.length; i++) {
      let tok = t[i];
      if (tok.k === "nl") { close(); cur = { lead: null, toks: [] }; continue; }
      const lv = cur.lead ? cur.lead.v : null;
      if (lv && FREE.test(lv)) { cur.toks.push(tok); continue; }
      if (plain(tok) && !(lv && NAMEY.test(lv))) tok = soundsLikeLead(tok, i, t, cur) || tok;
      if (tok.k === "lead") {
        const ok = validLead(tok, i, t, cur), got = borrow(tok.v, cur, ok);
        if (ok || got.length) { start(tok, got); continue; }
        if (tok.v === "note" || tok.v === "lnote") { cur.toks.push(tok); continue; }
        // not a lead here. Inside a name, a layer or a test it is just a word; elsewhere it is a lead with nothing after it.
        const guess = !!tok.mis || STRICT.has(tok.w), inside = !!lv && (NAMEY.test(lv) || LAYERISH.test(lv) || TESTISH.test(lv) || lv === tok.v);
        if (guess || inside || !lv && describes()) { tok.src.forEach(x => cur.toks.push(x)); continue; }
        start(tok, []); continue;
      }
      if (tok.k === "ilead") {
        const same = !!lv && (lv === tok.v || (tok.v === "precip" && /^(snowing|raining)$/.test(lv)));
        if (same || (lv && NAMEY.test(lv))) tok.src.forEach(x => cur.toks.push(x));
        else start({ k: "lead", v: tok.v, n: "l:" + tok.v, r: "", w: tok.w, implied: true }, tok.src.slice());
        continue;
      }
      // "new snow 12 cm" outside a layer is the 24 hour snowfall, not a grain form
      if (tok.k === "grain" && tok.v === "PP" && /^(new|fresh) snow$/.test(tok.w || "")) {
        const j = nextIdx(t, i), inLayer = (!!lv && LAYERISH.test(lv)) || (!lv && describes());
        if (isNum(t[j]) && (!inLayer || tok.sb || (plain(t[j + 1]) && /^(cm|centimet(re|er)s?)$/.test(t[j + 1].n)))) { start({ k: "lead", v: "hn24", n: "l:hn24", r: tok.r, w: tok.w }, []); continue; }
      }
      if (isNum(tok) && isTo(t[i + 1]) && isNum(t[i + 2])) {
        // a bare depth range starts a layer: "35 to 70 four finger", "from 100 to 83 fist", "depth 30 to 50 fist"
        if (!cur.lead && cur.toks.every(x => plain(x) && FILL.has(x.n))) { cur = { lead: { k: "lead", v: "layer", n: "l:layer", r: "" }, toks: cur.toks.concat([tok]) }; continue; }
        // and so does a second range once a layer has been described: "layer 100 to 83 fist rounds 83 to 60 four finger"
        const A = tok.v, B = t[i + 2].v, mm = plain(t[i + 3]) && /^(mm|mil|mils|millimet(re|er)s?)$/.test(t[i + 3].n);
        if (lv && /^(layer|next)$/.test(lv) && describes() && !mm && (A > 10 || B > 10 || B === 0)) { start({ k: "lead", v: "layer", n: "l:layer", r: "" }, [tok]); continue; }
      }
      cur.toks.push(tok);
    }
    close();
    return segs;
  }

  /* ---------- statement parsers ---------- */
  const rawOf = toks => toks.map(x => x.r).filter(Boolean).join(" ").replace(/^[\s,;:.]+|[\s,;:]+$/g, "").replace(/([^.])\.$/, "$1").trim();
  const title = s => (s && s === s.toLowerCase()) ? s.replace(/\b[a-z]/g, c => c.toUpperCase()) : s;
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const textOf = toks => toks.map(x => x.n).join(" ");
  // what was read as something else in these words: [[heard, read as], ...], and whether any of it was a closest match
  function heardIn(a, list, first) {
    const seen = {}, old = a.heard || [], fresh = []; let unsure = !!a.unsure;
    old.forEach(h => { seen[h[0].toLowerCase()] = 1; });
    list.forEach(x => {
      if (!x || !x.h) return;
      const raw = x.h[0].replace(/^[\s,;:.!?]+|[\s,;:.!?]+$/g, ""); if (!raw || seen[raw.toLowerCase()]) return; // once for each thing heard
      seen[raw.toLowerCase()] = 1; fresh.push([raw, x.h[1]]); if (!x.h[2]) unsure = true;
    });
    const out = first ? fresh.concat(old) : old.concat(fresh);
    if (out.length) a.heard = out;
    if (unsure) a.unsure = true;
    return a;
  }

  function layerFix(toks) { // closest matches for grain, hardness and wetness words, up to a spoken note
    const stop = toks.findIndex(t => t.k === "lead" && (t.v === "note" || t.v === "lnote")), head = stop < 0 ? toks : toks.slice(0, stop);
    const fixed = phrases(ctxFix("layer", head), ["grain", "hard", "wet", "concern"]).map(t => (plain(t) && t.fz ? unfix(t) : t)); // a word that did not complete a term stays as heard
    return stop < 0 ? fixed : fixed.concat(toks.slice(stop));
  }
  const isSizeUnit = t => plain(t) && /^(mm|mil|mils|millimet(re|er)s?)$/.test(t.n);
  function glued(A, tok) { // "100 283": dictation wrote "to 83" as 283
    const s = String(tok.v); if (!/^2\d\d+$/.test(s) || !(tok.v > 400 || A < 200)) return null;
    const rest = +s.slice(1); return rest === A ? null : rest;
  }

  function parseLayer(toks, lead) {
    const a = { type: "layer", mode: "current", attrs: {}, unknown: [] };
    let i = 0;
    const fillTo = j => { while (plain(toks[j]) && FILL.has(toks[j].n) && !isTo(toks[j])) j++; return j; };
    const cmAt = j => { while (plain(toks[j]) && /^(cm|centimet(re|er)s?|down|up)$/.test(toks[j].n)) j++; return j; };
    const bound = j => isNum(toks[j]) && toks[j].v >= 0 ? toks[j].v : plain(toks[j]) && toks[j].n === "surface" ? "surface" : plain(toks[j]) && toks[j].n === "ground" ? "ground" : null;
    // "layer depth 30 to 50": a depth or a height said outright, whichever way the page is set
    for (let j = 0; plain(toks[j]) && FILL.has(toks[j].n) && !isTo(toks[j]); j++) {
      if (/^(depth|deep)$/.test(toks[j].n)) a.from = "surface"; else if (toks[j].n === "high" || toks[j].n === "tall") a.from = "ground";
    }
    i = fillTo(i);
    if (lead === "edit" || lead === "dellayer") {
      if (isNum(toks[i])) { a.mode = "index"; a.index = toks[i].v; i++; }
      if (lead === "dellayer") return { type: "dellayer", index: a.index };
    } else if (isTo(toks[i]) && bound(fillTo(i + 1)) != null) { const k = fillTo(i + 1); a.mode = "to"; a.b = bound(k); i = k + 1; }
    else if (bound(i) != null) {
      const A = bound(i), numA = typeof A === "number", j = cmAt(i + 1), k = isTo(toks[j]) ? fillTo(j + 1) : -1; let g;
      if (k >= 0 && bound(k) != null) { a.mode = "range"; a.a = A; a.b = bound(k); i = k + 1; }
      else if (!numA) { /* "surface" with no range after it: left as heard */ }
      else if (isNum(toks[j]) && toks[j].v === 2 && isNum(toks[j + 1]) && toks[j + 1].v !== A && !isSizeUnit(toks[j + 2])) {
        a.mode = "range"; a.a = A; a.b = toks[j + 1].v; i = j + 2; // "0 2 35": dictation wrote "to" as 2
      } else if (isNum(toks[j]) && !isSizeUnit(toks[j + 1]) && (g = glued(A, toks[j])) != null) {
        a.mode = "range"; a.a = A; a.b = g; i = j + 1; a.heard = [[toks[j].r, "to " + g]]; a.unsure = true;
      } else if (lead !== "pre" && isNum(toks[j]) && toks[j].v !== A && (toks[j].v === 0 || toks[j].v > 10) && !isSizeUnit(toks[j + 1])) {
        a.mode = "range"; a.a = A; a.b = toks[j].v; i = j + 1; // "layer 100 83": the "to" was dropped
      } else if (plain(toks[j]) && /^(thick|thickness)$/.test(toks[j].n)) { a.mode = "thick"; a.b = A; i = j + 1; }
      else if (isSizeUnit(toks[j])) { /* a size, not a depth */ }
      else if (lead === "pre" && !(A > 10 || A === 0)) { /* a grain size said first */ }
      else { a.mode = "to"; a.b = A; i = j; }
    }
    if (a.mode !== "range" && a.mode !== "to") delete a.from;
    const hards = [], grains = [], sizes = [];
    for (; i < toks.length; i++) {
      const t = toks[i], nx = toks[i + 1];
      const mod = () => { if (plain(nx) && /^(plus|\+|minus|-)$/.test(nx.n)) { i++; return /plus|\+/.test(nx.n) ? "+" : "-"; } return ""; };
      if (t.k === "hard") { const m = t.mod || mod(); hards.push(t.v === "I" ? "I" : t.v + m); }
      else if (plain(t) && /^[fpk]$/.test(t.n)) hards.push(t.n.toUpperCase() + mod()); // the code letters F, P and K
      else if (t.k === "grain") grains.push(t.v);
      else if (t.k === "wet") a.attrs.wet = t.v;
      else if (t.k === "concern") a.attrs.concern = true;
      else if (t.k === "lead" && (t.v === "note" || t.v === "lnote")) {
        const rest = toks.slice(i + 1); if (rest.some(x => x.k === "concern")) a.attrs.concern = true;
        a.attrs.note = rawOf(rest.filter(x => x.k !== "concern")); break;
      }
      else if (t.k === "num") {
        const prev = toks[i - 1];
        if (plain(prev) && prev.n === "density") a.attrs.density = t.v;
        else if (plain(nx) && /^(kg|kilograms?|kilos?)$/.test(nx.n)) { a.attrs.density = t.v; i++; }
        else if (plain(prev) && /^(max|maximum)$/.test(prev.n)) sizes.push({ v: t.v, max: true });
        else sizes.push({ v: t.v });
      } else if (plain(t) && (FILL.has(t.n) || /^(density|max|maximum|kg|per|cubic|metre|meter)$/.test(t.n))) { /* filler */ }
      else a.unknown.push(t.r || t.n);
    }
    if (hards[0]) a.attrs.hardTop = hards[0];
    if (hards[1]) a.attrs.hardBot = hards[1];
    if (grains[0]) a.attrs.grain = grains[0];
    if (grains[1]) a.attrs.grain2 = grains[1];
    const ok = sizes.filter(s => s.v > 0 && s.v <= 60);
    sizes.filter(s => !(s.v > 0 && s.v <= 60)).forEach(s => a.unknown.push(String(s.v)));
    if (ok.length === 1) a.attrs.size = ok[0].v;
    else if (ok.length >= 2) {
      a.attrs.size = Math.min(ok[0].v, ok[1].v); a.attrs.sizeMax = Math.max(ok[0].v, ok[1].v);
      ok.slice(2).forEach(s => a.unknown.push(String(s.v)));
    }
    return heardIn(a, toks);
  }

  // The words of a statement that nothing used ("wind calm the dog"): said back as not understood, never dropped.
  // re: plain words this kind of statement expects; kinds: the kinds of term it takes.
  function leftover(toks, re, kinds) {
    const ok = t => t.k === "num" || (!!t.k && kinds.indexOf(t.k) >= 0) || (plain(t) && (FILL.has(t.n) || LINK.has(t.n) || isMinus(t) || PLUS.has(t.n) || re.test(t.n)));
    const runs = []; let run = null;
    toks.forEach((t, i) => {
      if (!ok(t)) {
        if (!run) { let b = i; while (b > 0 && plain(toks[b - 1]) && LINK.has(toks[b - 1].n)) b--; run = toks.slice(b, i); runs.push(run); }
        run.push(t);
      } else if (run && plain(t) && (FILL.has(t.n) || LINK.has(t.n))) run.push(t);
      else run = null;
    });
    return runs.map(r => { while (r.length && ok(r[r.length - 1])) r.pop(); return { type: "unknown", text: rawOf(r) }; }).filter(a => a.text);
  }
  const SPARE = {
    num: /^(feet|foot|ft|asl|sea|level|\+)$/,
    aspect: /^([nsew]{1,3}|facing|faces|aspect)$/,
    sky: /^(partly|mostly|clouds?|cloudy|cover|skies|sky|clear|clr|sunny|few|scattered|sct|broken|bkn|overcast|ovc|obscured|fog|foggy|whiteout)$/,
    wind: /^(gusting|gusts?|gusty|speed|direction|winds?|calm|light|moderate|strong|extreme|variable|none|nil|no|nothing|[clmsxnew])$/,
    precip: /^(snow\w*|rain\w*|light\w*|moderate\w*|heav\w+|very|flurries|mixed|freezing|drizzle|showers?|rate|type|s|as|s-?\d+|r[vlmhs]|zr|g|none|nil|no|nothing|precipitation|precip)$/,
    blow: /^(none|nil|no|nothing|prev\w*|light|moderate|intense|strong|heavy|unknown|blowing)$/,
    temp: /^(snow|air|temperatures?|temps?|surface|ground|height)$/
  };
  const SPARE_OF = { aspect: ["aspect", ["dir"]], sky: ["sky", []], wind: ["wind", ["dir"]], blow: ["blow", ["dir"]], precip: ["precip", ["grain"]], snowing: ["precip", ["grain"]], raining: ["precip", ["grain"]] };
  "elev slope hs air tmax tmin hn24 hst foot ski".split(" ").forEach(k => { SPARE_OF[k] = ["num", []]; });

  function signedNums(toks) {
    const out = []; let neg = false, pos = false;
    toks.forEach(t => {
      if (isMinus(t) || (t.dash && !t.k)) neg = true;
      else if (plain(t) && PLUS.has(t.n)) pos = true;
      else if (isNum(t)) { out.push({ v: neg ? -Math.abs(t.v) : t.v, signed: neg || pos || t.v < 0 }); neg = pos = false; }
    });
    return out;
  }

  function parseTemps(toks, lead, said) {
    const ns = signedNums(toks), acts = [], txt = " " + textOf(toks) + " ";
    // "at depth 20", "20 down": below the surface. "20 up": above the ground. Otherwise the way the page is set.
    const from = / (depth|deep|down) /.test(txt) ? "surface" : / (up|high) /.test(txt) ? "ground" : "";
    const reading = (d, t) => { const a = { type: "temp", depth: d, t }; if (from) a.from = from; return a; };
    if (lead === "tsurf") return ns.length ? [{ type: "temp", depth: 0, from: "surface", t: -Math.abs(ns[0].v) }] : [{ type: "unknown", text: said, hint: "Say the temperature after it: \u201csurface temperature minus 9\u201d." }];
    if (ns.length === 1 && ns[0].signed) return [{ type: "set", key: "wx.air", value: ns[0].v }]; // one temperature and no depth: the air
    if (ns.length < 2) return [{ type: "unknown", text: said, hint: "Say the depth, then the temperature: \u201ctemperature 20 minus 3.5\u201d." }];
    for (let i = 0; i + 1 < ns.length; i += 2) {
      let d = ns[i].v, T = ns[i + 1].v;
      if (d < 0 && T >= 0) { const s = d; d = T; T = s; }
      acts.push(reading(Math.abs(d), -Math.abs(T)));
    }
    if (ns.length % 2) acts.push({ type: "unknown", text: String(ns[ns.length - 1].v), hint: "A temperature reading needs a depth and a temperature." });
    leftover(toks, SPARE.temp, []).forEach(a => acts.push(a));
    return acts;
  }

  const NUM = "(\\d+(?:\\.\\d+)?)", CM = "(?: (?:cm|centimet\\w+))?";
  const POS = [ // where a test failed, said outright as a depth or a height, or the way the page is set
    [new RegExp(` (?:down|depth|deep)(?: (?:to|is|of|at|the|a|from|surface))* ${NUM}(?= )`), "surface"],
    [new RegExp(` (?:up|height|high)(?: (?:to|is|of|at|the|a|from|ground))* ${NUM}(?= )`), "ground"],
    [new RegExp(` ${NUM}${CM} (?:down|deep|depth|below the surface|below surface|from the surface|from surface)(?= )`), "surface", true],
    [new RegExp(` ${NUM}${CM} (?:up|high|above the ground|above ground|from the ground|from ground)(?= )`), "ground", true],
    [new RegExp(` (?:at|@|below|above|height)(?: (?:to|is|of|a))? ${NUM}(?= )`), ""],
    [new RegExp(` on ${NUM}(?= )`), ""]
  ];

  function parseTest(toks, lead) {
    const a = { type: "test", test: lead.toUpperCase(), unknown: [] };
    const ni = toks.findIndex(t => t.k === "lead" && (t.v === "note" || t.v === "lnote"));
    if (ni >= 0) { a.note = rawOf(toks.slice(ni + 1)); toks = toks.slice(0, ni); }
    toks = ctxFix("test", toks);
    let s = " " + textOf(toks) + " ";
    const take = re => { const m = re.exec(s); if (m) s = s.replace(m[0], " "); return m; };
    let m;
    const g = toks.find(t => t.k === "grain"); if (g) { a.onGrain = g.v; s = s.replace(/ g:\w+/g, " "); }
    if (lead === "pst") {
      if ((m = take(/ (\d+)\s*(?:\/|of|over|out of)\s*(\d+)(?= )/)) || (m = take(/ (\d+)\/(\d+)(?= )/))) { a.cut = +m[1]; a.col = +m[2]; }
      if (take(/ (to )?end(?= )/)) a.res = "End"; else if (take(/ (self )?arr(est|ested)?(?= )/)) a.res = "Arr"; else if (take(/ (slab fracture|sf)(?= )/)) a.res = "SF";
    }
    if (take(/ sudden planar(?= )| sp(?= )| pops?(?= )/)) a.char = "SP";
    else if (take(/ sudden collapse(?= )| sc(?= )| drops?(?= )/)) a.char = "SC";
    else if (take(/ resistant planar(?= )| rp(?= )/)) a.char = "RP";
    else if (take(/ progressive compression(?= )| pc(?= )/)) a.char = "PC";
    else if (take(/ non planar break(?= )| break(?= )| brk(?= )| bk(?= )/)) a.char = "BRK";
    if ((m = take(/ (?:q|quality|shear quality) ?([123])(?= )/))) a.q = "Q" + m[1];
    if (lead === "rb") {
      if (take(/ whole block(?= )| wb(?= )/)) a.rel = "WB"; else if (take(/ most of (the )?block(?= )| mb(?= )/)) a.rel = "MB"; else if (take(/ edge( of (the )?block| only)?(?= )| eb(?= )/)) a.rel = "EB";
    }
    if (lead === "ect") {
      if (take(/ (no propagation|does ?not propagate|doesnt propagate|did ?not propagate|not propagat\w*|no prop|initiat\w+ only)(?= )/) || take(/^ n(?= |\d)/)) a.prop = "N";
      else if (take(/ (on isolation|during isolation|while isolating)(?= )/) || take(/^ pv(?= )/)) a.prop = "PV";
      else if (take(/ (full propagation|propagat\w+)(?= )/) || take(/^ p(?= |\d)/)) a.prop = "P";
      else if (take(/ (no fracture|no result|no failure|nil|none)(?= )/) || take(/^ x(?= )/)) a.prop = "X";
    } else if (lead === "ct" || lead === "dt" || lead === "st") {
      if (take(/ (no fracture|no result|no failure|no shear|nil|none|negative|did not fail)(?= )/) || take(/^ n(?= )/)) a.none = true;
      else if (lead === "st" && (take(/ collapse(?= )/) || take(/^ c(?= )/))) a.band = "C";
      else if (lead !== "dt" && (take(/ very easy(?= )/) || take(/^ v(?= )/))) a.band = "V";
      else if (take(/ easy(?= )/) || take(/^ e(?= )/)) a.band = "E";
      else if (take(/ moderate(?= )/) || take(/^ m(?= )/)) a.band = "M";
      else if (take(/ hard(?= )/) || take(/^ h(?= )/)) a.band = "H";
    }
    const count = () => (s.match(/ \d+(?:\.\d+)?(?= )/g) || []).length;
    const score = lead !== "pst" && lead !== "st", needScore = score && !a.none && !a.band && !(lead === "ect" && (a.prop === "PV" || a.prop === "X"));
    for (const [re, from, after] of POS) {
      if (after && count() <= (needScore ? 1 : 0)) continue; // "CT 21 down": that number is the score
      if ((m = take(re))) { a.depth = +m[1]; if (from) a.from = from; break; }
    }
    const nums = (s.match(/ -?\d+(?:\.\d+)?(?= )/g) || []).map(Number);
    s = s.replace(/ -?\d+(?:\.\d+)?(?= )/g, " ");
    if (score && nums.length) a.score = nums.shift();
    if (a.depth == null && nums.length) a.depth = nums.shift();
    nums.forEach(n => a.unknown.push(String(n)));
    s.trim().split(/\s+/).filter(w => w && !FILL.has(w) && !/^(tests?|taps?|score|results?|fracture|character|release|type|cut|column|the|surface|ground|below|above|height)$/.test(w))
      .forEach(w => a.unknown.push(w.replace(/^[a-z]:/, "")));
    return heardIn(a, toks);
  }

  // "down 30", "depth 30", "at 30" on their own: where the test just said failed (or, for "depth 150" with no test waiting, the snow depth)
  function placeOf(toks) {
    const ws = toks.filter(t => !(plain(t) && /^(cm|centimet(re|er)s?|the|is|of|a|to|its|it|from|surface|ground|and|then|okay|ok|um|uh|that|was)$/.test(t.n)));
    if (ws.length !== 2) return null;
    const word = plain(ws[0]) ? ws[0] : plain(ws[1]) ? ws[1] : null, n = isNum(ws[0]) ? ws[0] : isNum(ws[1]) ? ws[1] : null;
    if (!word || !n || n.v < 0) return null;
    const mis = DEPTHISH.has(word.n) && word.n !== "depth", w = mis ? "depth" : word.n, first = word === ws[0];
    const from = /^(down|depth|deep|below)$/.test(w) ? "surface" : /^(up|height|above|high)$/.test(w) ? "ground" : /^(at|@|on)$/.test(w) && first ? "" : null;
    if (from === null) return null;
    const a = { type: "place", depth: n.v, text: rawOf(toks) };
    if (from) a.from = from;
    if (w === "depth" && first) a.hs = true;
    if (mis) a.heard = [[word.r, "depth"]];
    return a;
  }

  function compass(deg) { return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((deg % 360) + 360) % 360) / 45) % 8]; }
  function dirOf(toks) {
    const d = toks.find(t => t.k === "dir"); if (d) return d.v;
    const l = toks.find(t => plain(t) && /^[nsew]{1,3}$/.test(t.n) && !t.spd); return l ? l.n.toUpperCase() : "";
  }
  const set = (key, value, extra) => Object.assign({ type: "set", key, value }, extra || {});

  function parseField(lead, toks, said) {
    if (has(CTX, lead === "snowing" || lead === "raining" ? "precip" : lead)) toks = ctxFix(lead === "snowing" || lead === "raining" ? "precip" : lead, toks);
    const ns = signedNums(toks), txt = " " + textOf(toks) + " ", raw = rawOf(toks);
    const need = hint => [{ type: "unknown", text: said, hint: hint || "" }];
    const one = (key, abs, hint) => (ns.length ? [set(key, abs ? Math.abs(ns[0].v) : ns[0].v)] : need(hint || "Say the number after it."));
    let out;
    switch (lead) {
      case "location": out = raw ? [set("site.location", title(raw))] : need(); break;
      case "observer": out = raw ? [set("site.observer", title(raw))] : need(); break;
      case "org": out = raw ? [set("site.org", title(raw))] : need(); break;
      case "name": out = raw ? [set("name", cap(raw))] : need(); break;
      case "aspect": { const d = dirOf(toks) || (ns.length ? compass(ns[0].v) : ""); out = d ? [set("site.aspect", d)] : need("Say the direction after it: \u201caspect north east\u201d."); break; }
      case "elev": {
        if (!ns.length) { out = need("Say the number after it: \u201celevation 2080 metres\u201d."); break; }
        let v = ns[0].v; if (ns.length > 1 && v >= 10 && v < 100 && ns[1].v < 100) v = v * 100 + ns[1].v; // "twenty-two thirty"
        const unit = / (feet|foot|ft) /.test(txt) ? "ft" : / (metres|meters|metre|meter|m) /.test(txt) ? "m" : null;
        out = [set("site.elev", v)]; if (unit) out.unshift(set("site.elevUnit", unit, { quiet: true })); break;
      }
      case "slope": out = one("site.slope"); break;
      case "hs": out = one("surf.hs", true, "Say the number after it: \u201csnow depth 150\u201d."); break;
      case "air": out = one("wx.air"); break;
      case "tmax": out = one("wx.tmax"); break;
      case "tmin": out = one("wx.tmin"); break;
      case "hn24": out = one("wx.hn24", true); break;
      case "hst": out = one("wx.hst", true); break;
      case "foot": out = one("surf.foot", true); break;
      case "ski": out = one("surf.ski", true); break;
      case "sky": {
        const w = toks.find(t => plain(t) && has(SKY, t.n));
        const v = / partly cloudy /.test(txt) ? "SCT" : / mostly cloudy /.test(txt) ? "BKN" : w ? SKY[w.n] : "";
        out = v ? [set("wx.sky", v)] : need("Say clear, few, scattered, broken, overcast or obscured."); break;
      }
      case "precip": case "snowing": case "raining": {
        let v = "", m; const t2 = txt.replace(/ as (?=(minus |- ?)?-?\d)/, " s "); // "as one": the phone wrote S as "as"
        const I = / very light/.test(txt) || / flurries /.test(txt) ? 0 : / very heavy/.test(txt) ? 4 : / light/.test(txt) ? 1 : / moderate/.test(txt) ? 2 : / heavy/.test(txt) ? 3 : -1;
        const rate = / (cm|centimet\w+) /.test(txt) || / (an|per) hour /.test(txt);
        if ((m = / (s-?\d+|r[vlmhs]|zr|g) /.exec(txt))) v = m[1].toUpperCase();
        else if ((m = / s (minus |- ?)?(-?\d+) /.exec(t2))) v = "S" + (m[1] || +m[2] < 0 ? "-" : "") + Math.abs(+m[2]);
        else if (/ freezing rain /.test(txt)) v = "ZR";
        else if (/ (mixed|rain and snow|snow and rain) /.test(txt)) v = "RS";
        else if (toks.some(t => t.k === "grain" && /^PP(gp|hl)$/.test(t.v))) v = "G";
        else if (lead === "raining" || / (rain|drizzle)/.test(txt)) v = ["RV", "RL", "RM", "RH", "RH"][I < 0 ? (/ drizzle/.test(txt) ? 0 : 1) : I];
        else if (ns.length && (rate || I < 0) && !/ (none|nil|no|nothing) /.test(txt)) v = "S" + (ns[0].v < 0 || (ns[0].v > 0 && ns[0].v < 1) ? "-1" : Math.abs(Math.round(ns[0].v)));
        else if (lead === "snowing" || / snow/.test(txt) || / flurries /.test(txt) || I >= 0) v = ["S-1", "S1", "S2", "S5", "S10"][I < 0 ? 1 : I];
        else if (/ (none|nil|no|nothing) /.test(txt)) v = "NIL";
        out = v ? [set("wx.precip", v)] : need("Say nil, or the rate: \u201cprecip S2\u201d, \u201clight rain\u201d.");
        if (t2 !== txt && v) { out[0].heard = [["as", "S"]]; }
        break;
      }
      case "wind": {
        // code letters: "wind L SW". A lone S is south unless a direction is there too.
        const letters = toks.filter(t => plain(t) && /^[clmsxnew]$/.test(t.n)), hasDir = toks.some(t => t.k === "dir");
        const word = toks.find(t => plain(t) && has(WINDSPD, t.n)); let spd = word ? WINDSPD[word.n] : "";
        if (!spd && letters.length) {
          const L = letters[0];
          if (/^[clmx]$/.test(L.n) || (L.n === "s" && (hasDir || letters.length > 1))) { spd = L.n.toUpperCase(); L.spd = true; }
        }
        out = [];
        if (!spd && ns.length) { const k = Math.abs(ns[0].v); spd = k < 1 ? "C" : k <= 25 ? "L" : k <= 40 ? "M" : k <= 60 ? "S" : "X"; out.push(set("wx.windKmh", k, { quiet: true })); }
        if (!spd && / (none|nil|no|nothing) /.test(txt)) spd = "C";
        const rest = letters.filter(t => !t.spd && /^[nsew]$/.test(t.n)).map(t => t.n).join("");
        const d = dirOf(toks.filter(t => t.k === "dir")) || (/^(n|s|e|w|ne|nw|se|sw|nne|ene|ese|sse|ssw|wsw|wnw|nnw)$/.test(rest) ? rest.toUpperCase() : "");
        if (!spd && !d) { out = need("Say the speed and where it blows from: \u201cwind light south west\u201d."); break; }
        if (spd) out.unshift(set("wx.windSpd", spd)); if (d) out.push(set("wx.windDir", d));
        break;
      }
      case "blow": {
        const v = / (none|nil|no|nothing) /.test(txt) ? "NIL" : / prev/.test(txt) ? "Prev" : / light /.test(txt) ? "L" : / moderate /.test(txt) ? "M" : / (intense|strong|heavy) /.test(txt) ? "I" : / unknown /.test(txt) ? "U" : "";
        const d = dirOf(toks); if (!v && !d) { out = need("Say none, previous, light, moderate or intense."); break; }
        out = []; if (v) out.push(set("wx.blow", v)); if (d) out.push(set("wx.blowDir", d)); break;
      }
      case "surf": {
        const g = toks.find(t => t.k === "grain"); out = [];
        if (g) out.push(set("surf.grain", g.v)); if (ns.length) out.push(set("surf.size", Math.abs(ns[0].v)));
        if (!out.length) out = need(); break;
      }
      case "avs": out = raw ? [{ type: "text", key: "avs", text: NONE1.test(raw.toLowerCase()) ? "None observed" : raw }] : need(); break;
      case "note": out = raw ? [{ type: "text", key: "notes", text: raw }] : need(); break;
      case "lnote": out = raw ? [{ type: "layer", mode: "current", attrs: { note: raw }, unknown: [] }] : need(); break;
      case "undo": out = [{ type: "undo" }]; break;
      default: out = need();
    }
    const shown = out.find(x => !x.quiet) || out[0];
    if (shown && !FREE.test(lead) && !NAMEY.test(lead) && lead !== "lnote") heardIn(shown, toks);
    if (has(SPARE_OF, lead) && out[0].type !== "unknown") leftover(toks, SPARE[SPARE_OF[lead][0]], SPARE_OF[lead][1]).forEach(a => out.push(a));
    return out;
  }

  // words with no lead: where a test failed, more about the layer just said, or not understood
  function loose(toks) {
    const p = placeOf(toks); if (p) return [p];
    const fixed = layerFix(toks), sized = fixed.some(isNum) && fixed.some(isSizeUnit), terms = fixed.filter(t => t.k === "hard" || t.k === "grain" || t.k === "wet" || t.k === "concern" || (plain(t) && /^[fpk]$/.test(t.n)));
    if (terms.some(t => !t.h) || sized) { // "fist rounds", "half a millimetre"
      const a = parseLayer(fixed, "pre");
      if (a.unknown.length <= terms.length) return [a]; // mostly understood: it describes the layer just said
    }
    return rawOf(toks.filter(t => t.k || !FILL.has(t.n))) ? [{ type: "unknown", text: rawOf(toks) }] : [];
  }

  /* ---------- entry point ---------- */
  const tokens = text => numbers(phrases(joinLetters(repair(tokenize(text)))));
  // The actions for what was said. The array also carries "tail": the last words when they are a statement still waiting for
  // its value ("snow depth", "temperature 90"), and "tailCount", how many of the actions came from those words.
  function parse(text) {
    const segs = segment(tokens(text)), actions = []; let tail = "", tailCount = 0;
    segs.forEach((seg, si) => {
      const lead = seg.lead ? seg.lead.v : null, said = rawOf((seg.lead ? [seg.lead] : []).concat(seg.toks));
      let out;
      if (!lead) out = loose(seg.toks);
      else if (LAYERISH.test(lead)) out = [parseLayer(layerFix(seg.toks), lead)];
      else if (lead === "temp" || lead === "tsurf") out = parseTemps(seg.toks, lead, said);
      else if (TESTISH.test(lead)) out = [parseTest(seg.toks, lead)];
      else out = parseField(lead, seg.toks, said);
      if (lead && out[0]) heardIn(out.find(x => !x.quiet) || out[0], [seg.lead], true);
      const last = seg.toks[seg.toks.length - 1];
      if (si === segs.length - 1 && lead && out.length && (out.every(a => a.type === "unknown") || isTo(last))) { tail = said; tailCount = out.length; }
      out.forEach(a => actions.push(a));
    });
    actions.tail = tail; actions.tailCount = tailCount;
    return actions;
  }

  // How well a sentence reads: words not understood, closest-match guesses, known mishearings. Fewer is better.
  function quality(text) {
    let unknown = 0, unsure = 0, sure = 0; const count = s => String(s).split(/\s+/).filter(Boolean).length;
    parse(text).forEach(a => {
      if (a.type === "unknown") unknown += count(a.text); else (a.unknown || []).forEach(u => { unknown += count(u); });
      (a.heard || []).forEach(() => { if (a.unsure) unsure++; else sure++; });
    });
    return [unknown, unsure, sure];
  }
  // Of the versions a recogniser offers for one sentence, the one that reads best; the recogniser's own order breaks a tie.
  function best(list) {
    let pick = 0, q = null;
    list.forEach((text, i) => { const x = quality(text); if (!q || x[0] < q[0] || (x[0] === q[0] && (x[1] < q[1] || (x[1] === q[1] && x[2] < q[2])))) { q = x; pick = i; } });
    return pick;
  }
  // the spoken terms, for a recogniser that can be told which words to expect
  const terms = () => Array.from(new Set(PHRASES.filter(p => !p[3] && p[1] !== "dir" && p[0].join("").length >= 4 && !/\d/.test(p[0].join(""))).map(p => p[0].join(" "))));

  return { parse, tokenize, compass, quality, best, sound, closest, terms, _tokens: tokens };
});
