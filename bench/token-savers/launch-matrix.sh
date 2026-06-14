#!/usr/bin/env bash
# One-shot launcher for the detached matrix.
cd "$(dirname "$0")"
exec setsid nohup bash run-matrix.sh > runs/matrix.log 2>&1
