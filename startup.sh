#!/bin/sh
set -eu
cd /workspace
export PATH="/root/.local/share/solana/install/active_release/bin:${PATH:-}"

rpc_ok() {
  curl -sf -o /dev/null --max-time 2 -X POST http://127.0.0.1:8899 \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
}

program_ok() {
  curl -sf --max-time 2 -X POST http://127.0.0.1:8899 \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["2EXa31Ao7M9BU5MhJfvMmzbgzWzRj1XdQ2sNhD6xnaUy",{"encoding":"base64"}]}' \
    | grep -q '"executable":true'
}

if ! rpc_ok || ! program_ok; then
  if [ -x /root/.local/share/solana/install/active_release/bin/solana-test-validator ]; then
    for p in /proc/[0-9]*; do
      if tr "\0" " " 2>/dev/null < "$p/cmdline" | grep -q "solana-test-validator"; then
        kill "$(basename "$p")" 2>/dev/null || true
      fi
    done
    sleep 1
    mkdir -p /workspace/.validator
    rm -rf /workspace/.validator/ledger
    solana-test-validator \
      --reset \
      --ledger /workspace/.validator/ledger \
      --rpc-port 8899 \
      --faucet-port 9900 \
      --bind-address 127.0.0.1 \
      --dynamic-port-range 8100-8199 \
      --bpf-program 2EXa31Ao7M9BU5MhJfvMmzbgzWzRj1XdQ2sNhD6xnaUy /workspace/programs/prooftask/target/deploy/prooftask.so \
      --limit-ledger-size 100000 \
      >>/tmp/validator.log 2>&1 &
    i=0
    while [ "$i" -lt 60 ]; do
      if rpc_ok && program_ok; then
        break
      fi
      i=$((i + 1))
      sleep 0.5
    done
  fi
fi

node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
