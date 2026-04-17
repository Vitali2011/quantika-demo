#!/usr/bin/env bash
# =============================================================================
# Quantika Demo — Extended Smoke Test L8-L13
# Phase 3 audit regression & invariant checks (2026-04-17)
# Запускать: bash smoke-test-extended.sh
# Зависимости: sshpass, jq (на VPS: python3, sqlite3)
# =============================================================================

set -uo pipefail

VPS_HOST="185.249.225.169"
VPS_USER="root"
VPS_PASS="${VPS_PASS:-Vit15932}"
APP_DIR="/root/quantika-demo"
DB_PATH="${APP_DIR}/data/sessions.db"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

PASS=0; FAIL=0; WARN=0
REPORT=()

pass()   { echo -e "${GREEN}  ✅ PASS${RESET} $1"; PASS=$((PASS+1));  REPORT+=("PASS  | $1"); }
fail()   { echo -e "${RED}  ❌ FAIL${RESET} $1"; FAIL=$((FAIL+1));  REPORT+=("FAIL  | $1"); }
warn()   { echo -e "${YELLOW}  ⚠️  WARN${RESET} $1"; WARN=$((WARN+1));  REPORT+=("WARN  | $1"); }
info()   { echo -e "${CYAN}  ℹ  ${RESET}$1"; }
header() { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${RESET}"; }

SSH() {
  sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no \
    -o ConnectTimeout=10 -o LogLevel=ERROR \
    "${VPS_USER}@${VPS_HOST}" "$@"
}

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   Quantika Demo — Extended Smoke Test L8-L13        ║${RESET}"
echo -e "${BOLD}║   $(date '+%Y-%m-%d %H:%M:%S')  VPS: ${VPS_HOST}          ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"

# Quick SSH check
if ! SSH "echo ok" &>/dev/null; then
  echo -e "${RED}FATAL: SSH недоступен — тесты невозможны${RESET}"
  exit 1
fi

# =============================================================================
header "LEVEL 8 — Email-level extraction audit (regression + generic)"
# =============================================================================

L8_OUTPUT=$(SSH python3 << 'PYEOF'
import sqlite3
import json
import re
import sys

DB_PATH = "/root/quantika-demo/data/sessions.db"

def check(cond, label, note=""):
    tag = "PASS" if cond else "FAIL"
    msg = f"{tag}: {label}"
    if note:
        msg += f" [{note}]"
    print(msg)
    return cond

try:
    conn = sqlite3.connect(DB_PATH)
    # Largest session = sample data session
    row = conn.execute(
        "SELECT data FROM sessions ORDER BY length(data) DESC LIMIT 1"
    ).fetchone()
    conn.close()

    if not row:
        print("WARN: нет сессий в БД — пропускаю L8")
        sys.exit(0)

    data = json.loads(row[0])
    emails  = data.get("emails", [])
    cargos  = data.get("parsedCargos", [])
    vessels = data.get("parsedVessels", [])

    if not emails:
        print("WARN: emails пусты — нечего проверять в L8")
        sys.exit(0)

    # Build lookup maps by emailId
    cargo_by_id  = {c.get("emailId"): c for c in cargos}
    vessel_by_id = {v.get("emailId"): v for v in vessels}

    # -----------------------------------------------------------------
    # Patterns
    # -----------------------------------------------------------------
    RE_RATE_TERMS = re.compile(
        r'FIO\s*SHINC|CQD\s*(both\s*ends)?|\d+[,.]?\d*\s*SHINC',
        re.IGNORECASE
    )
    RE_LAST_CARGO = re.compile(r'L\/C[:\s]|last\s*cargo(?:es)?', re.IGNORECASE)
    RE_GEARLESS   = re.compile(r'\bgearless\b', re.IGNORECASE)
    RE_SPOT       = re.compile(r'\bspot\b|\bprompt\b', re.IGNORECASE)
    RE_WGT_RANGE  = re.compile(
        r'(\d[\d,]*)\s*/\s*(\d[\d,]*)\s*(mt|mts)\b',
        re.IGNORECASE
    )

    # Per-email audit
    rate_terms_fails  = 0
    last_cargo_fails  = 0
    gearless_fails    = 0
    spot_fails        = 0
    weight_range_ok   = 0
    weight_range_fail = 0

    for email in emails:
        eid  = email.get("id", "?")
        body = email.get("body", "") or ""
        etype = email.get("type", "")

        # ── L8.1  Rate terms → loadingRate/dischargeRate populated ────────
        if RE_RATE_TERMS.search(body):
            cargo = cargo_by_id.get(eid)
            if cargo:
                lr = cargo.get("loadingRate")
                dr = cargo.get("dischargeRate")
                has_rate = (lr not in (None, "", "null")) or (dr not in (None, "", "null"))
                if not has_rate:
                    print(f"FAIL: L8.1 REGRESSION rate-terms — cargo {eid}: "
                          f"email содержит FIO SHINC/CQD но loadingRate={lr}, dischargeRate={dr}")
                    rate_terms_fails += 1
                else:
                    print(f"PASS: L8.1 rate-terms cargo {eid}: loadingRate={lr}, dischargeRate={dr}")
            # vessel emails don't carry loadingRate — skip

        # ── L8.2  lastCargo mention → vessel.lastCargoes populated ────────
        if RE_LAST_CARGO.search(body):
            vessel = vessel_by_id.get(eid)
            if vessel:
                lc = vessel.get("lastCargoes")
                if lc in (None, "", "null", [], {}):
                    print(f"FAIL: L8.2 REGRESSION last-cargo — vessel {eid}: "
                          f"email содержит 'L/C' или 'last cargo' но lastCargoes={lc!r}")
                    last_cargo_fails += 1
                else:
                    print(f"PASS: L8.2 last-cargo vessel {eid}: lastCargoes присутствует")

        # ── L8.3  'gearless' in body → vessel.geared == False ─────────────
        if RE_GEARLESS.search(body):
            vessel = vessel_by_id.get(eid)
            if vessel:
                geared = vessel.get("geared")
                if geared is True:
                    print(f"FAIL: L8.3 REGRESSION gearless — vessel {eid}: "
                          f"email содержит 'gearless' но geared=True")
                    gearless_fails += 1
                else:
                    print(f"PASS: L8.3 gearless vessel {eid}: geared={geared}")

        # ── L8.4  'spot'/'prompt' in body → vessel.openDate == 'spot' ─────
        if RE_SPOT.search(body) and etype == "VESSEL":
            vessel = vessel_by_id.get(eid)
            if vessel:
                open_date_raw = vessel.get("openDate")
                # openDate can be a ConfidenceField or plain string
                if isinstance(open_date_raw, dict):
                    od_val = open_date_raw.get("value", "")
                    od_src = open_date_raw.get("sourceText", "")
                else:
                    od_val = open_date_raw or ""
                    od_src = vessel.get("openDateSourceText", "") or ""

                is_spot = (
                    str(od_val).lower() == "spot"
                    or "spot" in str(od_src).lower()
                )
                if not is_spot:
                    # Only flag if the spot/prompt token is on the openDate line
                    opendate_line = ""
                    for line in body.splitlines():
                        if re.search(r'open|avail|ready', line, re.IGNORECASE):
                            opendate_line = line
                            break
                    if RE_SPOT.search(opendate_line):
                        print(f"FAIL: L8.4 REGRESSION spot-semantics — vessel {eid}: "
                              f"openDate line contains 'spot' but openDate={od_val!r}")
                        spot_fails += 1
                    else:
                        print(f"PASS: L8.4 spot vessel {eid}: 'spot' not on openDate line, ok")
                else:
                    print(f"PASS: L8.4 spot vessel {eid}: openDate={od_val!r}")

        # ── L8.5  Weight range → confidence should be 'interpreted' ───────
        if etype == "CARGO":
            cargo = cargo_by_id.get(eid)
            if cargo and RE_WGT_RANGE.search(body):
                wmt = cargo.get("weightMt")
                if isinstance(wmt, dict):
                    conf = wmt.get("confidence", "")
                    if conf == "confirmed":
                        print(f"WARN: L8.5 weight-range cargo {eid}: "
                              f"body has weight range but confidence='confirmed' (expected 'interpreted')")
                    else:
                        weight_range_ok += 1
                        print(f"PASS: L8.5 weight-range cargo {eid}: confidence={conf!r}")

    # Aggregate
    if rate_terms_fails == 0:
        print("PASS: L8.1 — все emails с FIO SHINC/CQD имеют loadingRate или dischargeRate")
    if last_cargo_fails == 0:
        print("PASS: L8.2 — все emails с 'L/C'/'last cargo' имеют lastCargoes populated")
    if gearless_fails == 0:
        print("PASS: L8.3 — нет судов geared=True при наличии 'gearless' в теле письма")
    if spot_fails == 0:
        print("PASS: L8.4 — spot/prompt semantics: нет видимых потерь openDate='spot'")

    # ── L8.6  grainCapacityUnit enum (uppercase CBM) ──────────────────────
    gcu_fails = []
    for v in vessels:
        gcu = v.get("grainCapacityUnit")
        if gcu is not None and gcu != "cbm":
            vname = ""
            vn = v.get("vesselName")
            if isinstance(vn, dict):
                vname = vn.get("value", "?")
            elif isinstance(vn, str):
                vname = vn
            gcu_fails.append(f"{vname}({gcu!r})")
    if gcu_fails:
        print(f"FAIL: L8.6 REGRESSION grainCapacityUnit — enum violation (should be 'cbm'): "
              f"{', '.join(gcu_fails)}")
    else:
        print("PASS: L8.6 grainCapacityUnit — все значения 'cbm' или null")

    # ── L8.7  sourceText overflow — openDate must not be full email body ──
    src_overflow_fails = []
    for v in vessels:
        od = v.get("openDate")
        od_src = ""
        if isinstance(od, dict):
            od_src = od.get("sourceText", "") or ""
        if len(od_src) > 300:
            vname = ""
            vn = v.get("vesselName")
            if isinstance(vn, dict):
                vname = vn.get("value", "?")
            elif isinstance(vn, str):
                vname = vn
            src_overflow_fails.append(f"{vname}(len={len(od_src)})")
    if src_overflow_fails:
        print(f"FAIL: L8.7 REGRESSION sourceText-overflow — openDate.sourceText too long "
              f"(likely full email body leak): {', '.join(src_overflow_fails)}")
    else:
        print("PASS: L8.7 openDate.sourceText — нет overflow (все ≤300 chars)")

    # ── L8.8  CQD in body → not placed in specialRequirements ─────────────
    cqd_sr_fails = []
    RE_CQD = re.compile(r'\bCQD\b', re.IGNORECASE)
    for email in emails:
        eid  = email.get("id", "?")
        body = email.get("body", "") or ""
        if RE_CQD.search(body):
            cargo = cargo_by_id.get(eid)
            if cargo:
                sr = cargo.get("specialRequirements") or ""
                if RE_CQD.search(str(sr)):
                    cqd_sr_fails.append(eid)
    if cqd_sr_fails:
        print(f"FAIL: L8.8 REGRESSION CQD-in-specialRequirements — cargo IDs: "
              f"{cqd_sr_fails} (CQD should go to loadingRate/dischargeRate, not specialRequirements)")
    else:
        print("PASS: L8.8 CQD not leaked into specialRequirements")

except Exception as e:
    import traceback
    print(f"FAIL: L8 exception: {e}")
    traceback.print_exc()
PYEOF
)

while IFS= read -r pyline; do
  [[ -z "$pyline" ]] && continue
  if [[ "$pyline" == PASS:* ]];   then pass "${pyline#PASS: }"
  elif [[ "$pyline" == FAIL:* ]]; then fail "${pyline#FAIL: }"
  elif [[ "$pyline" == WARN:* ]]; then warn "${pyline#WARN: }"
  else info "  $pyline"; fi
done <<< "$L8_OUTPUT"

# =============================================================================
header "LEVEL 9 — Match scoring math invariants"
# =============================================================================

L9_OUTPUT=$(SSH python3 << 'PYEOF'
import sqlite3
import json
import sys

DB_PATH = "/root/quantika-demo/data/sessions.db"

try:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT data FROM sessions ORDER BY length(data) DESC LIMIT 1"
    ).fetchone()
    conn.close()

    if not row:
        print("WARN: нет сессий — пропускаю L9")
        sys.exit(0)

    data    = json.loads(row[0])
    matches = data.get("matches", [])
    blocked = data.get("blockedMatches", [])
    all_matches = matches + blocked

    if not all_matches:
        print("WARN: matches + blockedMatches пусты — нечего проверять")
        sys.exit(0)

    score_range_fails  = 0
    score_mismatch_fails = 0   # Bug D1
    level_mismatch_fails = 0   # Bug D2
    component_sum_fails  = 0

    COMPONENT_LABELS = {
        "Geographic proximity",
        "Cargo type match",
        "Cargo handling (cranes)",
        "Volume / hold fit",
        "Laycan fit",
        "DWT class fit",
    }

    for i, m in enumerate(all_matches):
        prefix = "blockedMatch" if i >= len(matches) else "match"
        idx    = i if i < len(matches) else i - len(matches)
        lbl    = f"{prefix}[{idx}]"

        score = m.get("score")
        sb    = m.get("scoreBreakdown") or {}
        final = sb.get("finalScore")

        # ── L9.1  finalScore in [0, 100] ──────────────────────────────────
        if final is not None:
            if not (0 <= final <= 100):
                print(f"FAIL: L9.1 {lbl} finalScore={final} вне [0,100]")
                score_range_fails += 1

        # ── L9.2  match.score == scoreBreakdown.finalScore  (Bug D1) ──────
        if score is not None and final is not None:
            if abs(score - final) > 0.5:
                print(f"FAIL: L9.2 BUG-D1 score≠finalScore — {lbl}: "
                      f"match.score={score} != scoreBreakdown.finalScore={final}")
                score_mismatch_fails += 1

        # ── L9.3  matchLevel consistency  (Bug D2) ────────────────────────
        ml = m.get("matchLevel")
        ref_score = final if final is not None else score
        if ref_score is not None and ml is not None:
            expected_ml = (
                "good"     if ref_score >= 70 else
                "possible" if ref_score >= 40 else
                "weak"
            )
            if ml != expected_ml:
                print(f"FAIL: L9.3 BUG-D2 matchLevel inconsistency — {lbl}: "
                      f"score={ref_score}, matchLevel='{ml}', expected='{expected_ml}'")
                level_mismatch_fails += 1

        # ── L9.4  component sum == basePhysical ───────────────────────────
        components = sb.get("components", [])
        base_physical = sb.get("basePhysical")
        if components and base_physical is not None:
            comp_sum = sum(c.get("points", 0) for c in components)
            if abs(comp_sum - base_physical) > 0.5:
                print(f"WARN: L9.4 {lbl} component sum={comp_sum} != basePhysical={base_physical}")
                component_sum_fails += 1

    # Aggregates
    total = len(all_matches)
    if score_range_fails == 0:
        print(f"PASS: L9.1 finalScore в [0,100] для всех {total} matches")
    else:
        print(f"FAIL: L9.1 {score_range_fails}/{total} matches с finalScore вне диапазона")

    if score_mismatch_fails == 0:
        print(f"PASS: L9.2 BUG-D1 НЕ воспроизводится — match.score==finalScore у всех {total}")
    else:
        print(f"FAIL: L9.2 BUG-D1 АКТИВЕН — {score_mismatch_fails}/{total} matches: score≠finalScore")

    if level_mismatch_fails == 0:
        print(f"PASS: L9.3 BUG-D2 НЕ воспроизводится — matchLevel корректен у всех {total}")
    else:
        print(f"FAIL: L9.3 BUG-D2 АКТИВЕН — {level_mismatch_fails}/{total} matches с неверным matchLevel")

    if component_sum_fails == 0:
        print(f"PASS: L9.4 component sum == basePhysical у всех matches")

except Exception as e:
    import traceback
    print(f"FAIL: L9 exception: {e}")
    traceback.print_exc()
PYEOF
)

