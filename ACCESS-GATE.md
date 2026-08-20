# The door — access gate

The main site is gated behind the access code people receive when they
pre-register. One page takes the code, checks it against the registration
sheet, and remembers the device.

## What it is, honestly

A velvet rope, not a lock. Everything runs in the visitor's browser, so
anyone willing to open devtools can write the unlock record by hand and walk
in. That is true of any gate on a static site — real access control needs a
server that refuses to send the HTML in the first place.

It filters the ninety-nine percent of people who will not do that, which is
what a drop gate is for. Do not put anything behind it that would actually
hurt to leak.

## The pieces

| File | Job |
| --- | --- |
| `enter.html` | The door itself. The only page a locked-out visitor can see. |
| `gate.css` | Its styles. Standalone — carries its own font-face and palette so the first paint does not wait on `styles.css`. |
| `gate.js` | Reads the code, asks the sheet, writes the unlock record. |
| `gate-guard.js` | Loaded in the `<head>` of every gated page. Reads the record, redirects if it is missing. Makes no network calls. |
| `google-apps-script.gs` | `verifyAccessCode()` answers the code lookup, `recoverAccessCode()` re-sends a lost one. Lives in the pre-registration folder. |

Gated pages: `index.html`, `drop-a-pin.html`, and the seven city pages.
Not gated: `enter.html` itself, and the pre-registration form — that is how
people get a code in the first place.

## Lost codes

"Forgot your code?" on the door swaps to a second view on the same page —
it never navigates away. The visitor gives the address they registered with
and the code is emailed back to that inbox.

**It always answers the same way**, whether or not the address is on the
list: *"If that address is on the list, the code is on its way."* Anyone can
type anyone's address here, so a straight "not registered" would turn the
door into a way to test who signed up. The page's wording is deliberately
matched to that promise — do not "improve" it into a definite claim.

Sent by `POST` rather than `GET`, because it sends mail. A lookup can ride
on a GET; a side effect should not.

Three things keep it from becoming a way to flood somebody's inbox:

- **`RECOVERY_COOLDOWN_SECONDS`** — 600. One send per address per ten
  minutes, held in `CacheService`. The cooldown is claimed *before* the sheet
  lookup, so a registered and an unregistered address leave the same trace.
- **`MAIL_QUOTA_FLOOR`** — 10. Recovery stops sending once the daily mail
  allowance drops this low, so lost-code requests can never eat the quota new
  registrations need to confirm themselves.
- A hidden honeypot field, matching the one the registration form uses.

If the address is on the list but **never confirmed**, the email carries a
fresh confirmation link as well — otherwise they would get their code and
still be refused at the door. The original token is only stored as a hash and
cannot be read back, so a new one is minted, which retires the old link. That
is the intended behaviour: the most recent email is the one that works.

One thing deliberately not solved: a registered address takes fractionally
longer to answer than an unregistered one, because it sends an email. Timing
alone could in principle distinguish them. Closing that would mean queueing
sends, which is not worth the complexity here.

## Setup — one step, and nothing works until it is done

The gate calls a `verify` action that the currently deployed Apps Script does
not have yet. **Until you redeploy, every code is refused.**

1. Open the Apps Script project bound to the registrations spreadsheet.
2. Replace its contents with
   `pre-registration landing page/google-apps-script.gs`.
3. **Deploy → Manage deployments → the pencil icon on the existing
   deployment → Version: New version → Deploy.**

   Use the existing deployment, not a new one. A new deployment mints a new
   `/exec` URL, which would then have to be pasted into `ENDPOINT` at the top
   of `gate.js` *and* `googleSheetsWebAppUrl` in the pre-registration
   `config.js`.

4. Check it answers, in a browser tab:

   ```
   https://script.google.com/macros/s/.../exec?verify=APS-BOM-XXXX-XXXX
   ```

   Expected: `{"ok":true,"valid":false,"reason":"unknown"}`. If you get
   `{"ok":true,"service":"APSHABD Early Access",...}` instead, the old version
   is still live — step 3 did not take.

Then try a real code from the sheet. It should come back
`{"ok":true,"valid":true,"name":"..."}`.

## Testing without a real code

```
APS-TST-TEST-CODE
```

It is wired in two independent places, so it works before *and* after the
redeploy:

- **`PREVIEW_CODE` in `gate.js`** — opens the door on a dev server without
  touching the sheet, so the whole flow is testable right now. Gated on
  hostname, so it is dead code on a real domain. Only this exact string
  short-circuits; every other code typed on localhost still goes to the live
  endpoint, so the real integration stays testable from your machine.
