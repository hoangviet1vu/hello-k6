#!/bin/bash
set -e   # exit immediately if any command fails

echo "[1/2] Browser login..."
set +e
LOGIN_OUTPUT=$(k6 run \
  --env BASE_URL="$BASE_URL" \
  --env CIID_OPERATOR_USERNAME="$CIID_OPERATOR_USERNAME" \
  --env CIID_OPERATOR_PASSWORD="$CIID_OPERATOR_PASSWORD" \
  --quiet ./scripts/browers/login/login.js 2>&1)
K6_EXIT_CODE=$?
set -e

if [ "$K6_EXIT_CODE" -ne 0 ]; then
  echo "WARN: k6 browser login exited with code $K6_EXIT_CODE"
  echo "$LOGIN_OUTPUT"
  exit 1
fi

echo "[2/2] Extract token from output"

# Extract token from output
ACCESS_TOKEN=$(echo "$LOGIN_OUTPUT" \
  | sed -n 's/.*ACCESS_TOKEN=\([^"[:space:]]*\).*/\1/p' \
  | tail -n 1)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "ERROR: ACCESS_TOKEN was not found in login output"
  exit 1
fi

echo "$ACCESS_TOKEN"
