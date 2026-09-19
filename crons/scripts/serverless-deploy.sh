#!/usr/bin/env bash
# Deploy abstract-play-backend-crons stack (run after main node-backend deploy).
#
# Usage: crons/scripts/serverless-deploy.sh <stage>
# Example: crons/scripts/serverless-deploy.sh dev
set -euo pipefail

STAGE="${1:?usage: serverless-deploy.sh <stage>}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

exec npx serverless deploy --stage "$STAGE"
