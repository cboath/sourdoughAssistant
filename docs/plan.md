# Sourdough Assistant: v1 Delivery Plan

2026-11-26 · mobile-tech-lead · Sources: `docs/PRD.md` (scope), `docs/BUILD_PLAN.md` (milestones, layout, conventions; treated as decided), `CLAUDE.md` (workflow)

## 1. Goal and scope

**User problem.** A home baker can't easily work out when to start each step of an 18 to 36 hour bake so the loaf is ready at a chosen time, and doesn't know what a loaf costs.

**Users.** Chris first (hobby baker, also the primary tester). The cottage baker and beginner personas shape the cost feature and the defaults.

**v1 is done when** all M0 to M6 done-when tests pass and the BUILD_PLAN v1 release checklist is complete: three real bakes (one multi-recipe, one overnight), a backup restored across phones, one crash-free week on TestFlight and Play internal testing, and a published privacy policy.

**In scope (PRD MVP):** recipes, pantry, baker's %, scaling, backward scheduler with local notifications, quiet-hours warnings, kitchen-temperature adjustment, live bake with recompute, several active bakes, multi-recipe bakes with oven slots, cost per loaf plus suggested sell price, JSON/plain-text import and export, full backup and restore, onboarding, accessibility, internal test-track builds.

**Out of scope for v1:** accounts, cloud sync, bake log and photos, schedule templates (v1.1); web app (Phase 2); sharing, starter tracker (Later); smart devices; selling features; store listings and public release; analytics; energy, packaging and starter-upkeep costs; automatic backups or backup reminders; iOS critical alerts.

**Should/Could items.** R-7, R-8, R-9, S-7, S-8, C-6 and C-7 are planned into their milestones because BUILD_PLAN already includes them. S-10 (calendar) is the only item that can be cut: it ships only if M4 finishes on time.

### Assumptions (recorded, not blocking)

| # | Assumption | Owner to confirm |
|---|---|---|
| A1 | Step durations are elapsed time, not wall-clock time. A 12 h cold ferment over a DST fall-back night is still 12 real hours, so its displayed clock span looks like 11 or 13 h. The ready time is picked in local time and stored as UTC. | Architect (ADR); Chris to agree |
| A2 | Levain is one ingredient line with a levain hydration % (default 100) and a flour pantry item. Its flour and water count in hydration (R-3), and its flour is priced at that pantry item's cost. This matches the PRD's $1.39 example, where levain flour is billed as bread flour and levain water costs $0. | Architect |
| A3 | Money is stored as integer cents (BUILD_PLAN). Unit cost per gram is kept at higher precision (computed from package cents and size, never stored rounded), and rounding to cents happens once per line. This still gives $1.39 for the PRD example. | Architect |
| A4 | Multi-recipe bake: the last oven slot finishes cooling at the ready time, earlier slots finish earlier, and slots run back to back with no reheat gap. | Chris (Q8) |
| A5 | Currency defaults to the device locale (C-4). A Settings override is kept for v1.1, but there is no currency picker in v1. `energyRate` is dropped from the v1 Settings schema because cost covers ingredients only. | Architect |
| A6 | The kitchen-temperature lookup uses a reference of 24 C / 75 F with a multiplier table the architect proposes. Results are clamped to each step's range and only apply to steps flagged `tempSensitive`. | Chris (Q7) |
| A7 | Every table gets sync-ready fields: UUID ids, `createdAt` and `updatedAt` (UTC), and soft-delete `deletedAt` tombstones, so v1.1 sync needs no migration rewrite (PRD section 3). | Architect, then cloud review |
| A8 | Pure-TS `packages/core` work is assigned to `backend-engineer`, a TS engineer with no React Native dependency, so M1 can run in parallel with M2 (`react-native-engineer`). The orchestrator may move it to `react-native-engineer` if parallelism doesn't matter. | Orchestrator |
| A9 | Native code is limited to Expo config plugins and small modules in `apps/mobile/plugins/` and `apps/mobile/modules/`. The repo layout is otherwise exactly as in BUILD_PLAN. | Architect |

## 2. Workflow phases for v1: skipped or reduced

