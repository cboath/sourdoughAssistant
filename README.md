# sourdoughAssistant

A sourdough baking assistant app for iOS and Android. See [docs/PRD.md](docs/PRD.md) for the product requirements and [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) for the build plan.

## Development with the agent team

This project is built with a team of eleven Claude Code subagents: a React Native/Expo client and an AWS serverless backend. The agent definitions live in `.claude/agents/`. That folder is local only and listed in `.gitignore`. [CLAUDE.md](CLAUDE.md) describes how the main session orchestrates them.

To set up a fresh clone, copy the agent files into `.claude/agents/`, or into `~/.claude/agents/` to make them available in every project. Then run `/agents` in Claude Code to check that they loaded.

### Kick off

> Use the mobile-tech-lead to plan the app from docs/PRD.md, then run the plan.

### The team

| Agent | Role | Model |
|---|---|---|
| mobile-tech-lead | Scopes work, writes the plan, assigns owners | opus |
| mobile-solutions-architect | App architecture, framework, state/offline, ADRs | opus |
| cloud-infrastructure-architect | AWS serverless design, SAM, data model, costs | opus |
| ux-ui-designer | Flows, screen specs, tokens, accessibility, HIG/Material | opus |
| react-native-engineer | Cross-platform feature implementation | sonnet |
| ios-engineer | Swift native modules, Xcode/entitlements, App Store rules | sonnet |
| android-engineer | Kotlin native modules, Gradle/manifest, Play rules | sonnet |
| backend-engineer | Lambda handlers, DynamoDB repos, OpenAPI contract | sonnet |
| qa-test-engineer | Test plans, Maestro/Jest tests, bug reports, go/no-go | sonnet |
| security-reviewer | MASVS + API Top 10 review, IAM, privacy (read-only) | opus |
| release-engineer | EAS, GitHub Actions, signing, store submission, OTA | sonnet |

### Notes

- iOS builds need macOS with Xcode. Run them locally on a Mac or through EAS Build in the cloud. The agents say when a build wasn't verified.
- To switch to fully native (SwiftUI + Compose), tell the solutions architect. The iOS and Android agents already cover that mode.
- Change the `model:` lines in the agent files to suit your plan and budget.
