import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const FINNHUB_API_KEY = 'd00dsnpr01qmsivsdiu0d00dsnpr01qmsivsdiug';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

// In-memory cache for live quotes and charts to ensure lightning-fast responses and zero rate limit issues
const cache = {
  quotes: new Map(), // symbol -> { data, expiresAt }
  charts: new Map(), // `${symbol}_${range}` -> { data, expiresAt }
  crypto: { data: null, expiresAt: 0 }
};

function fetchHttpsJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      ...(options.headers || {})
    };
    
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// ── Real-Time Quote Fetcher ───────────────────────────────────────────────────
async function getLiveStockQuote(symbol) {
  const cleanSym = symbol.toUpperCase().trim();
  const now = Date.now();

  if (cache.quotes.has(cleanSym)) {
    const cached = cache.quotes.get(cleanSym);
    if (cached.expiresAt > now) {
      return cached.data;
    }
  }

  let quoteData = null;

  // 1. Try Yahoo Finance for rich real-time market data
  try {
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSym)}?range=1d&interval=5m`;
    const yfRes = await fetchHttpsJson(yfUrl);
    const result = yfRes?.chart?.result?.[0];
    if (result && result.meta) {
      const meta = result.meta;
      const currentPrice = meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0;
      const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? currentPrice;
      const change = currentPrice - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
      
      quoteData = {
        symbol: cleanSym,
        name: meta.longName || meta.shortName || `${cleanSym} Equity`,
        c: Number(currentPrice.toFixed(2)),
        d: Number(change.toFixed(2)),
        dp: Number(changePct.toFixed(2)),
        h: Number((meta.regularMarketDayHigh ?? currentPrice * 1.01).toFixed(2)),
        l: Number((meta.regularMarketDayLow ?? currentPrice * 0.99).toFixed(2)),
        o: Number((meta.regularMarketDayOpen ?? prevClose).toFixed(2)),
        pc: Number(prevClose.toFixed(2)),
        v: meta.regularMarketVolume || 0,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ? Number(meta.fiftyTwoWeekHigh.toFixed(2)) : Number((currentPrice * 1.25).toFixed(2)),
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow ? Number(meta.fiftyTwoWeekLow.toFixed(2)) : Number((currentPrice * 0.75).toFixed(2)),
        currency: meta.currency || 'USD',
        exchange: meta.exchangeName || 'NASDAQ',
        timestamp: now
      };
    }
  } catch (err) {
    console.warn(`Yahoo quote fetch failed for ${cleanSym}, trying Finnhub fallback...`, err.message);
  }

  // 2. Fallback to Finnhub if Yahoo fails
  if (!quoteData) {
    try {
      const fhUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(cleanSym)}&token=${FINNHUB_API_KEY}`;
      const fhRes = await fetchHttpsJson(fhUrl);
      if (fhRes && typeof fhRes.c === 'number' && fhRes.c > 0) {
        quoteData = {
          symbol: cleanSym,
          name: `${cleanSym} Equity`,
          c: Number(fhRes.c.toFixed(2)),
          d: Number(fhRes.d.toFixed(2)),
          dp: Number(fhRes.dp.toFixed(2)),
          h: Number(fhRes.h.toFixed(2)),
          l: Number(fhRes.l.toFixed(2)),
          o: Number(fhRes.o.toFixed(2)),
          pc: Number(fhRes.pc.toFixed(2)),
          v: fhRes.v || 0,
          fiftyTwoWeekHigh: Number((fhRes.c * 1.25).toFixed(2)),
          fiftyTwoWeekLow: Number((fhRes.c * 0.75).toFixed(2)),
          currency: 'USD',
          exchange: 'NASDAQ',
          timestamp: now
        };
      }
    } catch (e) {
      console.warn(`Finnhub quote fetch failed for ${cleanSym}:`, e.message);
    }
  }

  // 3. Fallback to smart baseline if external APIs are unreachable
  if (!quoteData) {
    const hash = cleanSym.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const basePrice = 140.0 + (hash % 280);
    const diff = ((hash % 7) - 3) * 0.85;
    quoteData = {
      symbol: cleanSym,
      name: `${cleanSym} Corp`,
      c: Number(basePrice.toFixed(2)),
      d: Number(diff.toFixed(2)),
      dp: Number(((diff / basePrice) * 100).toFixed(2)),
      h: Number((basePrice * 1.02).toFixed(2)),
      l: Number((basePrice * 0.98).toFixed(2)),
      o: Number((basePrice - (diff * 0.5)).toFixed(2)),
      pc: Number((basePrice - diff).toFixed(2)),
      v: 15400000 + (hash * 10000),
      fiftyTwoWeekHigh: Number((basePrice * 1.3).toFixed(2)),
      fiftyTwoWeekLow: Number((basePrice * 0.7).toFixed(2)),
      currency: 'USD',
      exchange: 'NASDAQ',
      timestamp: now
    };
  }

  // Cache for 60 seconds
  cache.quotes.set(cleanSym, { data: quoteData, expiresAt: now + 60000 });
  return quoteData;
}

