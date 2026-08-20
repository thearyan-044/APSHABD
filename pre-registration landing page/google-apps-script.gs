const SPREADSHEET_ID = "1w03_ZmDhpOdqBOweGjQ3lKhSaojnJmS9wHxb1OP1uQc";
const SHEET_NAME = "Registrations";
const COLUMN = Object.freeze({
  ACCESS_CODE: 2,
  NAME: 3,
  EMAIL_STATUS: 17,
  CONFIRMED_AT: 18,
  CONFIRMATION_TOKEN_HASH: 19
});

/* Whether the site door accepts a code whose owner never clicked the
   confirmation link. Registration copy promises it does not, so this stays
   true — flip it if a drop ever needs to let unconfirmed sign-ups in. */
const REQUIRE_CONFIRMED_EMAIL = true;

/* A pause on every failed code lookup. The codes carry ~37 bits, so this is
   not what makes guessing infeasible — it is here to keep a script from
   burning the daily URL Fetch quota at full speed. */
const FAILED_LOOKUP_PAUSE_MS = 700;

/* Codes that open the door without being on the list, for testing the live
   site before a drop.
   ⚠ These work in production. EMPTY THIS ARRAY BEFORE THE DROP GOES PUBLIC.
   E and O are absent from the registration alphabet, so nothing here can
   ever collide with a code somebody was actually issued. */
const TEST_ACCESS_CODES = ["APS-TST-TEST-CODE"];

/* How long one email address has to wait between recovery sends. Anyone can
   trigger a send by typing somebody else's address, so without this the
   endpoint is a way to flood a stranger's inbox. */
const RECOVERY_COOLDOWN_SECONDS = 600;

/* Recovery stops sending once the daily mail quota drops to this, so a burst
   of lost-code requests can never eat the allowance that new registrations
   need to confirm themselves. */
const MAIL_QUOTA_FLOOR = 10;

function doGet(event) {
  const parameters = (event && event.parameter) || {};

  const token = String(parameters.confirm || "").trim();
  if (token) {
    return confirmRegistration(token);
  }

  // The site door (enter.html on the main site) asking whether a code is real.
  const code = String(parameters.verify || "").trim();
  if (code) {
    return verifyAccessCode(code);
  }

  return jsonResponse({
    ok: true,
    service: "APSHABD Early Access",
    message: "Registration endpoint is live."
  });
}

function doPost(event) {
  let payload;

  try {
    payload = parsePayload(event);
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error.message || error) });
  }

  /* Lost-code recovery. Routed before the lock is taken: it only reads the
     sheet and sends one email, and it should never sit in a queue behind a
     registration write. Registrations send no `action` at all, so the
     existing form keeps working untouched. */
  if (String(payload.action || "") === "recover") {
    return recoverAccessCode(payload);
  }

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const data = payload;

    // Quietly accept bot submissions without writing them anywhere.
    if (data.website) {
      return jsonResponse({ ok: true });
    }

    validateSubmission(data);

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);

    if (!sheet) {
      throw new Error("Registration sheet not found.");
    }

    const accessCode = safeCell(data.accessCode);
    const email = String(data.email || "").trim().toLowerCase();
    const confirmationToken = Utilities.getUuid();
    const webAppUrl = ScriptApp.getService().getUrl();

    if (!webAppUrl) {
      throw new Error("The Apps Script web app must be deployed before confirmation emails can be sent.");
    }

    const confirmationUrl = webAppUrl
      + "?confirm=" + encodeURIComponent(confirmationToken);
    const row = [
      new Date(),
      accessCode,
      safeCell(data.name),
      safeCell(email),
      safeCell(data.whatsapp),
      safeCell(data.instagram),
      safeCell(data.city),
      safeCell(data.neighbourhood),
      safeCell(data.pincode),
      safeCell(data.size),
      safeCell(data.fit),
      safeCell(Array.isArray(data.product) ? data.product.join(", ") : data.product),
      safeCell(data.street),
      data.instagramFollow ? "YES" : "NO",
      data.consent ? "YES" : "NO",
      safeCell(data.sourcePage),
      "PENDING",
      "",
      hashToken(confirmationToken)
    ];

    const existingRow = findExistingEmailRow(sheet, email);
    let registrationRow;

    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
      registrationRow = existingRow;
    } else {
      sheet.appendRow(row);
      registrationRow = sheet.getLastRow();
    }

    try {
      sendConfirmationEmail({
        email: email,
        name: String(data.name || "").trim(),
        accessCode: accessCode,
        confirmationUrl: confirmationUrl
      });
      sheet.getRange(registrationRow, COLUMN.EMAIL_STATUS).setValue("SENT");
    } catch (mailError) {
      sheet.getRange(registrationRow, COLUMN.EMAIL_STATUS).setValue("EMAIL FAILED");
      throw new Error("Registration was saved, but the confirmation email could not be sent: " + mailError.message);
    }

    return jsonResponse({ ok: true, accessCode: accessCode, emailStatus: "SENT" });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: String(error.message || error) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function parsePayload(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error("No registration data received.");
  }

  try {
    return JSON.parse(event.postData.contents);
  } catch (error) {
    throw new Error("Registration data was not valid JSON.");
  }
}

