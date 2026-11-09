// Render an HTML animation to PNG frames.
// Usage: node render-frames.cjs page.html <seconds> [width=1080] [height=1080] [fps=30] [outDir=frames]
// The page must define window.render(t) that draws the frame at time t (seconds).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [html, seconds = 2, width = 1080, height = 1080, fps = 30, outDir = 'frames'] = process.argv.slice(2);
if (!html) { console.error('usage: node render-frames.cjs page.html seconds [w] [h] [fps] [outDir]'); process.exit(1); }
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +width, height: +height } });
  await page.goto('file://' + path.resolve(html));
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(outDir, { recursive: true });
  const total = Math.round(+seconds * +fps);
  for (let i = 0; i < total; i++) {
    await page.evaluate(t => window.render(t), i / +fps);
    await page.screenshot({ path: path.join(outDir, `f_${String(i).padStart(4, '0')}.png`) });
  }
  await browser.close();
  console.log(`${total} frames → ${outDir}`);
})();
