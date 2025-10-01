#!/bin/bash
set -e

env=$1
project=caster
subDomain=pmp
domain=celestialstudio.net

echo ====================================================================================
echo env: $env
echo project: $project
echo domain: $subDomain.$domain
echo ====================================================================================

echo deploy backend AWS...
cd ./backend
npm install
npm run pre:deploy
aws cloudformation package --template-file aws/cloudformation/template.yaml --output-template-file packaged.yaml --s3-bucket y-cf-midway-ap-east-2
aws cloudformation deploy --template-file packaged.yaml --stack-name $project-$env-stack --parameter-overrides TargetEnvr=$env Project=$project SubDomain=$subDomain Domain=$domain --no-fail-on-empty-changeset --s3-bucket y-cf-midway-ap-east-2 --capabilities CAPABILITY_NAMED_IAM
echo ====================================================================================

echo prepare frontend files...
rm -rf ../webapp/src/model/backend
# rm -rf ../webapp/src/constant/backend
cp -R lib/src/model ../webapp/src/model/backend
# cp -R src/constant ../webapp/src/constant/backend
echo ====================================================================================

echo deploy frontend to S3...
cd ../webapp
npm i
npm run build
aws s3 sync ./dist s3://$project-$env-y --delete --cache-control no-cache
echo ====================================================================================
