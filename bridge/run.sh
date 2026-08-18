#!/bin/zsh
set -euo pipefail

project_root="${0:A:h:h}"
bridge_token="$(< /Users/work/.openclaw/secrets/ai-business-assistant-llm-bridge.token)"

export PORTFOLIO_LLM_BRIDGE_TOKEN="$bridge_token"
export PORTFOLIO_LLM_BRIDGE_PORT="8765"
export LLAMA_PROXY_URL="http://127.0.0.1:8082"

exec /usr/local/bin/node "$project_root/bridge/server.mjs"
