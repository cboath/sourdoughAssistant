# Questions for Chris: decisions

Answered by Chris on 2026-11-26. A blank answer means the working default was accepted, so **every working default below is now a decision, not a provisional choice.** Agents treat this file as the source of truth wherever another doc still says "provisional."

**Decision record**

- **Already settled:**
  - The app name is "Sourdough Assistant", the bundle ID and URL scheme are `com.cboath.sourdoughassistant`, and the home-screen name is "Sourdough".
  - OTA updates are left out of v1, which is ADR 0015 option (a). The privacy labels stay "Data Not Collected".
  - Minimum OS is iOS 18 and Android 12.
  - The baking, pricing and default answers in sections B, C and D are the working defaults, except as noted below.
- **Deferred by Chris:**
  - **A3/A4:** no Apple Developer or Play Console enrollment until M6. RE-02 uses only free routes to get dev builds onto phones.
  - **A7:** exact test devices.
  - **A8:** the privacy policy goes on GitHub Pages. The contact email is still needed, and Chris will be asked again at RE-03 (M6). Agents must not fill in an email address.
- **B5:** the cold ferment is a range of 12 to 24 h. That matches the current template (720–1440 min), so nothing changes.
- **B8:** the "ready to eat" notification wasn't decided, and the default is unset. It ships behind `flags.readyNotification`, **off by default**, so it doesn't count toward the iOS notification limit.
- **D1 and E1:** the seed recipes, prices, palette and icon stay as placeholders until Chris supplies replacements.
- **F1–F3:** these are for v1.1 and stay open.

## A. Blocking or hard to change later

| # | Question | Working default | Why it matters | Your answer |
|---|---|---|---|---|
| A1 | App display name | "Sourdough Assistant" | Store listing, and the scheme in the config | yes |
| A2 | Bundle ID and URL scheme | `com.cboath.sourdoughassistant` for both | **Can't be changed after the first store upload** | yes |
| A3 | Apple Developer Program ($99/yr): enroll now or at M6? As an individual or an organization? | Free 7-day Xcode installs until M6 | **Blocking** for RE-02 (dev builds on your iPhone) | going to wait on this |
| A4 | Google Play Console ($25 one-time) | Not until M6; until then, install APKs directly | Store submission | going to wait on this |
| A5 | EAS plan | Free tier, with local builds as the fallback | Cost |  |
| A6 | OTA updates (`expo-updates`) in v1? | **Leave them out.** Security and the architect both recommend this | Keeping them means declaring a device ID on both store privacy forms (SEC-01 H1) |  |
| A7 | Test devices: exact iPhone and Android models and OS versions | Minimum iOS 18 and Android 12 | Sets the minimum OS. The Android brand matters for background behavior |  |
| A8 | Privacy policy: host it on GitHub Pages? Which contact email? | GitHub Pages | Needed in the About screen and for store submission (M6) |  |

## B. Baking logic

| # | Question | Working default | Your answer |
|---|---|---|---|
| B1 | Multiple oven batches: is the ready time when the **last** batch finishes cooling, or the first? Is there a reheat gap between batches? | Last batch; no gap |  |
| B2 | Kitchen-temperature adjustment table | Multiplier `1.09^(24−T)` from 18 to 30 °C; you tune it later |  |
| B3 | Daylight-saving model: a 12-hour step stays 12 real hours, so the clock may show 11 or 13 hours on a changeover night | Yes, real elapsed time |  |
| B4 | Live bake: when a step finishes early, should the ready time move earlier? | Yes. "Hold ready time" and "+15 min" are buttons you tap |  |
| B5 | Do you plan with a cold ferment longer than 12 h? The template's 12 h minimum leaves no room to absorb a late step | Keep 12 h | It is a range of 12 to 24 hours |
| B6 | Should the kitchen temperature carry over from your last bake? | Starts as "Not set" |  |
| B7 | Max recipes in one bake | 4 |  |
| B8 | Add a "ready to eat" notification when cooling ends? | Not decided. It adds 1 notification per bake against iOS's limit of 64 |  |
| B9 | If you sleep through a reminder, the step shows "+3 h over" and waits for you to tap Done, with a way to set when you actually finished. Is that OK? | Yes |  |

## C. Cost and pricing

| # | Question | Working default | Your answer |
|---|---|---|---|
| C1 | Markup: a percentage added to cost, or a target margin? Do you have the old cost calculator to match? | 200% markup on cost (price = cost × 3) |  |
| C2 | Round the suggested price up to a step, e.g. $0.25? | No rounding |  |
| C3 | Show flour prices per 100 g, per kg or per lb? | Per 100 g for metric, per lb for US |  |
| C4 | Water is free unless you price it, and the water inside the levain is always free | Yes |  |
| C5 | Recipe export leaves prices out by default | Yes |  |

## D. Content and defaults

| # | Question | Working default | Your answer |
|---|---|---|---|
| D1 | Your real recipes (default, whole wheat, inclusion loaf) and pantry prices | Placeholders in `apps/mobile/src/db/seed/data.ts`; the default recipe matches the PRD example |  |
| D2 | Default units: grams or ounces, °C or °F? | From the phone's locale |  |
| D3 | Quiet hours | On, 10 PM to 6 AM |  |
| D4 | Default ready time for a new bake | The time of day of your last bake, otherwise 10:00 AM |  |
| D5 | Keep the screen on during a live bake | On |  |
| D6 | Finished bakes drop off the home screen in v1 (history comes in v1.1) | Yes |  |

## E. Brand

| # | Question | Working default | Your answer |
|---|---|---|---|
| E1 | Logo, app icon or colors | Placeholder "Crust" palette, plus a scored-boule icon in `apps/mobile/assets/` |  |
| E2 | Name under the home-screen icon. "Sourdough Assistant" gets cut off on iOS | "Sourdough" |  |
| E3 | Display font | System fonts |  |
| E4 | Tone of the app's wording | Plain, friendly, imperative |  |
| E5 | Illustration style for empty states and primers | None yet |  |
| E6 | Is the placeholder icon fine for TestFlight and Play internal testing? | Yes |  |

## F. v1.1 sync (not needed until then)

| # | Question | Working default | Your answer |
|---|---|---|---|
| F1 | Restoring a backup while signed in: replace the cloud copy or merge with it? | Not decided |  |
| F2 | When a bake syncs to a second device, should it ring there too? | Rings on both |  |
| F3 | Two devices edit the same recipe offline: does the last save win, or should the app keep a copy of the version that lost? | Last save wins |  |
