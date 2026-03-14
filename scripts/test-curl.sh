#!/bin/bash
API_KEY="${TEST_API_KEY:-ob_live_ec5c0f6b19233bf2ea4bac7d87db1e5a8484e4cd743b518d37632d701833c5a2}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "Testing cURL with API key..."
curl -s "${BASE_URL}/api/extract?url=https://stripe.com" \
  -H "Authorization: Bearer ${API_KEY}" | jq .
