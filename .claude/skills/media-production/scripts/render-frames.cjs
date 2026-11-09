const { chromium } = require('playwright'); const fs = require('fs');
const [html, seconds = 2] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1080 } });
  await p.goto('file://' + require('path').resolve(html)); fs.mkdirSync('frames', { recursive: true });
  for (let i = 0; i < 30 * seconds; i++) { await p.evaluate(t => window.render(t), i / 30); await p.screenshot({ path: `frames/f_${String(i).padStart(4, '0')}.png` }); }
  await b.close();
})();
