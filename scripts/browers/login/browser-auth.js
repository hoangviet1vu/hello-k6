/**
 * auth.js — Reusable OIDC/PKCE helpers for k6
 * ============================================
 * Provides:
 *   - PKCE generation  (code_verifier / code_challenge)
 *   - Realm auto-discovery from CIID redirect URL
 *   - Token exchange   (authorization_code + PKCE)
 *   - Token refresh    (refresh_token grant)
 *   - Full browser login flow
 *
 * Usage:
 *   import { browserLogin, refreshAccessToken } from './auth.js';
 */

import { browser } from 'k6/browser';
import { check }   from 'k6';
import http        from 'k6/http';
import crypto      from 'k6/crypto';
import encoding    from 'k6/encoding';

// ── PKCE ─────────────────────────────────────────────────────────────────────

export function generateCodeVerifier() {
  return encoding.b64encode(crypto.randomBytes(32), 'rawurl');
}

export function generateCodeChallenge(verifier) {
  return encoding.b64encode(crypto.sha256(verifier, 'binary'), 'rawurl');
}

export function generateState() {
  return encoding.b64encode(crypto.randomBytes(16), 'rawurl');
}

function decodeQueryComponent(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'));
  } catch {
    return value;
  }
}

function parseUrlParts(rawUrl) {
  const queryStart = rawUrl.indexOf('?');
  const hashStart = rawUrl.indexOf('#');
  const pathEnd = queryStart >= 0
    ? queryStart
    : (hashStart >= 0 ? hashStart : rawUrl.length);

  const urlWithoutQuery = rawUrl.slice(0, pathEnd);
  const query = queryStart >= 0
    ? rawUrl.slice(queryStart + 1, hashStart >= 0 ? hashStart : rawUrl.length)
    : '';

  const originMatch = urlWithoutQuery.match(/^([a-zA-Z][a-zA-Z\d+\-.]*:\/\/[^/]+)(\/.*)?$/);
  const origin = originMatch ? originMatch[1] : '';
  const pathname = originMatch ? (originMatch[2] || '/') : '';

  const params = {};
  if (query) {
    const pairs = query.split('&');
    for (const pair of pairs) {
      if (!pair) continue;
      const equalAt = pair.indexOf('=');
      const key = equalAt >= 0 ? pair.slice(0, equalAt) : pair;
      const value = equalAt >= 0 ? pair.slice(equalAt + 1) : '';
      params[decodeQueryComponent(key)] = decodeQueryComponent(value);
    }
  }

  return { origin, pathname, params };
}

function buildUrl(base, params) {
  const pairs = [];
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length ? `${base}?${pairs.join('&')}` : base;
}

// ── OIDC discovery from CIID redirect URL ─────────────────────────────────────

/**
 * Parse a Keycloak /openid-connect/auth URL and return OIDC parameters.
 *
 * @param {string} rawUrl   Full Keycloak auth URL
 * @returns {{ realm, realmBase, clientId, redirectUri, scope,
 *             authEndpoint, tokenEndpoint, logoutEndpoint }}
 */
