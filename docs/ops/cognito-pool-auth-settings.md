# Cognito pool auth settings (messages & email alias)

Prod and dev user pools are configured in the AWS console / CLI, not in `serverless.yml`. Message copy is maintained in-repo and applied with an ops script.

## Source files

| File | Purpose |
|------|---------|
| `scripts/cognito-pool-auth-settings.json` | Verification (link), forgot-password (code), and admin-invite templates |
| `scripts/apply-cognito-pool-auth-settings.mjs` | `DescribeUserPool` + `UpdateUserPool` for `--stage dev\|prod` |
| `scripts/apply-cognito-pool-ses-email.mjs` | Cognito auth email via SES (`DEVELOPER`) — same From as API/crons mail |

## Apply

```bash
npm run apply-cognito-pool-auth-settings -- --stage prod --dry-run
npm run apply-cognito-pool-auth-settings -- --stage prod --apply
npm run apply-cognito-pool-auth-settings -- --stage dev --apply
```

Requires AWS profile `AbstractPlayProd` or `AbstractPlayDev`. Pool ids: prod `us-east-1_YCjgSZHJm`, dev `us-east-1_2zrzbEjoU`.

## Custom message Lambda (play auth deep links)

Managed sign-up, password reset, and settings email change use the **`cognitoCustomMessage`** function in `serverless.yml` (`api/cognitoCustomMessage.ts`, logic in `lib/cognito/customMessage.ts`). Emails link to `https://play.<stage>/account/...` with click-to-verify URLs.

**Deploy and wire (dev first):**

1. `serverless deploy --stage dev` (creates/updates the `cognitoCustomMessage` Lambda only — the pool trigger is **not** attached by Serverless; the `cognitoUserPool` + `existing` CFN resource fails on our pools).
2. After a successful deploy, run:

```bash
npm run apply-cognito-custom-message-trigger -- --stage dev
npm run apply-cognito-custom-message-trigger -- --stage dev --dry-run
```

3. Create a throwaway user on dev and confirm the verification email contains a **play.dev** `/account/verify` link (not only Cognito’s default hosted link).

The apply script sets **`AutoVerifiedAttributes: email`** when the pool has none (required for `ResendConfirmationCode` and Amplify `resendSignUpCode`). Re-running the script preserves an existing list; avoid bare `update-user-pool` calls that change only one field — Cognito can clear other settings unless you send them in the same request.

Prod: repeat with `--stage prod` after dev Gates B–D are validated. `PLAY_BASE_URL` is set per stage in `serverless.yml` from `siteHost`.

## Auth email From (SES, not Cognito default)

Sign-up, reset, and attribute-verify mail uses the **Custom message** Lambda for HTML; the **From** address comes from the user pool **Email configuration**. Default Cognito mail shows `no-reply@verificationemail.com`. To match transactional mail (`noreply@abstractplay.com` from **`lib/sesFromAddress.ts`**, sent via the verified **`abstractplay.com`** SES domain identity):

```bash
npm run apply-cognito-pool-ses-email -- --stage prod --dry-run
npm run apply-cognito-pool-ses-email -- --stage prod --apply
```

`emailConfiguration` in `scripts/cognito-pool-auth-settings.json` is the source of truth for From + SES identity. The script verifies the identity in SES, sets `EmailSendingAccount` to `DEVELOPER`, and **preserves** `LambdaConfig`, `AutoVerifiedAttributes`, and message templates in the same `UpdateUserPool` call.

After apply, send a throwaway `sign-up` or `resend-confirmation-code` and confirm the inbox **From** is `noreply@abstractplay.com`. Allow ~70s for Cognito to pick up the change.

Dev: repeat with `--stage dev`. Run **after** `apply-cognito-custom-message-trigger` (or re-run the trigger script if you applied SES first and need to confirm `CustomMessage` is still set).

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