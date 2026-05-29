#!/usr/bin/env python3
"""Build critic prompts from a progong harness run result.

Usage:
  python3 scripts/build-critic-prompts.py --round 2

Output: /tmp/critic_r2_<n>.txt for each case.
"""
import json
import os
import sys
import argparse

CORPUS_DIR = os.path.join(os.path.dirname(__file__), '..', '.progong', 'corpus')
RESULTS_DIR = os.path.join(os.path.dirname(__file__), '..', '.progong', 'results')
DESIGN_DECISIONS = os.path.join(os.path.dirname(__file__), '..', '.progong', 'design-decisions.md')
SCHEMA_GAPS = os.path.join(os.path.dirname(__file__), '..', '.progong', 'schema-gaps.md')
GEMINI_QUIRKS = os.path.join(os.path.dirname(__file__), '..', '.progong', 'gemini-quirks.md')

CRITIC_SYSTEM = """You are a Senior shipping broker with 20 years experience in dry-bulk chartering, Black Sea/Mediterranean/Baltic corridors.
Perspective: Extremely skeptical — your job is to find semantic errors the parser made, not to confirm correctness.

TASK: Review Gemini's output for one shipping email and return a JSON verdict.

SEVERITY RUBRIC:
CRITICAL: wrong category; fabricated fields; weight/port completely wrong; items=[] for actual cargo/vessel; null for explicitly stated field; cert misclassified as cargo/vessel
HIGH: urgency off by 2+ levels; DWT off by >5%; originalSender from domain not signature; load/discharge rate swapped; literal "null" string instead of JSON null
MEDIUM: urgency off by 1 level; minor port variation; confidence over-marked; originalSenderCompany wrong
LOW: formatting variants; optional missing fields; enum synonym
"""

INSTRUCTIONS = """
===INSTRUCTIONS===
1. Is the classification category correct? Check subject+body carefully.
2. Are the key fields correct (port names, cargo weight/type, vessel DWT, owners/charterers, laycan)?
3. Is urgency appropriate per rubric?
4. Are there any HIGH or CRITICAL errors?

Return ONLY valid JSON in this exact format (no other text):
{
  "caseId": "EXPECTED_CATEGORY/EMAIL_ID",
  "verdict": "PASS or FAIL",
  "perSampleVerdicts": [{"sample": 0, "verdict": "PASS or FAIL"}],
  "issues": [
    {"sample": 0, "severity": "CRITICAL|HIGH|MEDIUM|LOW", "field": "...", "problem": "...", "expected": "...", "got": "...", "bucket_hint": "real_bug|schema_gap|design_disagreement|provider_artefact"}
  ],
  "overallComment": "brief summary"
}"""

def read_file_safe(path):
    try:
        with open(path) as f:
            return f.read().strip()
    except FileNotFoundError:
        return "(file not found)"

def load_corpus_email(email_id, results):
    """Find the corpus file for this email ID by scanning corpus dirs."""
    for cat in os.listdir(CORPUS_DIR):
        cat_dir = os.path.join(CORPUS_DIR, cat)
        if not os.path.isdir(cat_dir):
            continue
        for fname in os.listdir(cat_dir):
            if not fname.endswith('.json'):
                continue
            path = os.path.join(cat_dir, fname)
            try:
                with open(path) as f:
                    sample = json.load(f)
                if sample.get('id') == email_id:
                    return sample, cat
            except Exception:
                pass
    return None, None

def format_gemini_output(result):
    """Format the Gemini run result as human-readable text."""
    parts = []

    classify = result.get('classify')
    if classify:
        parts.append("CLASSIFY:")
        parts.append(json.dumps(classify, indent=2))
    else:
        parts.append("CLASSIFY: (error or missing)")

    parts.append("\nPARSE_CARGO (if run):")
    parts.append(json.dumps(result.get('parse_cargo', []), indent=2))

    parts.append("\nPARSE_VESSEL (if run):")
    parts.append(json.dumps(result.get('parse_vessel', []), indent=2))

    parts.append("\nPARSE_RECAP (if run):")
    parts.append(json.dumps(result.get('parse_recap', []), indent=2))

    return '\n'.join(parts)

def build_prompt(result, sample, corpus_category, design_decisions, schema_gaps, gemini_quirks):
    email_id = result['id']
    subject = sample.get('subject', '(unknown)')
    from_field = sample.get('from', '(unknown)')
    date_field = sample.get('date', '(unknown)')
    body = sample.get('body', '(no body)')

    classify = result.get('classify', {}) or {}
    parsed_category = classify.get('category', corpus_category)
    case_id = f"{parsed_category}/{email_id}"

    email_verbatim = f"Subject: {subject}\nFrom: {from_field}\nDate: {date_field}\nBody: \n{body}"
    gemini_output = format_gemini_output(result)

    prompt = f"""{CRITIC_SYSTEM}

DESIGN DECISIONS (do NOT flag these as bugs):
{design_decisions}

SCHEMA GAPS (do NOT flag these as bugs):
{schema_gaps}

GEMINI QUIRKS (provider artefacts, not prompt bugs):
{gemini_quirks if gemini_quirks else '(none observed yet)'}

===ORIGINAL EMAIL (verbatim)===
{email_verbatim}

===GEMINI OUTPUT===
{gemini_output}
{INSTRUCTIONS.replace('EXPECTED_CATEGORY/EMAIL_ID', case_id)}"""
    return prompt, case_id

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--round', type=int, required=True)
    parser.add_argument('--out-dir', default='/tmp')
    args = parser.parse_args()

    run_file = os.path.join(RESULTS_DIR, f'run-{args.round:03d}.json')
    if not os.path.exists(run_file):
        print(f"ERROR: {run_file} not found", file=sys.stderr)
        sys.exit(1)

    with open(run_file) as f:
        results = json.load(f)

    design_decisions = read_file_safe(DESIGN_DECISIONS)
    schema_gaps = read_file_safe(SCHEMA_GAPS)
    gemini_quirks = read_file_safe(GEMINI_QUIRKS)

    print(f"Building critic prompts for round {args.round} ({len(results)} cases)...")

    for i, result in enumerate(results):
        email_id = result.get('id')
        if not email_id:
            print(f"  case {i}: missing id, skipping")
            continue

        sample, corpus_category = load_corpus_email(email_id, results)
        if sample is None:
            print(f"  case {i} ({email_id}): corpus file not found, skipping")
            continue

        prompt, case_id = build_prompt(result, sample, corpus_category, design_decisions, schema_gaps, gemini_quirks)

        out_path = os.path.join(args.out_dir, f'critic_r{args.round}_{i:02d}.txt')
        with open(out_path, 'w') as f:
            f.write(prompt)

        print(f"  [{i:02d}] {case_id} → {out_path}")

    print("Done.")

if __name__ == '__main__':
    main()
