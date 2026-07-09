# Node Backend

The Abstract Play backend is a Serverless Framework service on AWS: Node.js Lambdas backed by a single DynamoDB table (`abstract-play-{stage}`). Most application logic lives in [`api/abstractplay.ts`](../api/abstractplay.ts).

## Documentation

- [Architecture](/backend/architecture/) — Lambdas, request routing, key modules
- [Database schema](/backend/database-schema/) — DynamoDB record types (pk/sk catalog)
- [Getting started](/backend/getting-started/) — local build, credentials, dependencies
- [Deployment](/backend/deployment/) — CI/CD, stages, Cognito essentials

### API

- [API overview](/backend/api/overview/) — `query`, `authQuery`, `botQuery` envelopes
- [Public queries](/backend/api/public-queries/) — unauthenticated RPC endpoints
- [Auth queries](/backend/api/auth-queries/) — Cognito-authenticated endpoints
- [Bot queries](/backend/api/bot-queries/) — M2M bot endpoints

### Bot framework

- [Bot framework](/backend/bots/) — protocol, auth, registration, implementation
- [Authentication](/backend/bots/authentication/)
- [Protocol](/backend/bots/protocol/)
- [Registration](/backend/bots/registration/)
- [Implementation guide](/backend/bots/implementation/)

### Subsystems

- [Games and moves](/backend/subsystems/games-and-moves/)
- [Challenges](/backend/subsystems/challenges/)
- [Tournaments](/backend/subsystems/tournaments/)
- [Events](/backend/subsystems/events/)
- [Bots](/backend/subsystems/bots/) — short overview (see Bot framework above)
- [WebSockets](/backend/subsystems/websockets/)
- [Notifications](/backend/subsystems/notifications/)
- [Player blocking](/backend/subsystems/player-blocking/)

## Resources

- [CHANGELOG](../CHANGELOG.md) — release history (repo root)
- [Gameslib docs](/gameslib/) — rules engine used by move validation
- [Renderer docs](/renderer/) — board rendering (transitive dependency)
- [Wiki bot RFC](https://abstractplay.com/wiki/doku.php?id=rfcs:bots) — original RFC (superseded by [Bot framework](/backend/bots/) docs here)

Query names and record field shapes are defined in TypeScript; these docs describe intent and patterns. When you add a query or record type, update `/docs` in the same PR.

*Last verified against `develop` branch.*
