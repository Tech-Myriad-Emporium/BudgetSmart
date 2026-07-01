# Deploying the BudgetSmart site to Cloudflare Pages → budgetsmarttme.com

The marketing site is a static Vite build. Output goes to `apps/marketing/dist`.
Production build command (run from the **repo root**): `npm run build:site`.

> The domain `budgetsmarttme.com` is already on Cloudflare, so DNS + SSL are automatic
> once you attach the domain to the Pages project.

---

## Option A — Git-connected Pages (recommended, auto-deploys on push)

1. Push this repo to GitHub/GitLab.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. **Build settings:**
   - Framework preset: **None**
   - **Build command:** `npm run build:site`
   - **Build output directory:** `apps/marketing/dist`
   - **Root directory:** `/` (repo root — `build:site` orchestrates the sub-packages)
   - **Environment variable:** `NODE_VERSION = 22`
4. Save & Deploy. Each push to the production branch redeploys.

## Option B — Wrangler CLI (one-off, no Git)

```bash
npm i -g wrangler
wrangler login
npm run build:site                       # from repo root
cd apps/marketing
wrangler pages deploy dist --project-name=budgetsmart
```

---

## Attach the domain

In the Pages project → **Custom domains** → **Set up a custom domain**:
- Add `budgetsmarttme.com` (apex) and `www.budgetsmarttme.com`.
- Cloudflare creates the records automatically (domain is already on Cloudflare).
- Add a **Redirect Rule** so `www` → apex (or apex → `www`), pick one canonical host.
  The site's `<link rel="canonical">` points at the apex (`https://budgetsmarttme.com/`).

---

## SEO that's already wired in (and what to do post-launch)

Included (high-signal, not spammy):
- Descriptive `<title>` + meta description, `<link rel="canonical">`, `lang="en"`
- Open Graph + Twitter Card tags, one `SoftwareApplication` JSON-LD block
- `robots.txt` (+ sitemap reference), `sitemap.xml`
- `<noscript>` fallback with the core copy so there's crawlable content even without JS
- Semantic headings (one `h1`, section `h2`s), fast static bundle on Cloudflare's CDN
- Security + long-cache headers via `_headers`

After launch:
1. **Google Search Console** → add `https://budgetsmarttme.com/`, submit `sitemap.xml`.
2. (Optional) **Bing Webmaster Tools** likewise.
3. **Replace `og.svg` with a 1200×630 `og.png`** — some social scrapers (Twitter/Facebook/
   LinkedIn) don't render SVG preview images. Then update the two `og:image` /
   `twitter:image` URLs in `index.html` to `/og.png`.
4. Run the page through PageSpeed Insights; it should score high (static + CDN).

What we intentionally did **not** do (keeps it clean, avoids penalties): no meta-keywords
stuffing, no hidden text, no doorway pages, no duplicate-content variants.