while IFS= read -r pyline; do
  [[ -z "$pyline" ]] && continue
  if [[ "$pyline" == PASS:* ]];   then pass "${pyline#PASS: }"
  elif [[ "$pyline" == FAIL:* ]]; then fail "${pyline#FAIL: }"
  elif [[ "$pyline" == WARN:* ]]; then warn "${pyline#WARN: }"
  else info "  $pyline"; fi
done <<< "$L9_OUTPUT"

# =============================================================================
header "LEVEL 10 — Sanctions completeness"
# =============================================================================

L10_OUTPUT=$(SSH python3 << 'PYEOF'
import sqlite3
import json
import re
import sys

DB_PATH = "/root/quantika-demo/data/sessions.db"

RU_FLAGS = {"RU", "RUS", "Russian Federation", "Russia"}
IR_FLAGS = {"IR", "IRN", "Iran", "Islamic Republic of Iran"}
SANCTIONED_FLAGS = RU_FLAGS | IR_FLAGS

EU_UA_ROUTES_KEYWORDS = re.compile(
    r'\b(EU|Europe|Ukraine|UA|Poland|Germany|Romania|Bulgaria|Odessa|Constanta|Reni|Izmail|Gdansk|Hamburg)\b',
    re.IGNORECASE
)

def normalize_flag(flag):
    if not flag:
        return flag
    flag = flag.strip()
    mapping = {
        "Russian Federation": "RU", "Russia": "RU", "RUS": "RU",
        "Iran": "IR", "Islamic Republic of Iran": "IR", "IRN": "IR",
    }
    return mapping.get(flag, flag)

try:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT data FROM sessions ORDER BY length(data) DESC LIMIT 1"
    ).fetchone()
    conn.close()

    if not row:
        print("WARN: нет сессий — пропускаю L10")
        sys.exit(0)

    data         = json.loads(row[0])
    vessels      = data.get("parsedVessels", [])
    cargos       = data.get("parsedCargos", [])
    matches      = data.get("matches", [])
    blocked      = data.get("blockedMatches", [])

    # Build vessel flag lookup
    def get_vessel_flag(v):
        flag_raw = v.get("flag")
        if isinstance(flag_raw, dict):
            return flag_raw.get("value", "")
        return flag_raw or ""

    vessel_flags = {}
    for v in vessels:
        eid = v.get("emailId", "?")
        vessel_flags[eid] = get_vessel_flag(v)

    # ── L10.1  Sanctioned vessels must NOT appear in approved matches ─────
    ru_ir_in_approved = []
    for m in matches:
        veid  = m.get("vesselEmailId")
        flag  = vessel_flags.get(veid, "")
        norm  = normalize_flag(flag)
        if flag in SANCTIONED_FLAGS or norm in {"RU", "IR"}:
            # Check cargo destination is EU/UA route
            ceid  = m.get("cargoEmailId")
            cargo = next((c for c in cargos if c.get("emailId") == ceid), None)
            dest  = ""
            if cargo:
                dp = cargo.get("destinationPort")
                if isinstance(dp, dict):
                    dest = dp.get("value", "") or ""
                elif isinstance(dp, str):
                    dest = dp
                dc = cargo.get("destinationCountry") or ""
                dest = f"{dest} {dc}"
            if EU_UA_ROUTES_KEYWORDS.search(dest):
                ru_ir_in_approved.append(
                    f"vessel={veid}(flag={flag!r}) cargo={ceid} dest={dest!r}"
                )

    if ru_ir_in_approved:
        for item in ru_ir_in_approved:
            print(f"FAIL: L10.1 Санкционное судно в approved match на EU/UA маршруте: {item}")
    else:
        print("PASS: L10.1 Нет RU/IR судов в approved matches на EU/UA маршрутах")

    # ── L10.2  Count sanctions-blocked matches ────────────────────────────
    sanctions_blocked_count = sum(
        1 for m in blocked
        if (m.get("sanctions") or {}).get("blocking") is True
    )
    print(f"PASS: L10.2 sanctions_blocked в blockedMatches: {sanctions_blocked_count}")

    # ── L10.3  Sanctions apply only to EU/UK/US/UA-bound routes ──────────
    # A sanctioned vessel may legitimately appear in approved matches for non-EU
    # routes (e.g. RU flag allowed on Turkey-Mexico, Turkey-Guyana). Check only
    # that no approved match pairs a sanctioned vessel with a cargo bound for an
    # EU/UK/US/UA country.
    EU_UA_COUNTRIES = {"RO", "BE", "DE", "NL", "FR", "IT", "ES", "PT", "GR", "BG", "HR",
                       "SI", "HU", "AT", "PL", "CZ", "SK", "LT", "LV", "EE", "FI", "SE",
                       "DK", "IE", "LU", "MT", "CY", "GB", "UK", "US", "UA"}
    def _cargo_dest_country(cid, cidx):
        for c in cargos:
            if c.get("emailId") == cid and c.get("itemIndex", 0) == cidx:
                cf = c.get("destinationCountry") or {}
                if isinstance(cf, dict):
                    return (cf.get("value") or "").upper()
                return str(cf).upper()
        return ""
    sanctioned_vessel_eids = {
        v.get("emailId") for v in vessels
        if normalize_flag(get_vessel_flag(v)) in {"RU", "IR"}
           or get_vessel_flag(v) in SANCTIONED_FLAGS
    }
    bad = []
    for m in matches:
        if m.get("vesselEmailId") in sanctioned_vessel_eids:
            country = _cargo_dest_country(m.get("cargoEmailId"), m.get("cargoItemIndex", 0))
            if country in EU_UA_COUNTRIES:
                bad.append((m.get("cargoEmailId"), m.get("vesselEmailId"), country))
    if bad:
        for c, v, ctry in bad[:5]:
            print(f"FAIL: L10.3 Санкционное судно {v} в approved matches на EU/UA маршрут "
                  f"(cargo={c}, destCountry={ctry})")
    else:
        print(f"PASS: L10.3 Санкционные суда корректно изолированы от EU/UA маршрутов "
              f"(sanctioned vessels: {len(sanctioned_vessel_eids)})")

    # ── L10.4  flag normalization check (sample-20 regression) ────────────
    full_name_flags = [
        (v.get("emailId"), get_vessel_flag(v))
        for v in vessels
        if get_vessel_flag(v) in ("Russian Federation", "Iran", "Islamic Republic of Iran")
    ]
    if full_name_flags:
        for eid, flag in full_name_flags:
            print(f"WARN: L10.4 REGRESSION sample-20 — vessel {eid} flag stored as full name '{flag}' "
                  f"(not ISO2); sanctions work on-the-fly but DB has non-ISO2 value")
    else:
        print("PASS: L10.4 flag normalization — нет full-name flags в БД (все ISO2 или null)")

