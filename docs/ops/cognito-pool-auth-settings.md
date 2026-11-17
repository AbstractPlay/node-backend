# Cognito pool auth settings (messages & email alias)

Prod and dev user pools are configured in the AWS console / CLI, not in `serverless.yml`. Message copy is maintained in-repo and applied with an ops script.

## Source files

| File | Purpose |
|------|---------|
| [`scripts/cognito-pool-auth-settings.json`](../../scripts/cognito-pool-auth-settings.json) | Verification (link), forgot-password (code), and admin-invite templates |
| [`scripts/apply-cognito-pool-auth-settings.mjs`](../../scripts/apply-cognito-pool-auth-settings.mjs) | `DescribeUserPool` + `UpdateUserPool` for `--stage dev\|prod` |

## Apply

```bash
npm run apply-cognito-pool-auth-settings -- --stage prod --dry-run
npm run apply-cognito-pool-auth-settings -- --stage prod --apply
npm run apply-cognito-pool-auth-settings -- --stage dev --apply
```

Requires AWS profile `AbstractPlayProd` or `AbstractPlayDev`. Pool ids: prod `us-east-1_YCjgSZHJm`, dev `us-east-1_2zrzbEjoU`.

## Email templates (applied via `UpdateUserPool`)

- **Sign-up / resend confirmation:** `CONFIRM_WITH_LINK` — `{##Verify email##}` becomes the confirm link.
- **Forgot password:** code email (`{####}`) — Cognito has no native reset magic link.
- **Admin invite:** temporary password template for rare admin-created users.

Allow up to ~70 seconds for Cognito to pick up template changes.

## Email sign-in alias (not on current pools)

Abstract Play pools were created with **username-only** sign-in. AWS **does not allow** adding `AliasAttributes: ["email"]` after creation ([updating user pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-updating.html)). The apply script requests email alias for documentation and **exits with code 2** if the pool still has no alias after update.

**Options to allow sign-in with email later:**

| Approach | Effort | Notes |
|----------|--------|--------|
| **New user pool** + **User Migration** Lambda | High | Only way to get native Hosted UI email alias with ~1.4k existing users |
| **“Forgot username?”** (email → remind username) | Medium | Public or rate-limited ops script / API; does not change Cognito sign-in |
| **Custom sign-in UI** (resolve email → `InitiateAuth` with username) | Medium–high | Leave Hosted UI for registration only |

Until one of these ships, copy should refer to **username** on sign-in and password reset, not email.