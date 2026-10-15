# Luminescent Gear — Gyraf Audio & Sessiondesk, Georgia

A catalog website with a cart that produces bank-transfer invoices, prices in GEL and EUR, a studio photo gallery, and an admin panel for products, brands, categories, orders and settings.

It has **no dependencies** — just Node.js 22.13 or newer. The database (SQLite) and uploaded photos live in the `data/` folder.

## Run it on your computer

```bash
cp .env.example .env      # then set ADMIN_PASSWORD and SESSION_SECRET
npm start
```

Open http://localhost:3000 for the shop and http://localhost:3000/admin for the admin panel.

The first start loads the full catalog from the `catalog/` folder: 7 Gyraf Audio units and 32 Sessiondesk products, with descriptions, specifications, options and white-background product photos (studio photos go to the gallery). Products without a product photo stay hidden until you add one.

To re-import it into a shop that is already running (for example after new photos are added to `catalog/`), run `npm run load-catalog`. It updates the catalog products by brand and name and leaves everything else alone.

## Put it online

The site needs a server that keeps files between restarts (a "persistent disk" or "volume"), because that's where orders and photos are saved. Vercel and Netlify don't offer this, so use one of these:

**Render (fewest clicks)**
1. Put this folder in a GitHub repository.
2. On render.com, sign in with GitHub → New → Blueprint → pick the repository. The included `render.yaml` creates the website, its disk and the luminescentgear.ge domain.
3. Type your admin password when asked, then click Apply.
4. Add the DNS records Render shows for luminescentgear.ge at your domain registrar (or in Cloudflare).

**Railway**
1. Put this folder in a GitHub repository.
2. On railway.app: New project → Deploy from GitHub → pick the repo. It finds the Dockerfile.
3. In the service, add a **Volume** mounted at `/data`.
4. Under Variables, add `ADMIN_PASSWORD` and `SESSION_SECRET`.
5. Under Settings → Networking, add your domain (e.g. `yourshop.ge`) and set the DNS record your domain registrar shows.

**Render**: New Web Service from the repo, Docker runtime, add a Disk mounted at `/data`, add the same two variables.

**Any VPS** (Hetzner, DigitalOcean, a Georgian host): install Docker, then
```bash
docker build -t shop .
docker run -d --restart=always -p 80:3000 -v /srv/shop-data:/data \
  -e ADMIN_PASSWORD=... -e SESSION_SECRET=... shop
```
Put Caddy or Cloudflare in front for HTTPS.

**Back up** the `data/` folder (or the `/data` volume) regularly — it holds every order and photo.

## Quotes or invoices

The shop starts in **quote mode**: prices are labelled as estimates, there is no cart, and each product has a "Request a quote" button that opens WhatsApp (if you've entered a number) or email. To switch on the cart and bank-transfer invoices, go to Admin → Settings → Online ordering.

## Daily use

- **Products**: Admin → Products → Add product. Drop photos in; the first is the main photo. Leave the price empty for "Price on request".
- **Options**: for products sold in several versions (finishes, sizes, single or pair), list them in the Options box, one per line as `Option | EUR price`. The product page shows them as a price table, and the lowest becomes the "from" price.
- **New brand**: Admin → Brands → Add brand. Upload a logo and a large photo for the home page.
- **Price list**: Admin → Import prices. Upload a CSV from Excel (`;` or `,` separated). Columns: `name, brand, category, sku, price_eur, price_gel, from, options, availability, lead_time, summary, description, specs, featured, published`. Only `name` is required. Existing products are updated, new ones are added. Export the current list first to get a ready template.
- **Gallery**: Admin → Gallery. Drop in studio photos, add a caption and the photographer's credit, change the order, or hide a photo.
- **Orders**: every invoice a customer creates appears under Orders. Mark it Paid when the transfer arrives; the customer's invoice link then shows the new status.
- **Settings**: company and bank details (printed on invoices), VAT, invoice numbering, home page texts, and the exchange rate.

## Exchange rate

Prices are entered in EUR. GEL prices use the Bank of Georgia commercial sell rate, refreshed every 30 minutes, with the National Bank of Georgia official rate as a fallback. In Settings you can add a markup %, round GEL prices up, or switch to a fixed rate. Any product can have a fixed GEL price instead. Each invoice locks the rate it was created with.

## Invoices

The invoice is a print-ready A4 page with English and Georgian labels. "Download PDF" opens the browser's print dialog, where customers choose "Save as PDF". Invoice numbers run `INV-2026-0001`, `INV-2026-0002`, … (prefix set in Settings).
