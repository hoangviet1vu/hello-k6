import http from 'k6/http';
import { check } from 'k6';
import encoding from 'k6/encoding';
import getTokenByRefreshToken from '../../../lib/auth.js';
import thresholds from '../../../config/thresholds.js';

const USER_HOST = getRequiredEnv('USER_HOST').replace(/\/+$/, '');
const PROFILE_URL = `${USER_HOST}/api/v0/users/profile`;
const VUS = getOptionalPositiveIntEnv('VUS');
const DURATION = __ENV.DURATION;

export const options = {
	thresholds,
	...(VUS !== undefined ? { vus: VUS } : {}),
	...(DURATION ? { duration: DURATION } : {})
};

function getRequiredEnv(key) {
	const value = __ENV[key];
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

function getOptionalPositiveIntEnv(key) {
	const value = __ENV[key];
	if (!value) {
		return undefined;
	}

	if (!/^\d+$/.test(value) || Number(value) <= 0) {
		throw new Error(`Environment variable ${key} must be a positive integer`);
	}

	return Number(value);
}

function decodeJwtPayload(jwtToken) {
	if (!jwtToken) {
		throw new Error('Token response does not include access_token');
	}

	const tokenParts = jwtToken.split('.');
	if (tokenParts.length < 2) {
		throw new Error('Invalid JWT format for access_token');
	}

	const payloadJson = encoding.b64decode(tokenParts[1], 'rawurl', 's');
	return JSON.parse(payloadJson);
}

async function ensureAccessTokenContext() {

	const tokenResponse = await getTokenByRefreshToken();
	var accessToken = tokenResponse.access_token;
	var accessTokenClaims = decodeJwtPayload(accessToken);

	return {
		accessToken,
		accessTokenClaims,
		refreshToken: tokenResponse.refresh_token,
	}
}

function extractProfileValue(profileBody, key) {
	if (!profileBody || typeof profileBody !== 'object') {
		return undefined;
	}

	const containers = [
		profileBody,
		profileBody.data,
		profileBody.user,
		profileBody.profile,
	];

	for (const container of containers) {
		if (container && typeof container === 'object' && key in container) {
			return container[key];
		}
	}

	return undefined;
}

function validateProfileMatchesToken(profileBody, claims) {
	const comparableClaimKeys = ['sub', 'email', 'preferred_username', 'name'];
	let comparedCount = 0;

	for (const key of comparableClaimKeys) {
		const claimValue = claims[key];
		const profileValue = extractProfileValue(profileBody, key);

		if (claimValue !== undefined && profileValue !== undefined) {
			comparedCount += 1;
			if (String(profileValue) !== String(claimValue)) {
				return false;
			}
		}
	}

	return comparedCount > 0;
}

export async function setup() {

  return ensureAccessTokenContext();
}

export default function (data) {
	const { accessToken, accessTokenClaims } = data;

	const response = http.get(PROFILE_URL, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/json',
		},
	});

	let profileBody = null;
	try {
		profileBody = response.json();
	} catch (_error) {
		profileBody = null;
	}

	check(response, {
		'profile status is 200': (r) => r.status === 200,
		'profile response time < 1000ms': (r) => r.timings.duration < 1000,
		'profile response is JSON': () => profileBody !== null,
		'profile matches access token claims': () =>
			validateProfileMatchesToken(profileBody, accessTokenClaims),
	});
}
