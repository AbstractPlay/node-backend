# Docs repository integration

Integration with the [AbstractPlay/docs](https://github.com/AbstractPlay/docs) repository is complete:

- Submodule: `vendor/node-backend` → `https://github.com/AbstractPlay/node-backend.git` (`develop` / `main`)
- Prebuild: `syncDocs("node-backend", "backend", false)`
- Site nav: **Backend** section at `/backend/`
- Deploy workflows fetch `vendor/node-backend` with renderer and gameslib

Local prebuild falls back to a sibling `../node-backend` checkout when the submodule does not yet contain `/docs` (e.g. before docs land on `develop`).

Published URL prefix: `/backend/` (e.g. `/backend/database-schema/`).
