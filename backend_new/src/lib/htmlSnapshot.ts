/// <reference lib="dom" />
// The reference above only affects type-checking inside this file (not
// the rest of this Node-only project) -- needed because the callbacks
// passed to page.evaluate() below run in the browser Puppeteer controls,
// not in this process, so they reference window/document.
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import chromium from '@sparticuz/chromium';
import { randomUUID } from 'node:crypto';
import puppeteer from 'puppeteer-core';

// Width of the rendered page in CSS pixels. The PNG comes out at this
// times DEVICE_SCALE, so 720 x 2 = 1440px wide -- comfortably above the
// 1200px Facebook wants for a feed photo. Widened from 560 because a
// reading-comprehension passage wrapped into a very tall, narrow image;
// the text column is this minus the body margins (24px each side).
const VIEWPORT_WIDTH = 720;
const DEVICE_SCALE = 2;

const wrapHtml = (content: string) => `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <!-- Noto Serif TC supplies the Ming (明體) face. A webfont is not
       optional here: the Lambda Chromium image ships essentially no
       system fonts, so anything not downloaded renders as tofu. -->
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Tinos:ital,wght@0,400;0,700;1,400&family=LXGW+WenKai+TC:wght@400;700&display=swap" rel="stylesheet">
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
        displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
      },
    };
  </script>
  <script id="MathJax-script" src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
  <style>
    /* Printed-exam look for the posted image: Times for Latin, Ming for
       CJK. Times New Roman is named first for the machines that have it;
       Tinos is its metrically-compatible stand-in and is what Lambda
       actually gets. Latin glyphs come from those two, and the CJK
       characters they have no glyph for fall through to Noto Serif TC.
       The app's own question rendering does NOT share this stack. */
    body { margin: 20px 24px; font-family: 'Times New Roman', 'Tinos', 'Noto Serif TC', serif; font-size: 16px; line-height: 1.6; background: #fff; color: #1a1a1a; }
    img { max-width: 100%; }
    /* Separates a GROUP's sub-questions, which otherwise read as one
       run-on paragraph (see facebookPoster.ts). */
    .child-question { margin-top: 14px; }
  </style>
</head>
<body>${content}</body>
</html>`;

/**
 * Renders a question's HTML content to a PNG (via headless Chromium, so
 * MathJax gets a chance to typeset before the screenshot) and uploads it
 * to S3 -- this is how a question becomes a postable Facebook photo.
 * Caller is responsible for deleting the S3 object (via deleteS3File)
 * once it's no longer needed, e.g. after the Facebook post succeeds.
 */
export const htmlToS3Url = async (html: string): Promise<{ url: string; key: string }> => {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: VIEWPORT_WIDTH, height: 600, deviceScaleFactor: DEVICE_SCALE });
    // 'load' waits for the <script> tags (including the MathJax CDN) to
    // finish executing.
    await page.setContent(wrapHtml(html), { waitUntil: 'load', timeout: 20000 });
    // MathJax typesetting is async internally; wait for startup.promise
    // to resolve before screenshotting, or formulas render as raw TeX.
    await page.evaluate(async () => {
      type Win = { MathJax?: { startup?: { promise?: Promise<void> } } };
      await Promise.all([(window as Win).MathJax?.startup?.promise, document.fonts.ready]);
    });
    // Clip to actual content size to avoid blank right/bottom padding.
    const { contentWidth, contentHeight } = await page.evaluate(() => {
      const style = window.getComputedStyle(document.body);
      const marginBottom = parseFloat(style.marginBottom);
      return {
        contentWidth: document.documentElement.scrollWidth,
        contentHeight: document.body.getBoundingClientRect().bottom + marginBottom,
      };
    });
    const buffer = (await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: contentWidth, height: contentHeight },
    })) as Buffer;

    const s3 = new S3Client({});
    const key = `questions/${randomUUID()}.png`;
    await s3.send(
      new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: 'image/png' })
    );

    const region = process.env.AWS_REGION ?? 'ap-east-2';
    return { url: `https://${process.env.S3_BUCKET}.s3.${region}.amazonaws.com/${key}`, key };
  } finally {
    await browser.close();
  }
};

export const deleteS3File = async (key: string): Promise<void> => {
  const s3 = new S3Client({});
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
};
