import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('response', response => {
    if(!response.ok()) console.log('REQ ERROR:', response.url(), response.status());
  });
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // Wait a little bit
  await new Promise(r => setTimeout(r, 2000));
  
  // Dump the page content text to see if it says Cargando dashboard...
  const text = await page.evaluate(() => document.body.innerText);
  console.log("PAGE TEXT:\\n" + text.substring(0, 500));
  
  await browser.close();
})();
