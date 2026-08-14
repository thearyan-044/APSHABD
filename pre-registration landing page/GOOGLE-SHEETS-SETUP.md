# APSHABD Google Sheets connection

The destination spreadsheet is:

https://docs.google.com/spreadsheets/d/1w03_ZmDhpOdqBOweGjQ3lKhSaojnJmS9wHxb1OP1uQc/edit

## One-time Apps Script deployment

1. Open the spreadsheet.
2. Choose **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with the contents of `google-apps-script.gs` from this folder.
4. Choose **Deploy → New deployment**.
5. Select **Web app**.
6. Set **Execute as** to **Me**.
7. Set **Who has access** to **Anyone**.
8. Deploy and complete Google's authorization prompts for both Google Sheets and sending email.
9. Copy the Web App URL ending in `/exec`.
10. Paste that URL into `config.js` as `googleSheetsWebAppUrl`.

Do not paste the spreadsheet URL into `config.js`; the public form needs the Apps Script Web App URL.

## Confirmation email

Every valid registration now sends one APSHABD confirmation email through Google's free `MailApp` service. The unique button in that message marks the row as **CONFIRMED** and records the confirmation time.

- No recurring trigger or paid email service is required; the form submission sends the email immediately.
- A personal Gmail account can send to up to 100 recipients per day through Apps Script.
- The spreadsheet records `SENT`, `CONFIRMED`, or `EMAIL FAILED` in the **Email Status** column.
- After changing `google-apps-script.gs`, deploy a new Web App version so the live form uses the updated code.
- Test once with your own email address before publishing.

Official quota reference: https://developers.google.com/apps-script/guides/services/quotas
