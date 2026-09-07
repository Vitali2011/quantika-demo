# Quantika Deploy Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Quantika merge actor dispatch one exact production SHA, queue all requests, prove the deployed SHA in a secret-free receipt, and detect drift without auto-deploying.

**Architecture:** Move dispatch out of auto-merge into an actor-neutral collector that creates a closed request artifact without secrets, then publish exactly one `repository_dispatch` from a `workflow_run` workflow after revalidation. This boundary covers Dependabot because GitHub withholds Actions secrets from its `pull_request_target` runs but permits secrets in the downstream `workflow_run`. Validate and forward `client_payload.sha` instead of `github.sha`; update the repository-owned forced-command deploy script to pin and prove that exact commit. Publish a closed receipt and compare it with `origin/main` plus a public health SHA in a separate read-only workflow.

**Tech Stack:** GitHub Actions YAML, Python 3 standard library contract fixtures, Bash deploy script fixtures, Next.js 16 health route and Jest.

## Global Constraints

- One canonical payload: `{"service":"quantika-demo","sha":"<40 lowercase hex>","source_pr":<positive integer>}`.
- Merge actors include humans, Dependabot (`app/dependabot`), and GitHub merge queue without actor-specific dispatch conditions.
- Deploy concurrency is `group: deploy-quantika-demo-prod`, `queue: max`, `cancel-in-progress: false`.
- `repository_dispatch` deploys `client_payload.sha`; manual dispatch requires an exact lowercase 40-hex SHA.
- Deploy script must build, reset, health-check, smoke, and record the same requested SHA; advancing `main` must not change the target.
- Receipt schema is identical to Allegro except `service=quantika-demo` and contains no secrets/environment dumps.
- Reconciliation may read GitHub and public health only; it never dispatches, SSHes, deploys, rolls back, or mutates production.
- No live workflow dispatch/rerun, merge, deploy, production checkout/service change, or secret read is authorized in this thread.
- Cross-repo order: either application PR can merge independently; Quantika's current production drift is repaired only after this workflow PR is merged and a separate approved dry-run records target and rollback SHAs.

---

### Task 1: Lock canonical dispatch, validation, receipt, and drift contracts

**Files:**
- Create: `ops/deploy_contract.py`
- Create: `scripts/ops/tests/deploy-reconciliation-contract.py`

**Interfaces:**
- Consumes: merged PR event JSON, changed paths, client payload JSON, exact deployed SHA, health production SHA.
- Produces: the same `build-dispatch`, `validate-request`, `create-receipt`, and `reconcile` commands and schemas as Allegro.

- [ ] **Step 1: Write failing mocked-event tests**

```python
def test_human_dependabot_and_merge_queue_dispatch_identically(self):
    actors = ("Vitali2011", "dependabot[bot]", "github-merge-queue[bot]")
    for actor in actors:
        body = build(actor=actor, sha="b" * 40, number=1104, paths=["app/page.tsx"])
        self.assertEqual(body["client_payload"], {
            "service": "quantika-demo", "sha": "b" * 40, "source_pr": 1104,
        })

def test_docs_only_merge_is_skipped_but_mixed_merge_dispatches(self):
    self.assertFalse(build(paths=["docs/runbook.md"])["deploy"])
    self.assertEqual(build(paths=["docs/runbook.md", "app/page.tsx"])["event_type"], "prod-deploy")
```

- [ ] **Step 2: Run tests remotely and record RED**

Run: `python3 scripts/ops/tests/deploy-reconciliation-contract.py -v`

Expected: FAIL because the contract CLI does not exist.

- [ ] **Step 3: Implement the closed standard-library CLI**

Use exact SHA regex `^[0-9a-f]{40}$`, exact payload keys `service/sha/source_pr`, exact eight receipt keys, integer source PR/run ID validation, UTC `Z` timestamps, and deterministic JSON. `reconcile` exits one with typed `DRIFT` evidence for any mismatch and has no execution primitives.

- [ ] **Step 4: Run contract tests and record GREEN**

Run: `python3 scripts/ops/tests/deploy-reconciliation-contract.py -v`

