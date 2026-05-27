import chromium from '@sparticuz/chromium';
import AWS from 'aws-sdk';
import puppeteer from 'puppeteer-core';
import { v4 as uuidv4 } from 'uuid';

const wrapHtml = (content: string) => `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=swap" rel="stylesheet">
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
    body { margin: 20px 24px; font-family: 'Noto Sans TC', sans-serif; font-size: 16px; line-height: 1.6; background: #fff; color: #1a1a1a; }
    img { max-width: 100%; }
  </style>
</head>
<body>${content}</body>
</html>`;

export async function htmlToS3Url(html: string): Promise<{ url: string; key: string }> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 560, height: 600, deviceScaleFactor: 2 });
    // 'load' waits for the <script> tags (including MathJax CDN) to finish executing
    await page.setContent(wrapHtml(html), { waitUntil: 'load', timeout: 20000 });
    // MathJax typesetting is async internally; wait for startup.promise to resolve
    await page.evaluate(async () => {
      type Win = { MathJax?: { startup?: { promise?: Promise<void> } } };
      await Promise.all([
        (window as Win).MathJax?.startup?.promise,
        document.fonts.ready,
      ]);
    });
    // Clip to actual content size to avoid blank right/bottom padding
    const { contentWidth, contentHeight } = await page.evaluate(() => ({
      contentWidth: document.documentElement.scrollWidth,
      contentHeight: document.documentElement.scrollHeight,
    }));
    const buffer = (await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: contentWidth, height: contentHeight },
    })) as Buffer;

    const s3 = new AWS.S3();
    const key = `questions/${uuidv4()}.png`;
    await s3
      .putObject({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
      })
      .promise();

    const region = process.env.AWS_REGION ?? 'ap-east-1';
    return { url: `https://${process.env.S3_BUCKET}.s3.${region}.amazonaws.com/${key}`, key };
  } finally {
    await browser.close();
  }
}

export async function deleteS3File(key: string): Promise<void> {
  const s3 = new AWS.S3();
  await s3
    .deleteObject({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
    })
    .promise();
}
