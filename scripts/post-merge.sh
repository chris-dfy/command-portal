#!/bin/bash
# Post-merge setup: reinstall dependencies to reconcile lockfile changes.
# Idempotent, non-interactive, fail-fast.
set -e

npm ci --no-audit --no-fund
