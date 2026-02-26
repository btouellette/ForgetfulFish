#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-https://forgetfulfish.com}"
ENCODED_BASE_URL="$(printf '%s' "$BASE_URL" | sed -e 's/:/%3A/g' -e 's#/#%2F#g')"

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"

  if [[ "$haystack" != *"$needle"* ]]; then
    echo "FAIL: $message"
    echo "Expected to find: $needle"
    exit 1
  fi
}

echo "Checking apex home..."
apex_headers="$(curl -sSI "$BASE_URL/")"
assert_contains "$apex_headers" "HTTP/2 200" "Apex root should return 200"

echo "Checking www redirect..."
www_url="${BASE_URL/https:\/\//https://www.}"
www_headers="$(curl -sSI "$www_url/")"
assert_contains "$www_headers" "HTTP/2 301" "www host should redirect"
assert_contains "$www_headers" "location: $BASE_URL/" "www redirect should target apex"

echo "Checking auth providers..."
providers_json="$(curl -sS "$BASE_URL/api/auth/providers")"
assert_contains "$providers_json" '"google"' "Google provider should be configured"
assert_contains "$providers_json" '"email"' "Email provider should be configured"

echo "Checking Google callback URI in sign-in redirect..."
csrf_json="$(curl -sS -c /tmp/ff-smoke.cookies -b /tmp/ff-smoke.cookies "$BASE_URL/api/auth/csrf")"
csrf_token="$(printf '%s' "$csrf_json" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')"

signin_headers="$(curl -sS -i -c /tmp/ff-smoke.cookies -b /tmp/ff-smoke.cookies -X POST "$BASE_URL/api/auth/signin/google" -H 'Content-Type: application/x-www-form-urlencoded' --data "csrfToken=$csrf_token&callbackUrl=${ENCODED_BASE_URL}%2Fauth%2Fverify")"
assert_contains "$signin_headers" "HTTP/2 302" "Google sign-in should redirect"
assert_contains "$signin_headers" "redirect_uri=${ENCODED_BASE_URL}%2Fapi%2Fauth%2Fcallback%2Fgoogle" "Google redirect URI should use apex callback"

echo "PASS: auth smoke checks completed for $BASE_URL"
