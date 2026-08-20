/* ══════════════════════════════════════════════════════════════════════════
   THE DOOR — page guard

   Loaded from the <head> of every gated page, above everything else and
   without defer, so it decides before the browser paints a single row of
   the page it is protecting.

   It makes no network calls. The code was checked once at enter.html; all
   this does is look for the record that check left behind, so gated pages
   stay as fast as they were before the door existed.

   Storage contract is shared with gate.js. Change one, change both.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var UNLOCK_KEY = "apshabd-access";
  var RETURN_KEY = "apshabd-access-return";
  var UNLOCK_VERSION = 1;
  var GATE = "enter.html";

  /* Relative, so the site keeps working from a GitHub Pages project subpath
     the same way it does from a domain root. */
  function currentPage() {
    var last = window.location.pathname.split("/").pop();
    return last || "index.html";
  }

  /* Never guard the door itself — that is a redirect loop. */
  if (currentPage().toLowerCase() === GATE) return;

  var raw;
  try {
    raw = window.localStorage.getItem(UNLOCK_KEY);
  } catch (error) {
    /* Storage is unreachable — private modes and blocked-cookie setups both
       throw here. Fail open: a door that traps paying customers is a worse
       outcome than one that occasionally lets a stranger past. */
    return;
  }

  var granted = false;
  if (raw) {
    try {
      var record = JSON.parse(raw);
      granted = !!record
        && record.v === UNLOCK_VERSION
        && typeof record.code === "string"
        && record.code.replace(/[^A-Za-z0-9]/g, "").length === 14;
    } catch (error) {
      granted = false;
    }
  }

  if (granted) return;

  /* Remember where they were headed so the door can hand them back to it.
     gate.js validates this against its own list of site pages before acting
     on it, so a tampered value cannot redirect anyone off-site. */
  try {
    window.sessionStorage.setItem(RETURN_KEY, currentPage());
  } catch (error) {
    /* Not being able to remember the destination just means they land on
       the front page instead. Not worth blocking the redirect over. */
  }

  /* The stylesheet has not applied yet at this point, so without this the
     browser can flash a frame of unstyled content before the navigation
     takes hold. */
  document.documentElement.style.visibility = "hidden";

  /* replace(), not assign(), so Back does not bounce them straight into the
     guard again. */
  window.location.replace(GATE);
})();
