<p align="center">
  <img src="public/logo.svg" alt="OpenBrand logo" width="80" height="84" />
</p>

<h1 align="center">OpenBrand</h1>

<p align="center">Try it out at <a href="https://openbrand.sh">openbrand.sh</a></p>

<p align="center">
  <img src="public/openbrand.gif" alt="OpenBrand demo" width="600" />
</p>

Extract brand assets (logos, colors, backdrops, brand name) from any website URL.

## As an [npm package](https://www.npmjs.com/package/openbrand)

```bash
bun add openbrand
```

```typescript
import { extractBrandAssets } from "openbrand";

const brand = await extractBrandAssets("https://stripe.com");
// brand.brand_name → "Stripe"
// brand.logos → LogoAsset[]
// brand.colors → ColorAsset[]
// brand.backdrop_images → BackdropAsset[]
```

Server-side only (requires Node.js/Bun for cheerio and sharp).

## Self-hosting the web app

```bash
git clone https://github.com/ethanjyx/openbrand.git
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
