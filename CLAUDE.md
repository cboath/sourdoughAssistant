# Mobile App Team: how to run the agents

This project uses a team of Claude Code subagents (in `.claude/agents/`) to build iOS and Android apps. Subagents can't call each other, so **the main session is the orchestrator**: it runs the tech lead's plan by delegating each task to its owner agent and passing outputs along through files in `docs/`.

## Workflow

1. **Plan:** delegate to `mobile-tech-lead` with the request. It writes `docs/plan.md` with a task table.
2. **Design + architecture (in parallel):**
   - `ux-ui-designer` → `docs/design/`
   - `mobile-solutions-architect` → `docs/architecture.md`, `docs/adr/`
   - `cloud-infrastructure-architect` → `docs/infrastructure.md`, `docs/data-model.md`, `infra/`
3. **Contract:** `backend-engineer` finalizes `docs/api/openapi.yaml` from the architects' docs.
4. **Build (in parallel where possible):**
   - `backend-engineer` → `backend/`
   - `react-native-engineer` → `app/`, `src/`
   - `ios-engineer` / `android-engineer` → `modules/`, config plugins (only when native work is needed)
5. **Verify:** `qa-test-engineer`, then `ux-ui-designer` (spec review of built screens), then `security-reviewer`.
6. **Fix loop:** send each bug/finding to its owner agent, then re-run QA on the affected areas.
7. **Release:** `release-engineer`.

## Orchestration rules

- Give each subagent its task ID from `docs/plan.md` and the exact input files to read; it starts with no memory of this conversation.
- Run independent tasks in parallel; never run two agents that edit the same files at the same time.
- Don't skip a phase without noting why in `docs/plan.md`.
- Stop and ask Chris before: spending money (new paid services, store accounts), deploying to `prod`, submitting to the stores, or making an irreversible data migration.
- When waiting on Chris, end the message with a numbered list of exactly what's needed.

## Default stack

React Native + Expo (TypeScript) · Expo Router · TanStack Query + Zustand · AWS SAM · API Gateway HTTP API + Lambda (Node.js/TS) · DynamoDB single-table · Cognito · S3/CloudFront · EAS Build/Submit/Update · GitHub Actions.
