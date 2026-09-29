import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // Click on "Agenda"
  console.log("Clicking Agenda...");
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const agendaBtn = buttons.find(b => b.textContent.includes('Agenda'));
    if (agendaBtn) agendaBtn.click();
  });
  
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
