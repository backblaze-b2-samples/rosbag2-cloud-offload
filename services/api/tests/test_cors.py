"""CORS origin-allowlist tests.

Regression guard for the bug where the dev CORS config accepted only the
`localhost` host spelling, so every API call from a `127.0.0.1` origin was
preflight-rejected. macOS and sandbox/AI-agent environments commonly resolve the
dev host as `127.0.0.1` (see apps/web/next.config.ts `allowedDevOrigins` and
apps/web/playwright.config.ts), so both spellings must be first-class dev
origins. The two gating layers are `scripts/dev.sh`
(`API_CORS_ORIGIN_REGEX`) and the `api_cors_origins` default here in the config
layer; this covers the config-layer default and the wired app.
"""

import pytest

from app.config.settings import Settings


@pytest.mark.parametrize(
    "origin",
    ["http://localhost:3000", "http://127.0.0.1:3000"],
)
def test_default_cors_allowlist_covers_both_host_spellings(origin):
    """The default allowlist (used when API_CORS_ORIGINS is unset — i.e.
    `pnpm dev:api` and the test suite) must accept both `localhost` and
    `127.0.0.1` on the dev ports."""
    settings = Settings(_env_file=None)
    assert origin in settings.cors_origins


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "origin",
    ["http://localhost:3000", "http://127.0.0.1:3000"],
)
async def test_preflight_allows_both_host_spellings(client, origin):
    """A CORS preflight from either dev host spelling is accepted and echoes
    the origin back, so the browser lets the real request through."""
    response = await client.options(
        "/sessions",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin
