# Carnival Manager

The **Cash Station** app for the annual community carnival. It runs on an Android phone and does three jobs:

1. **SETUP**: enter your ticket prices (games, grill items, new-card price).
2. **OPERATE**: sell tickets to customers and load them onto their NFC card or bracelet.
3. **MANAGE**: tap any card to see everything on it, fix the amounts, and write them back.

It is an installable, offline-first web app (PWA). Once installed it needs no Wi-Fi or data.

**Companion app:** the tickets this app loads are spent at the game booths, grill and prize table by **[carnival-pos](https://github.com/concentrateddon/carnival-pos)**. Both apps must use the same card format; see [Card format](#card-format-for-developers).

> **Money is handled outside the app.** Customers pay with cash, Venmo, etc. The operator confirms that payment was received, then presses **FINALIZE**. The app only calculates the total and writes the tickets. It does not take payments and keeps no sales record.

---

## Contents

1. [What you need](#what-you-need)
2. [First-time setup (installing the app)](#first-time-setup-installing-the-app)
3. [The home screen](#the-home-screen)
4. [SETUP: entering prices](#setup-entering-prices)
5. [OPERATE: selling tickets](#operate-selling-tickets)
6. [MANAGE: viewing and fixing a card](#manage-viewing-and-fixing-a-card)
7. [How to tap a card](#how-to-tap-a-card)
8. [Screens and messages](#screens-and-messages)
9. [Troubleshooting](#troubleshooting)
10. [Practice mode (no cards needed)](#practice-mode-no-cards-needed)
11. [Card format (for developers)](#card-format-for-developers)
12. [Deploying to Cloudflare](#deploying-to-cloudflare)
13. [Development and testing](#development-and-testing)
14. [Project layout](#project-layout)
15. [Known limits](#known-limits)

---

## What you need

- An **Android phone with NFC**, running **Chrome**. A Galaxy S10 or newer is fine. SETUP works on any device, but loading cards needs NFC. (iPhones can't read or write these cards from a web app.)
- **NFC turned on:** *Settings → Connections → NFC and contactless payments*.
- **NFC cards or bracelets**, ideally **NTAG215** (NTAG213 and NTAG216 also work).
- Internet **once**, to install the app.

## First-time setup (installing the app)

Do this once per phone, with internet.

1. Open the app's web address in **Chrome**.
2. On the home screen tap **INSTALL APP**.
   - If Chrome shows an install box, tap **Install**.
   - Otherwise the app shows step-by-step instructions for your type of device (Android, iPhone/iPad or computer). Follow them.
3. A green **Carnival Manager** icon (a ticket with a **$**) appears on the home screen.
4. Open it from the home screen **once while still online**. This saves everything the app needs to work offline.
5. When Chrome asks to allow **NFC**, tap **Allow**. This appears the first time you open OPERATE or MANAGE.

> **Tip:** Turn the phone's **media volume** up. The app beeps and vibrates on every success and every error, which helps in a noisy carnival.

## The home screen

The app starts here every time.

| Button | What it does |
|--------|--------------|
| **SETUP** | Enter or change prices and ticket types. |
| **OPERATE** | Sell tickets and load cards. Greyed out until an event has been set up. |
| **INSTALL APP** | Installs the app on the phone (see above). Shows **APP IS INSTALLED ✓** once done. |

At the top, a box tells you whether an event is already configured:

- Green **EVENT IS SET UP** with the event name and every price. This is shown after the app is restarted, so you can see at a glance that the phone still has your prices.
- Yellow **NO EVENT SET UP YET**. Press SETUP.

Everything you enter is stored **on the phone itself** and survives restarts, closing the app and losing signal. (It is not shared between phones. If you use two Cash Stations, enter the same prices on both.)

## SETUP: entering prices

Press **SETUP**. You can come back at any time, even during the event, to change a price or add a new GRILL item. Changes take effect the next time you open OPERATE.

**EVENT NAME** *(optional)*. Shown on the home screen, e.g. *Fall Carnival 2026*.

**GAME TICKETS**

- **Price for one ticket**: e.g. `1.00`. Leave blank if you don't sell game tickets.
- **Bundle size** and **Bundle price** *(optional)*: e.g. `20` and `10.00` for "20 tickets for $10". The bundle price must be lower than buying that many single tickets. Leave both blank for no bundle.

**GRILL TICKETS**

Each item you add becomes its own ticket type on the card. Give it a short name and a price:

| Item | Price | Card record |
|------|-------|-------------|
| MEAL | 10.00 | `GRILL:MEAL` |
| BEVERAGE | 1.00 | `GRILL:BEVERAGE` |

- Tap **+ ADD GRILL ITEM** for more lines. Tap the red **✕** to remove one.
- Names are made UPPER-CASE automatically. Use letters, numbers, spaces, `-` and `_`.
- Removing an item from SETUP does **not** remove tickets of that type already on customers' cards, and the grill app will still accept them.

**NEW CARD OR BRACELET** *(optional)*

The price of a card or bracelet, e.g. `5.00`. If set, OPERATE asks the operator to choose **NEW CARD** or **RELOAD**, and adds this price only for new cards. Leave blank if cards are free.

**Buttons at the bottom**

| Button | What it does |
|--------|--------------|
| **SAVE & OPERATE** | Saves, then goes straight to OPERATE. |
| **SAVE** | Saves and returns to the home screen. |
| **ERASE EVENT SETUP** | Deletes all prices from this phone (it asks first). Use this to start a new event. Cards are not affected. Only shown when an event exists. |
| **HOME** (top right) | Leaves without saving. If you changed anything it asks first. |

If something is wrong (for example, a bundle that isn't cheaper than singles), a red box at the top lists exactly what to fix and nothing is saved until it's right.

## OPERATE: selling tickets

OPERATE lists every ticket type you set up, with its price. For example:

```
GAME      $1.00 each · 20 for $10.00      [−] 0 [+]   [+20 for $10.00]
MEAL      $10.00 each                     [−] 0 [+]
BEVERAGE  $1.00 each                      [−] 0 [+]
```

**Selling to a customer**

1. For each ticket type, set how many the customer wants:
   - **+** and **−** change the amount by one.
   - Tap the **number** to type an amount with the phone's number pad.
   - **+20 for $10.00** (GAME only, when a bundle exists) adds a whole bundle at once.
2. If you set a new-card price, choose **NEW CARD** (adds the card price to the total) or **RELOAD** (the customer already has a card). You must choose one; **FINALIZE** stays grey until you do.
3. Check the **TOTAL** with the customer and **collect payment** (cash, Venmo, etc.).
4. **When the money is received**, press **FINALIZE**.
5. The screen says **TAP CARD TO LOAD** and lists what is being loaded. **The customer taps their card or bracelet** on the back of the phone.
6. A green **LOADED** screen shows what was added, what the card now holds, and the payment amount. After a few seconds the app returns to OPERATE with the counters cleared, ready for the next customer.

Press **CANCEL** on the tap screen to go back to the counters without loading anything (your selections stay). **CLEAR** next to the total resets everything.

**How bundle pricing works.** The app always gives the customer the best price automatically:

| Customer buys | Charged |
|---------------|---------|
| 5 tickets | 5 × $1 = **$5** |
| 20 tickets | 1 bundle = **$10** |
| 25 tickets | 1 bundle + 5 singles = **$15** |
| 45 tickets | 2 bundles + 5 singles = **$25** |
| 19 tickets | **$10**: it would be silly to charge $19 for 19 when 20 cost $10 |

A small line under the amount (such as *1 bundle + 5 single*) shows how the price was worked out.

**Notes**

- Tickets are **added** to whatever is already on the card. Reloading never wipes out existing tickets.
- **NEW CARD** on a card that already has tickets keeps those tickets, and the result screen tells you so.
- **NEW CARD with no tickets** (customer only buys the card) is allowed. The card is read to confirm it works, and nothing is written.
- If the write fails (the card moved away), the screen says **WRITE FAILED**. Just tap again. Tickets are never loaded twice, because the app recognises when the first attempt actually saved.

## MANAGE: viewing and fixing a card

Press **MANAGE** (top of the OPERATE screen) to look inside a card and correct it. Use it when:

- a card was loaded wrong,
- a customer needs a refund or goodwill tickets,
- a card needs a ticket type it doesn't have yet (for example PRIZE tickets).

**Steps**

1. Tap the card. Every ticket type on it is listed with its amount, e.g. `GAME 20`, `GRILL:MEAL 2`, `PRIZE 7`.
2. Change any amount with **+**, **−** or by tapping the number and typing. Set an amount to **0** to remove that type.
3. To add a type that isn't on the card, press **+ ADD TICKET TYPE**. Choose GAME, PRIZE or one of your GRILL items, or type another name (for example `GRILL:MEAL`).
4. Press **WRITE TO CARD**. It stays grey (*NO CHANGES*) until something is different.
5. The screen says **TAP THE SAME CARD AGAIN**. Tap it. The card is **overwritten** with exactly the amounts shown, replacing what was there. A green **CARD UPDATED** screen confirms.

Press **CANCEL** at any time to throw away your edits and read another card. Press **OPERATE** (top right) to go back to selling. If you have unwritten edits it asks you to confirm.

**Safety checks**

- A **different card** on the second tap → *WRONG CARD*. Tap the right one or CANCEL.
- If the card's contents **changed since you read it** (for example the customer spent a ticket at the grill in between), nothing is overwritten. The screen reloads with the card's latest contents and a warning, so you can review and write again.
- Other (non-ticket) data stored on the card is left alone.

> **MANAGE changes real money-value.** Anyone using it can give a card unlimited tickets. Keep the Cash Station phone with a trusted person.

## How to tap a card

- Touch the card **flat against the back of the phone, near the middle**, and **hold still** until you feel a buzz and hear a beep (about one second).
- Taking it away too soon is the most common cause of errors. The app tells you and you simply tap again.
- The app ignores a second tap for about a second so one tap is never counted twice.

## Screens and messages

| You see | It means | What to do |
|---------|----------|------------|
| **EVENT IS SET UP** (green) | Prices are saved on this phone | Press OPERATE. |
| **NO EVENT SET UP YET** (yellow) | Nothing saved | Press SETUP. |
| **CHOOSE NEW CARD OR RELOAD** | A new-card price is set and neither is picked | Pick one. |
| **TAP CARD TO LOAD** | Waiting for the customer's card | Customer taps. Or CANCEL. |
| Green **LOADED / CARD UPDATED** | Written to the card | Carry on. Clears itself. |
| **TAP THE SAME CARD AGAIN** | MANAGE is waiting to write | Tap the same card, or CANCEL. |
| **WRITE FAILED…** | Card moved away before the update was saved | Hold it flat against the phone and tap again. |
| **WRONG CARD** | Second tap was a different card | Tap the first card or CANCEL. |
| **The card changed since you read it** | Contents differ from your first tap | Review the reloaded amounts and write again. |
| **CARD IS FULL** | No room for another ticket type | Remove a type, or use a fresh card. |
| **PRESS READ CARD** / red *NFC OFF* | The phone stopped listening (screen was off or you switched apps) | Press **READ CARD**. |

**Sound and buzz:** a short tick when a card is read; a rising two-tone chirp for success; a low double-buzz for errors. The screen stays on while OPERATE or MANAGE is open.

## Troubleshooting

**"This phone can't use NFC here"**
Use **Chrome on Android**, opened at the real `https://` address or from the installed app.

**"NFC permission was blocked"**
Chrome → ⋮ → *Settings → Site settings → NFC devices* → allow this site. For the installed app, long-press its icon → *App info → Permissions*.

**"Could not start NFC"**
NFC is switched off. Turn it on in Android settings, then press **READ CARD**.

**Nothing happens when I tap**
Check the top bar says **READY**. If it says *NFC OFF*, press **READ CARD**. Try a different spot on the back of the phone. Remove thick cases, metal covers, or wallets holding other cards. Hold still for a full second.

**The app forgot my prices**
Prices live in the browser's storage for this app. They are lost if you clear Chrome's site data or uninstall the app. The home screen always shows whether an event is set up. After a clear, just run SETUP again. Installing the app and opening it from the home screen once makes the browser far less likely to clear its data.

**A customer paid but the load failed**
Tap again. If the retry also fails, use **MANAGE**: tap the card, add the tickets by hand, and write.

**The app isn't showing my latest update**
It updates itself in the background when online. Close it completely (swipe it away from recent apps), open it again while online, then once more.

## Practice mode (no cards needed)

Add `?sim=1` to the app's address, e.g. `https://your-site.example/?sim=1`. A small **SIM** button appears at the bottom right with three virtual cards you can edit and tap, which is good for **training volunteers** at a desk or testing on a computer. A checkbox makes the next write fail, so volunteers can practice the retry. Nothing here touches real cards, and normal use never shows the SIM button.

Each virtual card is just lines of text, one ticket type per line:

```
GAME=3
GRILL:MEAL=2
PRIZE=12
```

Practice mode still uses (and changes) the prices saved on that phone.

## Card format (for developers)

The Cash Station and [carnival-pos](https://github.com/concentrateddon/carnival-pos) share one format, defined in [`public/js/tickets.js`](public/js/tickets.js). **The two repos each carry a copy of that file; keep them identical.**

- A card holds an **NDEF message**. Each ticket type is **one NDEF *text* record** with the payload `NAME=COUNT`.

  | Record text | Meaning |
  |-------------|---------|
  | `GAME=2` | 2 game tickets |
  | `GRILL:MEAL=3` | 3 meal tickets |
  | `GRILL:BEVERAGE=1` | 1 beverage ticket |
  | `PRIZE=15` | 15 prize tickets |

- `NAME` is upper-case letters, digits, `_`, `-`, and optionally one `:VARIANT`. Lower-case is accepted when reading and normalised to upper-case when writing.
- `COUNT` is a whole number, **0–9999**. Zero-count records are removed on write.
- A type may not appear twice. If it does, counts are added together on read.
- Records that aren't `NAME=COUNT` text (URLs, notes, other apps' data) are **preserved unchanged** on every write.
- **A card with nothing on it** is written as the single record `GAME=0`. Web NFC refuses to write a message with no records, and this placeholder reads as "zero tickets" to every consumer.
- Capacity: about 15 bytes per type, so even an NTAG213 (144 bytes) holds a handful of types. The app refuses to write over the NTAG215 limit (492 usable bytes).
- **No signatures or checksums.** Tickets are plain text, so anyone with an NFC app can edit a card. That's accepted for a community event; add signing to `tickets.js` on both sides if it ever isn't.
- **Loading** a sale re-reads the card, adds to it, and rewrites the whole message with `NDEFReader.write({ records }, { overwrite: true })`. After a failed write the app remembers what it tried; if the next tap shows the card already holds the intended result it completes instead of repeating.

**Stored configuration** (browser `localStorage`, key `carnival-manager.event.v1`), with all money in whole cents:

```json
{
  "version": 1,
  "eventName": "Fall Carnival",
  "game": { "price": 100, "bundleQty": 20, "bundlePrice": 1000 },
  "grill": [{ "name": "MEAL", "price": 1000 }, { "name": "BEVERAGE", "price": 100 }],
  "buyIn": 500,
  "updatedAt": 1790000000000
}
```

## Deploying to Cloudflare

The app is plain static files (no build step) in [`public/`](public/). It must be served over **HTTPS**, since Web NFC and service workers need a secure origin. Cloudflare provides that automatically.

**Option A: Workers (static assets)**, using the included [`wrangler.jsonc`](wrangler.jsonc):

```bash
npx wrangler login
npx wrangler deploy
```

**Option B: Pages**, deploying the same folder:

```bash
npx wrangler pages deploy public --project-name carnival-manager
```

**Option C: Git-connected.** In the Cloudflare dashboard create a Pages (or Workers) project from this GitHub repo with **no build command** and **output directory `public`**. Every push to `main` then deploys.

[`public/_headers`](public/_headers) is picked up by both Pages and Workers assets. It makes the browser re-check `index.html`, `sw.js` and the manifest every time so updates arrive promptly.

**Important:** each phone stores its prices per web address. Always open the app from the same address (or the installed icon). A different address, such as a new Cloudflare preview URL, is a different app with empty prices.

### Releasing an update

The service worker caches files until its version changes. When you change **any** file in `public/`:

1. Bump `VERSION` in [`public/sw.js`](public/sw.js) **and** `APP_VERSION` in [`public/js/app.js`](public/js/app.js).
2. If you add or remove a file, update the `FILES` list in `sw.js`.
3. Deploy.

Phones pick up the new version the next time the app is opened with internet. **Don't deploy during the event.** Update a few days before. Saved prices are not affected by updates.

## Development and testing

No build tools are needed. Serve the repo root with any static server:

```bash
python3 -m http.server 8788
```

Then open:

- `http://localhost:8788/public/index.html?sim=1`: the app with the on-screen NFC simulator.
- `http://localhost:8788/test/index.html`: the unit tests for the card format and pricing (the tab title shows *ALL PASSED*). With Node installed you can also run `node test/pricing.test.js` and `node test/tickets.test.js`.

While developing, the service worker will keep serving cached files. In Chrome DevTools → *Application → Service Workers* tick **Bypass for network**, or bump `VERSION`.

Real NFC testing needs a phone: use the deployed HTTPS site, or Chrome's remote debugging (`chrome://inspect`, with port forwarding of 8788), which treats `localhost` as secure.

To regenerate the icons: `python3 scripts/make-icons.py` (needs Pillow).

## Project layout

```
public/                  ← everything that gets deployed
  index.html             page shell
  manifest.webmanifest   install metadata
  sw.js                  offline cache (service worker)
  _headers               Cloudflare cache headers
  css/app.css            all styling (dark, high-contrast, big targets)
  js/app.js              screens and the SETUP / OPERATE / MANAGE flows
  js/pricing.js          money, bundle pricing, setup validation
  js/store.js            saving the event setup on the phone
  js/tickets.js          card format + ticket arithmetic (shared with carnival-pos)
  js/nfc.js              Web NFC read/write wrapper
  js/sim.js              ?sim=1 NFC simulator
  js/feedback.js         beeps, vibration, keep-awake
  icons/                 app icons
test/                    unit tests (card format, pricing)
scripts/make-icons.py    icon generator
wrangler.jsonc           Cloudflare config
```

## Known limits

- **Android + Chrome only** for loading cards. Web NFC does not exist on iOS or in Firefox.
- NFC listens only while the app is open and the screen is on. If Chrome pauses it, press **READ CARD**.
- **No sales record.** The app does not log sales or totals, so keep your own tally of cash and Venmo received.
- Prices are stored per phone; there is no sync between Cash Stations.
- No tamper protection on cards (see [Card format](#card-format-for-developers)).
