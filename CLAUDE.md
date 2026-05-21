# CLAUDE.md — keptnisfun

## Project Overview

This is a **Keptn continuous delivery orchestration project** named `fulltour`. It defines a two-stage delivery pipeline (QA → Production) using Keptn's shipyard specification. The repository contains no application source code — it is purely YAML configuration that Keptn interprets to orchestrate deployments, tests, quality evaluations, approvals, and self-healing.

## Repository Structure

```
keptnisfun/
├── CLAUDE.md          # This file
├── metadata.yaml      # Project metadata (name, creation timestamp)
└── shipyard.yaml      # Keptn delivery pipeline definition
```

## Key Files

### `metadata.yaml`
Keptn project metadata. The project name here (`fulltour`) must match the Keptn project registration.

### `shipyard.yaml`
The core pipeline definition. Uses **Keptn API spec `spec.keptn.sh/0.2.2`**. Defines two stages:

| Stage | Sequences | Key Tasks |
|-------|-----------|-----------|
| `qa` | `delivery` | deployment → test → evaluation (2m window) |
| `production` | `delivery` | approval → deployment → test → evaluation (2m window) |
| `production` | `remediation` | get-action → action → test → evaluation (2m window) |

**Trigger chain:**
1. External event triggers `qa.delivery`
2. On `qa.delivery.finished` → `production.delivery` starts automatically
3. On `production.remediation.finished` with `evaluation.result: "fail"` → `production.remediation` loops

## Pipeline Conventions

- **Approval strategy:** Both `pass` and `warning` outcomes use `automatic` approval in production, meaning no human gate is required by default.
- **Evaluation timeframe:** All evaluation tasks use a `2m` lookback window for SLI/SLO checks.
- **Remediation trigger:** Only fires when evaluation result is explicitly `"fail"` — warnings do not trigger self-healing.
- **Event naming pattern:** `{stage}.{sequence}.{status}` (e.g., `qa.delivery.finished`)

## Making Changes

### Adding a new task to a sequence
Insert a new task entry under the relevant sequence's `tasks` list in `shipyard.yaml`. Tasks execute in order and are handled by Keptn integrations registered to that task name.

```yaml
tasks:
  - name: "deployment"
  - name: "your-new-task"   # add here
  - name: "test"
```

### Adding a new stage
Add a new entry under `spec.stages`. Wire it into the trigger chain via `triggeredOn` using the upstream stage's `finished` event.

### Changing approval behavior
Modify the `approval` task's `pass` and `warning` fields. Valid values: `automatic`, `manual`.

```yaml
- name: "approval"
  properties:
    pass: "manual"     # require human sign-off on pass
    warning: "manual"  # require human sign-off on warning
```

### Changing evaluation timeframe
Modify the `timeframe` property on an `evaluation` task:

```yaml
- name: "evaluation"
  properties:
    timeframe: "5m"
```

## Commit Conventions

All historical commits follow this pattern:
- **Author:** automation or human — short descriptive message
- **Style:** lowercase, action-oriented (e.g., `add approval step to production`, `add self-healing to production`)
- **Scope:** one logical change per commit

Follow the same style for new commits.

## Branch Strategy

- `master` — stable, production-ready pipeline definition
- Feature branches use the pattern `{author}/{description}-{id}` (e.g., `claude/add-claude-documentation-YvIhz`)

## Keptn Context

- **Keptn API version:** `spec.keptn.sh/0.2.2`
- **Project name:** `fulltour` (defined in `metadata.yaml`)
- **Directory structure:** flat (`isUsingDirectoryStructure: false`)

Changes to `shipyard.yaml` take effect when pushed and synced to the Keptn control plane. Keptn validates the shipyard spec on ingestion — malformed YAML or invalid task/sequence names will cause silent failures in the pipeline.
