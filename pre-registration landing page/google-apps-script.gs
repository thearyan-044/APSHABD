const SPREADSHEET_ID = "1w03_ZmDhpOdqBOweGjQ3lKhSaojnJmS9wHxb1OP1uQc";
const SHEET_NAME = "Registrations";
const COLUMN = Object.freeze({
  EMAIL_STATUS: 17,
  CONFIRMED_AT: 18,
  CONFIRMATION_TOKEN_HASH: 19
});

function doGet(event) {
  const token = event && event.parameter
    ? String(event.parameter.confirm || "").trim()
    : "";

  if (token) {
    return confirmRegistration(token);
  }

  return jsonResponse({
    ok: true,
    service: "APSHABD Early Access",
    message: "Registration endpoint is live."
  });
}

function doPost(event) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const data = parsePayload(event);

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
    const accessCode = sheet.getRange(registrationRow, 2).getDisplayValue();

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
