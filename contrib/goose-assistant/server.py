#!/usr/bin/env python3
"""
Local assistant sidecar backed by the goose SDK (GDK).

The web app is browser-only, and `goose-sdk` is a Rust crate whose bindings are
generated for Python and Kotlin — there is no JavaScript or WASM target. This
process bridges the two: the browser posts a turn here, goose talks to the model,
and the reply comes back as JSON.

Why bother, when the app can call xAI directly? Two reasons:

  * X subscription tokens expire, and a browser cannot renew one because
    `auth.x.ai` sends no CORS headers. This server refreshes the token itself
    and rewrites goose's cache, so a long-lived browser session keeps working
    without anything being pasted.

    Note that `goose-sdk` cannot do this on its own: the X OAuth flow lives in
    the `goose` crate, not in the SDK (which depends on `goose-providers`), so
    the refresh below is implemented here against the same endpoint and client
    id goose uses.
  * Anything goose can reach becomes available to the assistant, not just the
    providers reimplemented in the app.

It is optional. Without it the app still talks to xAI and Anthropic directly.

Usage:
    pip install goose-sdk
    python server.py                     # listens on 127.0.0.1:8791

Token resolution, first match wins:
    1. $XAI_API_KEY
    2. access_token from goose's cache (see TOKEN_CACHE below)
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import sys
import tempfile
import threading
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    import goose
except ImportError:  # pragma: no cover - startup guard
    sys.exit("goose-sdk is not installed. Run: pip install goose-sdk")

HOST = os.environ.get("GOOSE_ASSISTANT_HOST", "127.0.0.1")
PORT = int(os.environ.get("GOOSE_ASSISTANT_PORT", "8791"))
MAX_BODY = 1 << 20  # 1 MiB is far more than a turn needs

# Where goose stores the tokens from an X subscription sign-in (`goose configure`
# -> xai_oauth). Re-read per request so a refresh by goose is picked up here.
TOKEN_CACHE = Path(
    os.environ.get(
        "GOOSE_XAI_TOKEN_CACHE",
        Path.home() / ".config" / "goose" / "xai_oauth" / "tokens.json",
    )
)

PROVIDER_CONFIG = Path(__file__).with_name("xai.json")

# Same endpoint and public client id goose registers for the X sign-in.
TOKEN_URL = "https://auth.x.ai/oauth2/token"
CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828"
# Renew this long before expiry so a request in flight cannot straddle it.
REFRESH_SKEW = dt.timedelta(seconds=120)

_refresh_lock = threading.Lock()


def _read_cache() -> dict | None:
    try:
        data = json.loads(TOKEN_CACHE.read_text())
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _expired(data: dict) -> bool:
    raw = data.get("expires_at")
    if not isinstance(raw, str):
        return False  # no expiry recorded; assume usable and let the API judge
    try:
        when = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return False
    return dt.datetime.now(dt.timezone.utc) + REFRESH_SKEW >= when


def _write_cache(data: dict) -> None:
    """Replace the cache atomically and keep it owner-only, as goose does."""
    TOKEN_CACHE.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(TOKEN_CACHE.parent))
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as fh:
            json.dump(data, fh)
        os.replace(tmp, TOKEN_CACHE)
    except BaseException:
        os.unlink(tmp)
        raise


def _refresh(data: dict) -> dict | None:
    """Exchange the refresh token for a new access token, and persist the result."""
    refresh_token = data.get("refresh_token")
    if not isinstance(refresh_token, str) or not refresh_token:
        return None
    body = urllib.parse.urlencode(
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": CLIENT_ID,
        }
    ).encode()
    req = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.load(resp)
    except Exception as exc:  # network error, or the refresh token itself expired
        print(f"token refresh failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return None

    expires_in = payload.get("expires_in")
    expires_at = dt.datetime.now(dt.timezone.utc) + dt.timedelta(
        seconds=int(expires_in) if isinstance(expires_in, (int, float)) else 3600
    )
    # Keep goose's schema exactly; the server may rotate the refresh token.
    updated = {
        "access_token": payload["access_token"],
        "refresh_token": payload.get("refresh_token") or refresh_token,
        "id_token": payload.get("id_token") or data.get("id_token"),
        "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
    }
    _write_cache(updated)
    print("refreshed the X access token", file=sys.stderr)
    return updated


def resolve_token(force_refresh: bool = False) -> str | None:
    """The bearer goose should use: an API key, else the subscription token.

    Refreshes the subscription token when it is at or near expiry, which is the
    whole point of running this sidecar rather than pasting a token into the page.

    `force_refresh` renews regardless of the recorded expiry. The recorded
    `expires_at` cannot be trusted on its own: xAI will reject a token that the
    cache still considers valid (a sign-in elsewhere rotates it, for instance),
    so a rejection is the other signal worth acting on.
    """
    env = os.environ.get("XAI_API_KEY", "").strip()
    if env:
        return env

    with _refresh_lock:  # one refresh at a time, not one per concurrent request
        data = _read_cache()
        if data is None:
            return None
        if force_refresh or _expired(data):
            data = _refresh(data) or data
        token = data.get("access_token")
        return token.strip() if isinstance(token, str) and token.strip() else None


# xAI does not report a bad bearer consistently: a rotated OAuth token comes back
# as 403 "unauthenticated:bad-credentials", while a malformed one is a 400
# "Incorrect API key provided". Both are worth one refresh-and-retry.
_AUTH_FAILURE_MARKERS = (
    "401",
    "403",
    "unauthenticated",
    "authentication",
    "credential",
    "incorrect api key",
    "invalid api key",
    "expired",
)


def _is_auth_failure(exc: BaseException) -> bool:
    text = str(exc).lower()
    return any(marker in text for marker in _AUTH_FAILURE_MARKERS)


def build_provider(token: str):
    """A declarative xAI provider. goose reads the key from the env var named in the config."""
    os.environ["XAI_API_KEY"] = token
    return goose.declarative_provider_from_json(PROVIDER_CONFIG.read_text())


def to_messages(raw: list[dict]) -> list:
    """Map the app's transcript onto goose message objects."""
    out = []
    for m in raw:
        role = {
            "user": goose.MessageRole.USER,
            "assistant": goose.MessageRole.ASSISTANT,
            "tool": goose.MessageRole.TOOL,
        }.get(m.get("role", "user"), goose.MessageRole.USER)

        content = []
        for c in m.get("content", []):
            kind = c.get("type")
            if kind == "text":
                content.append(goose.MessageContent.TEXT(text=c.get("text", "")))
            elif kind == "tool_request":
                content.append(
                    goose.MessageContent.TOOL_REQUEST(
                        id=c["id"],
                        name=c["name"],
                        arguments_json=json.dumps(c.get("input", {})),
                    )
                )
            elif kind == "tool_result":
                content.append(
                    goose.MessageContent.TOOL_RESULT(
                        id=c["id"],
                        success=bool(c.get("success", True)),
                        content_json=json.dumps(c.get("output", "")),
                    )
                )
        if content:
            out.append(goose.ProviderMessage(role=role, content=content))
    return out


