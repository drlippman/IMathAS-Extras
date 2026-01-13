const express = require('express');
const https = require('https');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const MathJax = require('mathjax');
MathJax.init({loader: {load: ['input/tex', 'output/svg']}});

const app = express();
const PORT = 3001;

// Create cache directory at startup
const CACHE_DIR = path.join(__dirname, 'math-cache');
fsp.mkdir(CACHE_DIR, { recursive: true }).catch(console.error);

function getCacheKey(math) {
  return crypto.createHash('sha256').update(math).digest('hex') + '.svg';
}

// Add this function near the top with your other functions
async function cleanupOldCache() {
  try {
    const files = await fsp.readdir(CACHE_DIR);
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      try {
        const stats = await fsp.stat(filePath);
        // Check last access time
        if (stats.atimeMs < oneWeekAgo) {
          await fsp.unlink(filePath);
          deletedCount++;
        }
      } catch (err) {
        console.error(`Error processing ${file}:`, err);
      }
    }

    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} cached SVG(s)`);
    }
  } catch (err) {
    console.error('Error during cache cleanup:', err);
  }
}

// Run cleanup on startup
cleanupOldCache();

// Run cleanup daily
setInterval(cleanupOldCache, 24 * 60 * 60 * 1000);

// Check for allowed domain
app.use((req, res, next) => {
  const allowedDomains = [
    'https://mydomain.com',
    'http://localhost'
  ];

  const referer = req.headers.referer || req.headers.referrer;

  if (referer) {
    const isAllowed = allowedDomains.some(domain => referer.includes(domain));
    if (!isAllowed) {
      return res.status(403).send('Access denied');
    }
  }

  // Set CORS headers to allow fetching
  if (req.headers.origin) {
    const allowedOrigin = allowedDomains.find(domain => req.headers.origin.includes(domain));
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    } else {
      return res.status(403).send('Access denied');
    }
  }

  next();
});


app.get('/math', async (req, res) => {
  let math = req.url.split('?')[1] || ''; // req.query.expr;
  math = decodeURIComponent(math);

  if (!math) {
    return res.status(400).send('Missing query parameter');
  }

  try {
    const cacheKey = getCacheKey(math);
    const cachePath = path.join(CACHE_DIR, cacheKey);

    // Try to read from cache first
    try {
      const cachedSvg = await fsp.readFile(cachePath, 'utf8');
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
      res.setHeader('ETag', cacheKey); // Use hash as ETag
      return res.send(cachedSvg);
    } catch (err) {
      // Cache miss, continue to render
    }

    // Render math to SVG
    const svg = MathJax.tex2svg(math, {display: true});
    const svgNode = MathJax.startup.adaptor.firstChild(svg);
    const svgOutput = MathJax.startup.adaptor.serializeXML(svgNode);

    // store in cache
    fsp.writeFile(cachePath, svgOutput).catch(console.error);

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
    res.setHeader('ETag', cacheKey); // Use hash as ETag
    res.send(svgOutput);
  } catch (error) {
    res.status(500).send('Error rendering math: ' + error.message);
  }
});

var options = {
    // adjust these paths to your certificate locations
    key: fs.readFileSync(__dirname + '/../livepoll/certs/privkey.pem'),
    cert: fs.readFileSync(__dirname + '/../livepoll/certs/fullchain.pem'),
    ca: fs.readFileSync(__dirname + '/../livepoll/certs/chain.pem')
};
https.createServer(options, app).listen(3002, () => {
  console.log(`Server running on port 3002`);
});