- **`TEST_ACCESS_CODES` in `google-apps-script.gs`** — makes the same code
  work against the deployed endpoint, from anywhere, so you can test the live
  site before a drop. Checked before the sheet and skips the confirmed-email
  rule.

> **⚠ Empty `TEST_ACCESS_CODES` before the drop goes public.** That one is a
> real key to the live site. The `gate.js` half is safe to leave alone — the
> hostname check already makes it inert in production.

`E` and `O` are not in the alphabet the registration form draws from
(`CDFGHJKLMNPQRTVWXY34679`), so this string can never collide with a code
somebody was actually issued.

## Testing the backend without deploying anything

The web app cannot answer `verify` or `recover` until it is redeployed. To
prove the backend works first, run these from the Apps Script editor — pick
the function in the toolbar dropdown, press **Run**, read the Execution log.

| Function | What it proves | Sends email? |
| --- | --- | --- |
| `testVerify()` | Code lookup, against a real code read straight out of row 2. Also checks the test code, an impossible code, and nonsense. | No |
| `testRecoveryRejections()` | Empty address, malformed address, honeypot. | No |
| `testRecovery()` | Recovery end to end, including the email and the cooldown. Set `TEST_RECOVERY_EMAIL` first. | **Yes** |
| `clearRecoveryCooldown()` | Drops the ten-minute hold so `testRecovery` can be run again. | No |

`testRecovery()` refuses to run until `TEST_RECOVERY_EMAIL` is set, rather
than picking somebody out of your sheet and mailing them. Use an address you
control that is on the list.

It calls recovery twice in a row on purpose. Both answers should be
identical — `{"ok":true,"sent":true}` — and the mail quota should drop by one
on the first call and not move on the second. That is the cooldown holding.

The first run against a fresh sheet is the interesting one: if row 2's status
is not `CONFIRMED`, `testVerify` returns `reason:"unconfirmed"` rather than
`valid:true`. That is correct, not a failure.

## Testing the interface before the backend is live

On a dev server only:

- **`APS-TST-TEST-CODE`** opens the door.
- **`preview@apshabd.test`** in the lost-code form gives the sent state
  without any request leaving the browser. `.test` is a reserved TLD, so that
  address cannot belong to anyone.

Any *other* address typed on localhost goes to the live endpoint for real —
which after the redeploy means a registered address receives an actual email.
Use the preview address when you only want to watch the interface move.

## Two settings

Both at the top of `google-apps-script.gs`:

- `REQUIRE_CONFIRMED_EMAIL` — `true`. A code whose owner never clicked the
  confirmation link is refused, with a message telling them to go find that
  email. Set `false` to let unconfirmed sign-ups in.
- `FAILED_LOOKUP_PAUSE_MS` — `700`. A pause on failed lookups, so a script
  cannot burn the daily quota at full speed.

## How access is remembered

`localStorage["apshabd-access"]`, no expiry — enter the code once per device.

```json
{ "v": 1, "code": "APS-BOM-XXXX-XXXX", "name": "Aryan", "at": "2026-08-19T…" }
```

To make access lapse between drops, bump `UNLOCK_VERSION` in **both**
`gate.js` and `gate-guard.js`. Every stored record stops matching and
everyone comes back through the door.

To close the site to everyone at once, do the same. To open it to everyone,
delete the `<script src="gate-guard.js">` line from the gated pages.

If a visitor's browser blocks storage entirely — private modes do — the guard
lets them through rather than trapping them in a loop they cannot escape. A
door that turns away paying customers is worse than one that occasionally
lets a stranger past.

## What the door says

Wrong codes get sarcasm that escalates over six tries and then holds. The
joke is always about the situation, never about the person — and two cases
never get the sarcasm at all, because in both of them the visitor did nothing
wrong:

- **Real code, unconfirmed email** — points them at the confirmation link.
- **The lookup failed** — takes the blame, tells them to try again.

Copy lives in `REFUSALS` near the top of `gate.js`.

## The CSP exception

`.htaccess` sets `connect-src 'none'` for the whole site. A header CSP and a
page's meta CSP are enforced *together*, as an intersection, so that would
block the code lookup no matter what `enter.html` declares for itself. The
`<Files "enter.html">` block in `.htaccess` re-sets the whole policy for that
one file, allowing `script.google.com` and `script.googleusercontent.com` —
both, because `/exec` answers with a 302 to the second one and `fetch`
follows it.

If the lookup works locally but fails on the live site, that block is the
first thing to check.