except Exception as e:
    import traceback
    print(f"FAIL: L10 exception: {e}")
    traceback.print_exc()
PYEOF
)

while IFS= read -r pyline; do
  [[ -z "$pyline" ]] && continue
  if [[ "$pyline" == PASS:* ]];   then pass "${pyline#PASS: }"
  elif [[ "$pyline" == FAIL:* ]]; then fail "${pyline#FAIL: }"
  elif [[ "$pyline" == WARN:* ]]; then warn "${pyline#WARN: }"
  else info "  $pyline"; fi
done <<< "$L10_OUTPUT"

# =============================================================================
header "LEVEL 11 — Readiness correctness"
# =============================================================================

L11_OUTPUT=$(SSH python3 << 'PYEOF'
import sqlite3
import json
import sys
import re

DB_PATH = "/root/quantika-demo/data/sessions.db"

def parse_date_ms(s):
    """Try to parse ISO date string to ms timestamp."""
    if not s or not isinstance(s, str):
        return None
    import datetime
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            dt = datetime.datetime.strptime(s[:len(fmt)], fmt)
            return int(dt.timestamp() * 1000)
        except Exception:
            pass
    return None

try:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT data FROM sessions ORDER BY length(data) DESC LIMIT 1"
    ).fetchone()
    conn.close()

    if not row:
        print("WARN: нет сессий — пропускаю L11")
        sys.exit(0)

    data    = json.loads(row[0])
    matches = data.get("matches", [])
    vessels = data.get("parsedVessels", [])

    if not matches:
        print("WARN: matches пусты — нечего проверять")
        sys.exit(0)

    vessel_by_id = {v.get("emailId"): v for v in vessels}

    verdict_fails    = 0
    spot_ideal_fails = 0
    gap_formula_checks = 0
    gap_formula_fails  = 0

    for i, m in enumerate(matches):
        lbl      = f"match[{i}]"
        readiness = m.get("readiness") or {}
        verdict   = readiness.get("verdict")
        gap_days  = readiness.get("gapDays")
        is_spot   = readiness.get("isSpot", False)

        # ── L11.1  verdict consistency with gapDays ────────────────────────
        if verdict is not None and gap_days is not None and isinstance(gap_days, (int, float)):
            if is_spot:
                if verdict != "ideal":
                    print(f"FAIL: L11.1 {lbl} isSpot=True но verdict='{verdict}' (expected 'ideal')")
                    spot_ideal_fails += 1
            else:
                # ideal: gap in [-5, 5], idle: gap > 5, late: gap < -5
                if -5 <= gap_days <= 5:
                    expected = "ideal"
                elif gap_days > 5:
                    expected = "idle"
                else:
                    expected = "late"
                if verdict != expected and verdict != "tight":
                    # 'tight' is edge-case tolerated
                    print(f"FAIL: L11.1 {lbl} verdict='{verdict}' но gapDays={gap_days:.1f} "
                          f"(expected='{expected}')")
                    verdict_fails += 1

        # ── L11.2  spot vessel → ideal verdict ────────────────────────────
        veid   = m.get("vesselEmailId")
        vessel = vessel_by_id.get(veid)
        if vessel:
            od = vessel.get("openDate")
            if isinstance(od, dict):
                od_val = od.get("value", "")
            else:
                od_val = od or ""
            if str(od_val).lower() == "spot":
                if verdict != "ideal":
                    print(f"FAIL: L11.2 {lbl} vessel openDate='spot' но verdict='{verdict}' "
                          f"(expected 'ideal')")
                    spot_ideal_fails += 1
                else:
                    print(f"PASS: L11.2 spot vessel {veid}: verdict='ideal'")

        # ── L11.3  gapDays formula spot check (5 matches) ─────────────────
        if gap_formula_checks < 5 and gap_days is not None:
            arrival_ms    = readiness.get("arrivalMs")
            laycan_ms     = readiness.get("laycanStartMs")
            if arrival_ms and laycan_ms:
                expected_gap = (laycan_ms - arrival_ms) / 86400000
                if abs(expected_gap - gap_days) > 1.0:
                    print(f"FAIL: L11.3 {lbl} gapDays formula mismatch: "
                          f"stored={gap_days:.2f}, "
                          f"computed=(laycanStart-arrival)/86400000={expected_gap:.2f}")
                    gap_formula_fails += 1
                else:
                    print(f"PASS: L11.3 {lbl} gapDays formula ok ({gap_days:.1f}d)")
                gap_formula_checks += 1

    total = len(matches)
    if verdict_fails == 0:
        print(f"PASS: L11.1 verdict consistency — все {total} matches корректны")
    else:
        print(f"FAIL: L11.1 {verdict_fails}/{total} matches с inconsistent verdict/gapDays")

    if spot_ideal_fails == 0:
        print("PASS: L11.2 все spot vessels имеют verdict='ideal'")
    else:
        print(f"FAIL: L11.2 {spot_ideal_fails} spot vessels с verdict≠'ideal'")

    if gap_formula_checks == 0:
        print("WARN: L11.3 gapDays formula — нет matches с arrivalMs/laycanStartMs для проверки")
    elif gap_formula_fails == 0:
        print(f"PASS: L11.3 gapDays formula verified for {gap_formula_checks} matches")

