import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Captures what was handed to the SDK instead of reaching AWS. Declared
// with `vi.hoisted` because vi.mock's factory is lifted above the imports.
const { sent } = vi.hoisted(() => ({ sent: [] as unknown[] }));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    async send(command: unknown) {
      sent.push(command);
    }
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { deleteFromS3, uploadToS3 } from 'src/lib/s3';

/**
 * These cover the one thing in this module that fails silently.
 *
 * A wrong bucket, region or key does not throw -- the object is stored
 * perfectly well and the URL handed back simply points at nothing, so the
 * figure shows up as a broken image in the app and in the Facebook post.
 * The logic used to live inside htmlSnapshot.ts, which imports Chromium
 * and is therefore mocked wholesale by the only suite that touches it;
 * moving it here is what made it reachable by a test at all.
 */
describe('uploadToS3', () => {
  const originalBucket = process.env.S3_BUCKET;
  const originalRegion = process.env.AWS_REGION;

  beforeEach(() => {
    sent.length = 0;
    process.env.S3_BUCKET = 'castor-public-bucket';
    process.env.AWS_REGION = 'ap-east-2';
  });

  afterEach(() => {
    if (originalBucket === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = originalBucket;
    if (originalRegion === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = originalRegion;
  });

  it('stores the body under the given key and returns its public url', async () => {
    const body = Buffer.from('png bytes');

    const result = await uploadToS3(body, 'image/png', 'question-figures/abc.png');

    expect(result).toEqual({
      url: 'https://castor-public-bucket.s3.ap-east-2.amazonaws.com/question-figures/abc.png',
      key: 'question-figures/abc.png',
    });
    expect(sent).toHaveLength(1);
    expect((sent[0] as { input: unknown }).input).toEqual({
      Bucket: 'castor-public-bucket',
      Key: 'question-figures/abc.png',
      Body: body,
      ContentType: 'image/png',
    });
  });

  // The returned URL has to agree with wherever the stack actually runs.
  it('builds the url from the region the function runs in', async () => {
    process.env.AWS_REGION = 'us-east-1';

    const { url } = await uploadToS3(Buffer.from('x'), 'image/webp', 'k/x.webp');

    expect(url).toBe('https://castor-public-bucket.s3.us-east-1.amazonaws.com/k/x.webp');
  });

  // Lambda always sets AWS_REGION; this only covers local runs.
  it('falls back to the stack region when AWS_REGION is unset', async () => {
    delete process.env.AWS_REGION;

    const { url } = await uploadToS3(Buffer.from('x'), 'image/png', 'k/x.png');

    expect(url).toContain('.s3.ap-east-2.amazonaws.com/');
  });

  // Without this the SDK would be handed Bucket: undefined, which fails
  // with an opaque SDK error rather than naming the missing config.
  it('refuses to upload when S3_BUCKET is not configured', async () => {
    delete process.env.S3_BUCKET;

    await expect(uploadToS3(Buffer.from('x'), 'image/png', 'k/x.png')).rejects.toMatchObject({
      status: 502,
      code: 'S3_NOT_CONFIGURED',
    });
    expect(sent).toHaveLength(0);
  });

  it('deletes by key from the configured bucket', async () => {
    await deleteFromS3('questions/old.png');

    expect((sent[0] as { input: unknown }).input).toEqual({
      Bucket: 'castor-public-bucket',
      Key: 'questions/old.png',
    });
  });
});
