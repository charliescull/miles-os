# Closed Feedback Loop

This is the repository-local agent workflow for MILES OS. It turns a brain dump into a durable starting hypothesis, gives implementation work to coding agents, verifies the result, and sends evidence back for bounded repair cycles.

## Intelligence-first design

The controller is intentionally thin. It owns durable state, worktree isolation, verification, and handoffs. It does not own the agents' reasoning.

Agents are expected to challenge the initial plan, change task order, compare alternatives, refactor broadly when justified, and revise assumptions as they learn more. A plan, acceptance criterion, or model assignment is guidance—not a substitute for engineering judgment. The loop's evidence requirements exist to catch mistakes, not to force shallow or mechanically minimal changes.

## Persistent learning

After every loop, the Learning node extracts reusable lessons from failures, successful decisions, verification evidence, and plan revisions. Lessons live in `.ai/closed-feedback-loop/memory/` and are supplied to future agents as context. This is procedural memory, not model-weight training, so it works across providers and survives changing models.

If a provider is unavailable, the controller still stores the run evidence as a memory record. A later provider can synthesize it into a stronger lesson.

## The nodes

1. **Architect** — interprets the brain dump and writes `plan.md` with goals, constraints, dependencies, and acceptance criteria.
2. **Implementer** — applies the next implementation pass inside an isolated Git worktree.
3. **Verifier** — runs the repository's objective checks and records `verification.md`.
4. **Reviewer** — reviews the diff and verification evidence, then records `review.md`.
5. **Repair loop** — sends failures and review findings back to the implementer until the maximum iteration count is reached.

The controller is `scripts/closed-feedback-loop.ps1`.

## Start with a brain dump

```powershell
 .\scripts\closed-feedback-loop.ps1 init -BrainDumpFile .\docs\brain-dump.md
 .\scripts\closed-feedback-loop.ps1 plan -RunId <run-id>
```

The planner is read-only with respect to application code. Review `.ai/runs/<run-id>/plan.md` before starting implementation, while recognizing that the implementation and review nodes may recommend a better plan.

## Run the autonomous loop

```powershell
.\scripts\closed-feedback-loop.ps1 run -RunId <run-id>
```

This creates a new branch and worktree under `.ai/worktrees/<run-id>`. It does not touch the current dirty worktree. The loop runs implementation, verification, and review for at most three iterations by default. The iteration limit prevents an unattended runaway process; it is not a limit on how deeply an agent may reason within an iteration.

Use `-Planner claude`, `-Implementer codex`, or `-Reviewer claude` to change providers. Use `-MaxIterations 1` for a cautious first run.

## Important safety boundaries

- The current repository worktree may contain user changes; the controller never resets or cleans it.
- Agent work is isolated in a new branch based on `HEAD`.
- Secrets are never included in prompts by the controller.
- Protected paths are called out to agents and require human review.
- A passing build is evidence, not proof of product correctness; inspect the final diff before merging.

## Inspect status

```powershell
 .\scripts\closed-feedback-loop.ps1 status -RunId <run-id>
```

Run artifacts are intentionally ignored by Git. Keep the final plan and review notes if they become useful project documentation.