function validateSubmission(data) {
  const required = ["accessCode", "name", "email", "city", "neighbourhood", "pincode", "size", "fit"];
  const missing = required.filter((key) => !String(data[key] || "").trim());

  if (missing.length) {
    throw new Error("Missing required fields: " + missing.join(", "));
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email))) {
    throw new Error("Invalid email address.");
  }

  if (!/^\d{6}$/.test(String(data.pincode))) {
    throw new Error("Invalid PIN code.");
  }

  if (!Array.isArray(data.product) || data.product.length === 0) {
    throw new Error("At least one product interest is required.");
  }

  if (!data.instagramFollow) {
    throw new Error("Instagram follow confirmation is required.");
  }

  if (!data.consent) {
    throw new Error("Communication consent is required.");
  }
}

function sendConfirmationEmail(details) {
  if (MailApp.getRemainingDailyQuota() < 1) {
    throw new Error("The daily email limit has been reached.");
  }

  const displayName = htmlEscape(details.name || "there");
  const confirmationUrl = htmlEscape(details.confirmationUrl);
  const accessCode = htmlEscape(details.accessCode);
  const subject = "Your APSHABD access code: " + details.accessCode;
  const body = [
    "APSHABD EARLY ACCESS",
    "",
    "Hey " + (details.name || "there") + ",",
    "",
    "This is your access code. Keep it somewhere safe. It is what opens the store on drop day.",
    "",
    "    " + details.accessCode,
    "",
    "One click and your place is locked. Skip it and none of this counts:",
    details.confirmationUrl,
    "",
    "If you did not request this, ignore this email."
  ].join("\n");

  const htmlBody = `
    <div style="margin:0;padding:32px 18px;background:#10171c;color:#e7dccb;font-family:Arial,sans-serif;">
      <div style="max-width:620px;margin:0 auto;border:1px solid #c4ac90;background:#172127;">
        <div style="padding:18px 22px;border-bottom:1px solid #c4ac90;color:#f03a32;font-size:12px;font-weight:700;letter-spacing:2px;">
          APSHABD / EARLY ACCESS
        </div>
        <div style="padding:34px 22px 38px;">
          <p style="margin:0 0 12px;color:#c4ac90;font-size:12px;font-weight:700;letter-spacing:1.5px;">KEEP THIS SAFE</p>
          <h1 style="margin:0 0 20px;color:#e7dccb;font-family:Georgia,serif;font-size:40px;line-height:0.95;">THIS IS<br>YOUR CODE.</h1>
          <div style="margin:0 0 24px;padding:20px 22px;border:2px solid #c4ac90;background:#10171c;">
            <p style="margin:0 0 10px;color:#f03a32;font-size:11px;font-weight:700;letter-spacing:2px;">APSHABD ACCESS CODE</p>
            <p style="margin:0;color:#e7dccb;font-family:'Courier New',Courier,monospace;font-size:26px;font-weight:700;letter-spacing:2px;">${accessCode}</p>
          </div>
          <p style="margin:0 0 26px;color:#e7dccb;font-size:16px;line-height:1.6;">Hey ${displayName} — this is what opens the store while everyone else is still waiting for the public link. Save this email. We don't reissue codes over DM.</p>
          <p style="margin:0 0 14px;color:#c4ac90;font-size:13px;line-height:1.6;">One click left, or none of this counts:</p>
          <a href="${confirmationUrl}" style="display:inline-block;padding:16px 20px;background:#f03a32;color:#10171c;font-size:14px;font-weight:800;letter-spacing:1px;text-decoration:none;">CONFIRM MY ACCESS &rarr;</a>
          <p style="margin:28px 0 0;color:#c4ac90;font-size:12px;line-height:1.6;">If you did not request this, ignore this email.</p>
        </div>
      </div>
    </div>`;

  MailApp.sendEmail({
    to: details.email,
    subject: subject,
    body: body,
    htmlBody: htmlBody,
    name: "APSHABD"
  });
}