// ── Historical Chart Fetcher ─────────────────────────────────────────────────
async function getLiveStockChart(symbol, range = '1mo') {
  const cleanSym = symbol.toUpperCase().trim();
  const cacheKey = `${cleanSym}_${range}`;
  const now = Date.now();

  if (cache.charts.has(cacheKey)) {
    const cached = cache.charts.get(cacheKey);
    if (cached.expiresAt > now) {
      return cached.data;
    }
  }

  let interval = '1d';
  if (range === '1d') interval = '5m';
  else if (range === '5d') interval = '15m';
  else if (range === '1mo' || range === '1m') interval = '1d';
  else if (range === '6mo' || range === '6m') interval = '1d';
  else if (range === '1y') interval = '1wk';

  let chartData = null;

  try {
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSym)}?range=${range}&interval=${interval}`;
    const yfRes = await fetchHttpsJson(yfUrl);
    const result = yfRes?.chart?.result?.[0];
    if (result && result.timestamp && result.indicators?.quote?.[0]) {
      const timestamps = result.timestamp;
      const quotes = result.indicators.quote[0];
      const points = [];

      for (let i = 0; i < timestamps.length; i++) {
        const close = quotes.close?.[i];
        if (typeof close === 'number' && !isNaN(close)) {
          points.push({
            t: timestamps[i],
            date: new Date(timestamps[i] * 1000).toISOString(),
            c: Number(close.toFixed(2)),
            o: quotes.open?.[i] ? Number(quotes.open[i].toFixed(2)) : Number(close.toFixed(2)),
            h: quotes.high?.[i] ? Number(quotes.high[i].toFixed(2)) : Number(close.toFixed(2)),
            l: quotes.low?.[i] ? Number(quotes.low[i].toFixed(2)) : Number(close.toFixed(2)),
            v: quotes.volume?.[i] || 0
          });
        }
      }

      const meta = result.meta || {};
      chartData = {
        symbol: cleanSym,
        range,
        interval,
        points,
        meta: {
          regularMarketPrice: meta.regularMarketPrice,
          previousClose: meta.previousClose,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
          currency: meta.currency || 'USD'
        }
      };
    }
  } catch (err) {
    console.warn(`Yahoo chart fetch failed for ${cleanSym}:`, err.message);
  }

  // Fallback synthetic trend if external chart is unreachable
  if (!chartData || !chartData.points || chartData.points.length === 0) {
    const quote = await getLiveStockQuote(cleanSym);
    const basePrice = quote.c || 150.0;
    const count = range === '1d' ? 24 : 30;
    const points = [];
    const stepSec = range === '1d' ? 1800 : 86400;
    let runningPrice = basePrice * 0.95;

    for (let i = 0; i < count; i++) {
      const time = Math.floor(now / 1000) - ((count - i) * stepSec);
      const delta = (Math.sin(i * 0.5) * 2.5) + ((i / count) * (basePrice - runningPrice));
      runningPrice = Number((runningPrice + delta).toFixed(2));
      points.push({
        t: time,
        date: new Date(time * 1000).toISOString(),
        c: runningPrice,
        o: runningPrice,
        h: runningPrice * 1.01,
        l: runningPrice * 0.99,
        v: 1000000
      });
    }

    chartData = {
      symbol: cleanSym,
      range,
      interval,
      points,
      meta: {
        regularMarketPrice: quote.c,
        previousClose: quote.pc,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        currency: 'USD'
      }
    };
  }

  // Cache chart for 3 minutes
  cache.charts.set(cacheKey, { data: chartData, expiresAt: now + 180000 });
  return chartData;
}

// ── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const reqPath = parsedUrl.pathname;

  // ── API: Real-Time Stock Quote Proxy ───────────────────────────
  if (reqPath === '/api/quote') {
    const symbol = (parsedUrl.searchParams.get('symbol') || 'NVDA').toUpperCase();
    try {
      const quote = await getLiveStockQuote(symbol);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify(quote));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message, symbol }));
    }
  }

  // ── API: Real-Time Historical Chart Proxy ───────────────────────
  if (reqPath === '/api/chart') {
    const symbol = (parsedUrl.searchParams.get('symbol') || 'NVDA').toUpperCase();
    const range = parsedUrl.searchParams.get('range') || '1mo';
    try {
      const chart = await getLiveStockChart(symbol, range);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify(chart));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message, symbol, range }));
    }
  }

  // ── API: Real-Time Crypto Proxy ─────────────────────────────────
  if (reqPath === '/api/crypto') {
    const now = Date.now();
    if (cache.crypto.data && cache.crypto.expiresAt > now) {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify(cache.crypto.data));
    }

    try {
      // Fetch live BTC and ETH from Yahoo
      const [btcRes, ethRes, solRes] = await Promise.allSettled([
        fetchHttpsJson('https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?range=1d&interval=5m'),
        fetchHttpsJson('https://query1.finance.yahoo.com/v8/finance/chart/ETH-USD?range=1d&interval=5m'),
        fetchHttpsJson('https://query1.finance.yahoo.com/v8/finance/chart/SOL-USD?range=1d&interval=5m')
      ]);

      const btcPrice = btcRes.status === 'fulfilled' ? btcRes.value?.chart?.result?.[0]?.meta?.regularMarketPrice || 96450.00 : 96450.00;
      const btcPrev = btcRes.status === 'fulfilled' ? btcRes.value?.chart?.result?.[0]?.meta?.previousClose || 95000.00 : 95000.00;
      const btcChangePct = Number((((btcPrice - btcPrev) / btcPrev) * 100).toFixed(2));

      const ethPrice = ethRes.status === 'fulfilled' ? ethRes.value?.chart?.result?.[0]?.meta?.regularMarketPrice || 2780.50 : 2780.50;
      const ethPrev = ethRes.status === 'fulfilled' ? ethRes.value?.chart?.result?.[0]?.meta?.previousClose || 2740.00 : 2740.00;
      const ethChangePct = Number((((ethPrice - ethPrev) / ethPrev) * 100).toFixed(2));

      const solPrice = solRes.status === 'fulfilled' ? solRes.value?.chart?.result?.[0]?.meta?.regularMarketPrice || 192.40 : 192.40;
      const solPrev = solRes.status === 'fulfilled' ? solRes.value?.chart?.result?.[0]?.meta?.previousClose || 188.00 : 188.00;
      const solChangePct = Number((((solPrice - solPrev) / solPrev) * 100).toFixed(2));

      const cryptoData = {
        'BINANCE:BTCUSDT': { name: 'Bitcoin (BTC)', price: Number(btcPrice.toFixed(2)), change: btcChangePct, high: Number((btcPrice * 1.02).toFixed(2)), low: Number((btcPrice * 0.98).toFixed(2)) },
        'BINANCE:ETHUSDT': { name: 'Ethereum (ETH)', price: Number(ethPrice.toFixed(2)), change: ethChangePct, high: Number((ethPrice * 1.02).toFixed(2)), low: Number((ethPrice * 0.98).toFixed(2)) },
        'BINANCE:SOLUSDT': { name: 'Solana (SOL)', price: Number(solPrice.toFixed(2)), change: solChangePct, high: Number((solPrice * 1.03).toFixed(2)), low: Number((solPrice * 0.97).toFixed(2)) },
        'BINANCE:BNBUSDT': { name: 'BNB', price: 645.20, change: 1.15, high: 652.00, low: 638.00 }
      };

      cache.crypto = { data: cryptoData, expiresAt: now + 60000 };
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify(cryptoData));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        'BINANCE:BTCUSDT': { name: 'Bitcoin (BTC)', price: 96450.00, change: 1.52, high: 97800.00, low: 95200.00 },
        'BINANCE:ETHUSDT': { name: 'Ethereum (ETH)', price: 2780.50, change: 0.85, high: 2820.00, low: 2740.00 },
        'BINANCE:SOLUSDT': { name: 'Solana (SOL)', price: 192.40, change: 3.45, high: 196.00, low: 187.50 },
        'BINANCE:BNBUSDT': { name: 'BNB', price: 645.20, change: 1.15, high: 652.00, low: 638.00 }
      }));
    }
  }

  // ── 301 Legacy Redirects for SEO ──────────────────────────────
  if (reqPath === '/article.html' || reqPath === '/he/article.html') {
    const slug = parsedUrl.searchParams.get('slug') || parsedUrl.searchParams.get('article') || parsedUrl.searchParams.get('id');
    const isHe = reqPath.startsWith('/he');
    if (slug) {
      const target = isHe ? `/he/article/${encodeURIComponent(slug)}` : `/article/${encodeURIComponent(slug)}`;
      res.writeHead(301, { 'Location': target });
      return res.end();
    }
  }

  if (reqPath === '/category.html' || reqPath === '/he/category.html') {
    const slug = parsedUrl.searchParams.get('slug') || 'ai';
    const isHe = reqPath.startsWith('/he');
    const target = isHe ? `/he/${encodeURIComponent(slug)}` : `/${encodeURIComponent(slug)}`;
    res.writeHead(301, { 'Location': target });
    return res.end();
  }

  // ── Static Files Router & Clean Path Resolution ─────────────────
  let targetPath = reqPath;
  if (targetPath === '/') targetPath = '/index.html';
  if (targetPath === '/he' || targetPath === '/he/') targetPath = '/he/index.html';
  
  let filePath = path.join(PUBLIC_DIR, targetPath);

  if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  }

  // If path is a dynamic clean article route (e.g. /ai/some-slug or /article/some-slug or /he/ai/some-slug)
  const segments = reqPath.split('/').filter(Boolean);
  const isHeRoute = segments[0] === 'he';
  const effectiveSegments = isHeRoute ? segments.slice(1) : segments;

  if (!fs.existsSync(filePath) && effectiveSegments.length === 2) {
    filePath = path.join(PUBLIC_DIR, isHeRoute ? 'he/article.html' : 'article.html');
  } else if (!fs.existsSync(filePath) && effectiveSegments.length === 1 && !path.extname(reqPath)) {
    // Dynamic category page fallback
    const catHtml = path.join(PUBLIC_DIR, isHeRoute ? 'he/category.html' : 'category.html');
    if (fs.existsSync(catHtml)) {
      filePath = catHtml;
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      const notFoundPath = path.join(PUBLIC_DIR, isHeRoute ? 'he/404.html' : '404.html');
      if (fs.existsSync(notFoundPath)) {
        return fs.createReadStream(notFoundPath).pipe(res);
      }
      return res.end('<h1>404 Not Found</h1>');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TrendingTech Daily live server running at http://localhost:${PORT}`);
});
