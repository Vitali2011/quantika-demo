#!/usr/bin/env python3
"""Contract fixtures for exact-SHA deployment dispatch and reconciliation."""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACT = REPO_ROOT / "ops" / "deploy_contract.py"
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
SHA_A = "a" * 40
SHA_B = "b" * 40


def merged_event(
    actor: str = "Vitali2011", sha: str = SHA_A, number: int = 1104
) -> dict:
    return {
        "action": "closed",
        "sender": {"login": actor},
        "pull_request": {
            "merged": True,
            "merge_commit_sha": sha,
            "number": number,
            "base": {"ref": "main"},
        },
    }


class ContractCliTest(unittest.TestCase):
    def run_cli(
        self, *args: str, expected_rc: int = 0
    ) -> subprocess.CompletedProcess[str]:
        self.assertTrue(CONTRACT.exists(), f"missing contract CLI: {CONTRACT}")
        result = subprocess.run(
            ["python3", str(CONTRACT), *args],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, expected_rc, result.stderr or result.stdout)
        return result

    def build_dispatch(self, event: dict, paths: list[str]) -> dict:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            event_path = root / "event.json"
            paths_path = root / "paths.txt"
            event_path.write_text(json.dumps(event), encoding="utf-8")
            paths_path.write_text("\n".join(paths) + "\n", encoding="utf-8")
            result = self.run_cli(
                "build-dispatch",
                "--service",
                "quantika-demo",
                "--event",
                str(event_path),
                "--changed-files",
                str(paths_path),
            )
        return json.loads(result.stdout)

    def test_human_dependabot_and_merge_queue_dispatch_identically(self) -> None:
        for actor in ("Vitali2011", "dependabot[bot]", "github-merge-queue[bot]"):
            with self.subTest(actor=actor):
                result = self.build_dispatch(
                    merged_event(actor=actor), ["app/page.tsx"]
                )
                self.assertEqual(
                    result,
                    {
                        "event_type": "prod-deploy",
                        "client_payload": {
                            "service": "quantika-demo",
                            "sha": SHA_A,
                            "source_pr": 1104,
                        },
                    },
                )

    def test_docs_only_skips_but_mixed_change_dispatches(self) -> None:
        self.assertEqual(
            self.build_dispatch(merged_event(), ["docs/runbook.md", "README.md"]),
            {"deploy": False, "reason": "docs-only"},
        )
        mixed = self.build_dispatch(merged_event(), ["docs/runbook.md", "app/page.tsx"])
        self.assertEqual(mixed["event_type"], "prod-deploy")

    def test_validate_request_rejects_wrong_service_short_uppercase_and_extra_keys(
        self,
    ) -> None:
        payload = {"service": "quantika-demo", "sha": SHA_A, "source_pr": 1104}
        accepted = self.run_cli(
            "validate-request",
            "--expected-service",
            "quantika-demo",
            "--payload-json",
            json.dumps(payload),
        )
        self.assertEqual(accepted.stdout.strip(), SHA_A)
        for bad_payload in (
            {**payload, "sha": SHA_A.upper()},
            {**payload, "sha": "abc"},
            {**payload, "service": "allegro-lister"},
            {**payload, "source_pr": 0},
            {**payload, "secret": "must-not-pass"},
        ):
            with self.subTest(payload=bad_payload):
                self.run_cli(
                    "validate-request",
                    "--expected-service",
                    "quantika-demo",
                    "--payload-json",
                    json.dumps(bad_payload),
                    expected_rc=2,
                )

    def test_manual_request_requires_exact_lowercase_sha(self) -> None:
        accepted = self.run_cli(
            "validate-request",
            "--expected-service",
            "quantika-demo",
            "--manual-sha",
            SHA_A,
        )
        self.assertEqual(accepted.stdout.strip(), SHA_A)
        for sha in ("abc", SHA_A.upper()):
            self.run_cli(
                "validate-request",
                "--expected-service",
                "quantika-demo",
                "--manual-sha",
                sha,
                expected_rc=2,
            )

    def test_receipt_is_closed_secret_free_and_rejects_sha_mismatch(self) -> None:
        result = self.run_cli(
            "create-receipt",
            "--service",
            "quantika-demo",
            "--requested-sha",
            SHA_A,
            "--deployed-sha",
            SHA_A,
            "--run-id",
            "456",
            "--deployed-at",
            "2026-07-22T12:00:00Z",
        )
        receipt = json.loads(result.stdout)
        self.assertEqual(
            set(receipt),
            {
                "schema_version",
                "service",
                "requested_sha",
                "deployed_sha",
                "run_id",
                "health",
                "smoke",
                "deployed_at",
            },
        )
        self.assertEqual(receipt["requested_sha"], receipt["deployed_sha"])
        self.assertNotRegex(
            json.dumps(receipt).lower(), r"secret|token|password|environment|env_"
        )
        self.run_cli(
            "create-receipt",
            "--service",
            "quantika-demo",
            "--requested-sha",
            SHA_A,
            "--deployed-sha",
            SHA_B,
            "--run-id",
            "456",
            expected_rc=2,
        )

    def test_reconcile_reports_typed_drift(self) -> None:
        receipt = {
            "schema_version": 1,
            "service": "quantika-demo",
            "requested_sha": SHA_A,
            "deployed_sha": SHA_A,
            "run_id": 456,
            "health": "PASS",
            "smoke": "PASS",
            "deployed_at": "2026-07-22T12:00:00Z",
        }
        with tempfile.TemporaryDirectory() as directory:
            receipt_path = Path(directory) / "receipt.json"
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            matched = self.run_cli(
                "reconcile",
                "--service",
                "quantika-demo",
                "--main-sha",
                SHA_A,
                "--receipt",
                str(receipt_path),
                "--production-sha",
                SHA_A,
            )
            self.assertEqual(json.loads(matched.stdout)["status"], "IN_SYNC")
            drift = self.run_cli(
                "reconcile",
                "--service",
                "quantika-demo",
                "--main-sha",
                SHA_B,
                "--receipt",
                str(receipt_path),
                "--production-sha",
                SHA_A,
                expected_rc=1,
            )
            self.assertEqual(json.loads(drift.stdout)["status"], "DRIFT")

            unavailable = self.run_cli(
                "reconcile",
                "--service",
                "quantika-demo",
                "--main-sha",
                SHA_A,
                "--receipt",
                str(receipt_path.with_name("missing.json")),
                "--production-sha",
                "unknown",
                expected_rc=1,
            )
            unavailable_result = json.loads(unavailable.stdout)
            self.assertEqual(unavailable_result["status"], "DRIFT")
            self.assertIn("errors", unavailable_result)


