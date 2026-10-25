const express = require('express');
const http = require('http');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const MathJax = require('mathjax');
MathJax.init({
  loader: {load: ['input/tex', 'output/svg', '[tex]/color', '[tex]/cancel']},
  tex: { packages: {'[+]': ['cancel', 'color']} }
});

const app = express();
const PORT = 3001;

// Restrict requests to these domains (matched against Referer and Origin).
// Uncomment and edit to enable; when undefined, requests from any domain are allowed.
// const allowedDomains = [
//   'https://mydomain.com',
//   'http://localhost'
// ];

//  Minimal CSS needed for stand-alone image
//
const CSS = [
  'svg a{fill:blue;stroke:blue}',
  '[data-mml-node="merror"]>g{fill:red;stroke:red}',
  '[data-mml-node="merror"]>rect[data-background]{fill:yellow;stroke:none}',
  '[data-frame],[data-line]{stroke-width:70px;fill:none}',
  '.mjx-dashed{stroke-dasharray:140}',
  '.mjx-dotted{stroke-linecap:round;stroke-dasharray:0,140}',
  'use[data-c]{stroke-width:3px}'
].join('');


// Create cache directory at startup
const CACHE_DIR = path.join(__dirname, 'math-cache');
fsp.mkdir(CACHE_DIR, { recursive: true }).catch(console.error);

// Protection limits
const MAX_MATH_LENGTH = 3000;     // chars of TeX accepted
const MAX_CONCURRENT = 8;         // renders in flight; extra requests get 503 instead of piling up
const RENDER_TIMEOUT_MS = 8000;   // stop waiting on a render (frees the client; can't interrupt sync work)
const MAX_CACHE_FILES = 100000;   // stop adding to the cache beyond this, so it can't fill the disk
let cacheCount = 0;
let inFlight = 0;

function getCacheKey(math) {
  return crypto.createHash('sha256').update(math).digest('hex') + '.svg';
}

// Add this function near the top with your other functions
async function cleanupOldCache() {
  try {
    const files = await fsp.readdir(CACHE_DIR);
    cacheCount = files.length;
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      try {
        const stats = await fsp.stat(filePath);
        // Check last access time
        // use the later of atime/mtime, since atime may not be updated (noatime mounts)
        if (Math.max(stats.atimeMs, stats.mtimeMs) < oneWeekAgo) {
          await fsp.unlink(filePath);
          deletedCount++;
          cacheCount--;
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

// Run cleanup every 6 hours
setInterval(cleanupOldCache, 6 * 60 * 60 * 1000);

// Health check endpoint (used by the watchdog cron job)
app.get('/ping', (req, res) => res.send('pong'));

// Check for allowed domain (skipped when allowedDomains is not defined)
app.use((req, res, next) => {
  if (typeof allowedDomains === 'undefined') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return next();
  }

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
  if (math.length > MAX_MATH_LENGTH * 3) {
    return res.status(414).send('Expression too long');
  }
  try {
    math = decodeURIComponent(math);
  } catch (e) {
    return res.status(400).send('Bad encoding');
  }

  if (!math) {
    return res.status(400).send('Missing query parameter');
  }
  if (math.length > MAX_MATH_LENGTH) {
    return res.status(414).send('Expression too long');
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

    if (inFlight >= MAX_CONCURRENT) {
      res.setHeader('Retry-After', '5');
      return res.status(503).send('Server busy');
    }

    // Render math to SVG
    inFlight++;
    let svg;
    let timer;
    try {
      svg = await Promise.race([
        MathJax.tex2svgPromise(math, {display: true}),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('render timeout')), RENDER_TIMEOUT_MS);
        })
      ]);
    } finally {
      clearTimeout(timer);
      inFlight--;
    }
    const svgNode = MathJax.startup.adaptor.firstChild(svg);
    let svgOutput = MathJax.startup.adaptor.serializeXML(svgNode);
    svgOutput = svgOutput.replace(/<defs>/, `<defs><style>${CSS}</style>`);

    // store in cache
    if (cacheCount < MAX_CACHE_FILES) {
      cacheCount++;
      fsp.writeFile(cachePath, svgOutput).catch(console.error);
    }

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
    res.setHeader('ETag', cacheKey); // Use hash as ETag
    res.send(svgOutput);
  } catch (error) {
    res.status(500).send('Error rendering math: ' + error.message);
  }
});

const server = http.createServer(app);
// Don't let slow or stalled clients hold connections open indefinitely
server.headersTimeout = 10000;
server.requestTimeout = 15000;
server.keepAliveTimeout = 5000;
server.maxConnections = 500;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on port ${PORT}`);
});

// Log and exit on fatal errors so systemd restarts us cleanly
process.on('uncaughtException', (err) => { console.error('uncaughtException', err); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error('unhandledRejection', err); process.exit(1); });