except Exception as e:
    import traceback
    print(f"FAIL: L11 exception: {e}")
    traceback.print_exc()
PYEOF
)

while IFS= read -r pyline; do
  [[ -z "$pyline" ]] && continue
  if [[ "$pyline" == PASS:* ]];   then pass "${pyline#PASS: }"
  elif [[ "$pyline" == FAIL:* ]]; then fail "${pyline#FAIL: }"
  elif [[ "$pyline" == WARN:* ]]; then warn "${pyline#WARN: }"
  else info "  $pyline"; fi
done <<< "$L11_OUTPUT"

# =============================================================================
header "LEVEL 12 — Reason quality"
# =============================================================================

L12_OUTPUT=$(SSH python3 << 'PYEOF'
import sqlite3
import json
import re
import sys

DB_PATH = "/root/quantika-demo/data/sessions.db"

RE_HAS_DIGIT   = re.compile(r'\d')
RE_OBJ_OBJ     = re.compile(r'\[object Object\]', re.IGNORECASE)
RE_UNDEFINED   = re.compile(r'\bundefined\b', re.IGNORECASE)
RE_NULL_LIT    = re.compile(r'\bnull\b')

def check_reason_string(s, label):
    issues = []
    if not RE_HAS_DIGIT.search(s):
        issues.append("no digit")
    if RE_OBJ_OBJ.search(s):
        issues.append("[object Object]")
    if RE_UNDEFINED.search(s):
        issues.append("'undefined' literal")
    if RE_NULL_LIT.search(s):
        issues.append("'null' literal")
    return issues

try:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT data FROM sessions ORDER BY length(data) DESC LIMIT 1"
    ).fetchone()
    conn.close()

    if not row:
        print("WARN: нет сессий — пропускаю L12")
        sys.exit(0)

    data    = json.loads(row[0])
    matches = data.get("matches", [])
    blocked = data.get("blockedMatches", [])

    reason_fields = ["matchReasons", "issues", "dateIssues"]
    # For blockedMatches also check blockReasons
    blocked_reason_fields = reason_fields + ["blockReasons"]

    no_digit_count   = 0
    artifact_count   = 0
    total_reasons    = 0

    def audit_reasons(match_list, fields, prefix):
        nonlocal no_digit_count, artifact_count, total_reasons
        for i, m in enumerate(match_list):
            lbl = f"{prefix}[{i}]"
            for field in fields:
                reasons = m.get(field)
                if not isinstance(reasons, list):
                    continue
                for r in reasons:
                    if not isinstance(r, str):
                        continue
                    total_reasons += 1
                    issues = check_reason_string(r, f"{lbl}.{field}")
                    if "no digit" in issues:
                        no_digit_count += 1
                        print(f"WARN: L12.1 {lbl}.{field} — reason без цифры: {r[:100]!r}")
                    artifact_issues = [x for x in issues if x != "no digit"]
                    if artifact_issues:
                        artifact_count += 1
                        print(f"FAIL: L12.2 {lbl}.{field} — артефакты {artifact_issues}: {r[:100]!r}")

    audit_reasons(matches, reason_fields, "match")
    audit_reasons(blocked, blocked_reason_fields, "blocked")

    if total_reasons == 0:
        print("WARN: L12 — нет reason strings для проверки (matches пуст?)")
    else:
        if artifact_count == 0:
            print(f"PASS: L12.2 Нет '[object Object]'/'undefined'/'null' в {total_reasons} reasons")
        else:
            print(f"FAIL: L12.2 {artifact_count} reasons с артефактами (всего {total_reasons})")
        if no_digit_count == 0:
            print(f"PASS: L12.1 Все {total_reasons} reasons содержат хотя бы одну цифру")
        else:
            # WARN not FAIL because some qualitative reasons may legitimately have no digits
            print(f"WARN: L12.1 {no_digit_count}/{total_reasons} reasons без цифр")