function confirmRegistration(token) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    if (!/^[0-9a-f-]{36}$/i.test(token)) {
      return confirmationPage(false, "LINK NOT RECOGNISED", "That confirmation link is incomplete or malformed.");
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);

    if (!sheet || sheet.getLastRow() < 2) {
      return confirmationPage(false, "NOT ON THE LIST", "We could not find a registration attached to this link.");
    }

    const tokenHash = hashToken(token);
    const match = sheet
      .getRange(2, COLUMN.CONFIRMATION_TOKEN_HASH, sheet.getLastRow() - 1, 1)
      .createTextFinder(tokenHash)
      .matchEntireCell(true)
      .matchCase(true)
      .findNext();

    if (!match) {
      return confirmationPage(false, "LINK NOT RECOGNISED", "This link has expired, changed, or does not belong to a current registration.");
    }

    const registrationRow = match.getRow();
    const currentStatus = String(sheet.getRange(registrationRow, COLUMN.EMAIL_STATUS).getValue() || "").toUpperCase();
    const accessCode = sheet.getRange(registrationRow, COLUMN.ACCESS_CODE).getDisplayValue();

    if (currentStatus !== "CONFIRMED") {
      sheet.getRange(registrationRow, COLUMN.EMAIL_STATUS).setValue("CONFIRMED");
      sheet.getRange(registrationRow, COLUMN.CONFIRMED_AT).setValue(new Date());
    }

    return confirmationPage(true, "YOU'RE CONFIRMED", "Your access code " + accessCode + " is locked in. Keep it safe — it is what opens the store on drop day.");
  } catch (error) {
    console.error(error);
    return confirmationPage(false, "THE LINK STALLED", "We could not confirm the registration right now. Try the link again in a moment.");
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/**
 * Answers the site door: is this access code on the list?
 *
 * Read-only by design. Every visitor to the main site hits this on their
 * first load, so it takes no lock and writes nothing — a door that queues
 * behind the registration form would stall the whole site.
 *
 * Called as GET .../exec?verify=APS-BOM-XXXX-XXXX and answered as JSON:
 *   { ok: true, valid: true,  name: "Aryan" }
 *   { ok: true, valid: false, reason: "unknown" | "unconfirmed" | "malformed" }
 *   { ok: false, valid: false, error: "..." }
 */
function verifyAccessCode(rawCode) {
  try {
    const code = normalizeAccessCode(rawCode);

    // Wrong shape never reaches the sheet — it cannot possibly be a hit.
    if (!code) {
      return accessDenied("malformed");
    }

    // Checked before the sheet, and skips the confirmed-email rule, so a test
    // code keeps working whatever state the registration list is in.
    if (TEST_ACCESS_CODES.indexOf(code) !== -1) {
      return jsonResponse({ ok: true, valid: true, name: "Test" });
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);

    if (!sheet || sheet.getLastRow() < 2) {
      return accessDenied("unknown");
    }

    const match = sheet
      .getRange(2, COLUMN.ACCESS_CODE, sheet.getLastRow() - 1, 1)
      .createTextFinder(code)
      .matchEntireCell(true)
      .matchCase(false)
      .findNext();

    if (!match) {
      Utilities.sleep(FAILED_LOOKUP_PAUSE_MS);
      return accessDenied("unknown");
    }

    const registrationRow = match.getRow();

    if (REQUIRE_CONFIRMED_EMAIL) {
      const status = String(
        sheet.getRange(registrationRow, COLUMN.EMAIL_STATUS).getValue() || ""
      ).toUpperCase();

      // Told apart from "unknown" on purpose: the door has a different,
      // non-sarcastic message for someone whose code is real but unfinished.
      if (status !== "CONFIRMED") {
        return accessDenied("unconfirmed");
      }
    }

    // First name only. The door greets people by name and has no reason to
    // hand back any more of the registration than that.
    const fullName = String(
      sheet.getRange(registrationRow, COLUMN.NAME).getValue() || ""
    ).trim();

    return jsonResponse({
      ok: true,
      valid: true,
      name: fullName.split(/\s+/)[0] || ""
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      ok: false,
      valid: false,
      error: "Verification is unavailable right now."
    });
  }
}

function accessDenied(reason) {
  return jsonResponse({ ok: true, valid: false, reason: reason });
}

/**
 * Accepts whatever the visitor pasted — lowercase, spaced, dashes missing —
 * and returns it in the exact APS-CTY-XXXX-XXXX form the sheet stores, or an
 * empty string if it could never be a code.
 */
function normalizeAccessCode(raw) {
  const clean = String(raw == null ? "" : raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (clean.length !== 14 || clean.slice(0, 3) !== "APS") {
    return "";
  }

  return "APS-" + clean.slice(3, 6)
    + "-" + clean.slice(6, 10)
    + "-" + clean.slice(10, 14);
}

/**
 * Emails somebody their own access code again.
 *
 * Answers { ok: true, sent: true } whether or not the address is on the
 * list. Anyone can post any address here, so saying "not registered" would
 * turn this into a way to test whether a given person signed up. The page
 * words its confirmation to match: "if that email is on the list".
 *
 * Called as POST with { action: "recover", email: "…" }.
 */
function recoverAccessCode(data) {
  // The one answer this function is allowed to give on the happy path.
  const neutral = jsonResponse({ ok: true, sent: true });

  // Released again if the attempt dies before anything is actually sent.
  let cooldownClaimed = "";

  try {
    // Bots fill the hidden field; treat them exactly like everyone else.
    if (data.website) {
      return neutral;
    }

    const email = String(data.email || "").trim().toLowerCase();

    // Shape is safe to report: it says nothing about who is registered.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ ok: false, error: "That does not look like an email address." });
    }

    /* Cache rather than a sheet column: this is throwaway state, and a path
       any stranger can trigger should not be writing a row every time. */
    const cache = CacheService.getScriptCache();
    const cooldownKey = "recover:" + hashToken(email);

    if (cache.get(cooldownKey)) {
      return neutral;
    }

    /* Checked before the cooldown is claimed. The other way round, somebody
       who asks on a day the quota is already gone gets nothing sent AND is
       locked out for ten minutes over a request that never had a chance. */
    if (MailApp.getRemainingDailyQuota() < MAIL_QUOTA_FLOOR) {
      return jsonResponse({
        ok: false,
        error: "We have hit today's email limit. Try again tomorrow, or reach us on Instagram."
      });
    }

    // Claimed before the lookup, so a registered and an unregistered address
    // leave exactly the same trace behind them.
    cache.put(cooldownKey, "1", RECOVERY_COOLDOWN_SECONDS);
    cooldownClaimed = cooldownKey;

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);

    if (!sheet) {
      throw new Error("Registration sheet not found.");
    }

    const registrationRow = findExistingEmailRow(sheet, email);

    // Not on the list. Same answer as success, and nothing sent.
    if (!registrationRow) {
      return neutral;
    }

    const accessCode = sheet.getRange(registrationRow, COLUMN.ACCESS_CODE).getDisplayValue();
    const name = String(sheet.getRange(registrationRow, COLUMN.NAME).getValue() || "").trim();
    const status = String(
      sheet.getRange(registrationRow, COLUMN.EMAIL_STATUS).getValue() || ""
    ).toUpperCase();

    /* Someone who never confirmed would get their code and still be refused
       at the door, so the recovery email carries a fresh confirmation link
       too. The original token is only stored as a hash and cannot be read
       back, so this mints a new one — which retires the old link, as it
       should: the most recent email is the one that works. */
    let confirmationUrl = "";
    let freshTokenHash = "";

    if (status !== "CONFIRMED") {
      const webAppUrl = ScriptApp.getService().getUrl();

      if (webAppUrl) {
        const confirmationToken = Utilities.getUuid();
        freshTokenHash = hashToken(confirmationToken);
        confirmationUrl = webAppUrl + "?confirm=" + encodeURIComponent(confirmationToken);
      }
    }

    sendRecoveryEmail({
      email: email,
      name: name,
      accessCode: accessCode,
      confirmationUrl: confirmationUrl
    });

    /* Only once the mail is actually away. Writing the new hash before the
       send would mean a send that then fails has retired a link that worked
       and replaced it with one nobody ever received — locking an unconfirmed
       registrant out with no way back. */
    if (freshTokenHash) {
      sheet
        .getRange(registrationRow, COLUMN.CONFIRMATION_TOKEN_HASH)
        .setValue(freshTokenHash);
    }

    return neutral;
  } catch (error) {
    console.error(error);

    /* Nothing went out, so the cooldown should not stand — otherwise a
       transient failure costs a real person ten minutes for no reason. */
    if (cooldownClaimed) {
      try {
        CacheService.getScriptCache().remove(cooldownClaimed);
      } catch (cacheError) {
        // Not worth masking the original failure over.
      }
    }

    return jsonResponse({
      ok: false,
      error: "We could not send the code right now. Try again in a moment."
    });
  }
}

