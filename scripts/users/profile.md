# Profile API Test (`scripts/users/profile.js`)

This testcase validates the endpoint:

- `${USER_HOST}/users/api/v0/users/profile`

It uses refresh-token authentication in the init phase and then runs the profile API checks in the VU execution phase.

## What This Test Verifies

- Access token is retrieved by `getTokenByRefreshToken()` from `lib/auth.js`.
- Profile API returns HTTP `200`.
- Response time is less than `1000ms` (check assertion).
- Response body is JSON.
- Response values match JWT access-token claims when comparable keys are present:
	- `sub`
	- `email`
	- `preferred_username`
	- `name`

## Required Environment Variables

Auth variables:

- `IDP_REALM_CODE`
- `IDP_CLIENT_ID`
- `IDP_BASE_URL`
- `REFRESH_TOKEN`

API host variable:

- `USER_HOST`

Optional threshold override:

- `HTTP_REQ_DURATION_THRESHOLD`

`HTTP_REQ_DURATION_THRESHOLD` behavior from `config/thresholds.js`:

- Default: `p(95)<1000`
- If value is only digits (example `1200`): interpreted as `p(95)<1200`
- If full expression is provided (example `p(99)<1500`): used as-is

## Run Commands

Run with default thresholds:

```bash
USER_HOST=https://<user-host> \
IDP_REALM_CODE=<realm-code> \
IDP_CLIENT_ID=<client-id> \
IDP_BASE_URL=https://<idp-host>/idp \
REFRESH_TOKEN='<refresh-token>' \
k6 run scripts/users/profile.js
```

Run with specific VUs and duration:

```bash
USER_HOST=https://<user-host> \
IDP_REALM_CODE=<realm-code> \
IDP_CLIENT_ID=<client-id> \
IDP_BASE_URL=https://<idp-host>/idp \
REFRESH_TOKEN='<refresh-token>' \
k6 run --vus 10 --duration 1m scripts/users/profile.js
```

Run with custom duration threshold:

```bash
USER_HOST=https://<user-host> \
IDP_REALM_CODE=<realm-code> \
IDP_CLIENT_ID=<client-id> \
IDP_BASE_URL=https://<idp-host>/idp \
REFRESH_TOKEN='<refresh-token>' \
k6 run -e HTTP_REQ_DURATION_THRESHOLD=1200 scripts/users/profile.js
```

Run with custom threshold expression:

```bash
USER_HOST=https://<user-host> \
IDP_REALM_CODE=<realm-code> \
IDP_CLIENT_ID=<client-id> \
IDP_BASE_URL=https://<idp-host>/idp \
REFRESH_TOKEN='<refresh-token>' \
k6 run -e HTTP_REQ_DURATION_THRESHOLD='p(99)<1500' scripts/users/profile.js
```

## Notes

- `USER_HOST` trailing slash is handled by the script.
- If token retrieval fails, the test stops in init phase.
- If required environment variables are missing, the script throws an error immediately.
