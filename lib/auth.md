# k6 Auth Guide (Refresh Token Grant)

This project provides a helper to get a new access token using Keycloak `grant_type=refresh_token`.

## Helper Location

- File: `lib/auth.js`
- Function: `getTokenByRefreshToken()`

## Required Environment Variables

Set these before running `k6`:

- `IDP_REALM_CODE` (example: `25H05t3420d`)
- `IDP_CLIENT_ID` (example: `25H05t3420d-0002`)
- `IDP_BASE_URL` (example: `https://dev001.integrated-id.jpn.panasonic.com/idp`)
- `REFRESH_TOKEN` (your refresh token)

## Token Endpoint Format

The helper builds this endpoint:

`{IDP_BASE_URL}/realms/{IDP_REALM_CODE}/protocol/openid-connect/token`

Example:

`https://dev001.integrated-id.jpn.panasonic.com/idp/realms/25H05t3420d/protocol/openid-connect/token`

## Request Sent by k6

Content type:

- `application/x-www-form-urlencoded`

Form fields:

- `client_id={IDP_CLIENT_ID}`
- `grant_type=refresh_token`
- `refresh_token={REFRESH_TOKEN}`

## Usage in a k6 Script

```js
import getTokenByRefreshToken from './lib/auth.js';

export default function () {
	const tokenResponse = getTokenByRefreshToken();
	const accessToken = tokenResponse.access_token;

	// Use accessToken in your API request headers
	// Example:
	// http.get('https://your-api.example.com/resource', {
	// 	headers: { Authorization: `Bearer ${accessToken}` },
	// });
}
```

## Run Example

```bash
IDP_REALM_CODE=25H05t3420d \
IDP_CLIENT_ID=25H05t3420d-0002 \
IDP_BASE_URL=https://dev001.integrated-id.jpn.panasonic.com/idp \
REFRESH_TOKEN='your-refresh-token' \
k6 run script.js
```

## Error Behavior

- If a required environment variable is missing, the helper throws an error.
- If the token endpoint does not return HTTP `200`, the helper throws an error with status and response body.
