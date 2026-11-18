# Luminescent Mastering website

The one-page site for luminescentmastering.com, with an admin panel at `/admin`. This branch is
separate from the Luminescent Gear code on `main`: Railway's `luminescent-mastering` project deploys
it, and pushes here don't touch the Gear site.

It's a small Node.js server (Node 22, no packages to install).

## Admin panel

Open luminescentmastering.com/admin and sign in with the admin password. There you can:

- change every text on the page: the intro, services, equipment, rates, the artist list,
  Send your music, contact details, the footer, the menu labels and the Google description;
- add, reorder and remove services, equipment groups, prices, blocks and links;
- switch between the two designs, **Rack** (the dark front panel with knobs) and **Raw**
  (black and plain: typewriter text and the splash logo, like a photocopied flyer);
- preview changes before saving, and go back to any of the last 30 saved versions.

Changes show on the site as soon as you save. An empty section (no services, no prices…) is left
off the page, with its menu link.

The PDF guide (`public/luminescent-mastering-mix-guide.pdf`) isn't edited in the admin.

## Railway setup

- Service `website` in the project `luminescent-mastering`, built from this branch's `Dockerfile`.
- A **volume mounted at `/data`** keeps the saved texts (`/data/content.json`) and earlier versions
  (`/data/history/`). Without it, changes would be lost at the next deploy.
- Variables:
  - `ADMIN_PASSWORD`: the admin password. Changing it signs everyone out.
  - `CANONICAL_HOST=luminescentmastering.com` (optional): sends www.luminescentmastering.com to the
    bare domain.
  - `PORT=8080`.
- Health check: `/healthz`.
- DNS for luminescentmastering.com is at LuaDNS (the domain is registered at ALL-INKL).

Pushes don't deploy on their own, because the Railway GitHub App isn't installed for this repo.
The service's source is **pinned to a commit** of this branch: without the pin, a redeploy (after a
variable or volume change) builds the repo's default branch, which is the Gear shop. To publish a new
commit, connect the service to this branch again with the new commit's SHA.

## Files

- `server.js`: the web server (page, static files, `/healthz`, the www forwarding).
- `src/content.js`: loading, checking and saving the texts; `content/default.json` holds the
  starting texts.
- `src/admin.js`, `src/auth.js`: the admin panel and its sign-in (signed cookie, form tokens, a limit
  on wrong passwords).
- `src/designs/rack.*` and `src/designs/raw.*`: the two designs.
- `public/`: logos, icons, fonts (Latin Modern Mono for the Raw design and Inter for the admin; see
  `public/fonts/README.txt` for their licences), the admin's styles and script, and the PDF guide.

## Run it on your computer

```bash
ADMIN_PASSWORD=choose-one npm start
```

Then open http://localhost:8080 and http://localhost:8080/admin. Saved texts go to `./data`.
