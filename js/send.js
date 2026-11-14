/* Snowpack Translator: send a finished profile to the Banff Snowpack app. This is the only link between the two apps.

   A profile goes to the snowpack site's own observation upload (its Netlify form "observation-upload"), the same
   drop-in a person uses on that site. Its daily update files each upload under profiles/ and reads it.

   Phones in the field have no signal, so "Send" puts the profile in an outbox kept on the phone (localStorage) and
   tries at once. Whatever is left is retried when the phone comes back online and each time the app is opened.
   A cross-site upload cannot read the reply (no-cors), so "sent" means the upload reached the snowpack site. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SnowSend = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // /api/* is outside the snowpack site's access check (Canada only, Parks password), as other apps call it.
  // Netlify Forms takes a submission posted to any path of the site.
  const ENDPOINT = "https://banff-snowpack.netlify.app/api/translator-upload";
  const FORM = "observation-upload";
  const KEY = "snowpack-translator-outbox";
  const SITES = [
    { id: "goats_eye", label: "Goat's Eye", match: /goat/i },
    { id: "simpson", label: "Simpson", match: /simpson/i },
    { id: "bow_summit", label: "Bow Summit", match: /bow\s*summit/i },
    { id: "other", label: "Somewhere else", match: null },
  ];

  /** The snowpack site's study plot for a location as typed or spoken; anything else is "other". */
  function guessSite(location) {
    const hit = SITES.find((s) => s.match && s.match.test(String(location || "")));
    return hit ? hit.id : "other";
  }

  /** The form fields for one profile, as the snowpack upload form names them. */
  function fields(item) {
    const notes = [item.site === "other" && item.location ? "Location: " + item.location : "", item.notes || "",
      "Sent from the Snowpack Translator (" + (item.source || "app") + ")."].filter(Boolean).join(" ");
    return { "form-name": FORM, "bot-field": "", site: item.site || "other",
      observed_date: String(item.date || "").slice(0, 10), notes: notes.slice(0, 1000) };
  }

  function makeStore(storage) {
    const read = () => { try { return JSON.parse(storage.getItem(KEY) || "[]"); } catch (e) { return []; } };
    const write = (list) => { try { storage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } };
    return { read, write };
  }

  /**
   * An outbox. `post(item)` must resolve once the upload reached the server and reject when it did not (no network).
   * In the browser it is `browserPost`; tests pass their own.
   */
  function outbox({ storage, post, onChange } = {}) {
    const store = makeStore(storage);
    let busy = null;
    const changed = () => { if (onChange) onChange(store.read()); };

    /** Add a profile: {filename, xml, site, location, date, notes, source}. Replaces an unsent copy of the same pit. */
    function add(item) {
      const list = store.read().filter((x) => !(item.pitId && x.pitId === item.pitId));
      list.push(Object.assign({ key: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), queued: new Date().toISOString(), tries: 0 }, item));
      if (!store.write(list)) throw new Error("The phone's storage is full, so the profile could not be kept for sending.");
      changed();
      return flush();
    }

    /** Send what is waiting, oldest first; stops at the first failure (still offline). Resolves to {sent, left}. */
    function flush() {
      if (busy) return busy;
      busy = (async () => {
        let sent = 0;
        for (;;) {
          const list = store.read();
          if (!list.length) break;
          const item = list[0];
          try { await post(item); } catch (e) {
            item.tries = (item.tries || 0) + 1; item.lastError = String((e && e.message) || e); store.write(list); break;
          }
          store.write(store.read().filter((x) => x.key !== item.key));
          sent++;
        }
        const left = store.read().length;
        busy = null; changed();
        return { sent, left };
      })();
      return busy;
    }

    return { add, flush, pending: () => store.read() };
  }

  /** The browser upload: multipart form, cross-site, reply unread. Rejects only when nothing reached the server. */
  function browserPost(item, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
    const body = new FormData();
    Object.entries(fields(item)).forEach(([k, v]) => body.append(k, v));
    body.append("file", new Blob([item.xml], { type: "application/xml" }), item.filename || "profile.caaml.xml");
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    return fetchImpl(ENDPOINT, { method: "POST", mode: "no-cors", body, signal: ctl ? ctl.signal : undefined })
      .finally(() => { if (timer) clearTimeout(timer); });
  }

  /** The app's outbox: retries when the phone comes back online and when the page opens. */
  function start(onChange) {
    const box = outbox({ storage: localStorage, post: (i) => browserPost(i), onChange });
    addEventListener("online", () => box.flush());
    if (navigator.onLine !== false) setTimeout(() => box.flush(), 1500);
    return box;
  }

  return { ENDPOINT, FORM, SITES, guessSite, fields, outbox, browserPost, start };
});