except Exception as e:
    import traceback
    print(f"FAIL: L12 exception: {e}")
    traceback.print_exc()
PYEOF
)

while IFS= read -r pyline; do
  [[ -z "$pyline" ]] && continue
  if [[ "$pyline" == PASS:* ]];   then pass "${pyline#PASS: }"
  elif [[ "$pyline" == FAIL:* ]]; then fail "${pyline#FAIL: }"
  elif [[ "$pyline" == WARN:* ]]; then warn "${pyline#WARN: }"
  else info "  $pyline"; fi
done <<< "$L12_OUTPUT"

# =============================================================================
header "LEVEL 13 — Cross-reference integrity"
# =============================================================================

L13_OUTPUT=$(SSH python3 << 'PYEOF'
import sqlite3
import json
import sys

DB_PATH = "/root/quantika-demo/data/sessions.db"

try:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT data FROM sessions ORDER BY length(data) DESC LIMIT 1"
    ).fetchone()
    conn.close()

    if not row:
        print("WARN: нет сессий — пропускаю L13")
        sys.exit(0)

    data    = json.loads(row[0])
    matches = data.get("matches", [])
    blocked = data.get("blockedMatches", [])
    cargos  = data.get("parsedCargos", [])
    vessels = data.get("parsedVessels", [])

    cargo_ids  = {c.get("emailId") for c in cargos  if c.get("emailId")}
    vessel_ids = {v.get("emailId") for v in vessels if v.get("emailId")}

    all_matches = matches + blocked

    # ── L13.1  cargoEmailId exists in parsedCargos ─────────────────────────
    orphan_cargo = [
        (i, m.get("cargoEmailId"))
        for i, m in enumerate(all_matches)
        if cargo_ids and m.get("cargoEmailId") not in cargo_ids
    ]
    if orphan_cargo:
        for idx, ceid in orphan_cargo[:5]:
            print(f"FAIL: L13.1 match/blocked[{idx}] cargoEmailId='{ceid}' нет в parsedCargos")
        if len(orphan_cargo) > 5:
            print(f"FAIL: L13.1 ... и ещё {len(orphan_cargo)-5} orphan cargo refs")
    else:
        print(f"PASS: L13.1 Все cargoEmailId существуют в parsedCargos")

    # ── L13.2  vesselEmailId exists in parsedVessels ───────────────────────
    orphan_vessel = [
        (i, m.get("vesselEmailId"))
        for i, m in enumerate(all_matches)
        if vessel_ids and m.get("vesselEmailId") not in vessel_ids
    ]
    if orphan_vessel:
        for idx, veid in orphan_vessel[:5]:
            print(f"FAIL: L13.2 match/blocked[{idx}] vesselEmailId='{veid}' нет в parsedVessels")
    else:
        print(f"PASS: L13.2 Все vesselEmailId существуют в parsedVessels")

    # ── L13.3  100% pair coverage ──────────────────────────────────────────
    n_cargos  = len(cargo_ids)
    n_vessels = len(vessel_ids)
    expected  = n_cargos * n_vessels
    actual    = len(all_matches)

    # De-dupe (pairs in both matches + blocked = duplicates). Include itemIndex so
    # independent lots within one email (e.g. sample-9 with 3 cargo lots) are treated
    # as distinct pairs.
    def _pair_key(m):
        return (
            m.get("cargoEmailId"),
            m.get("cargoItemIndex", 0),
            m.get("vesselEmailId"),
            m.get("vesselItemIndex", 0),
        )
    match_pairs   = {_pair_key(m) for m in matches}
    blocked_pairs = {_pair_key(m) for m in blocked}
    duplicates    = match_pairs & blocked_pairs

    if duplicates:
        for pair in list(duplicates)[:5]:
            print(f"FAIL: L13.4 Дублирующаяся пара (в matches И blocked): "
                  f"cargo={pair[0]}#{pair[1]}, vessel={pair[2]}#{pair[3]}")
        print(f"FAIL: L13.4 Итого дублирующихся пар: {len(duplicates)}")
    else:
        print(f"PASS: L13.4 Нет дублирующихся пар между matches и blockedMatches")

    unique_pairs = len(match_pairs | blocked_pairs)
    coverage_pct = round(100 * unique_pairs / expected, 1) if expected > 0 else 0

    if expected == 0:
        print("WARN: L13.3 cargos или vessels пусты — coverage проверка невозможна")
    elif unique_pairs == expected:
        print(f"PASS: L13.3 100% pair coverage: {unique_pairs}/{expected} пар "
              f"({n_cargos} cargos × {n_vessels} vessels)")
    else:
        missing = expected - unique_pairs
        print(f"FAIL: L13.3 Неполное coverage: {unique_pairs}/{expected} пар "
              f"({coverage_pct}%), отсутствует {missing} пар "
              f"({n_cargos} cargos × {n_vessels} vessels)")

    # ── L13.5  email classification coherence ──────────────────────────────
    emails = data.get("emails", [])
    cargo_email_ids  = {e.get("id") for e in emails if e.get("type") == "CARGO"}
    vessel_email_ids = {e.get("id") for e in emails if e.get("type") == "VESSEL"}

    parsed_cargo_ids  = {c.get("emailId") for c in cargos  if c.get("emailId")}
    parsed_vessel_ids = {v.get("emailId") for v in vessels if v.get("emailId")}

    unclassified_cargos  = parsed_cargo_ids  - cargo_email_ids
    unclassified_vessels = parsed_vessel_ids - vessel_email_ids

    if unclassified_cargos:
        print(f"WARN: L13.5 parsedCargos содержат emailId не классифицированные как CARGO: "
              f"{unclassified_cargos}")
    else:
        print("PASS: L13.5 Все parsedCargos emailId совпадают с emails[type=CARGO]")

    if unclassified_vessels:
        print(f"WARN: L13.5 parsedVessels содержат emailId не классифицированные как VESSEL: "
              f"{unclassified_vessels}")
    else:
        print("PASS: L13.5 Все parsedVessels emailId совпадают с emails[type=VESSEL]")

