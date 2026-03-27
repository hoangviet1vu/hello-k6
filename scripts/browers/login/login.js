/**
 * api-test.js — Example: Login → call EC_URL APIs with the access token
 * ======================================================================
 * Demonstrates how to reuse auth.js for authenticated API testing.
 *
 * Run:
 *   k6 run \
 *     --env BASE_URL=https://saasbpf.secondary.saas-stg.mira-pco.net \
 *     --env EC_URL=https://api.saasbpf.secondary.saas-stg.mira-pco.net \
 *     --env CIID_OPERATOR_USERNAME=hoangviet1.vu@vn.panasonic.com \
 *     --env CIID_OPERATOR_PASSWORD=Zaq1@wsxcde3 \
 *     api-test.js
 */
import { browserLogin, refreshAccessToken } from './browser-auth.js';

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://saasbpf.secondary.saas-stg.mira-pco.net';
const USERNAME = __ENV.CIID_OPERATOR_USERNAME || '';
const PASSWORD = __ENV.CIID_OPERATOR_PASSWORD || '';

// ── Shared token state across iterations ─────────────────────────────────────
// (In k6, VU-level shared state lives in module scope)
let _tokens = null;

// ── k6 options ────────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // 1 browser VU logs in once, then N API VUs hammer the API
    browser_login: {
      executor:   'shared-iterations',
      vus:        1,
      iterations: 1,
      exec:       'login',
      options: {
        browser: { type: 'chromium' },
      },
    }
  },
  thresholds: {
    checks:                       ['rate >= 0.99'],
    'http_req_duration{name:api}': ['p(95) < 3000'],
  },
};

// ── Login scenario (runs once) ────────────────────────────────────────────────
export async function login() {
  console.log('=== Browser Login ===');
  _tokens = await browserLogin({ baseUrl: BASE_URL, username: USERNAME, password: PASSWORD });
  if (!_tokens) {
    throw new Error('Login failed — cannot proceed');
  }
  console.log('=== Tokens acquired — API tests can proceed ===');
  console.log('ACCESS_TOKEN=' + _tokens.accessToken);
  console.log('REFRESH_TOKEN=' + _tokens.refreshToken);
  console.log('ID_TOKEN=' + _tokens.idToken);
}
