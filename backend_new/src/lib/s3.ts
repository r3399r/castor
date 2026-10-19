import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BadGatewayError } from 'src/model/error';

/**
 * S3 access on its own, deliberately not inside htmlSnapshot.ts.
 *
 * That module owns the Facebook post image and imports puppeteer-core
 * plus @sparticuz/chromium, so importing anything from it would drag a
 * headless browser into the importing bundle -- the API lambda needs S3
 * and nothing else. Keeping the URL construction in one place matters
 * too: a wrong region or bucket here produces images that are stored
 * fine and display as broken everywhere.
 */

// Matches the region the stack deploys to. Lambda always sets AWS_REGION,
// so this only covers local runs and tests.
const DEFAULT_REGION = 'ap-east-2';

const bucketName = (): string => {
  const bucket = process.env.S3_BUCKET;
  if (bucket === undefined || bucket === '')
    throw new BadGatewayError('S3_BUCKET is not configured', 'S3_NOT_CONFIGURED');
  return bucket;
};

/**
 * Stores one object and returns the URL to reference it by.
 *
 * The caller owns the key, because the key is the only thing that makes
 * an object findable later -- questions/<uuid>.png for a transient
 * Facebook render, questions/figures/<uuid>.png for a figure a question
 * depends on forever. Both live under questions/ because that is the only
 * prefix the bucket policy grants public read on.
 */
export const uploadToS3 = async (
  body: Buffer,
  contentType: string,
  key: string
): Promise<{ url: string; key: string }> => {
  const bucket = bucketName();
  const s3 = new S3Client({});
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  );

  const region = process.env.AWS_REGION ?? DEFAULT_REGION;
  return { url: `https://${bucket}.s3.${region}.amazonaws.com/${key}`, key };
};

export const deleteFromS3 = async (key: string): Promise<void> => {
  const s3 = new S3Client({});
  await s3.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
};
