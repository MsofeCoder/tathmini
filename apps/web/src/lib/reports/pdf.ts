import { chromium } from 'playwright-core';

/**
 * Renders an HTML string to a PDF buffer via headless Chromium.
 *
 * Two launch paths: @sparticuz/chromium ships a serverless-trimmed Linux
 * binary built for Vercel's function runtime, which does not exist (and
 * cannot run) on a developer's own machine — so locally this falls back to
 * playwright-core's own browser resolution, which finds the Chromium
 * `npx playwright install chromium` already downloads into the local
 * Playwright cache. Plain `playwright` (bundled Chromium) was rejected for
 * production: its download is large enough to risk Vercel's function size
 * limit, which @sparticuz/chromium exists specifically to avoid.
 */
export async function renderPdf(html: string): Promise<Buffer> {
  const isServerless = !!process.env.VERCEL;

  const browser = isServerless
    ? await launchServerless()
    : await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

async function launchServerless() {
  const chromiumServerless = (await import('@sparticuz/chromium')).default;
  return chromium.launch({
    args: chromiumServerless.args,
    executablePath: await chromiumServerless.executablePath(),
    headless: true,
  });
}
