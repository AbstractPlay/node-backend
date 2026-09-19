# Docs repository integration

[AbstractPlay/docs](https://github.com/AbstractPlay/docs) aggregates crons documentation from this monorepo:

- Submodule `vendor/node-backend` → `https://github.com/AbstractPlay/node-backend.git` (`develop` / `main`).
- Prebuild: `vendor/node-backend/crons/docs` → site prefix `/crons/` (`scripts/crons-docs.js` + `syncDocsFromSrc` in `scripts/prebuild.js`).
- Site nav: **Crons** section at `/crons/` (`crons/docs/nav.json`).
- No `vendor/backend-crons` submodule (retired with monorepo merge).

Local prebuild: sibling `../node-backend` with `crons/docs/` when the vendor pin predates the merge.

Published URL prefix: `/crons/` (e.g. `/crons/pipeline/`).

Docs rebuild trigger: node-backend deploy workflow dispatches `dep_update_dev` / `dep_update_prod` when a push changes `docs/` or `crons/docs/`.
