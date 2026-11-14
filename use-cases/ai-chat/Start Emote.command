#!/bin/zsh
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 22.15 or newer, then open this file again.'
  read -r '?Press Enter to close.'
  exit 1
fi
if [[ ! -d node_modules ]]; then npm ci; fi
if [[ ! -f .env ]]; then cp .env.example .env; chmod 600 .env; fi
emote_port=$(node --import tsx --input-type=module -e 'import {readConfig} from "./server/config.ts"; console.log(readConfig().port)')
emote_url="http://127.0.0.1:$emote_port"
if curl --silent --fail "$emote_url/api/status" >/dev/null 2>&1; then
  open "$emote_url"
  exit 0
fi
npm run dev &
emote_pid=$!
trap 'kill "$emote_pid" 2>/dev/null || true' EXIT INT TERM
for attempt in {1..30}; do
  if curl --silent --fail "$emote_url/api/status" >/dev/null 2>&1; then
    open "$emote_url"
    break
  fi
  sleep 1
done
wait "$emote_pid"