except Exception as e:
    import traceback
    print(f"FAIL: L13 exception: {e}")
    traceback.print_exc()
PYEOF
)

while IFS= read -r pyline; do
  [[ -z "$pyline" ]] && continue
  if [[ "$pyline" == PASS:* ]];   then pass "${pyline#PASS: }"
  elif [[ "$pyline" == FAIL:* ]]; then fail "${pyline#FAIL: }"
  elif [[ "$pyline" == WARN:* ]]; then warn "${pyline#WARN: }"
  else info "  $pyline"; fi
done <<< "$L13_OUTPUT"

# =============================================================================
header "ИТОГОВЫЙ ОТЧЁТ (L8-L13)"
# =============================================================================

TOTAL=$((PASS + FAIL + WARN))
echo ""
echo -e "${BOLD}Результаты:${RESET}"
echo -e "  ${GREEN}✅ PASS: $PASS${RESET}"
echo -e "  ${RED}❌ FAIL: $FAIL${RESET}"
echo -e "  ${YELLOW}⚠️  WARN: $WARN${RESET}"
echo -e "  Всего проверок: $TOTAL"
echo ""

echo -e "${BOLD}Детали:${RESET}"
for line in "${REPORT[@]}"; do
  if [[ "$line" == PASS* ]]; then
    echo -e "  ${GREEN}${line}${RESET}"
  elif [[ "$line" == FAIL* ]]; then
    echo -e "  ${RED}${line}${RESET}"
  else
    echo -e "  ${YELLOW}${line}${RESET}"
  fi
done

echo ""
if [[ "$FAIL" -eq 0 && "$WARN" -le 3 ]]; then
  echo -e "${GREEN}${BOLD}ВЕРДИКТ: ✅ PASS — все L8-L13 проверки пройдены${RESET}"
elif [[ "$FAIL" -eq 0 ]]; then
  echo -e "${YELLOW}${BOLD}ВЕРДИКТ: ⚠️  PASS WITH WARNINGS — тесты прошли, есть предупреждения${RESET}"
elif [[ "$FAIL" -le 3 ]]; then
  echo -e "${YELLOW}${BOLD}ВЕРДИКТ: ⚠️  KNOWN BUGS ACTIVE — $FAIL известных бага воспроизводятся${RESET}"
else
  echo -e "${RED}${BOLD}ВЕРДИКТ: ❌ MULTIPLE FAILURES — $FAIL критичных проблем${RESET}"
fi
echo ""

[[ $FAIL -eq 0 ]]