| Phase (CLAUDE.md) | v1 status | Why |
|---|---|---|
| Design + mobile architecture | **Full** | Needed before M1 to M3 |
| Cloud architecture (`cloud-infrastructure-architect`) | **Reduced to one review task (CL-01)** | PRD section 3 says it is decided that v1 is local-only with no accounts and that nothing leaves the device. `infra/` stays empty. One read-through of the local schema for v1.1 sync readiness costs little and avoids a migration rewrite. |
| API contract (`docs/api/openapi.yaml`) | **Skipped** | No network API in v1. The contract role goes to `docs/core-api.md` (the `packages/core` public types and function signatures), which app code builds against. |
| Backend implementation | **Skipped (deferred to v1.1 sync)** | Nothing to serve. `backend-engineer` only works on pure-TS `packages/core` (A8). |
| Native platform work | **Reduced** | Only notifications (Android exact alarms and channels, iOS time-sensitive delivery), permission strings, the privacy manifest, and Play/App Store compliance. Keep-awake, sharing and calendar use stock Expo modules. |
| QA | **Full** | Most risk sits in core math and notifications |
| Design spec review | **Full** (after M3, M5, M6) | |
| Security review | **Reduced** | No auth, network or server. The scope is local storage, backup/import file handling, permissions, third-party SDKs, privacy disclosures, and MASVS-STORAGE/PLATFORM/PRIVACY/CODE. |
| Release | **Reduced** | Dev builds (M0) plus TestFlight and Play **internal** testing only (M6). No store listings or production submission. EAS Update channel set up, free tier. |

## 3. Milestone acceptance criteria

Each milestone's done-when comes from BUILD_PLAN, with testable criteria added.

**M0 Foundation.** Done when a dev build runs on Chris's iPhone and Android phone and CI is green.
- Given a fresh clone, when `npm install && npm test && npm run lint && npm run typecheck` run at the root, then all pass, and `apps/mobile` imports a function from `packages/core`.
- Given a push to any branch, when GitHub Actions runs, then lint, typecheck and test jobs pass on an Ubuntu runner.
- Given the EAS `development` profile, when built for iOS and Android, then both install on Chris's devices and open the expo-router home screen.

**M1 Core logic.** Done when tests pass for every PRD example plus DST nights.
- Given 500 g flour, 375 g water, 10 g salt and 100 g levain at 100%, then hydration = 77.3% (425/550), and scaling to 2 loaves doubles every line in whole grams.
- Given the PRD cost table, then one loaf = 139 cents, and a markup % gives the expected sell price.
- Given the default template and ready Sat 10:00 local, then the feeding starts Fri 03:05, preheat starts Sat 07:45 (alongside), and every row matches PRD section 5. With cold ferment = 18 h, the feeding starts Thu 21:05.
- Given quiet hours 22:00 to 06:00, then the 03:05 feeding returns a warning and no step is moved.
- Given US spring-forward and fall-back nights (fixed zone `America/New_York`, fixed clock), then elapsed durations are preserved and local display times are correct (A1).
- Given a ready time too soon, then the result is "earliest possible ready time". Given "start now", then the ready time is computed forward.
- Given 3 loaves and oven capacity 2, then 2 loaves share slot 1, 1 loaf gets slot 2, and the per-recipe offsets match A4.
- Given a step that finished 40 min late, then every remaining planned start shifts by +40 min.

**M2 Local data.** Done when repository tests cover create, edit, delete and reload for every entity.
- Given an empty DB, when migrations run, then the schema version is current. Re-running migrations is a no-op.
- Given each entity (Recipe, RecipeIngredient, PantryItem, PriceHistory, Step, Bake, BakeItem, Settings), when it is created, edited, deleted and reloaded, then it round-trips with stable ids and timestamps.
- Given first launch, then the seed recipes (R-9) and starter pantry exist. Given second launch, then nothing is duplicated.

**M3 Recipes, pantry, cost UI.** Done when Chris enters his own recipe and prices and trusts the cost per loaf.
- Given a pantry item priced as a 5 lb bag, when it is used in grams in a recipe, then the line cost is correct. Given a cup-based line, then grams-per-cup conversion is applied (C-2).
- Given a recipe, then the detail screen shows baker's %, hydration, cost per batch and per loaf, a per-line cost share, and a suggested sell price.
- Given a price change, then recipe costs update and earlier bakes keep their `costSnapshot` (C-6).
- Given system text at the largest size and VoiceOver/TalkBack, then the recipe editor stays usable.

