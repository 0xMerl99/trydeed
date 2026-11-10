#!/usr/bin/env bash
# stop any running local validator, build the test-only (short timers) program, then the normal artefact
pkill -x solana-test-val || true
bash "$(dirname "$0")/build.sh" e2e
bash "$(dirname "$0")/build.sh" build
