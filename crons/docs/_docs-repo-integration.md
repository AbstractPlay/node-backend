# Docs repository integration

Integration with the [AbstractPlay/docs](https://github.com/AbstractPlay/docs) repository:

- Submodule: `vendor/node-backend` → `https://github.com/AbstractPlay/node-backend.git` (`develop` / `main`)
- Prebuild: sync cron docs from `vendor/node-backend/crons/docs` → `/crons/` (see AbstractPlay/docs prebuild config)
- Site nav: **Crons** section at `/crons/`
- Deploy workflows fetch `vendor/backend-crons` with renderer, gameslib, node-backend, and recranks

Local prebuild falls back to a sibling `../backend-crons` checkout when the submodule does not yet contain `/docs` (e.g. before docs land on `develop`).

Published URL prefix: `/crons/` (e.g. `/crons/pipeline/`).

Docs rebuild trigger: unconditional `dep_update_dev` / `dep_update_prod` dispatch on push deploy (gameslib/renderer pattern).
