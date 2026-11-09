#!/bin/bash
set -e

env=$1
project=castor
subDomain=learnforgood
domain=celestialstudio.net

echo ====================================================================================
echo env: $env
echo project: $project
echo domain: $subDomain.$domain
echo ====================================================================================

npm install

echo deploy backend AWS...
cd ./backend_new
npm run pre:deploy
aws cloudformation package --template-file aws/cloudformation/template.yaml --output-template-file packaged.yaml --s3-bucket y-cf-midway-ap-east-2
aws cloudformation deploy --template-file packaged.yaml --stack-name $project-$env-stack --parameter-overrides TargetEnvr=$env Project=$project SubDomain=$subDomain Domain=$domain --no-fail-on-empty-changeset --s3-bucket y-cf-midway-ap-east-2 --capabilities CAPABILITY_NAMED_IAM
echo ====================================================================================

echo deploy webapp SSG to S3...
cd ../webapp
# next dev and next build share .next, but produce incompatible output
# (next.config.ts only sets output:'export' when NODE_ENV=production).
# A local dev run therefore leaves artifacts that make this build fail in
# page-data collection with a misleading "Cannot find module for page".
# Clearing out too, so pages deleted since the last deploy are not
# re-synced to S3 from a stale export.
rm -rf .next out
npm run build
# Everything outside _next/static: unhashed names, so it has to stay
# uncacheable. --delete prunes pages removed since the last release.
aws s3 sync ./out s3://$project-$env-y --delete --exclude "_next/static/*" --cache-control "no-cache"

# The hashed assets, in two passes, because one cannot do both jobs:
#
#   sync  prunes assets dropped from this release, but SKIPS any file
#         whose contents already match the object in the bucket -- it
#         never revisits a skipped object to update its metadata.
#   cp    always writes, so it is what actually puts the header on.
#
# That skip is why the immutable header below has never reached a single
# asset: the old script uploaded everything with no-cache first, and the
# line meant to mark it immutable skipped all of it. Reordering alone
# would not fix it either -- an asset already in the bucket from an
# earlier release keeps its no-cache header until something overwrites
# the object, and an unchanged chunk keeps the same content hash, so its
# name never changes and sync never touches it again.
#
# The cp pass re-uploads the whole prefix every deploy (2.4MB, 69 files),
# which is cheaper than reasoning about which objects still carry a stale
# header.
aws s3 sync ./out/_next/static s3://$project-$env-y/_next/static --delete --cache-control "public, max-age=31536000, immutable"
aws s3 cp ./out/_next/static s3://$project-$env-y/_next/static --recursive --cache-control "public, max-age=31536000, immutable"
# No CloudFront invalidation, and none needed: everything outside
# _next/static is served with no-cache and sits behind a TTL-0 behavior,
# while everything inside it has a content hash in its name, so a new
# release is a new URL. Adding a TTL to the default behavior would change
# that and an invalidation would have to come with it.
echo ====================================================================================
