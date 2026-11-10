#!/usr/bin/env bash
pkill -x solana-test-val || true
sleep 1
pgrep -x solana-test-val || echo "validator stopped"
