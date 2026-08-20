/* ══════════════════════════════════════════════════════════════════════════
   THE DOOR — access code check (enter.html only)

   Reads a code, asks the Apps Script web app whether it exists in the
   Registrations sheet, and on a yes writes the unlock record that
   gate-guard.js reads on every other page.

   Honest about what this is: a velvet rope, not a lock. Everything here runs
   in the visitor's browser, so anyone willing to open devtools can write the
   unlock record by hand. It filters the ninety-nine percent who will not.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Configuration ──────────────────────────────────────────────────────
     The deployed Apps Script web app. Must end in /exec, not /dev, and must
     be the same deployment the pre-registration form posts to — that is the
     script holding the Registrations sheet.

     Re-deploying: Apps Script keeps this URL only if you edit the EXISTING
     deployment and publish a new version. Creating a fresh deployment mints
     a new URL, which has to be pasted back in here. */
  var ENDPOINT = "https://script.google.com/macros/s/AKfycby_oxg0hFLDaW_7pxoqwBLDvqbkmUPZ5wMsNWXocKULssePGDh7hG6_Rsb2hRP4djcBew/exec";

  var REQUEST_TIMEOUT_MS = 12000;

  /* ── Local test code ────────────────────────────────────────────────────
     Opens the door on a dev server without the sheet being involved at all,
     so the whole flow can be exercised before the Apps Script has the verify
     action deployed.

     Safe to leave in. The hostname check means it is dead code the moment
     the site is served from a real domain, the same way the pre-registration
     form already gates its own preview branch. It also short-circuits only
     for this exact code — every other code on localhost still goes to the
     live endpoint, so the real integration stays testable from here.

     The letters E and O are not in the code alphabet the registration form
     draws from, so this string can never collide with a genuine code. */
  var PREVIEW_CODE = "APS-TST-TEST-CODE";

  /* The same idea for the lost-code form. .test is a reserved TLD that can
     never resolve, so this address cannot belong to anyone. Any other address
     typed on localhost still goes to the live endpoint — which does mean a
     registered one will receive a real email, so use this when you only want
     to see the interface move. */
  var PREVIEW_RECOVERY_EMAIL = "preview@apshabd.test";

  var PREVIEW_HOSTS = ["localhost", "127.0.0.1", "::1", ""];

  function onPreviewHost() {
    return PREVIEW_HOSTS.indexOf(window.location.hostname) !== -1;
  }

  /* Storage contract, shared with gate-guard.js. Change one, change both. */
  var UNLOCK_KEY = "apshabd-access";
  var RETURN_KEY = "apshabd-access-return";
  var UNLOCK_VERSION = 1;

  /* Where a visitor may be sent after unlocking. The guard writes the page
     it bounced them from into sessionStorage; this list is what makes
     reading that value back safe, since anything not named here falls
     through to the front page. */
  var SITE_PAGES = [
    "index.html", "bangalore.html", "chennai.html", "delhi.html",
    "hyderabad.html", "kolkata.html", "mumbai.html", "pune.html",
    "drop-a-pin.html"
  ];
  var HOME = "index.html";

  /* Codes are APS + a three-letter city token + two four-character blocks,
     drawn from the confusable-free alphabet in the pre-registration form. */
  var CODE_LENGTH = 14;

  /* ── Copy ───────────────────────────────────────────────────────────────
     Refusals escalate with each wrong try, then hold on the last one. Dry,
     not mean: the joke is always about the situation, never about the
     person standing at the door. */
  var REFUSALS = [
    "Not it. Check the email — yes, the one you archived.",
    "Still no. Fourteen characters, three dashes, reads like a boarding pass.",
    "Third go. There is a search bar in your inbox. It has been there the whole time.",
    "Eight random characters from a twenty-three symbol alphabet. Guessing this is a weekend project.",
    "We can keep doing this. We have nothing else on.",
    "Persistence noted. Accuracy still pending."
  ];

  var SAID = {
    deny: "Denied",
    nudge: "Hold on",
    grant: "Access granted",
    sent: "On its way"
  };

  /* ── Elements ───────────────────────────────────────────────────────────── */
  var form = document.querySelector("#door-form");
  var plate = document.querySelector("#door-plate");
  var input = document.querySelector("#code");
  var submit = document.querySelector("#door-submit");
  var submitLabel = document.querySelector("#door-submit-label");
  var message = document.querySelector("#door-message");
  var main = document.querySelector("#main");

  var codeView = document.querySelector("#view-code");
  var recoverView = document.querySelector("#view-recover");
  var toRecover = document.querySelector("#to-recover");
  var toCode = document.querySelector("#to-code");
  var recoverForm = document.querySelector("#recover-form");
  var recoverPlate = document.querySelector("#recover-plate");
  var recoverEmail = document.querySelector("#recover-email");
  var recoverWebsite = document.querySelector("#recover-website");
  var recoverSubmit = document.querySelector("#recover-submit");
  var recoverSubmitLabel = document.querySelector("#recover-submit-label");
  var recoverMessage = document.querySelector("#recover-message");

  var refusals = 0;
  var busy = false;
  var cooldownTimer = null;

  /* ── Storage, defensively ───────────────────────────────────────────────
     Storage throws outright in some privacy modes. Nothing here is allowed
     to take the page down with it — a visitor who cannot be remembered
     should still get through, they will just be asked again next time. */
  function readStore(store, key) {
    try {
      return window[store].getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStore(store, key, value) {
    try {
      window[store].setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function clearStore(store, key) {
    try {
      window[store].removeItem(key);
    } catch (error) {
      /* Nothing to clean up if the store was never reachable. */
    }
  }

  /* ── Code shape ─────────────────────────────────────────────────────────── */

  function normalize(raw) {
    return String(raw == null ? "" : raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  /* Pulls a code out of whatever actually got pasted. People copy the line
     out of the email, not the code alone, so "Your access code: APS-BOM-…"
     has to survive the trip.

     The search for APS only runs once there is more text than a code can
     hold. Below that the visitor is still typing, and hunting for a prefix
     mid-keystroke would silently eat characters they are about to fix. */
  function extract(raw) {
    var clean = normalize(raw);

    if (clean.length > CODE_LENGTH) {
      var start = clean.indexOf("APS");
      if (start > 0) clean = clean.slice(start);
    }

    return clean.slice(0, CODE_LENGTH);
  }

  /* Normalises first so it is idempotent: the granted screen formats a code
     that has already been through here once, and re-splitting the dashes
     would turn APS-BOM-CDFG-3467 into APS--BO-M-CD-FG-3. */
  function format(raw) {
    var clean = normalize(raw);
    var out = clean.slice(0, 3);
    if (clean.length > 3) out += "-" + clean.slice(3, 6);
    if (clean.length > 6) out += "-" + clean.slice(6, 10);
    if (clean.length > 10) out += "-" + clean.slice(10, 14);
    return out;
  }

  function looksLikeCode(clean) {
    return clean.length === CODE_LENGTH && clean.slice(0, 3) === "APS";
  }

  /* ── Saying something ───────────────────────────────────────────────────── */

  /* Built as nodes rather than innerHTML: some of these lines carry text that
     came back from the sheet, and none of it should ever be parsed as markup. */
  function writeMessage(element, tone, text) {
    element.dataset.tone = tone;
    element.textContent = "";

    var label = document.createElement("span");
    label.className = "said";
    label.textContent = SAID[tone] || "";
    element.appendChild(label);
    element.appendChild(document.createTextNode(text));
  }

  function say(tone, text) { writeMessage(message, tone, text); }
  function sayRecover(tone, text) { writeMessage(recoverMessage, tone, text); }

  function clearMessage() {
    delete message.dataset.tone;
    message.textContent = "";
  }

  function refuse(text) {
    say("deny", text);

    /* Restart the shake even when it is already mid-run. */
    plate.classList.remove("is-refused");
    void plate.offsetWidth;
    plate.classList.add("is-refused");
  }

  function setBusy(state) {
    busy = state;
    submit.disabled = state;
    submitLabel.textContent = state ? "Checking…" : "Open it";
  }

  /* ── Throttle ───────────────────────────────────────────────────────────
     Eight random characters from a 23-symbol alphabet is roughly 7.8e10
     combinations, so this is not what stops a determined attacker — the
     entropy is. It exists to make idle guessing boring, and to stop a
     stuck visitor from hammering the Apps Script quota. */
  function cooldownFor(attempts) {
    if (attempts < 6) return 0;
    return Math.min(30, (attempts - 5) * 5);
  }

  function runCooldown(seconds) {
    var left = seconds;
    setBusy(true);
    submitLabel.textContent = "Wait " + left + "s";

    cooldownTimer = window.setInterval(function () {
      left -= 1;
      if (left <= 0) {
        window.clearInterval(cooldownTimer);
        cooldownTimer = null;
        setBusy(false);
        return;
      }
      submitLabel.textContent = "Wait " + left + "s";
    }, 1000);
  }

  /* ── Asking the sheet ───────────────────────────────────────────────────
     A plain GET with no custom headers, so the browser sends it without a
     preflight — Apps Script does not answer OPTIONS. The /exec URL 302s to
     script.googleusercontent.com and fetch follows it; that final response
     is the one carrying the CORS header, which is why the page CSP has to
     name both hosts. */
  async function verify(code) {
    // Never reached off a dev server — see PREVIEW_CODE above.
    if (onPreviewHost() && code === PREVIEW_CODE) {
      await new Promise(function (resolve) { window.setTimeout(resolve, 420); });
      return { ok: true, valid: true, name: "Preview" };
    }

    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(ENDPOINT)) {
      throw new Error("misconfigured");
    }

    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);

    try {
      var response = await fetch(
        ENDPOINT + "?verify=" + encodeURIComponent(code),
        { method: "GET", redirect: "follow", signal: controller.signal }
      );

      if (!response.ok) throw new Error("http " + response.status);
      return await response.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  /* ── Getting in ─────────────────────────────────────────────────────────── */

  function destination() {
    var stored = readStore("sessionStorage", RETURN_KEY);
    clearStore("sessionStorage", RETURN_KEY);

    /* Only ever a bare filename off this list — never a path, never a URL.
       That is what keeps a tampered storage value from turning the door
       into an open redirect. */
    return SITE_PAGES.indexOf(stored) === -1 ? HOME : stored;
  }

  function unlock(code, name) {
    var stored = writeStore("localStorage", UNLOCK_KEY, JSON.stringify({
      v: UNLOCK_VERSION,
      code: code,
      name: name || "",
      at: new Date().toISOString()
    }));

    var target = destination();

    main.innerHTML = "";

    var kicker = document.createElement("p");
    kicker.className = "door-kicker";
    kicker.textContent = "Access granted";

    var title = document.createElement("h1");
    title.className = "door-title";
    var line = document.createElement("span");
    line.textContent = name ? "In you go," : "You are";
    var accent = document.createElement("span");
    accent.className = "accent";
    accent.textContent = name ? name + "." : "in.";
    title.appendChild(line);
    title.appendChild(accent);

    var shown = document.createElement("p");
    shown.className = "door-granted-code";
    shown.textContent = format(code);

    var note = document.createElement("p");
    note.className = "door-lede";
    note.textContent = stored
      ? "This device will remember you. Taking you through now."
      : "Your browser will not let us remember this device, so you will need the code again next visit. Taking you through now.";

    var link = document.createElement("p");
    link.className = "door-foot";
    var anchor = document.createElement("a");
    anchor.href = target;
    anchor.textContent = "Enter the site ↗";
    link.appendChild(anchor);

    main.appendChild(kicker);
    main.appendChild(title);
    main.appendChild(shown);
    main.appendChild(note);
    main.appendChild(link);

    /* Long enough to read the confirmation, short enough not to feel stuck.
       replace() rather than assign() so Back does not land them on a door
       they have already walked through. */
    window.setTimeout(function () { window.location.replace(target); }, 1100);
  }

  /* ── Already inside ─────────────────────────────────────────────────────
     Somebody with a valid record who navigates back to the door gets the
     short version rather than being asked to prove themselves twice. */
  function showAlreadyIn(record) {
    say("grant", (record.name ? record.name + ", you" : "You") + " already have access on this device. Head through, or enter a different code to swap it.");

    submitLabel.textContent = "Open it";

    var through = document.createElement("p");
    through.className = "door-foot";

    var anchor = document.createElement("a");
    anchor.href = HOME;
    anchor.textContent = "Enter the site ↗";

    var swap = document.createElement("a");
    swap.href = "#";
    swap.textContent = "Forget this device";
    swap.addEventListener("click", function (event) {
      event.preventDefault();
      clearStore("localStorage", UNLOCK_KEY);
      through.remove();
      clearMessage();
      input.value = "";
      input.focus();
    });

    through.appendChild(anchor);
    through.appendChild(swap);
    form.appendChild(through);
  }

  function existingRecord() {
    var raw = readStore("localStorage", UNLOCK_KEY);
    if (!raw) return null;

    try {
      var record = JSON.parse(raw);
      if (!record || record.v !== UNLOCK_VERSION) return null;
      if (!looksLikeCode(normalize(record.code))) return null;
      return record;
    } catch (error) {
      return null;
    }
  }

  /* ── Wiring ─────────────────────────────────────────────────────────────── */

  /* Reformat as they type and put the caret back where it was, counted in
     alphanumerics rather than in characters — otherwise every dash the
     formatter inserts would drag the cursor. */
  input.addEventListener("input", function () {
    var caret = input.selectionStart;
    var typedBefore = normalize(input.value.slice(0, caret)).length;

    var clean = extract(input.value);
    var formatted = format(clean);
    input.value = formatted;

    var position = 0;
    var seen = 0;
    while (position < formatted.length && seen < typedBefore) {
      if (formatted.charAt(position) !== "-") seen += 1;
      position += 1;
    }
    /* Step over a dash the formatter just added, so the next keystroke
       lands after it rather than in front of it. */
    while (position < formatted.length && formatted.charAt(position) === "-") {
      position += 1;
    }

    input.setSelectionRange(position, position);

    if (message.dataset.tone && message.dataset.tone !== "grant") clearMessage();
  });

  /* Enter submits. Implicit submission already covers the ordinary desktop
     case, but this is the one control on the page and it is not worth
     leaving to it — mobile keyboards send a "Go" that does not always
     trigger it, and requestSubmit() fires the submit event the handler below
     is listening for, where form.submit() would skip it entirely. */
  input.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    form.requestSubmit();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (busy) return;

    var clean = normalize(input.value);

    if (!clean) {
      say("nudge", "The field is empty. Bold, but not a strategy.");
      input.focus();
      return;
    }

    if (!looksLikeCode(clean)) {
      say("nudge", "That is not the shape of a code. Ours run APS, a city, then two blocks of four — like APS-BOM-XXXX-XXXX.");
      input.focus();
      return;
    }

    var code = format(clean);
    setBusy(true);

    try {
      var result = await verify(code);

      if (result && result.ok && result.valid) {
        refusals = 0;
        unlock(code, typeof result.name === "string" ? result.name.trim() : "");
        return;
      }

      if (result && result.reason === "unconfirmed") {
        /* Real code, unfinished registration. No joke here — this one is
           actionable and the visitor did nothing wrong. */
        say("nudge", "That code is real. You just never confirmed your email — open the confirmation link we sent you, then come back.");
        setBusy(false);
        return;
      }

      refusals += 1;
      refuse(REFUSALS[Math.min(refusals, REFUSALS.length) - 1]);

      var wait = cooldownFor(refusals);
      if (wait) {
        runCooldown(wait);
      } else {
        setBusy(false);
        input.select();
      }
    } catch (error) {
      /* Connection trouble is ours to own, so it never gets the sarcasm. */
      say("nudge", error && error.message === "misconfigured"
        ? "The door is not wired to the list yet. If you are seeing this, it is our fault, not yours."
        : "We could not reach the list — that is us, or your connection. Give it a moment and try again.");
      setBusy(false);
    }
  });

  /* ── Lost code ──────────────────────────────────────────────────────────
     Same page, swapped view — the door never navigates away from itself. */

  var recoverBusy = false;

  function showView(which) {
    var toRecovery = which === "recover";

    codeView.hidden = toRecovery;
    recoverView.hidden = !toRecovery;

    /* Focus has to follow the swap. Without this a keyboard or screen-reader
       user is left on a button that no longer exists, with no idea the page
       changed under them. */
    (toRecovery ? recoverEmail : input).focus({ preventScroll: true });
  }

  /* No carrying an address over from the code field: its formatter strips
     everything that is not alphanumeric on the way in, so an email typed
     there is already mangled past recognition by the time this runs. */
  toRecover.addEventListener("click", function () { showView("recover"); });

  toCode.addEventListener("click", function () { showView("code"); });

  function setRecoverBusy(state) {
    recoverBusy = state;
    recoverSubmit.disabled = state;
    recoverSubmitLabel.textContent = state ? "Sending…" : "Send it";
  }

  /* POST, because this sends mail — a lookup can ride on a GET, a side effect
     should not. text/plain keeps it a "simple request" so the browser skips
     the preflight, which matters because Apps Script does not answer OPTIONS. */
  async function requestRecovery(email) {
    // Never reached off a dev server — see PREVIEW_RECOVERY_EMAIL above.
    if (onPreviewHost() && email.toLowerCase() === PREVIEW_RECOVERY_EMAIL) {
      await new Promise(function (resolve) { window.setTimeout(resolve, 420); });
      return { ok: true, sent: true };
    }

    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(ENDPOINT)) {
      throw new Error("misconfigured");
    }

    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);

    try {
      var response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "recover",
          email: email,
          website: recoverWebsite.value
        }),
        redirect: "follow",
        signal: controller.signal
      });

      if (!response.ok) throw new Error("http " + response.status);
      return await response.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  /* Matches the server's own cooldown, so the button cannot invite a second
     request that the backend has already decided to ignore. */
  function holdRecoverButton(seconds) {
    var left = seconds;
    setRecoverBusy(true);
    recoverSubmitLabel.textContent = "Sent";

    var timer = window.setInterval(function () {
      left -= 1;
      if (left <= 0) {
        window.clearInterval(timer);
        setRecoverBusy(false);
        return;
      }
      recoverSubmitLabel.textContent = "Sent · " + left + "s";
    }, 1000);
  }

  recoverEmail.addEventListener("input", function () {
    if (recoverMessage.dataset.tone === "nudge") {
      delete recoverMessage.dataset.tone;
      recoverMessage.textContent = "";
    }
  });

  recoverEmail.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    recoverForm.requestSubmit();
  });

  recoverForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (recoverBusy) return;

    var email = recoverEmail.value.trim();

    if (!email) {
      sayRecover("nudge", "We need the address to send it to.");
      recoverEmail.focus();
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sayRecover("nudge", "That is not an email address. Check it and try again.");
      recoverEmail.focus();
      return;
    }

    setRecoverBusy(true);

    try {
      var result = await requestRecovery(email);

      if (result && result.ok && result.sent) {
        /* Deliberately says "if" — the server answers the same way whether or
           not the address is on the list, so that nobody can use this to test
           who signed up. The copy has to match that promise. */
        sayRecover("sent", "If that address is on the list, the code is on its way. Give it a minute, and look in spam before you try again.");
        holdRecoverButton(60);
        return;
      }

      if (result && /required fields/i.test(String(result.error || ""))) {
        /* The live script has not been redeployed yet, so it fell through to
           the registration handler and rejected this as an incomplete signup. */
        throw new Error("notdeployed");
      }

      sayRecover("nudge", (result && result.error) || "We could not send it right now. Try again in a moment.");
      setRecoverBusy(false);
    } catch (error) {
      var reason = error && error.message;

      sayRecover("nudge",
        reason === "notdeployed"
          ? "Lost-code recovery is not live yet — the script behind it still needs deploying. That one is on us."
          : reason === "misconfigured"
            ? "The door is not wired to the list yet. If you are seeing this, it is our fault, not yours."
            : "We could not reach the list — that is us, or your connection. Give it a moment and try again.");

      setRecoverBusy(false);
    }
  });

  var record = existingRecord();
  if (record) {
    showAlreadyIn(record);
  } else if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    /* Only on pointer devices. Autofocusing on a phone throws the keyboard up
       over the page before the visitor has read what it is asking for. */
    input.focus({ preventScroll: true });
  }
})();
