# castor
tarot

## work with docker
go to the folder you want to work in docker container and run
```
docker run -dit -v .:/usr/src/app --name castor sleavely/node-awscli:22.x
```
a docker container would be generated.

if you want to attach it, run
```
docker exec -it castor bash
```

One manual step required — create the Chromium Lambda layer:

The arm64 Chromium binary must be in a Lambda layer. Do this once per region:


# Download the arm64 layer from @sparticuz/chromium GitHub releases
curl -L -o chromium-arm64.zip \
  https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack-arm64.tar.br

# Publish the layer (adjust region as needed)
aws lambda publish-layer-version \
  --layer-name chromium-arm64 \
  --compatible-runtimes nodejs22.x \
  --compatible-architectures arm64 \
  --zip-file fileb://chromium-arm64.zip \
  --region ap-east-1

# Copy the returned LayerVersionArn and set it as a secret/env:
export CHROMIUM_LAYER_ARN=arn:aws:lambda:ap-east-1:ACCOUNT:layer:chromium-arm64:1
Add CHROMIUM_LAYER_ARN as a GitHub Actions secret so deploy.sh can pass it to CloudFormation.