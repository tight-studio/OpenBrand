const API_KEY =
  process.env.TEST_API_KEY ??
  "ob_live_ec5c0f6b19233bf2ea4bac7d87db1e5a8484e4cd743b518d37632d701833c5a2";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  console.log("Testing TypeScript with API key...");
  const response = await fetch(
    `${BASE_URL}/api/extract?url=https://stripe.com`,
    { headers: { Authorization: `Bearer ${API_KEY}` } },
  );
  console.log(`Status: ${response.status}`);
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

main();
