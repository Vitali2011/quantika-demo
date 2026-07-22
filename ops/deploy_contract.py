#!/usr/bin/env python3
"""Closed contracts for deployment dispatch, receipts, and reconciliation."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SHA_RE = re.compile(r"^[0-9a-f]{40}$")
PAYLOAD_KEYS = {"service", "sha", "source_pr"}
RECEIPT_KEYS = {
    "schema_version",
    "service",
    "requested_sha",
    "deployed_sha",
    "run_id",
    "health",
    "smoke",
    "deployed_at",
}
DOCS_ONLY_PREFIXES = ("docs/", ".claude/", ".github/", ".specs/")


class ContractError(ValueError):
    """The supplied deployment data does not match the closed contract."""


def exact_sha(value: object, field: str) -> str:
    if not isinstance(value, str) or SHA_RE.fullmatch(value) is None:
        raise ContractError(f"{field} must be exactly 40 lowercase hex characters")
    return value


def positive_int(value: object, field: str) -> int:
    if type(value) is not int or value <= 0:
        raise ContractError(f"{field} must be a positive integer")
    return value


def validate_payload(payload: object, expected_service: str) -> dict[str, object]:
    if not isinstance(payload, dict) or set(payload) != PAYLOAD_KEYS:
        raise ContractError(
            "client_payload must use exactly service, sha, and source_pr"
        )
    if payload["service"] != expected_service:
        raise ContractError(f"service must be {expected_service}")
    exact_sha(payload["sha"], "sha")
    positive_int(payload["source_pr"], "source_pr")
    return payload


def docs_only(path: str) -> bool:
    normalized = path.strip()
    if not normalized or normalized.startswith("/") or ".." in normalized.split("/"):
        raise ContractError(f"invalid changed path: {path!r}")
    return normalized.startswith(DOCS_ONLY_PREFIXES) or (
        "/" not in normalized and normalized.lower().endswith(".md")
    )


def build_dispatch(
    service: str, event: object, changed_files: list[str]
) -> dict[str, object]:
    if not isinstance(event, dict) or event.get("action") != "closed":
        raise ContractError("dispatcher accepts only a closed pull request event")
    pull_request = event.get("pull_request")
    if not isinstance(pull_request, dict) or pull_request.get("merged") is not True:
        raise ContractError("pull request must be merged")
    base = pull_request.get("base")
    if not isinstance(base, dict) or base.get("ref") != "main":
        raise ContractError("pull request base must be main")
    if not changed_files:
        raise ContractError("changed file list must not be empty")
    if all(docs_only(path) for path in changed_files):
        return {"deploy": False, "reason": "docs-only"}

    payload: dict[str, object] = {
        "service": service,
        "sha": exact_sha(pull_request.get("merge_commit_sha"), "merge_commit_sha"),
        "source_pr": positive_int(pull_request.get("number"), "pull_request.number"),
    }
    validate_payload(payload, service)
    return {"event_type": "prod-deploy", "client_payload": payload}


def utc_timestamp(value: str | None) -> str:
    if value is None:
        return (
            datetime.now(timezone.utc)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z")
        )
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ContractError("deployed_at must be an ISO-8601 timestamp") from exc
    if not value.endswith("Z") or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise ContractError("deployed_at must be UTC and end with Z")
    return value


def create_receipt(
    service: str,
    requested_sha: str,
    deployed_sha: str,
    run_id: int,
    deployed_at: str | None,
) -> dict[str, object]:
    requested = exact_sha(requested_sha, "requested_sha")
    deployed = exact_sha(deployed_sha, "deployed_sha")
    if deployed != requested:
        raise ContractError("deployed_sha must equal requested_sha")
    return {
        "schema_version": 1,
        "service": service,
        "requested_sha": requested,
        "deployed_sha": deployed,
        "run_id": positive_int(run_id, "run_id"),
        "health": "PASS",
        "smoke": "PASS",
        "deployed_at": utc_timestamp(deployed_at),
    }


def validate_receipt(receipt: object, expected_service: str) -> dict[str, Any]:
    if not isinstance(receipt, dict) or set(receipt) != RECEIPT_KEYS:
        raise ContractError("receipt does not use the closed schema")
    if receipt["schema_version"] != 1 or receipt["service"] != expected_service:
        raise ContractError("receipt schema_version or service is invalid")
    requested = exact_sha(receipt["requested_sha"], "receipt.requested_sha")
    deployed = exact_sha(receipt["deployed_sha"], "receipt.deployed_sha")
    if requested != deployed:
        raise ContractError("receipt requested and deployed SHAs differ")
    positive_int(receipt["run_id"], "receipt.run_id")
    if receipt["health"] != "PASS" or receipt["smoke"] != "PASS":
        raise ContractError("receipt health and smoke must both be PASS")
    utc_timestamp(receipt["deployed_at"])
    return receipt


def reconcile(
    service: str,
    main_sha: str,
    receipt: object,
    production_sha: str,
) -> tuple[dict[str, object], int]:
    main = exact_sha(main_sha, "main_sha")
    production = exact_sha(production_sha, "production_sha")
    validated = validate_receipt(receipt, service)
    receipt_sha = str(validated["deployed_sha"])
    status = "IN_SYNC" if main == receipt_sha == production else "DRIFT"
    return (
        {
            "schema_version": 1,
            "service": service,
            "status": status,
            "main_sha": main,
            "receipt_sha": receipt_sha,
            "production_sha": production,
            "receipt_run_id": validated["run_id"],
        },
        0 if status == "IN_SYNC" else 1,
    )


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)

    dispatch = commands.add_parser("build-dispatch")
    dispatch.add_argument("--service", required=True)
    dispatch.add_argument("--event", required=True, type=Path)
    dispatch.add_argument("--changed-files", required=True, type=Path)

    request = commands.add_parser("validate-request")
    request.add_argument("--expected-service", required=True)
    request_source = request.add_mutually_exclusive_group(required=True)
    request_source.add_argument("--payload-json")
    request_source.add_argument("--manual-sha")

    receipt = commands.add_parser("create-receipt")
    receipt.add_argument("--service", required=True)
    receipt.add_argument("--requested-sha", required=True)
    receipt.add_argument("--deployed-sha", required=True)
    receipt.add_argument("--run-id", required=True, type=int)
    receipt.add_argument("--deployed-at")

    reconciliation = commands.add_parser("reconcile")
    reconciliation.add_argument("--service", required=True)
    reconciliation.add_argument("--main-sha", required=True)
    reconciliation.add_argument("--receipt", required=True, type=Path)
    reconciliation.add_argument("--production-sha", required=True)
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "build-dispatch":
            event = json.loads(args.event.read_text(encoding="utf-8"))
            paths = args.changed_files.read_text(encoding="utf-8").splitlines()
            output = build_dispatch(args.service, event, paths)
            print(json.dumps(output, sort_keys=True, separators=(",", ":")))
            return 0
        if args.command == "validate-request":
            if args.manual_sha is not None:
                print(exact_sha(args.manual_sha, "manual sha"))
                return 0
            payload = json.loads(args.payload_json)
            print(validate_payload(payload, args.expected_service)["sha"])
            return 0
        if args.command == "create-receipt":
            output = create_receipt(
                args.service,
                args.requested_sha,
                args.deployed_sha,
                args.run_id,
                args.deployed_at,
            )
            print(json.dumps(output, sort_keys=True, separators=(",", ":")))
            return 0
        if args.command == "reconcile":
            receipt = json.loads(args.receipt.read_text(encoding="utf-8"))
            output, return_code = reconcile(
                args.service,
                args.main_sha,
                receipt,
                args.production_sha,
            )
            print(json.dumps(output, sort_keys=True, separators=(",", ":")))
            return return_code
        raise ContractError(f"unsupported command: {args.command}")
    except (ContractError, json.JSONDecodeError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