export function parseCiidAuthUrl(rawUrl) {
  const url        = parseUrlParts(rawUrl);
  const realmMatch = rawUrl.match(/\/realms\/([^/?#]+)/);
  const realm      = realmMatch ? realmMatch[1] : null;
  const pathUpTo   = url.pathname.indexOf('/realms/') + '/realms/'.length + (realm?.length ?? 0);
  const realmBase  = realm
    ? `${url.origin}${url.pathname.slice(0, pathUpTo)}`
    : null;

  return {
    realm,
    realmBase,
    clientId:       url.params.client_id,
    redirectUri:    url.params.redirect_uri,
    scope:          url.params.scope || 'openid',
    authEndpoint:   realmBase ? `${realmBase}/protocol/openid-connect/auth`  : null,
    tokenEndpoint:  realmBase ? `${realmBase}/protocol/openid-connect/token` : null,
    logoutEndpoint: realmBase ? `${realmBase}/protocol/openid-connect/logout` : null,
  };
}

// ── Token exchange ────────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for tokens (PKCE flow).
 *
 * @param {Object} params
 * @param {string} params.tokenEndpoint
 * @param {string} params.authCode
 * @param {string} params.clientId
 * @param {string} params.redirectUri
 * @param {string} params.codeVerifier   PKCE code_verifier
 * @returns {Object|null}   Parsed token response body, or null on failure.
 */
export function exchangeCodeForTokens({ tokenEndpoint, authCode, clientId, redirectUri, codeVerifier }) {
  const res = http.post(
    tokenEndpoint,
    {
      grant_type:    'authorization_code',
      code:          authCode,
      client_id:     clientId,
      redirect_uri:  redirectUri,
      code_verifier: codeVerifier,
    },
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      tags:    { name: 'oidc_token_exchange' },
    },
  );

  const ok = check(res, {
    'token exchange → HTTP 200': (r) => r.status === 200,
  });

  if (!ok) {
    console.error('[auth] Token exchange failed:', res.status, res.body);
    return null;
  }

  return JSON.parse(res.body);
}

// ── Token refresh ─────────────────────────────────────────────────────────────

/**
 * Use a refresh_token to obtain a new access_token.
 *
 * @param {Object} params
 * @param {string} params.tokenEndpoint
 * @param {string} params.refreshToken
 * @param {string} params.clientId
 * @returns {Object|null}   Parsed token response body, or null on failure.
 */
export function refreshAccessToken({ tokenEndpoint, refreshToken, clientId }) {
  const res = http.post(
    tokenEndpoint,
    {
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     clientId,
    },
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      tags:    { name: 'oidc_token_refresh' },
    },
  );

  const ok = check(res, {
    'token refresh → HTTP 200': (r) => r.status === 200,
  });

  if (!ok) {
    console.error('[auth] Token refresh failed:', res.status, res.body);
    return null;
  }

  return JSON.parse(res.body);
}

// ── Full browser login ────────────────────────────────────────────────────────

/**
 * Perform the complete browser-based login flow and return tokens.
 *
 * Steps:
 *  1. Navigate to {baseUrl}/login and click the ログイン button.
 *  2. Capture the CIID auth redirect to discover realm / client_id / redirect_uri.
 *  3. Re-navigate with our own PKCE code_challenge.
 *  4. Fill username → submit.
 *  5. Fill password → submit.
 *  6. Capture auth code from callback URL.
 *  7. Exchange code for tokens via HTTP.
 *
 * @param {Object} config
 * @param {string} config.baseUrl      SaaS application base URL
 * @param {string} config.username     CIID operator username
 * @param {string} config.password     CIID operator password
 * @param {number} [config.timeout]    Per-step timeout in ms (default 20 000)
 *
 * @returns {Promise<{
 *   accessToken: string, refreshToken: string, idToken: string,
 *   expiresIn: number, tokenEndpoint: string,
 *   clientId: string, realm: string
 * }|null>}
 */
export async function browserLogin({ baseUrl, username, password, timeout = 20_000 }) {
  const page = await browser.newPage();
  page.setDefaultTimeout(timeout);

  try {
    // ── 1. SaaS login page ────────────────────────────────────────────────
    console.log(`[auth] Navigating to ${baseUrl}/login`);
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });

    // ── 2. Click ログイン and capture CIID auth URL ───────────────────────
    const loginBtn = page.locator('button[aria-label="ログイン"]');
    await loginBtn.waitFor({ state: 'visible', timeout });
    await page.waitForTimeout(200);
    await loginBtn.click();

    await page.waitForURL(
      (url) => url.includes('/openid-connect/auth'),
      { timeout },
    );

    const ciidAuthUrl = page.url();
    console.log('[auth] CIID auth URL:', ciidAuthUrl);

    const oidc = parseCiidAuthUrl(ciidAuthUrl);
    const { realm, clientId, redirectUri, scope, authEndpoint, tokenEndpoint } = oidc;

    console.log(`[auth] realm=${realm}  client_id=${clientId}`);

    if (!realm || !clientId || !redirectUri) {
      throw new Error('Failed to parse OIDC parameters from CIID redirect');
    }

    check(oidc, {
      '[auth] realm discovered':    (o) => !!o.realm,
      '[auth] client_id found':     (o) => !!o.clientId,
      '[auth] redirect_uri found':  (o) => !!o.redirectUri,
    });

    // ── 3. Re-navigate with our PKCE params ───────────────────────────────
    const codeVerifier  = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state         = generateState();

    const pkceUrl = buildUrl(
      authEndpoint,
      {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      },
    );

    await page.goto(pkceUrl, { waitUntil: 'networkidle' });

    // Fast-path: SSO session already active on CIID
    if (!page.url().includes('code=')) {
      // ── 4. Username ──────────────────────────────────────────────────────
      console.log('[auth] Filling username …');
      const usernameInput = page.locator('#username');
      await usernameInput.waitFor({ state: 'visible', timeout });
      await page.waitForTimeout(500);
      await usernameInput.fill(username);

      const nextBtn = page.locator('input[name="login"][type="submit"]');
      await nextBtn.waitFor({ state: 'visible', timeout });
      await nextBtn.click();
      await page.waitForLoadState('networkidle');

      // ── 5. Password ──────────────────────────────────────────────────────
      console.log('[auth] Filling password …');
      const passwordInput = page.locator('#password');
      await passwordInput.waitFor({ state: 'visible', timeout });
      await page.waitForTimeout(500);
      await passwordInput.fill(password);

      const submitBtn = page.locator('input[name="login"][type="submit"]');
      await submitBtn.waitFor({ state: 'visible', timeout });
      await submitBtn.click();

      // Wait for callback URL containing auth code
      await page.waitForURL(
        (url) => url.includes('code='),
        { timeout: timeout + 10_000 },
      );
    } else {
      console.log('[auth] SSO active — login forms skipped');
    }

    // ── 6. Extract auth code ─────────────────────────────────────────────
    const callbackUrl = page.url();
    const callbackObj = parseUrlParts(callbackUrl);

    if (callbackObj.params.error) {
      const desc = callbackObj.params.error_description || '';
      throw new Error(`OIDC error from CIID: ${callbackObj.params.error} — ${desc}`);
    }

    const authCode      = callbackObj.params.code;
    const returnedState = callbackObj.params.state;

    check(authCode,                  { '[auth] auth code present':     (v) => !!v  });
    check(returnedState === state,   { '[auth] state matches (CSRF)':  (v) => v    });

    if (!authCode) throw new Error('No auth code in callback URL: ' + callbackUrl);
    console.log(`[auth] Auth code (first 20): ${authCode.slice(0, 20)}…`);

    // ── 7. Token exchange ────────────────────────────────────────────────
    const tokens = exchangeCodeForTokens({
      tokenEndpoint,
      authCode,
      clientId,
      redirectUri,
      codeVerifier,
    });

    if (!tokens) return null;

    check(tokens, {
      '[auth] access_token present':  (t) => !!t.access_token,
      '[auth] refresh_token present': (t) => !!t.refresh_token,
    });

    console.log('[auth] ✅ Login successful — expires_in:', tokens.expires_in, 's');

    return {
      accessToken:   tokens.access_token,
      refreshToken:  tokens.refresh_token,
      idToken:       tokens.id_token,
      expiresIn:     tokens.expires_in,
      tokenEndpoint,
      clientId,
      realm,
    };

  } finally {
    await page.close();
  }
}