class WorkflowContractTest(unittest.TestCase):
    def test_one_actor_neutral_dispatcher_and_no_duplicate_trigger(self) -> None:
        dispatchers = []
        for workflow in WORKFLOWS.glob("*.yml"):
            text = workflow.read_text(encoding="utf-8")
            if "/dispatches" in text:
                dispatchers.append(workflow.name)
        self.assertEqual(dispatchers, ["deploy-dispatch-publish.yml"])
        collector = (WORKFLOWS / "deploy-dispatch.yml").read_text(encoding="utf-8")
        self.assertIn("pull_request_target:", collector)
        self.assertNotIn("secrets.", collector)
        publisher = (WORKFLOWS / "deploy-dispatch-publish.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("workflow_run:", publisher)
        self.assertIn("validate-request", publisher)

        auto_merge = (WORKFLOWS / "auto-merge.yml").read_text(encoding="utf-8")
        self.assertNotIn("trigger-deploy:", auto_merge)

        deploy = (WORKFLOWS / "deploy.yml").read_text(encoding="utf-8")
        self.assertIn("repository_dispatch:", deploy)
        self.assertIn("workflow_dispatch:", deploy)
        self.assertNotIn("  push:", deploy)
        self.assertNotIn("  pull_request_target:", deploy)
        self.assertIn("group: deploy-quantika-demo-prod", deploy)
        self.assertIn("queue: max", deploy)
        self.assertIn("cancel-in-progress: false", deploy)
        self.assertIn("steps.request.outputs.sha", deploy)
        self.assertNotIn("github.sha", deploy)

    def test_dispatch_is_serialized_rerun_safe_and_actions_are_pinned(self) -> None:
        collector = (WORKFLOWS / "deploy-dispatch.yml").read_text(encoding="utf-8")
        publisher = (WORKFLOWS / "deploy-dispatch-publish.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("group: deploy-dispatch-collector-quantika-demo", collector)
        self.assertIn("queue: max", collector)
        self.assertIn("cancel-in-progress: false", collector)
        self.assertIn("group: deploy-dispatch-publisher-quantika-demo", publisher)
        self.assertIn("queue: max", publisher)
        self.assertIn("cancel-in-progress: false", publisher)
        self.assertIn("github.event.workflow_run.run_attempt == 1", publisher)
        self.assertIn("github.run_attempt == 1", publisher)

        for name in (
            "deploy-dispatch.yml",
            "deploy-dispatch-publish.yml",
            "deploy.yml",
            "deploy-reconcile.yml",
        ):
            for line in (WORKFLOWS / name).read_text(encoding="utf-8").splitlines():
                if "uses:" in line:
                    reference = line.split("@", 1)[-1].split()[0]
                    self.assertRegex(reference, r"^[0-9a-f]{40}$", f"{name}: {line}")

    def test_receipt_and_reconciliation_workflows_are_closed_and_read_only(
        self,
    ) -> None:
        deploy = (WORKFLOWS / "deploy.yml").read_text(encoding="utf-8")
        self.assertIn("DEPLOY_RECEIPT_SHA", deploy)
        self.assertIn("actions/upload-artifact@ea165f8d", deploy)
        self.assertIn("deployment-receipt-quantika-demo", deploy)
        self.assertIn("jq -er '.git_sha'", deploy)
        self.assertIn('test "$production_sha" = "$REQUESTED_SHA"', deploy)

        ci = (WORKFLOWS / "ci.yml").read_text(encoding="utf-8")
        self.assertIn("bash scripts/ops/tests/deploy-quantika-demo-unit.sh", ci)
        self.assertIn("bash scripts/ops/tests/deploy-quantika-demo-adversarial.sh", ci)

        reconcile = (WORKFLOWS / "deploy-reconcile.yml").read_text(encoding="utf-8")
        self.assertEqual(reconcile.count("continue-on-error: true"), 2)
        self.assertIn("production_sha=unknown", reconcile)
        for forbidden in (
            "/dispatches",
            "repository_dispatch",
            "ssh ",
            "deploy.sh",
            "rollback",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, reconcile)


if __name__ == "__main__":
    unittest.main()
