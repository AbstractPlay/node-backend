#!/usr/bin/env bash
# Deploy with enableGameProjectorStream derived from whether the table already has a stream.
#
# First deploy to a stage (no stream yet): enables StreamSpecification on the table only.
# Subsequent deploys (stream exists): attaches GameProjectorEventSourceMapping.
#
# Usage: bin/serverless-deploy.sh <stage> <aws-profile>
# Example: bin/serverless-deploy.sh dev AbstractPlayDev
set -euo pipefail

STAGE="${1:?usage: serverless-deploy.sh <stage> <aws-profile>}"
PROFILE="${2:?usage: serverless-deploy.sh <stage> <aws-profile>}"
TABLE="abstract-play-${STAGE}"
REGION="${AWS_REGION:-us-east-1}"

STREAM_ARN=$(aws dynamodb describe-table \
  --table-name "$TABLE" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --query 'Table.LatestStreamArn' \
  --output text 2>/dev/null || echo "None")

if [ "$STREAM_ARN" != "None" ] && [ -n "$STREAM_ARN" ]; then
  echo "DynamoDB stream on ${TABLE}: ${STREAM_ARN}"
  echo "Deploying with gameProjector stream mapping enabled"
  exec serverless deploy --stage "$STAGE" --param=enableGameProjectorStream=true
else
  echo "No DynamoDB stream on ${TABLE} yet"
  echo "Deploying without gameProjector stream mapping (streams will be enabled on this deploy)"
  exec serverless deploy --stage "$STAGE" --param=enableGameProjectorStream=false
fi
