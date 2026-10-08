# Profession photos (optional banners)

Each `career-as-<slug>.html` page shows a photo banner **only if**
`images/professions/<slug>.jpg` exists here. With no image, the page is
unchanged (it keeps its illustrated hero). So photos are purely additive.

## Getting the photos

The Claude cloud session that built this can't download images — its network
policy blocks every image host. So fetch them from a normal machine:

```bash
# optional but recommended, for smaller/cropped files:
npm i sharp

# fetch strictly-CC0 / public-domain photos, optimise, wire in, rebuild:
npm run photos:fetch           # only the ones not already here
# node tools/fetch-profession-photos.mjs --force          # re-fetch all
# node tools/fetch-profession-photos.mjs --only=nurse,chef # just these
```

It pulls from the **Openverse API filtered to `license=cc0,pdm`** — CC0 and
Public Domain Mark only, so every image is genuinely licence-free with no
attribution required. It then rebuilds the generated pages, injects the banner
into the older hand-authored pages, writes `credits.json` (provenance), and
regenerates the sitemap.

Review the results (search results vary in quality — re-run `--only=<slug>` for
any you want to replace, or just drop your own `<slug>.jpg` in here), then
commit `images/professions/` together with the changed pages.

## Using your own images instead

Drop a landscape JPEG named exactly `<slug>.jpg` (e.g. `nurse.jpg`,
`software-engineer.jpg`) into this folder and rebuild
(`npm run career:pages`). Any aspect ratio works — the page crops it to the
banner. Make sure you have the right to use it.
