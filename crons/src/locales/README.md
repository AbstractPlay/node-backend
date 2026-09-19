# Generated `apback` locale files

Not committed. Canonical strings live in [node-backend `locales/`](https://github.com/AbstractPlay/node-backend/tree/develop/locales).

**Local:** `npm run sync-apback-locales` (sibling `../node-backend` or `NODE_BACKEND_ROOT`).

**CI / deploy:** workflows check out node-backend and run the same sync before build and test.

`npm test` runs `pretest`, which syncs automatically when these files are missing.
