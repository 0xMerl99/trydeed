#!/usr/bin/env bash
# build (SBPF v0) + test in one go (used for background runs)
bash "$(dirname "$0")/build.sh" test
