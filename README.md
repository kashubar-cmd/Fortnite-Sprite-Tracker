# Sprite Tracker

Static page for tracking a Fortnite sprite collection and comparing it with friends.
State lives in each person's browser; share links carry the collection in the URL.

## Files
- `index.html`: the tracker (no build step, no dependencies)
- `sprites.js`: sprite list + image file names (generated, don't edit)
- `img/`: mirrored sprite icons (filled in by the update job)
- `scripts/update.mjs`: refreshes `sprites.js` and downloads new images
- `.github/workflows/update-sprites.yml`: runs the script daily

## Setup (GitHub Pages)
1. Create a new **public** repo (Pages on private repos needs a paid plan) and upload everything here.
   Include the `.github` folder; hidden folders are easy to miss when dragging files in.
2. Repo > **Settings > Pages** > Source: *Deploy from a branch* > `main` / `(root)` > Save.
3. Repo > **Actions** > *Update sprites* > **Run workflow** once. It downloads all images into `img/`.
   Until that finishes, the page loads images straight from the original site.
4. Your link is `https://<your-username>.github.io/<repo-name>/`. Send it to friends.

## Notes
- If the update job fails (site blocks GitHub's servers, layout change), it leaves the old list in
  place and the page keeps working. Check the Actions tab for the error message.
- If a sprite has no local copy yet, the page falls back to the original host, then a placeholder.
- Sprite art belongs to Epic Games. Keep the repo small and friends-only in spirit; remove `img/`
  and the update step if anyone objects.