Expected: actor, docs-only, payload injection, uppercase/short SHA, extra key, receipt mismatch, secret-key, and drift cases PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add ops/deploy_contract.py scripts/ops/tests/deploy-reconciliation-contract.py
git commit -m "test(deploy): lock Quantika reconciliation contract"
```

### Task 2: Extract one merge dispatcher and queue exact deployment requests

**Files:**
- Create: `.github/workflows/deploy-dispatch.yml`
- Create: `.github/workflows/deploy-dispatch-publish.yml`
- Modify: `.github/workflows/auto-merge.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/ops/tests/deploy-reconciliation-contract.py`

**Interfaces:**
- Consumes: all closed merged PRs and GitHub Pulls API file names.
- Produces: one closed `deployment-request` artifact and one canonical `prod-deploy` from the downstream publisher; validated workflow output `steps.request.outputs.sha` is the only SSH SHA.

- [ ] **Step 1: Add failing static workflow assertions**

Assert exactly one file calls `/dispatches` and it is `deploy-dispatch-publish.yml`; `auto-merge.yml` has no `trigger-deploy`, deploy has no `push/pull_request` triggers, queue is `max`, cancellation is false, and the SSH command contains `steps.request.outputs.sha` but no `github.sha`.

- [ ] **Step 2: Run and record RED**

Run: `python3 scripts/ops/tests/deploy-reconciliation-contract.py -v`

Expected: FAIL because dispatch currently lives inside auto-merge and deploy forwards `github.sha`.

- [ ] **Step 3: Create trusted actor-neutral dispatcher**

Use `pull_request_target: {types: [closed], branches: [main]}` and guard only `merged == true`. Checkout base `main`, query changed filenames using the Pulls API, execute the trusted contract CLI, and upload only its closed JSON artifact. Never checkout or run PR code and never request a secret in this collector. A separate successful-`workflow_run` publisher downloads the upstream artifact, revalidates it, and is the only workflow that sends the body with existing `AUTO_REBASE_PAT`.

- [ ] **Step 4: Validate exact request before SSH and add queue**

```yaml
on:
  repository_dispatch:
    types: [prod-deploy]
  workflow_dispatch:
    inputs:
      sha:
        required: true
        type: string

concurrency:
  group: deploy-quantika-demo-prod
  queue: max
  cancel-in-progress: false
```

Use `toJson(github.event.client_payload)` for closed-schema validation and forward only `steps.request.outputs.sha` to `"quantika-demo <sha>"`. Add the Python contract and both Bash deploy fixtures to CI.

- [ ] **Step 5: Run and record GREEN**

Run: `python3 scripts/ops/tests/deploy-reconciliation-contract.py -v`

Expected: one dispatcher, every actor, docs skip, exact payload/forwarding, queue, and no duplicate trigger PASS.

- [ ] **Step 6: Commit dispatcher and workflow queue**

```bash
git add .github/workflows/deploy-dispatch.yml .github/workflows/deploy-dispatch-publish.yml .github/workflows/auto-merge.yml .github/workflows/deploy.yml .github/workflows/ci.yml scripts/ops/tests/deploy-reconciliation-contract.py
git commit -m "fix(deploy): canonicalize Quantika exact-SHA dispatch"
```

### Task 3: Pin the forced-command script to the requested SHA and prove completion

**Files:**
- Modify: `ops/scripts/deploy-quantika-demo.sh`
- Modify: `scripts/ops/tests/deploy-quantika-demo-unit.sh`
- Modify: `scripts/ops/tests/deploy-quantika-demo-adversarial.sh`
- Modify: `scripts/ops/tests/deploy-reconciliation-contract.py`

**Interfaces:**
- Consumes: exact lowercase 40-hex SHA on `origin/main` ancestry.
- Produces: build/reset/health/smoke for that same SHA and exactly one `DEPLOY_RECEIPT_SHA=<sha>` marker after `HEAD == requested SHA`.

- [ ] **Step 1: Add failing exact-SHA deploy fixtures**

Update mocked SHAs to real 40-hex values. Add cases where `origin/main` advances beyond the request, duplicate exact target rechecks health/smoke, older-than-current request fails, invalid/uppercase SHA is rejected, and marker is absent on build/health/smoke/rollback failure.

- [ ] **Step 2: Run both Bash suites and record RED**

```bash
bash scripts/ops/tests/deploy-quantika-demo-unit.sh
bash scripts/ops/tests/deploy-quantika-demo-adversarial.sh
```

Expected: exact-target assertions FAIL because current code replaces the request with `git rev-parse origin/main`.

- [ ] **Step 3: Implement exact target pinning**

Validate `$ARG1`, fetch main, resolve exactly `${ARG1}^{commit}`, require it to be on `origin/main`, and require current HEAD to be an ancestor unless already equal. Build and reset `TARGET_SHA=$ARG1`; never substitute the new main tip. For exact idempotence run health and smoke without build/reset. After success require `git rev-parse HEAD == TARGET_SHA`, persist that SHA, and print one receipt marker. An older request behind current HEAD is a nonzero error, not a successful NOOP.

- [ ] **Step 4: Run Bash suites and record GREEN**

```bash
bash scripts/ops/tests/deploy-quantika-demo-unit.sh
bash scripts/ops/tests/deploy-quantika-demo-adversarial.sh
python3 scripts/ops/tests/deploy-reconciliation-contract.py -v
```

Expected: all staged-build, rollback, exact-target, marker, and workflow cases PASS.

- [ ] **Step 5: Commit exact deployed-SHA proof**

```bash
git add ops/scripts/deploy-quantika-demo.sh scripts/ops/tests/deploy-quantika-demo-unit.sh scripts/ops/tests/deploy-quantika-demo-adversarial.sh scripts/ops/tests/deploy-reconciliation-contract.py
git commit -m "fix(deploy): pin and prove Quantika target SHA"
```

### Task 4: Publish receipt and expose a full health SHA for read-only reconciliation

**Files:**
- Create: `.github/workflows/deploy-reconcile.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `app/api/health/route.ts`
- Modify: `app/api/health/__tests__/health.test.ts`
- Modify: `ops/scripts/deploy-quantika-demo.sh`
- Modify: `scripts/ops/tests/deploy-reconciliation-contract.py`

