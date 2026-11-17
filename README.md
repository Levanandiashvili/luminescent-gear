# Luminescent Mastering website

The one-page site for luminescentmastering.com. This branch is separate from the Luminescent Gear
code on `main`: Railway's `luminescent-mastering` project deploys it, and pushes here don't touch
the Gear site.

- `index.html` is the whole site, with the logo and icons inlined.
- `nginx.conf` serves it on port 8080, with a `/healthz` check for Railway, and sends
  www.luminescentmastering.com to the bare domain.
- DNS for luminescentmastering.com is at LuaDNS (the domain is registered at ALL-INKL).

To update the site, replace `index.html`, push to this branch, then deploy the latest commit of the
`website` service in Railway's `luminescent-mastering` project. Pushes don't deploy on their own,
because the Railway GitHub App isn't installed for this repo.
