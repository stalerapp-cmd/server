import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * GET /api/ice — the network routes a call may use (STUN + TURN), with TURN
 * credentials that expire on their own. Only the S-Taler API asks for it, with
 * the shared secret ICE_SECRET, then passes the list to signed-in callers.
 *
 * Where the TURN relay comes from, first match wins:
 *   1. METERED_DOMAIN + METERED_API_KEY  -> your own Metered app (free 20 GB/month)
 *   2. TURN_SECRET (+ TURN_HOST)         -> any coturn with use-auth-secret
 *   3. nothing set                       -> the public Open Relay static-auth relay
 */
const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };
const TTL = 6 * 3600; // seconds a credential stays valid

function allowed(req) {
  const want = process.env.ICE_SECRET;
  if (!want) return true;
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** TURN REST credentials (RFC draft used by coturn): user = expiry:id, pass = base64(HMAC-SHA1). */
function fromSecret(secret, host) {
  const username = `${Math.floor(Date.now() / 1000) + TTL}:staler`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return [
    STUN,
    {
      urls: [`turn:${host}:80`, `turn:${host}:80?transport=tcp`, `turn:${host}:443`, `turns:${host}:443?transport=tcp`],
      username,
      credential,
    },
  ];
}

async function fromMetered(domain, key) {
  const r = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`metered ${r.status}`);
  const list = await r.json();
  if (!Array.isArray(list) || !list.length) throw new Error('metered: empty');
  return [STUN, ...list];
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!allowed(req)) return res.status(401).json({ error: 'unauthorised' });
  const env = process.env;
  let iceServers;
  let source;
  try {
    if (env.METERED_DOMAIN && env.METERED_API_KEY) {
      iceServers = await fromMetered(env.METERED_DOMAIN, env.METERED_API_KEY);
      source = 'metered';
    }
  } catch (e) {
    console.error('metered failed, falling back', String(e));
  }
  if (!iceServers) {
    const custom = !!env.TURN_SECRET;
    iceServers = fromSecret(env.TURN_SECRET || 'openrelayprojectsecret', env.TURN_HOST || 'staticauth.openrelay.metered.ca');
    source = custom ? 'coturn' : 'openrelay';
  }
  res.status(200).json({ iceServers, ttl: TTL, source });
}
