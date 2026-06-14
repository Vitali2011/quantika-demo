#!/usr/bin/env bash
# Per-arm config mutations. Each arm function takes the run's cfg dir + prints
# the --append-system-prompt payload (empty if none) on stdout via ARM_SYSPROMPT.
set -euo pipefail
ARMS=(baseline caveman rtk cavecrew all)

CAVEMAN_DIRECTIVE='Respond in caveman style: drop articles, filler, pleasantries, hedging. Fragments OK. Keep ALL technical substance exact. Code blocks unchanged.'

arm_apply() {            # arm_apply <arm> <cfgdir>  -> sets ARM_SYSPROMPT
  local arm="$1" cfg="$2"; ARM_SYSPROMPT=""
  case "$arm" in
    baseline) ;;
    caveman)  ARM_SYSPROMPT="$CAVEMAN_DIRECTIVE" ;;
    rtk)      _install_rtk_hook "$cfg" ;;
    cavecrew) _install_cavecrew "$cfg" ;;
    all)      ARM_SYSPROMPT="$CAVEMAN_DIRECTIVE"
              _install_rtk_hook "$cfg"
              _install_cavecrew "$cfg" ;;
  esac
}

# _install_rtk_hook: write rtk PreToolUse hook into per-run settings.json.
# rtk init -g writes to ~/.claude/settings.json (global), not to cfg dir,
# so we inject the hook directly into the per-run settings file.
_install_rtk_hook() {
  local cfg="$1"
  printf '{"defaultMode":"acceptEdits","hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"rtk hook claude"}]}]}}' \
    > "$cfg/settings.json"
}

# cavecrew = caveman plugin present so cavecrew-* subagents are available.
_install_cavecrew() {
  local cfg="$1"
  mkdir -p "$cfg/plugins"
  cp -R "$HOME/.claude/plugins/"*caveman* "$cfg/plugins/" 2>/dev/null || true
}
