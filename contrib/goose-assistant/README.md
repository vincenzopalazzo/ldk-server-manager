# goose-assistant

Optional local sidecar that runs the assistant through the
[goose SDK](https://github.com/aaif-goose/goose/tree/main/crates/goose-sdk) (GDK).

The web app is browser-only and `goose-sdk` is a Rust crate with bindings generated for
Python and Kotlin — there is no JavaScript or WASM target, so it cannot be imported into the
page. This process bridges the gap: the browser posts a turn, goose talks to the model, and
the reply comes back as JSON.

It is optional. Without it the app calls xAI and Anthropic directly from the browser.
Run it when you want either of these:

- **Subscription tokens that keep working.** An X subscription access token expires and the
  browser cannot renew one, because `auth.x.ai` sends no CORS headers. This server renews it:
  before a request when the recorded expiry is close, and again if xAI rejects the token
  anyway, then retries once. The refreshed token is written back to goose's cache in the same
  format, atomically and owner-only.

  `goose-sdk` cannot do this by itself — the X OAuth flow lives in the `goose` crate, not the
  SDK — so the refresh is implemented here against the same token endpoint and client id goose
  uses.
- **Any provider goose supports**, rather than only the ones reimplemented in the app.

## Run

```bash
pip install -r requirements.txt
python server.py                 # http://127.0.0.1:8791
```

Then in the app's assistant drawer choose the **goose (local)** provider.

The credential is resolved per request, first match wins:

1. `$XAI_API_KEY`
2. `access_token` from `~/.config/goose/xai_oauth/tokens.json`, written by
   `goose configure` → `xai_oauth`

So after one `goose configure` sign-in, nothing needs to be pasted into the browser at all.

## API

`POST /chat` takes `{system, model, messages[], tools[]}` and returns `{text, calls[]}`.
Messages carry `text`, `tool_request` and `tool_result` content blocks. `GET /health`
reports whether a credential was found.

The server binds to loopback and holds no secret of its own: it reads the same token file
goose already wrote.

## Configuration

| Variable                 | Default                                      |
| ------------------------ | -------------------------------------------- |
| `GOOSE_ASSISTANT_HOST`   | `127.0.0.1`                                  |
| `GOOSE_ASSISTANT_PORT`   | `8791`                                       |
| `GOOSE_XAI_TOKEN_CACHE`  | `~/.config/goose/xai_oauth/tokens.json`      |
| `XAI_API_KEY`            | unset; overrides the token cache when present |

`xai.json` is the declarative provider config goose consumes; edit it to add models.
