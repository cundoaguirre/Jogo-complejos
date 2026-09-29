import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  const clickTab = async (text) => {
    await page.evaluate((txt) => {
       const btns = Array.from(document.querySelectorAll('button'));
       const btn = btns.find(b => b.textContent.includes(txt) && b.closest('.fixed.bottom-0'));
       if(btn) btn.click();
    }, text);
    await new Promise(r => setTimeout(r, 1000));
  };
  
  await clickTab('Agenda');
  await clickTab('Usuarios');
  await clickTab('Finanzas');
  await clickTab('Perfil');
  
  await browser.close();
})();
