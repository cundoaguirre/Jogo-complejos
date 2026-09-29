const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // click recent activity item
  const recentItems = await page.$$('.cursor-pointer'); // matches the py-4 flex items-center justify-between gap-3 cursor-pointer...
  console.log('Found recent items:', recentItems.length);
  if (recentItems.length > 0) {
    await recentItems[0].click();
    await page.waitForTimeout(1000);
  }
  
  await browser.close();
})();
