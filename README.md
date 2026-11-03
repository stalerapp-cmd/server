# S-Taler call server

S-Taler calls are WebRTC: voice and video go straight between the two phones.
Some mobile and office networks block that direct path. A **TURN** relay fixes
it: when the direct path fails, the call passes through the relay instead.

This repo is a tiny Vercel function that gives the S-Taler API short-lived TURN
credentials. Vercel can't carry the call audio itself (its functions only
answer HTTP requests), so the relay is an existing TURN service and this server
only hands out the keys to it.

## Endpoints

| Path | What it returns |
| --- | --- |
| `GET /api/ice` | `{ iceServers, ttl, source }` — pass `iceServers` to `RTCPeerConnection`. Needs `Authorization: Bearer $ICE_SECRET`. |
| `GET /api/health` | `{ status: "ok" }` |

## Settings (Vercel → Project → Environment Variables)

| Variable | Needed | Meaning |
| --- | --- | --- |
| `ICE_SECRET` | yes | Shared with the S-Taler API (`ICE_SECRET` there too). Keeps the credentials from being handed to anyone. |
| `METERED_DOMAIN`, `METERED_API_KEY` | optional | Your own Metered TURN app (free 20 GB a month): sign up at metered.ca, create an app, copy its domain (`yourapp.metered.live`) and API key. Recommended for real use. |
| `TURN_SECRET`, `TURN_HOST` | optional | Your own coturn server with `use-auth-secret` / `static-auth-secret`. |

With none of the optional ones set it uses the public **Open Relay** static-auth
relay (`staticauth.openrelay.metered.ca`) — free and shared, good for testing,
with no guarantee for heavy use.

## S-Taler API side

Set on the S-Taler API service:

```
ICE_URL=https://<this-project>.vercel.app/api/ice
ICE_SECRET=<same value as here>
```

The app asks the API (`GET /api/calls/ice`) before every call; the API caches
the answer and falls back to STUN only if this server can't be reached.