**M4 Scheduler and reminders.** Done when a real bake is scheduled and every reminder fires on time with the app closed, on both phones.
- Given a recipe and a ready time, then the timeline shows every step's start, with quiet-hours warnings inline, in under 60 seconds from app open.
- Given notifications granted, with the app killed, the phone locked and Android battery saver on, then every step, fold and heads-up fires within 1 minute (manual script QA-04).
- Given notifications denied, then an in-app banner shows and the schedule still works.
- Given a reboot or app update, when the app next launches, then pending notifications are rescheduled with no duplicates.
- Given multiple recipes, then the app asks for oven capacity (default from Settings) and shows one merged timeline.

**M5 Live bake.** Done when one full real bake is completed with the app alone, no paper.
- Given an active bake, then the live screen shows the current step, a countdown, the next step, and a large "mark done" target (at least 56 pt/dp).
- Given a step marked done early or late, then the remaining steps recompute and their notifications are cancelled and rescheduled to match.
- Given two active bakes, then both appear on home and their notifications don't collide.
- Given keep-awake on, then the screen stays on while the live view is open.

**M6 Backup, polish, release prep.** Done when the app installs from TestFlight and Play internal testing, and a backup from one phone restores on the other.
- Given a full backup exported from iOS, when restored on Android after a confirmation step, then all recipes, pantry, bakes and settings match, and notifications for active bakes are rescheduled.
- Given a malformed or wrong-version file, when imported, then it is rejected with a clear message and no data changes.
- Given first run, then onboarding sets units, quiet hours and oven capacity, and can be skipped.
- Given the privacy review, then the app makes no network calls except Expo update checks (or none, if updates are off) and includes no analytics SDK.

## 4. Task table

Batch = the wave in which a task can start once its dependencies are done. Tasks in the same batch with different owners can run in parallel. Each owner also writes the unit tests for its own code.