function sendRecoveryEmail(details) {
  const displayName = htmlEscape(details.name || "there");
  const accessCode = htmlEscape(details.accessCode);
  const needsConfirming = !!details.confirmationUrl;
  const confirmationUrl = htmlEscape(details.confirmationUrl);

  const subject = "Your APSHABD access code: " + details.accessCode;

  const body = [
    "APSHABD EARLY ACCESS",
    "",
    "Hey " + (details.name || "there") + ",",
    "",
    "You asked for your access code. Here it is again:",
    "",
    "    " + details.accessCode,
    ""
  ]
    .concat(needsConfirming
      ? [
          "Your email is still unconfirmed, so the code will not open the door yet.",
          "One click fixes that:",
          details.confirmationUrl,
          ""
        ]
      : [])
    .concat([
      "If you did not ask for this, ignore this email. Nothing has changed.",
      "Your code has not been altered and nobody else has been sent it."
    ])
    .join("\n");

  const confirmBlock = needsConfirming
    ? `<p style="margin:0 0 14px;color:#c4ac90;font-size:13px;line-height:1.6;">Your email is still unconfirmed, so this code will not open the door yet. One click fixes that:</p>
       <a href="${confirmationUrl}" style="display:inline-block;margin:0 0 26px;padding:16px 20px;background:#f03a32;color:#10171c;font-size:14px;font-weight:800;letter-spacing:1px;text-decoration:none;">CONFIRM MY ACCESS &rarr;</a>`
    : "";

  const htmlBody = `
    <div style="margin:0;padding:32px 18px;background:#10171c;color:#e7dccb;font-family:Arial,sans-serif;">
      <div style="max-width:620px;margin:0 auto;border:1px solid #c4ac90;background:#172127;">
        <div style="padding:18px 22px;border-bottom:1px solid #c4ac90;color:#f03a32;font-size:12px;font-weight:700;letter-spacing:2px;">
          APSHABD / LOST CODE
        </div>
        <div style="padding:34px 22px 38px;">
          <p style="margin:0 0 12px;color:#c4ac90;font-size:12px;font-weight:700;letter-spacing:1.5px;">FOUND IT</p>
          <h1 style="margin:0 0 20px;color:#e7dccb;font-family:Georgia,serif;font-size:40px;line-height:0.95;">HERE IT IS<br>AGAIN.</h1>
          <div style="margin:0 0 24px;padding:20px 22px;border:2px solid #c4ac90;background:#10171c;">
            <p style="margin:0 0 10px;color:#f03a32;font-size:11px;font-weight:700;letter-spacing:2px;">APSHABD ACCESS CODE</p>
            <p style="margin:0;color:#e7dccb;font-family:'Courier New',Courier,monospace;font-size:26px;font-weight:700;letter-spacing:2px;">${accessCode}</p>
          </div>
          <p style="margin:0 0 26px;color:#e7dccb;font-size:16px;line-height:1.6;">Hey ${displayName} — you asked, so here it is. Same code as before, nothing has changed. Maybe screenshot it this time.</p>
          ${confirmBlock}
          <p style="margin:28px 0 0;color:#c4ac90;font-size:12px;line-height:1.6;">If you did not ask for this, ignore this email. Your code has not been altered and nobody else has been sent it.</p>
        </div>
      </div>
    </div>`;

  MailApp.sendEmail({
    to: details.email,
    subject: subject,
    body: body,
    htmlBody: htmlBody,
    name: "APSHABD"
  });
}

