import os
import requests

API_KEY = os.environ.get(
    "TEST_API_KEY",
    "ob_live_ec5c0f6b19233bf2ea4bac7d87db1e5a8484e4cd743b518d37632d701833c5a2",
)
BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")

print("Testing Python with API key...")
response = requests.get(
    f"{BASE_URL}/api/extract",
    params={"url": "https://stripe.com"},
    headers={"Authorization": f"Bearer {API_KEY}"},
)
print(f"Status: {response.status_code}")
print(response.json())
