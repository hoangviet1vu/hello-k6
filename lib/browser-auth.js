import { browser } from 'k6/browser';
import http from 'k6/http';

const REQUIRED_ENV_KEYS = [
	'BASE_URL',
	'IDP_BASE_URL',
	'IDP_REALM_CODE',
	'IDP_CLIENT_ID',
	'CIID_OPERATOR_USERNAME',
	'CIID_OPERATOR_PASSWORD',
];

function getRequiredEnv(key) {
	const value = __ENV[key];
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

function buildTokenEndpoint(baseUrl, realmCode) {
	const normalized = baseUrl.replace(/\/+$/, '');
	return `${normalized}/realms/${encodeURIComponent(realmCode)}/protocol/openid-connect/token`;
}

function exchangeCodeForTokens(tokenEndpoint, clientId, code, redirectUri) {
	const payload = [
		`client_id=${encodeURIComponent(clientId)}`,
		`code=${encodeURIComponent(code)}`,
		`redirect_uri=${encodeURIComponent(redirectUri)}`,
		'grant_type=authorization_code',
	].join('&');

	const response = http.post(tokenEndpoint, payload, {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
	});

	if (response.status !== 200) {
		throw new Error(
			`Authorization code exchange failed (${response.status}): ${response.body}`
		);
	}

	return response.json();
}

export async function getTokenOverAuthCode() {
	for (const key of REQUIRED_ENV_KEYS) {
		getRequiredEnv(key);
	}

	const baseUrl = __ENV.BASE_URL.replace(/\/+$/, '');
	const idpBaseUrl = __ENV.IDP_BASE_URL;
	const realmCode = __ENV.IDP_REALM_CODE;
	const clientId = __ENV.IDP_CLIENT_ID;
	const redirectUri = baseUrl;
	const username = __ENV.CIID_OPERATOR_USERNAME;
	const password = __ENV.CIID_OPERATOR_PASSWORD;

	const tokenEndpoint = buildTokenEndpoint(idpBaseUrl, realmCode);

	// Escape special regex characters in the redirect URI before using as a prefix pattern.
	const redirectUriPattern = new RegExp(
	 	'^' + redirectUri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	);

	const page = await browser.newPage();
	try {
		// Step 1: Navigate to the login page
		const loginPageUrl = `${baseUrl}/login`;
		await page.goto(loginPageUrl, { waitUntil: 'load' });

		// Step 2: Click the login button with aria-label="ログイン"
		await page
			.locator('button[aria-label="ログイン"].pcoui-button--primary')
			.click();

		// After clicking login, should be redirected to IDP. Wait for username field to appear.
		await page.waitForSelector('input[name="username"]', { timeout: 30000 });

		// Step 3: Fill username and submit
		await page.locator('input[name="username"]').fill(username);
		await page
			.locator('input[name="login"][type="submit"][value="Log in"]')
			.click();

		// Step 4: Wait for password field and fill it
		await page.waitForSelector('input[name="password"]', { timeout: 30000 });
		await page.locator('input[name="password"]').fill(password);
		await page
			.locator('input[name="login"][type="submit"][value="Log in"]')
			.nth(1)
			.click();

		// Step 5: Wait for redirect back to the registered redirect URI with auth code
		await page.waitForURL(redirectUriPattern, { timeout: 30000 });

		const currentUrl = page.url();
		const urlObj = new URL(currentUrl);
		const code = urlObj.searchParams.get('code');

		if (!code) {
			throw new Error(
				`No authorization code found in callback URL: ${currentUrl}`
			);
		}

		return exchangeCodeForTokens(tokenEndpoint, clientId, code, redirectUri);
	} finally {
		await page.close();
	}
}

export default getTokenOverAuthCode;