def to_tools(raw: list[dict]) -> list:
    return [
        goose.ProviderTool(
            name=t["name"],
            description=t.get("description", ""),
            input_schema_json=json.dumps(t.get("parameters", {"type": "object"})),
        )
        for t in raw
    ]


async def _complete_once(token: str, payload: dict):
    provider = build_provider(token)
    model = goose.ProviderModelConfig(model_name=payload.get("model") or "grok-4.7")
    return await provider.complete(
        model,
        payload.get("system", ""),
        to_messages(payload.get("messages", [])),
        to_tools(payload.get("tools", [])),
    )


async def complete(payload: dict) -> dict:
    token = resolve_token()
    if not token:
        return {
            "error": (
                "No xAI credential. Set XAI_API_KEY, or sign in with "
                "`goose configure` (xai_oauth) so a token exists at "
                f"{TOKEN_CACHE}."
            )
        }

    try:
        completion = await _complete_once(token, payload)
    except Exception as exc:
        if not _is_auth_failure(exc):
            raise
        # Rejected despite the cache thinking it was fine: renew and try once more.
        print("credential rejected; forcing a refresh", file=sys.stderr)
        renewed = resolve_token(force_refresh=True)
        if not renewed or renewed == token:
            return {
                "error": (
                    "xAI rejected the credential and it could not be renewed. "
                    "Sign in again with `goose configure` (xai_oauth), or set XAI_API_KEY."
                )
            }
        completion = await _complete_once(renewed, payload)

    text_parts: list[str] = []
    calls: list[dict] = []
    for c in completion.content:
        if c.is_text():
            text_parts.append(c.text)
        elif c.is_tool_request():
            try:
                args = json.loads(c.arguments_json or "{}")
            except ValueError:
                args = {}
            calls.append(
                {"id": c.id, "name": c.name, "input": args if isinstance(args, dict) else {}}
            )

    return {"text": "\n".join(text_parts).strip(), "calls": calls}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _cors(self) -> None:
        # The page may be served from anywhere (localhost during development, the
        # deployed site in normal use); this server is bound to loopback and holds
        # no secrets of its own beyond the token it already reads from disk.
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-headers", "content-type")
        self.send_header("access-control-allow-methods", "POST, OPTIONS")

    def _json(self, status: int, body: dict) -> None:
        raw = json.dumps(body).encode()
        self.send_response(status)
        self._cors()
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:  # noqa: N802 - required name
        self.send_response(204)
        self._cors()
        self.send_header("content-length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") == "/health":
            self._json(200, {"ok": True, "credential": resolve_token() is not None})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/chat":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("content-length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._json(400, {"error": "missing or oversized body"})
        try:
            payload = json.loads(self.rfile.read(length))
        except ValueError:
            return self._json(400, {"error": "body is not JSON"})

        try:
            result = asyncio.run(complete(payload))
        except Exception as exc:  # surface provider errors to the browser
            return self._json(502, {"error": f"{type(exc).__name__}: {exc}"})
        self._json(200 if "error" not in result else 401, result)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("goose-assistant: " + (fmt % args) + "\n")


def main() -> None:
    have = "yes" if resolve_token() else "no"
    print(f"goose-assistant on http://{HOST}:{PORT}  (credential found: {have})")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