function confirmationPage(success, title, message) {
  const accent = success ? "#f03a32" : "#c4ac90";
  const html = `<!doctype html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${htmlEscape(title)} / APSHABD</title></head>
    <body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#10171c;color:#e7dccb;font-family:Arial,sans-serif;">
      <main style="width:min(680px,100%);padding:42px;box-sizing:border-box;border:1px solid #c4ac90;background:#172127;box-shadow:10px 10px 0 ${accent};">
        <p style="margin:0 0 14px;color:${accent};font-size:12px;font-weight:800;letter-spacing:2px;">APSHABD / EMAIL CONFIRMATION</p>
        <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:clamp(42px,9vw,76px);line-height:.9;">${htmlEscape(title)}</h1>
        <p style="margin:0;color:#e7dccb;font-size:17px;line-height:1.6;">${htmlEscape(message)}</p>
      </main>
    </body></html>`;

  return HtmlService.createHtmlOutput(html).setTitle(title + " / APSHABD");
}

function hashToken(token) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    token,
    Utilities.Charset.UTF_8
  );

  return bytes.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ("0" + value.toString(16)).slice(-2);
  }).join("");
}

function htmlEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findExistingEmailRow(sheet, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const match = sheet
    .getRange(2, 4, lastRow - 1, 1)
    .createTextFinder(email)
    .matchEntireCell(true)
    .matchCase(false)
    .findNext();

  return match ? match.getRow() : null;
}

