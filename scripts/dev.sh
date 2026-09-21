#!/bin/sh
# Pick a free API port (uvicorn won't auto-pick), wire CORS + the
# web-side API URL to whatever we landed on, then hand off to
# concurrently. Next.js handles its own port fallback natively.
set -e

HERE="$(dirname "$0")"
API_PORT="$(node "$HERE/pick-port.mjs" 8000)"

if [ "$API_PORT" != "8000" ]; then
  printf '\n⚠  API on http://localhost:%s (8000 was busy)\n\n' "$API_PORT"
fi

export API_PORT
export NEXT_PUBLIC_API_URL="http://localhost:$API_PORT"
# Dev-only: accept any localhost:<port> OR 127.0.0.1:<port> origin so the web
# side works regardless of which port `next dev` lands on, and regardless of
# whether the browser/agent resolved the host as `localhost` or `127.0.0.1`
# (macOS and sandbox/AI-agent environments commonly use 127.0.0.1). Mirrors the
# `allowedDevOrigins` in apps/web/next.config.ts. Never set in prod.
export API_CORS_ORIGIN_REGEX='^http://(localhost|127\.0\.0\.1):[0-9]+$'

exec pnpm exec concurrently \
  --kill-others-on-fail \
  --names web,api \
  --prefix-colors blue,green \
  "pnpm dev:web" "pnpm dev:api"