| ID | MS | Task | Owner | Inputs | Outputs | Depends on | Batch |
|---|---|---|---|---|---|---|---|
| AR-01 | M0 | Architecture and ADRs: Expo SDK (latest stable), expo-router route map, state (Zustand plus how TanStack Query is used, or not used, over local repos), SQLite schema and migration strategy, sync-ready fields (A7), time model (A1), money precision (A3), levain model (A2), temperature table proposal (A6), notification design (iOS 64-pending cap budget, Android exact alarms and channels, reschedule-on-launch idempotency), backup file format (versioned JSON), test setup for SQLite in Jest | mobile-solutions-architect | PRD.md, BUILD_PLAN.md, this plan section 1 | `docs/architecture.md`, `docs/adr/0001-*.md`..., `docs/data-model.md` (local SQLite schema), `docs/core-api.md` (types and signatures for `packages/core`) | none | 1 |
| DS-01 | M0 | UX foundation: IA and navigation map, core flows (add pantry item, create recipe, schedule bake <60 s, live bake, multi-recipe), design tokens (light/dark), base components, accessibility rules (tap targets, dynamic type) | ux-ui-designer | PRD.md sections 2, 4 to 6, 8; BUILD_PLAN M3 to M6 | `docs/design/flows.md`, `docs/design/tokens.md`, `docs/design/components.md` | none | 1 |
| RN-01 | M0 | Monorepo scaffold: npm workspaces root, `apps/mobile` (Expo, expo-router, TS strict), `packages/core` with Vitest, shared tsconfig, ESLint, Prettier, lint-staged, root scripts, empty `apps/web/` and `infra/` placeholders; app name and bundle IDs from Q1/Q2 (placeholder until answered) | react-native-engineer | BUILD_PLAN "Repo layout and conventions" and M0 | `package.json`, `tsconfig.base.json`, `apps/mobile/**`, `packages/core/**`, lint configs | none | 1 |
| QA-01 | M0 | Test plan: strategy per layer, device matrix (Chris's phones plus OS versions), table-driven case list for every PRD example and DST night, notification manual-test outline | qa-test-engineer | PRD.md, BUILD_PLAN "Testing" | `docs/test-plan.md`, `docs/test-cases/core-cases.md` | none | 1 |
| RE-01 | M0 | CI and EAS: GitHub Actions (lint, typecheck, test; Ubuntu only, npm cache), `eas.json` profiles (development, preview, production), app config for bundle IDs | release-engineer | RN-01 output, Q1 to Q3 | `.github/workflows/ci.yml`, `apps/mobile/eas.json`, `apps/mobile/app.config.ts` edits | RN-01 | 2 |
| SEC-01 | M0 | Light threat model of the local-only design: data at rest, backup/import parsing, notification lock-screen content, permissions, third-party SDK list (read-only review) | security-reviewer | `docs/architecture.md`, `docs/data-model.md` | Findings in its reply; orchestrator saves them to `docs/security/threat-model.md` and feeds them into AR-01 follow-ups | AR-01 | 2 |
| DS-02 | M3 | Screen specs: pantry list/editor with price history, recipe list (search, tags, favorites), recipe editor, step editor (range, folds, alongside), recipe detail (baker's %, scaling), cost breakdown | ux-ui-designer | DS-01 outputs, `docs/core-api.md` | `docs/design/screens-recipes.md` | DS-01, AR-01 | 2 |
| RE-02 | M0 | Dev builds installed on Chris's iPhone and Android phone (M0 done-when) | release-engineer | RE-01, Apple/Google accounts (Q3, Q4) | Dev build install instructions in `docs/release.md` | RE-01, Q3 | 3 |
| CO-01 | M1 | `packages/core`: units (weight/volume, grams-per-cup, display), recipe math (baker's %, hydration with levain, scaling, whole-gram rounding), cost (unit cost, per line/batch/loaf in cents, sell price from markup) | backend-engineer | `docs/core-api.md`, `docs/adr/*` | `packages/core/src/{units,recipe,cost}/**` plus unit tests | AR-01, RN-01 | 2 |
| CO-02 | M1 | `packages/core` scheduler: backward pass, ranges and chosen values, alongside anchors, fold sub-reminders, temperature adjustment with clamping, quiet-hours warnings, forward "start now", earliest-possible ready time | backend-engineer | `docs/core-api.md`, `docs/adr/*` | `packages/core/src/schedule/**` plus unit tests | AR-01, RN-01 | 2 (parallel with CO-01: separate folders) |
| CO-03 | M1 | `packages/core`: multi-recipe oven slots and offsets (A4), live recompute from actual start/end, finalize `src/index.ts` barrel exports | backend-engineer | CO-02 output | `packages/core/src/schedule/{multi,recompute}.ts`, `packages/core/src/index.ts` | CO-01, CO-02 | 3 |
| QA-02 | M1 | PRD acceptance and DST tests, table-driven, fixed clock and zone (test-first against `core-api.md`) | qa-test-engineer | `docs/test-cases/core-cases.md`, `docs/core-api.md` | `packages/core/test/acceptance/*.test.ts` | QA-01, AR-01, RN-01 | 2 |
| RN-02 | M2 | SQLite schema, migration runner with version table, typed repositories with tests against in-memory SQLite | react-native-engineer | `docs/data-model.md`, `docs/architecture.md` | `apps/mobile/src/db/**` plus tests | AR-01, RN-01 | 2 |
| RN-03 | M2 | Seed data (default process recipe, whole wheat, inclusion loaf, starter pantry; idempotent) and Settings store (quiet hours, oven capacity, markup %, heads-up minutes, units) | react-native-engineer | PRD section 5 template, Q6 | `apps/mobile/src/db/seed/**`, `apps/mobile/src/state/settings.ts` | RN-02 | 3 |
| CL-01 | M2 | v1.1 sync-readiness review of the local schema: ids, timestamps, tombstones, `PK=USER#` / `SK=` mapping; no infra | cloud-infrastructure-architect | `docs/data-model.md`, PRD section 7 | `docs/sync-readiness.md` (recommendations go back to AR-01 owner if schema changes are needed) | RN-02 | 3 |
| AN-01 | M4 | Android notification spike (early de-risk): exact alarms (`SCHEDULE_EXACT_ALARM` request flow on Android 12+; not `USE_EXACT_ALARM`, which Play restricts), high-importance channel, Doze/battery-saver behavior, reboot persistence, config plugin if expo-notifications falls short | android-engineer | `docs/architecture.md` notification section | `apps/mobile/plugins/withAndroidExactAlarm.*` (if needed), `docs/native/android-notifications.md` | AR-01, RE-02 | 4 |
| IO-01 | M4 | iOS notification spike (early de-risk): permission flow, time-sensitive interruption level (entitlement) so overnight steps get through Focus, 64-pending-notification cap behavior, sound | ios-engineer | `docs/architecture.md` notification section | Config plugin/entitlements in `apps/mobile/app.config.ts` and `apps/mobile/plugins/`, `docs/native/ios-notifications.md` | AR-01, RE-02 | 4 (parallel with AN-01; serialize edits to `app.config.ts`) |
| RN-04 | M3 | App shell: tabs/stack per route map, tokens, base components, TanStack Query/Zustand wiring to repos | react-native-engineer | DS-01, `docs/architecture.md` | `apps/mobile/app/**` layout, `apps/mobile/src/ui/**` | RN-03, DS-01 | 4 |
| RN-05 | M3 | Pantry screens, recipe list, recipe and step editors, recipe detail, cost breakdown (uses core) | react-native-engineer | DS-02, `docs/core-api.md` | `apps/mobile/app/(tabs)/{pantry,recipes}/**`, `apps/mobile/src/features/{pantry,recipes,cost}/**` | RN-04, CO-01, DS-02 | 5 |
| QA-03 | M3 | RNTL tests for the recipe editor; manual M3 checklist incl. a cost check against the PRD example | qa-test-engineer | RN-05, DS-02 | `apps/mobile/src/features/recipes/__tests__/*`, `docs/test-runs/m3.md` | RN-05 | 6 |
| DR-01 | M3 | Design review of built M3 screens against spec and a11y rules | ux-ui-designer | DS-02, running app/screens | Findings as a list of issues (orchestrator files GitHub issues) | RN-05 | 6 |
| DS-03 | M4/M5 | Screen specs: schedule screen (recipe(s), ready time, kitchen temp, sliders, oven-capacity prompt), timeline with warnings, permission-denied banner, home with active bakes, live bake view, "start now" | ux-ui-designer | DS-01, `docs/core-api.md` | `docs/design/screens-bake.md` | DS-01, AR-01 | 3 |
| RN-06 | M4 | Schedule screen, sliders, oven-capacity prompt, merged timeline, quiet-hours warnings, bake persistence with recipe and cost snapshots | react-native-engineer | DS-03, `docs/core-api.md` | `apps/mobile/app/bake/schedule/**`, `apps/mobile/src/features/schedule/**` | RN-05, CO-03, DS-03 | 6 |
| RN-07 | M4 | Notification service: schedule, cancel and reschedule per bake (steps, folds, heads-up), idempotent reschedule on launch, budget for iOS 64 cap, denied-permission banner; optional S-10 calendar export only if time allows | react-native-engineer | AN-01, IO-01 docs, `docs/architecture.md` | `apps/mobile/src/features/notifications/**` | RN-06, AN-01, IO-01 | 7 |
| QA-04 | M4 | Notification manual test script and run on both phones: app killed, locked, battery saver, reboot, DST; RNTL test for the schedule screen | qa-test-engineer | RN-07, QA-01 | `docs/test-scripts/notifications.md`, `docs/test-runs/m4.md`, `apps/mobile/src/features/schedule/__tests__/*` | RN-07 | 8 |
| RN-08 | M5 | Live bake screen (countdown, next step, mark done), recompute wired to core plus notification update, home list of active bakes, keep-awake toggle, large targets | react-native-engineer | DS-03, `docs/core-api.md` | `apps/mobile/app/bake/[id]/**`, `apps/mobile/src/features/live/**` | RN-07 | 8 |
| QA-05 | M5 | RNTL live-bake tests; recompute and two-concurrent-bake scenarios on device | qa-test-engineer | RN-08 | `apps/mobile/src/features/live/__tests__/*`, `docs/test-runs/m5.md` | RN-08 | 9 |
| DR-02 | M5 | Design review of the schedule, timeline and live bake screens | ux-ui-designer | DS-03, built screens | Findings list | RN-08 | 9 |
| DS-04 | M6 | Specs: onboarding, backup/restore and import/export flows, settings screen, a11y audit checklist, app icon and splash (from Chris's assets, or a simple wordmark if none) | ux-ui-designer | DS-01, Q5 | `docs/design/screens-settings-onboarding.md`, `apps/mobile/assets/{icon,splash}*` | DS-01 | 4 |
| RN-09 | M6 | Full backup/restore (versioned JSON, schema validation, size limit, confirm step, reschedule notifications after restore), single-recipe JSON/plain-text import and export via the share sheet and document picker | react-native-engineer | `docs/architecture.md` backup format, DS-04, SEC-01 findings | `apps/mobile/src/features/backup/**` | RN-08, DS-04 | 9 |
| RN-10 | M6 | Onboarding, settings screen, accessibility fixes from DR-01, DR-02 and the audit checklist | react-native-engineer | DS-04, DR findings | `apps/mobile/app/onboarding/**`, `apps/mobile/app/settings/**` | RN-09 | 10 |
| IO-02 | M6 | iOS store-readiness: `PrivacyInfo.xcprivacy` required-reason APIs, Info.plist usage strings, `ITSAppUsesNonExemptEncryption=false`, App Privacy answers ("Data Not Collected") | ios-engineer | Dependency list, SEC-01 | `apps/mobile/app.config.ts` (iOS section), `docs/native/ios-store-readiness.md` | RN-10 | 11 |
| AN-02 | M6 | Android store-readiness: permission audit (remove unused), target SDK per current Play policy, exact-alarm declaration, Data safety form answers | android-engineer | Dependency list, AN-01 | `apps/mobile/app.config.ts` (Android section), `docs/native/android-store-readiness.md` | IO-02 (same file) | 12 |
| RE-03 | M6 | Privacy policy draft (no data collected, local-only) for hosting on GitHub Pages; versioning; EAS Update channel; EAS Submit to TestFlight and Play internal testing | release-engineer | IO-02, AN-02, Q3, Q4, Q9 | `docs/privacy-policy.md`, `apps/mobile/eas.json` (submit), `docs/release.md` | AN-02, SEC-02 fixes | 14 |
| SEC-02 | M6 | Security and privacy review: MASVS STORAGE, PLATFORM, CODE, PRIVACY; import fuzzing cases, permissions, SDK network calls, privacy policy accuracy | security-reviewer | Code, `docs/privacy-policy.md` draft, SEC-01 | Findings in its reply (orchestrator saves them to `docs/security/review-v1.md`) | RN-10, IO-02, AN-02 | 13 |
| QA-06 | M6 | Full regression on the TestFlight and Play internal builds, cross-platform backup restore (iOS to Android and back), v1 release checklist tracking (including one crash-free week), go/no-go | qa-test-engineer | All above | `docs/test-runs/m6.md`, release checklist status | RE-03 | 15 |
| DR-03 | M6 | Design review of onboarding, settings, backup and the a11y pass | ux-ui-designer | DS-04, built screens | Findings list | RN-10 | 11 |

**Parallel groups at a glance**
- Batch 1 (start now): AR-01, DS-01, RN-01, QA-01.
- Batch 2: RE-01, SEC-01, DS-02, CO-01, CO-02, QA-02, RN-02. CO-01 and CO-02 run as two `backend-engineer` instances on separate folders. Neither edits `index.ts`; CO-03 owns it.
- Batches 3 and 4: run the native spikes AN-01 and IO-01 as early as RE-02 allows, in parallel with M1 to M3, because notifications are the top risk. DS-03 and DS-04 run ahead of the app work.
- From M3 on, `react-native-engineer` is the critical path (RN-04 to RN-10, in sequence). Fix loops: send each QA, DR or SEC finding to its owner, then re-run the affected QA task.
- Real-bake checkpoints (Chris): after RN-07 (M4), after RN-08 (M5), and before RE-03 (overnight plus multi-recipe bakes).

## 5. Risks

| Risk | Mitigation |
|---|---|
| Android drops or delays notifications (Doze, OEM battery killers, Android 14+ denies exact alarms by default) | AN-01 spike early; request `SCHEDULE_EXACT_ALARM` with an explainer screen; guide the user to battery-optimization settings; in-app countdown; reschedule on launch; QA-04 runs with battery saver on, on Chris's actual Android phone |
| iOS keeps at most 64 pending local notifications; several bakes with folds and heads-ups can exceed it | AR-01 defines a budget: schedule the soonest N and top up on launch, foreground and step completion. QA-04 includes a three-concurrent-bake case. |
| Overnight steps silenced by Focus or Do Not Disturb | IO-01 enables time-sensitive notifications (no Apple approval needed, unlike critical alerts); Android high-importance channel |
| DST and time-zone bugs | Elapsed-time model (A1), UTC storage, `date-fns-tz`, QA-02 fixed-zone tests for both DST transitions |
| Rounding drift in cost (per-gram prices below 1 cent) | A3: keep high-precision unit cost and round once per line; PRD $1.39 example locked in QA-02 |
| Schema not sync-ready, which forces a v1.1 migration rewrite | A7 plus CL-01 review before M3 builds on the schema |
| Restore of a bad or old backup corrupts data | Versioned format, schema validation before any write, single transaction, confirm step, SEC-02 review |
| Single RN engineer is the bottleneck from M3 | Core logic is tested before screens exist; specs are ready a batch ahead; native spikes run off the critical path |
| Play: new personal developer accounts must run a closed test (12+ testers for 14 days) before production | Not a v1 blocker (internal testing only); note it for any later public launch |
| Cost creep | See Q3 and Q4. Use the EAS free tier with local builds (`eas build --local` or `npx expo run:*`) as fallback; GitHub Actions on Ubuntu only (macOS runners use the free minutes 10x faster); privacy policy on GitHub Pages (free) |

## 6. Needs from Chris

1. **App name.** Confirm "Sourdough Assistant" as the display name. A short home-screen name such as "Sourdough" is optional.
2. **Bundle ID / application ID.** Proposed `com.cboath.sourdoughassistant` for both platforms. It is effectively permanent after the first store upload. Needed before RE-01 finalizes the app config.
3. **Apple Developer Program, $99/year (about $8/month, over the $5 threshold).** Needed for EAS device dev builds and for TestFlight (M6). Cheaper option: build to your iPhone from Xcode on your Mac with a free Apple ID (apps expire every 7 days) through M5, then enroll only for M6. Choose enroll now or at M6. Individual or organization? Organization enrollment needs a D-U-N-S number.
4. **Google Play Console, $25 one-time.** Needed only for M6 internal testing. Dev builds sideload as APKs for free. Requires identity verification.
5. **Brand assets.** Do you have an icon or logo and colors? If not, OK for the designer to make a simple placeholder icon and wordmark?
6. **Seed content.** Your default process recipe (actual ingredient amounts, not just steps) plus the whole wheat and inclusion loaf recipes, and starter pantry prices. Otherwise we use generic published-style formulas and illustrative prices.
7. **Kitchen-temperature table.** OK to use a standard reference table (24 C / 75 F baseline, clamped to step ranges) that you tune later? Do you want C or F as the default display?
8. **Multi-recipe timing.** At the ready time, should all loaves be ready (the last oven slot ends at the ready time), or the first slot? Should there be a reheat gap between back-to-back slots (for example, 10 min for the Dutch oven)?
9. **Privacy policy.** OK to publish the drafted local-only policy on GitHub Pages under your name or repo? Any contact email to list?
10. **Test devices.** Exact iPhone and Android models and OS versions. The Android brand matters for battery-killer behavior.
11. **EAS plan.** Confirm we stay on the free Expo plan (monthly build cap, slower queue) and fall back to local builds instead of paying for a subscription.

## 7. Scope changes since the plan was written

Recorded by the orchestrator on 2026-11-26. The details are in `docs/architecture.md` and the ADRs.

- **CO-03 (follow-up):** `PlannedStep.name` stays the plain step name. The app's `stepLabel()` builds the oven-slot and recipe labels.
- **RN-04:** `app/+native-intent.tsx` deep-link allowlist, the Zod route-param helper and the logger (SEC-01 M2, L6). The orientation setting is `'default'`, so landscape is allowed everywhere.
- **RN-06/RN-08:**
  - `bakeService.sweep(now)`: auto-activates a bake, and auto-completes it 12 h after the ready time.
  - `applyEvent` returns a `revertToken` and `revert(token)` undoes the latest event. This needs the repo methods `snapshotRows` and `restoreRows`.
  - `src/features/schedule/labels.ts` and `overlap.ts`.
  - The bake is saved before the notification primers.
- **RN-07:**
  - A `ready` notification kind behind `flags.readyNotification`, provisional until B8 in `docs/open-questions.md` is answered.
  - Test reminders use the `satest:` prefix.
  - Android channels use PRIVATE lock-screen visibility.
  - Check the exact-alarm permission before `alarmClock` delivery.
- **RN-09:** the SEC-01 M3/M4 import caps, strict schemas and the export self-check (including the size cap). Also restores `onboardingCompletedAt`, sets `currency_override` from the backup, and writes the `app_meta` keys `lastBackupExportedAt` and `lastRestoreSafetyAt`.
- **RN-10:**
  - Currency is `currency_override ?? device`, in `src/lib/locale.ts`, shown read-only in Settings.
  - Onboarding is three steps, with no notifications step.
- **Phases:** OTA (`expo-updates`) is excluded until Chris decides A6. The open questions are consolidated in `docs/open-questions.md`.

## 8. Chris's decisions (2026-11-26)

`docs/open-questions.md` is the decision record, and every working default in it is now accepted. Effects on the plan:

- **Docs:** the "provisional" markers for AMB-09, AMB-10, A1 (elapsed time), the 200% markup, quiet hours, the minimum OS and the OTA decision are now accepted. The architect updates the docs and QA updates the case statuses.
- **RE-02 (reduced, free routes only):** Chris won't enroll in the Apple Developer Program or Play Console until M6. Dev builds have to use free routes, and those need tools that aren't installed on this Mac:
  - **iOS:** full Xcode (free, from the Mac App Store), plus a personal team signed in with Chris's Apple ID. Installs expire after 7 days.
  - **Android:** Android Studio (SDK plus JDK 17) for local builds. The alternative is a free EAS cloud APK build, which needs a free Expo account.
  
  Until Chris installs one of these, M0's done-when ("dev build on phones") is partly blocked. Development continues, verified by tests and `expo export`.
- **IO-01 and AN-01:** the native notification spikes are blocked by RE-02, because they need a real device. They stay scheduled as early as RE-02 allows.
- **RE-03 (M6):** still needs the store accounts and the privacy contact email. Ask Chris at that point.

## 9. Follow-ups from the decision pass (2026-11-26)

- **RE-01:** add `INTERNET` to `android.blockedPermissions` for the preview and production profiles (ADR 0015 option a, A6).
- **RN-07:** `flags.readyNotification` defaults to `false` (B8, ADR 0011).
- **RE-01 / AN-01:** the Android home-screen label comes from `apps/mobile/plugins/withAndroidAppLabel.js` (E2). Check it on the first prebuild.
- **Repo rule:** no test or non-route files under `apps/mobile/app/`. Expo Router treats them as routes, and one crashed the app at startup.
- **RN-05:** adds `recipes.restore(id)`, which the recipe-delete Undo needs.
- **M3 verify (2026-11-26):**
  - QA-03 passed: 4 minor bugs, all fixed.
  - DR-01: 46 issues fixed. Deferred: DR1-29 drag-to-dismiss, which needs react-native-gesture-handler (add with RN-06), and the DR1-32 duration-unit i18n, since v1 ships one locale.
  - SEC-M3 says ship (`docs/security/review-m3.md`). SEC-M3-01, -02 and -07 are in the fix loop.
- **SEC-M3-03 → RN-09, DS-04, RE-03:** "Save my data" shares a `VACUUM INTO` copy with tombstones hard-deleted, or says that deleted items are included. The privacy policy notes that deleted items stay on the device.
- **SEC-M3-04 → CL-01 (v1.1):** use a delete-batch ID instead of exact `deleted_at` matching in `restore`.
- **SEC-M3-05 → RE-01:** add `babel-plugin-transform-remove-console` for production, or amend ADR 0015.
- **SEC-M3-06 → RE-01:** the 20 moderate advisories are in dev tooling. Take the fixes through normal Expo and Jest updates. Never run `npm audit fix --force`, which downgrades expo.
- **Before the next device build:** run `expo prebuild --clean`, because the local `ios/` folder is stale.