function safeCell(value) {
  const text = String(value == null ? "" : value).trim();
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ══════════════════════════════════════════════════════════════════════════
   MANUAL TESTS

   Run these from the Apps Script editor: pick the function in the toolbar
   dropdown, press Run, then read the Execution log (Ctrl+Enter).

   They call the real functions against the real sheet, and none of them go
   through the web app — so the whole backend can be proved before anything
   is deployed, and diagnosed afterwards without touching the live site.

   Only the editor can run these. They are not reachable over HTTP.
   ══════════════════════════════════════════════════════════════════════════ */

/* An address you control that IS on the registration list. testRecovery
   sends a REAL email to whatever is set here, so it refuses to run while it
   is blank rather than guessing at somebody from the sheet. */
const TEST_RECOVERY_EMAIL = "";

/**
 * Proves the code lookup. Reads a genuine code out of the sheet, so there is
 * nothing to fill in first. Sends no email and writes nothing.
 */
function testVerify() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);

  if (!sheet) {
    Logger.log("FAIL — no sheet named '%s' in that spreadsheet.", SHEET_NAME);
    return;
  }

  if (sheet.getLastRow() < 2) {
    Logger.log("No registrations yet, so only the negative cases can be checked.");
  }

  const cases = [];

  if (sheet.getLastRow() >= 2) {
    const realCode = sheet.getRange(2, COLUMN.ACCESS_CODE).getDisplayValue();
    const realStatus = String(sheet.getRange(2, COLUMN.EMAIL_STATUS).getValue() || "").toUpperCase();

    cases.push(["a real code from row 2 (status " + realStatus + ")", realCode]);
    cases.push(["the same code, lowercase and unspaced", realCode.replace(/-/g, "").toLowerCase()]);
  }

  cases.push(["the built-in test code", TEST_ACCESS_CODES[0] || "(none configured)"]);
  cases.push(["a code that cannot exist", "APS-XXX-XXXX-XXXX"]);
  cases.push(["nonsense", "hello"]);

  cases.forEach(function (entry) {
    const answer = verifyAccessCode(entry[1]).getContent();
    Logger.log("%s\n  in:  %s\n  out: %s", entry[0], entry[1], answer);
  });

  Logger.log("\nExpect: real code valid:true (unless its status is not CONFIRMED,"
    + " which gives reason:unconfirmed), test code valid:true,"
    + " impossible code reason:unknown, nonsense reason:malformed.");
}