**Interfaces:**
- Consumes: exact receipt marker, run ID, latest successful receipt, public `/api/health.git_sha`.
- Produces: `deployment-receipt-quantika-demo/deployment-receipt.json` and typed read-only reconciliation result.

- [ ] **Step 1: Add failing health/receipt/no-write tests**

```typescript
it('git-sha-field: exposes one exact deployed commit', async () => {
  process.env.APP_GIT_SHA = 'c'.repeat(40);
  expect((await (await GET()).json()).git_sha).toBe('c'.repeat(40));
});
```

Static tests require the receipt's exact keys and forbid `repository_dispatch`, `ssh`, deploy, rollback, and write-oriented API calls in reconciliation.

- [ ] **Step 2: Run and record RED**

```bash
npx jest app/api/health/__tests__/health.test.ts --runInBand
python3 scripts/ops/tests/deploy-reconciliation-contract.py -v
```

Expected: FAIL because health has no SHA and receipt/reconciliation are absent.

- [ ] **Step 3: Bind app health to the deployed SHA**

Write the exact SHA to a repository-local runtime marker only after successful exact HEAD verification, restore/update it on rollback paths, and make the health route validate/read that marker (with exact `APP_GIT_SHA` as a test/build override). Invalid or absent values return `unknown`, never an unchecked string.

- [ ] **Step 4: Upload only the closed receipt**

Parse exactly one marker after SSH success, call `create-receipt`, and upload only JSON through `actions/upload-artifact@v4`; do not upload SSH output or environment dumps.

- [ ] **Step 5: Add read-only scheduled/manual reconciliation**

The workflow reads current main, downloads the latest successful receipt, fetches the public health JSON, and runs `reconcile`. A mismatch fails with typed drift evidence. The file contains no token with write permission and no deploy-capable command.

- [ ] **Step 6: Run and record GREEN**

```bash
npx jest app/api/health/__tests__/health.test.ts --runInBand
python3 scripts/ops/tests/deploy-reconciliation-contract.py -v
bash scripts/ops/tests/deploy-quantika-demo-unit.sh
bash scripts/ops/tests/deploy-quantika-demo-adversarial.sh
```

Expected: health SHA, closed receipt, drift/no-auto-deploy, exact target, and rollback suites PASS.

- [ ] **Step 7: Commit receipt and reconciliation**

```bash
git add .github/workflows/deploy.yml .github/workflows/deploy-reconcile.yml app/api/health/route.ts app/api/health/__tests__/health.test.ts ops/scripts/deploy-quantika-demo.sh scripts/ops/tests/deploy-reconciliation-contract.py
git commit -m "feat(deploy): add Quantika receipt reconciliation"
```

### Task 5: Verify, review, and prepare the ready PR

**Files:**
- Modify if review finds defects: only the files listed above.

**Interfaces:**
- Consumes: complete branch.
- Produces: exact remote test evidence, pushed branch, ready non-merged PR, and explicit drift-recovery order.

- [ ] **Step 1: Run focused remote integration**

```bash
python3 scripts/ops/tests/deploy-reconciliation-contract.py -v
bash scripts/ops/tests/deploy-quantika-demo-unit.sh
bash scripts/ops/tests/deploy-quantika-demo-adversarial.sh
npx jest app/api/health/__tests__/health.test.ts --runInBand
npm run lint -- --max-warnings=0
npx tsc --noEmit
NODE_OPTIONS=--max-old-space-size=6144 npm run build
bash -n ops/scripts/deploy-quantika-demo.sh
```

Run sequentially on dev-vps and record exact counts plus `git rev-parse HEAD`.

- [ ] **Step 2: Perform security review**

Verify privileged dispatcher never executes PR code; untrusted event/payload/health fields are exact-schema validated; shell receives only validated SHA; receipt artifact cannot contain secrets; reconciliation has read-only permissions and no deploy route; runtime SHA marker cannot select a deploy target.

- [ ] **Step 3: Perform code review and fix only scoped findings**

Inspect `git diff origin/main...HEAD`, run `git diff --check`, and rerun exact affected tests for each correction.

- [ ] **Step 4: Push and open ready PR without auto-merge**

```bash
git push -u origin codex/deploy-reconciliation-2026-07-22
gh pr create --repo Vitali2011/quantika-demo --base main --head codex/deploy-reconciliation-2026-07-22 --title "fix(deploy): exact-SHA queue and receipts [deploy-affects]" --body-file /tmp/quantika-deploy-pr.md
```

Do not label `code-only`, enable auto-merge, merge, dispatch, rerun, deploy, or reconcile production in this thread. After a future merge, Quantika drift recovery remains a separate production change: record rollback SHA, dry-run the exact forced-command path, dispatch target once, verify receipt/public health/HEAD, and rollback on failure.
