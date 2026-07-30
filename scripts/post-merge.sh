#!/bin/bash
# Post-merge setup for the NEXUS command portal.
# Idempotent, non-interactive, fail-fast. Installs exact locked dependencies
# so merged task branches always run against a consistent node_modules.
set -e

npm ci --no-audit --no-fund
