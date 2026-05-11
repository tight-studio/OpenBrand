<p align="center">
  <img src="public/logo.svg" alt="OpenBrand logo" width="80" height="84" />
</p>

<h1 align="center">OpenBrand</h1>
<p align="center">Extract any brand from a URL</p>

<p align="center">Try it out at <a href="https://openbrand.sh">openbrand.sh</a></p>

<p align="center">
  <img src="public/openbrand.gif" alt="OpenBrand demo" width="600" />
</p>

<p align="center"><sub>Demo prepared with <a href="https://tight.studio/">Tight Studio</a></sub></p>

Extract brand assets (logos, colors, backdrops, brand name) from any website URL.

## As an API call

Get your free API key from [openbrand.sh/dashboard](https://openbrand.sh/dashboard).

**cURL**

```bash
curl "https://openbrand.sh/api/extract?url=https://stripe.com" \
  -H "Authorization: Bearer your_api_key"
```

**TypeScript**

```typescript
const res = await fetch(
  "https://openbrand.sh/api/extract?url=https://stripe.com",
  { headers: { Authorization: "Bearer your_api_key" } }
);
const brand = await res.json();
```

**Python**

```python
import requests

res = requests.get(
    "https://openbrand.sh/api/extract",
    params={"url": "https://stripe.com"},
    headers={"Authorization": "Bearer your_api_key"},
)
brand = res.json()
```

## As an [agent skill](https://skills.sh/ethanjyx/openbrand/openbrand)

Add OpenBrand to Claude Code, Cursor, Codex, Gemini CLI, and [40+ other agents](https://skills.sh):

```bash
npx skills add ethanjyx/openbrand
```

Once installed, your agent automatically knows how to extract brand assets — just ask it to "extract brand assets from stripe.com".

## As an [npm package](https://www.npmjs.com/package/openbrand)

No API key required. Runs as a library from your server-side code.

```bash
npm add openbrand
```

```typescript
import { extractBrandAssets } from "openbrand";

const result = await extractBrandAssets("https://stripe.com");
if (result.ok) {
  // result.data.brand_name → "Stripe"
  // result.data.logos → LogoAsset[]
  // result.data.colors → ColorAsset[]
  // result.data.backdrop_images → BackdropAsset[]
} else {
  // result.error.code → "ACCESS_BLOCKED" | "NOT_FOUND" | "SERVER_ERROR" | ...
  // result.error.message → human-readable explanation
}
```

## As an [MCP server](https://www.npmjs.com/package/openbrand-mcp)

Use OpenBrand as a tool in Claude Code, Cursor, or any MCP-compatible client.

1. Install the MCP server (no API key needed to install):

```bash
claude mcp add --transport stdio openbrand -- npx -y openbrand-mcp
```

2. Get your API key from [openbrand.sh/dashboard](https://openbrand.sh/dashboard) and add it:

```bash
claude mcp add --transport stdio \
  --env OPENBRAND_API_KEY=your_api_key \
  openbrand -- npx -y openbrand-mcp
```

Or add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "openbrand": {
      "command": "npx",
      "args": ["-y", "openbrand-mcp"],
      "env": {
        "OPENBRAND_API_KEY": "your_api_key"
      }
    }
  }
}
```

Then ask Claude to "extract brand assets from stripe.com" and it will use the `extract_brand_assets` tool automatically.

## Self-hosting the web app

```bash
git clone https://github.com/tight-studio/openbrand.git
cd openbrand
bun install
bun dev
```

No environment variables required. Open http://localhost:3000.

## What it extracts

- **Logos** — favicons, apple-touch-icons, header/nav logos, inline SVGs (with dimension probing)
- **Brand colors** — from theme-color meta tags, manifest.json, and dominant colors from logo imagery
- **Backdrop images** — og:image, CSS backgrounds, hero/banner images
- **Brand name** — from og:site_name, application-name, logo alt text, page title

## Tech stack

Next.js, React, TypeScript, Cheerio, Sharp, Tailwind CSS

## License

[MIT](LICENSE)
