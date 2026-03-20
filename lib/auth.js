import http from 'k6/http';

const REQUIRED_ENV_KEYS = [
	'IDP_REALM_CODE',
	'IDP_CLIENT_ID',
	'IDP_BASE_URL',
	'REFRESH_TOKEN',
];

function getRequiredEnv(key) {
	const value = __ENV[key];
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

function buildTokenEndpoint(baseUrl, realmCode) {
	const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
	return `${normalizedBaseUrl}/realms/${encodeURIComponent(realmCode)}/protocol/openid-connect/token`;
}

function buildRefreshTokenPayload(clientId, refreshToken) {
	return [
		`client_id=${encodeURIComponent(clientId)}`,
		'grant_type=refresh_token',
		`refresh_token=${encodeURIComponent(refreshToken)}`,
	].join('&');
}

export function getTokenByRefreshToken() {
	for (const key of REQUIRED_ENV_KEYS) {
		getRequiredEnv(key);
	}

	const realmCode = __ENV.IDP_REALM_CODE;
	const clientId = __ENV.IDP_CLIENT_ID;
	const baseUrl = __ENV.IDP_BASE_URL;
	const refreshToken = __ENV.REFRESH_TOKEN;

	const tokenEndpoint = buildTokenEndpoint(baseUrl, realmCode);
	const payload = buildRefreshTokenPayload(clientId, refreshToken);

	const response = http.post(tokenEndpoint, payload, {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
	});

	if (response.status !== 200) {
		throw new Error(
			`Refresh token request failed (${response.status}): ${response.body}`
		);
	}

	return response.json();
}

export default getTokenByRefreshToken;