/**
 * Proves lost-code recovery end to end, including the email itself.
 *
 * ⚠ This sends a real email to TEST_RECOVERY_EMAIL. Set that first.
 */
function testRecovery() {
  const email = String(TEST_RECOVERY_EMAIL || "").trim().toLowerCase();

  if (!email) {
    Logger.log("Set TEST_RECOVERY_EMAIL near the bottom of this file first —"
      + " an address you control that is on the registration list."
      + " This function sends a real email, so it will not pick one for you.");
    return;
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const row = findExistingEmailRow(sheet, email);

  Logger.log("Address: %s", email);
  Logger.log("On the list: %s", row ? "yes, row " + row : "NO — expect no email, and the same neutral answer");

  if (row) {
    Logger.log("  code:   %s", sheet.getRange(row, COLUMN.ACCESS_CODE).getDisplayValue());
    Logger.log("  status: %s", sheet.getRange(row, COLUMN.EMAIL_STATUS).getValue());
  }

  Logger.log("Mail quota left before: %s", MailApp.getRemainingDailyQuota());

  // Cleared first so this is re-runnable rather than silently no-op on the
  // second press.
  clearRecoveryCooldown();

  const answer = recoverAccessCode({ action: "recover", email: email }).getContent();
  Logger.log("Answer: %s", answer);
  Logger.log("Mail quota left after: %s  (one lower means an email went out)",
    MailApp.getRemainingDailyQuota());

  // Second call, cooldown now in force: should answer identically, send nothing.
  const repeat = recoverAccessCode({ action: "recover", email: email }).getContent();
  Logger.log("Immediate repeat: %s", repeat);
  Logger.log("Quota after repeat: %s  (unchanged means the cooldown held)",
    MailApp.getRemainingDailyQuota());

  Logger.log("\nExpect both answers identical — {\"ok\":true,\"sent\":true} — whether or"
    + " not the address is registered. That sameness is the point.");
}

/** Drops the recovery cooldown for TEST_RECOVERY_EMAIL so a test can re-run. */
function clearRecoveryCooldown() {
  const email = String(TEST_RECOVERY_EMAIL || "").trim().toLowerCase();
  if (!email) return;

  CacheService.getScriptCache().remove("recover:" + hashToken(email));
  Logger.log("Cooldown cleared for %s", email);
}

/** Checks the bad-input paths. Sends nothing, writes nothing. */
function testRecoveryRejections() {
  [
    ["empty", {}],
    ["not an email", { email: "nope" }],
    ["honeypot filled", { email: "bot@example.com", website: "spam" }]
  ].forEach(function (entry) {
    Logger.log("%s -> %s", entry[0], recoverAccessCode(entry[1]).getContent());
  });

  Logger.log("\nExpect: the first two ok:false with a message about the address,"
    + " the honeypot the same neutral ok:true everyone else gets.");
}
