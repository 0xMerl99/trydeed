#!/usr/bin/env bash
# Run a command inside WSL with a clean Linux-only PATH (the inherited Windows PATH contains spaces and breaks tools).
#   wsl -d Ubuntu -u root -- bash /mnt/d/Codes/deed/chain/scripts/wsl.sh 'cd ~/deed-chain && anchor build'
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
exec bash -c "$*"
