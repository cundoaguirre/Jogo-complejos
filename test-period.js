import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  const buttons = await page.$$('button');
  for(let btn of buttons) {
    const text = await btn.evaluate(b => b.textContent);
    if(['Hoy', 'Sem', 'Mes', 'Año'].includes(text)) {
       console.log('Clicking', text);
       await btn.click();
       await new Promise(r => setTimeout(r, 1000));
    }
  }
  await browser.close();
})();
