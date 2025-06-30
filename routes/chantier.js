const express = require('express');
const router = express.Router();
const { isAuthenticated: ensureAuthenticated } = require('../middlewares/auth');
const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

// Export PDF route
router.get('/export-pdf', ensureAuthenticated, async (req, res, next) => {
  try {
    const host = req.get('host');
    const protocol = req.protocol;
    const url = `${protocol}://${host}/chantier?` + Object.entries(req.query)
      .map(([k,v])=>`${k}=${encodeURIComponent(v)}`)
      .join('&');
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    res.setHeader('Content-Type','application/pdf');
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
