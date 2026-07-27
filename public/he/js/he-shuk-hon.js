// he-shuk-hon.js — Hebrew Stock Market Page JS for TrendingTech Daily
// Vanilla JS, uses global firebase/db/auth set up by he-app.js

(function () {
  'use strict';

  // ── Configuration ─────────────────────────────────────────────────────────────
  var FINNHUB_API_KEY = 'd00dsnpr01qmsivsdiu0d00dsnpr01qmsivsdiug';
  var DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'AMZN'];
  var ISRAELI_SYMBOLS = ['TEVA', 'NICE', 'CHKP', 'ESLT', 'MNDO'];
  var CRYPTO_SYMBOLS  = ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:BNBUSDT', 'BINANCE:SOLUSDT'];
  var CRYPTO_LABELS   = { 'BINANCE:BTCUSDT': 'Bitcoin (BTC)', 'BINANCE:ETHUSDT': 'Ethereum (ETH)', 'BINANCE:BNBUSDT': 'BNB', 'BINANCE:SOLUSDT': 'Solana (SOL)' };
  var LS_WATCHLIST_KEY = 'heStockWatchlist';

  var DISCLAIMER_HE = 'התכנים מובאים לצורכי לימוד והעשרה בלבד, ואינם מהווים ייעוץ השקעות, שיווק השקעות, או תחליף לייעוץ פיניינסי/מס מקצועי המתחשב בנתונים ובצרכים המיוחדים של כל אדם. אין באמור כדי להוות התחייבות להשגת תשואה. כל הפועל בהסתמך על המידע עושה זאת על דעת עצמו ועל אחריותו בלבד.';

  // ── State ─────────────────────────────────────────────────────────────────────
  var stockLogos       = {};   // symbol -> logo URL from JSON
  var heWatchlist      = [];
  var heStockChart     = null;
  var heStockModal     = null;
  var heCurrentSymbol  = null; // symbol currently open in modal
  var searchSuggestions = [];
  var searchTimeout    = null;
  // YouTube carousel state
  var heVideoList  = [];
  var heVideoIndex = 0;
  var heVideoTimer = null;

  // ── Utilities ─────────────────────────────────────────────────────────────────

  function formatNumber(n) {
    if (n === null || n === undefined || isNaN(n)) return '--';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'מ"מ';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'מ\'';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'א\'';
    return Number(n).toLocaleString('he-IL');
  }

  function formatVolume(n) {
    if (n === null || n === undefined || isNaN(n)) return '--';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return Number(n).toLocaleString();
  }

  function heFormatDateLocal(timestamp) {
    if (!timestamp) return '';
    var d;
    if (timestamp && timestamp.toDate) {
      d = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      d = timestamp;
    } else {
      d = new Date(timestamp);
    }
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function getDb() {
    if (typeof window.heDb !== 'undefined') return window.heDb;
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      return firebase.firestore();
    }
    return null;
  }

  // ── Load Logo Data ────────────────────────────────────────────────────────────

  function loadStockLogos() {
    return fetch('/json/stock-data.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (Array.isArray(data)) {
          data.forEach(function (item) {
            // JSON file uses "logoUrl" field
            var url = item.logoUrl || item.logo || '';
            if (item.symbol && url) {
              stockLogos[item.symbol.toUpperCase()] = url;
            }
          });
        } else if (data && typeof data === 'object') {
          Object.keys(data).forEach(function (sym) {
            var url = (data[sym] && (data[sym].logoUrl || data[sym].logo)) || '';
            if (url) stockLogos[sym.toUpperCase()] = url;
          });
        }
      })
      .catch(function () {});
  }

  // ── Finnhub API ───────────────────────────────────────────────────────────────

  function finnhubQuote(symbol) {
    var url = 'https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(symbol) + '&token=' + FINNHUB_API_KEY;
    return fetch(url).then(function (r) { return r.json(); });
  }

  function finnhubCandles(symbol, from, to) {
    var url = 'https://finnhub.io/api/v1/stock/candle?symbol=' + encodeURIComponent(symbol) +
              '&resolution=D&from=' + from + '&to=' + to + '&token=' + FINNHUB_API_KEY;
    return fetch(url).then(function (r) { return r.json(); });
  }

  function finnhubProfile(symbol) {
    var url = 'https://finnhub.io/api/v1/stock/profile2?symbol=' + encodeURIComponent(symbol) + '&token=' + FINNHUB_API_KEY;
    return fetch(url).then(function (r) { return r.json(); });
  }

  function finnhubSearch(query) {
    var url = 'https://finnhub.io/api/v1/search?q=' + encodeURIComponent(query) + '&token=' + FINNHUB_API_KEY;
    return fetch(url).then(function (r) { return r.json(); });
  }

  // ── Watchlist ─────────────────────────────────────────────────────────────────

  function loadHeWatchlistFromStorage() {
    try {
      var raw = localStorage.getItem(LS_WATCHLIST_KEY);
      heWatchlist = raw ? JSON.parse(raw) : [];
    } catch (e) {
      heWatchlist = [];
    }
    if (!Array.isArray(heWatchlist)) heWatchlist = [];
  }

  function saveHeWatchlist() {
    try {
      localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(heWatchlist));
    } catch (e) {}
  }

  function isInWatchlist(symbol) {
    return heWatchlist.indexOf(symbol.toUpperCase()) !== -1;
  }

  function toggleHeWatchlist(symbol) {
    symbol = symbol.toUpperCase();
    var idx = heWatchlist.indexOf(symbol);
    if (idx === -1) {
      heWatchlist.push(symbol);
    } else {
      heWatchlist.splice(idx, 1);
    }
    saveHeWatchlist();
    syncWatchlistToFirestore();
    updateHeWatchlistDisplay();
    updateWatchlistToggleBtn(symbol);
  }

  function syncWatchlistToFirestore() {
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) return;
      var user = firebase.auth().currentUser;
      if (!user) return;
      var db = getDb();
      if (!db) return;
      db.collection('users').doc(user.uid).set(
        { heStockWatchlist: heWatchlist },
        { merge: true }
      ).catch(function () {});
    } catch (e) {}
  }

  function loadWatchlistFromFirestore(cb) {
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) { cb(false); return; }
      firebase.auth().onAuthStateChanged(function (user) {
        if (!user) { cb(false); return; }
        var db = getDb();
        if (!db) { cb(false); return; }
        db.collection('users').doc(user.uid).get()
          .then(function (doc) {
            if (doc.exists) {
              var data = doc.data();
              if (Array.isArray(data.heStockWatchlist) && data.heStockWatchlist.length > 0) {
                heWatchlist = data.heStockWatchlist;
                saveHeWatchlist();
              }
            }
            cb(true);
          })
          .catch(function () { cb(false); });
      });
    } catch (e) { cb(false); }
  }

  function updateWatchlistToggleBtn(symbol) {
    var btn = document.getElementById('he-watchlist-toggle-btn');
    if (!btn) return;
    var inList = isInWatchlist(symbol);
    btn.innerHTML = inList
      ? '<i class="bi bi-star-fill me-1"></i><span>הסר מרשימת המעקב</span>'
      : '<i class="bi bi-star me-1"></i><span>הוסף לרשימת המעקב</span>';
    btn.className = inList ? 'btn btn-warning' : 'btn btn-outline-warning';
  }

  function updateHeWatchlistDisplay() {
    var container = document.getElementById('watchlist-stocks-he');
    if (!container) return;
    if (heWatchlist.length === 0) {
      container.innerHTML =
        '<div class="watchlist-empty">' +
          '<i class="bi bi-star fs-2 d-block mb-2 text-muted"></i>' +
          '<p>רשימת המעקב שלך ריקה.</p>' +
        '</div>';
      return;
    }
    fetchHeWatchlistData();
  }

  function fetchHeWatchlistData() {
    var container = document.getElementById('watchlist-stocks-he');
    if (!container || heWatchlist.length === 0) return;
    container.innerHTML =
      '<div class="he-loader">' +
        '<div class="spinner-border spinner-border-sm text-primary" role="status"></div>' +
        '<p class="mt-2 mb-0 small">טוען נתוני מעקב...</p>' +
      '</div>';
    fetchHeStockData(heWatchlist.slice(), 'watchlist-stocks-he', true);
  }

  function initHeWatchlist() {
    loadHeWatchlistFromStorage();
    updateHeWatchlistDisplay();
    // Try to override with Firestore data for logged-in users
    loadWatchlistFromFirestore(function (loaded) {
      if (loaded) updateHeWatchlistDisplay();
    });
  }

  // ── Stock Cards ───────────────────────────────────────────────────────────────

  function createHeStockCard(symbol, quote, inWatchlist) {
    symbol = symbol.toUpperCase();
    var price   = quote && quote.c != null ? parseFloat(quote.c).toFixed(2) : '--';
    var change  = quote && quote.d != null ? parseFloat(quote.d).toFixed(2) : null;
    var changePct = quote && quote.dp != null ? parseFloat(quote.dp).toFixed(2) : null;
    var isPos   = change !== null && parseFloat(change) >= 0;
    var changeClass = change === null ? '' : (isPos ? 'positive' : 'negative');
    var changeIcon  = change === null ? '' : (isPos ? '▲' : '▼');
    var changeStr   = change !== null ? changeIcon + ' ' + (isPos ? '+' : '') + change + ' (' + (isPos ? '+' : '') + changePct + '%)' : '--';
    var logo = stockLogos[symbol] || '';
    var logoHtml = logo
      ? '<img src="' + logo + '" alt="' + symbol + '" class="stock-logo mb-2" onerror="this.style.display=\'none\'">'
      : '<div class="mb-2" style="width:32px;height:32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.55rem;font-weight:700;color:#fff;">' + symbol.substring(0, 4) + '</div>';

    var card = document.createElement('div');
    card.className = 'col-6 col-md-4';
    card.innerHTML =
      '<div class="he-stock-card" data-symbol="' + symbol + '" tabindex="0" role="button" aria-label="פתח פרטי ' + symbol + '">' +
        '<div class="d-flex align-items-start justify-content-between mb-1">' +
          logoHtml +
          '<button class="btn btn-sm p-0 border-0 watchlist-star-btn" data-symbol="' + symbol + '" aria-label="' + (inWatchlist ? 'הסר ממעקב' : 'הוסף למעקב') + '">' +
            '<i class="bi ' + (inWatchlist ? 'bi-star-fill text-warning' : 'bi-star text-muted') + '"></i>' +
          '</button>' +
        '</div>' +
        '<div class="stock-symbol">' + symbol + '</div>' +
        '<div class="stock-price">$' + price + '</div>' +
        '<div class="stock-change ' + changeClass + '">' + changeStr + '</div>' +
      '</div>';

    // Watchlist star button
    var starBtn = card.querySelector('.watchlist-star-btn');
    if (starBtn) {
      starBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleHeWatchlist(symbol);
        var icon = starBtn.querySelector('i');
        if (icon) {
          var nowIn = isInWatchlist(symbol);
          icon.className = nowIn ? 'bi bi-star-fill text-warning' : 'bi bi-star text-muted';
          starBtn.setAttribute('aria-label', nowIn ? 'הסר ממעקב' : 'הוסף למעקב');
        }
      });
    }

    // Card click -> open modal
    var cardEl = card.querySelector('.he-stock-card');
    if (cardEl) {
      cardEl.addEventListener('click', function () { openHeStockDetail(symbol); });
      cardEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHeStockDetail(symbol); }
      });
    }

    return card;
  }

  // ── Fetch & Render Stocks ─────────────────────────────────────────────────────

  function fetchHeStockData(symbols, containerId, isWatchlist) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var loaderId = containerId === 'market-data-he' ? 'market-loader-he'
                  : containerId === 'tase-data' ? 'tase-loader'
                  : null;
    var errorId  = containerId === 'market-data-he' ? 'market-error-he'
                  : containerId === 'tase-data' ? 'tase-error'
                  : null;

    if (loaderId) {
      var loader = document.getElementById(loaderId);
      if (loader) loader.style.display = 'block';
    }
    if (errorId) {
      var errEl = document.getElementById(errorId);
      if (errEl) errEl.classList.add('d-none');
    }

    var promises = symbols.map(function (sym) {
      return finnhubQuote(sym)
        .then(function (data) { return { symbol: sym, quote: data }; })
        .catch(function () { return { symbol: sym, quote: null }; });
    });

    Promise.all(promises).then(function (results) {
      if (loaderId) {
        var l = document.getElementById(loaderId);
        if (l) l.style.display = 'none';
      }

      var anyError = results.every(function (r) { return !r.quote || r.quote.c === 0; });
      if (anyError && errorId) {
        var e = document.getElementById(errorId);
        if (e) { e.textContent = 'שגיאה בטעינת הנתונים. אנא נסה שוב מאוחר יותר.'; e.classList.remove('d-none'); }
      }

      if (isWatchlist) {
        container.innerHTML = '';
        var row = document.createElement('div');
        row.className = 'row g-3';
        results.forEach(function (r) {
          row.appendChild(createHeStockCard(r.symbol, r.quote, true));
        });
        container.appendChild(row);
      } else {
        container.innerHTML = '';
        results.forEach(function (r) {
          container.appendChild(createHeStockCard(r.symbol, r.quote, isInWatchlist(r.symbol)));
        });
      }
    }).catch(function () {
      if (loaderId) { var l = document.getElementById(loaderId); if (l) l.style.display = 'none'; }
      if (errorId) {
        var e = document.getElementById(errorId);
        if (e) { e.textContent = 'שגיאה בטעינת הנתונים.'; e.classList.remove('d-none'); }
      }
    });
  }

  // ── Stock Detail Modal ────────────────────────────────────────────────────────

  function openHeStockDetail(symbol) {
    symbol = symbol.toUpperCase();
    var modalEl = document.getElementById('heStockDetailModal');
    if (!modalEl) return;

    if (!heStockModal) {
      heStockModal = new bootstrap.Modal(modalEl);
    }

    // Reset
    document.getElementById('he-detail-symbol').textContent = symbol;
    document.getElementById('he-detail-name').textContent = '...';
    document.getElementById('he-detail-price').textContent = '--';
    document.getElementById('he-detail-change').textContent = '--';
    document.getElementById('he-detail-open').textContent = '--';
    document.getElementById('he-detail-high').textContent = '--';
    document.getElementById('he-detail-low').textContent = '--';
    document.getElementById('he-detail-volume').textContent = '--';
    var logoImg = document.getElementById('he-detail-logo');
    if (logoImg) logoImg.style.display = 'none';
    var descDiv = document.getElementById('he-company-description');
    if (descDiv) descDiv.style.display = 'none';
    var errDiv = document.getElementById('he-detail-error');
    if (errDiv) errDiv.style.display = 'none';
    var loadingDiv = document.getElementById('he-detail-loading');
    if (loadingDiv) loadingDiv.style.display = 'block';

    updateWatchlistToggleBtn(symbol);

    // Setup watchlist toggle button
    var wBtn = document.getElementById('he-watchlist-toggle-btn');
    if (wBtn) {
      wBtn.onclick = function () { toggleHeWatchlist(symbol); };
    }

    heCurrentSymbol = symbol;
    heStockModal.show();

    // Fetch quote + profile in parallel
    Promise.all([
      finnhubQuote(symbol),
      finnhubProfile(symbol)
    ]).then(function (results) {
      if (loadingDiv) loadingDiv.style.display = 'none';
      updateHeDetailView(symbol, results[0], results[1]);
      // Chart is rendered in shown.bs.modal handler once canvas has real dimensions
    }).catch(function () {
      if (loadingDiv) loadingDiv.style.display = 'none';
      if (errDiv) { errDiv.textContent = 'שגיאה בטעינת נתוני המניה.'; errDiv.style.display = 'block'; }
    });
  }

  function updateHeDetailView(symbol, quote, profile) {
    if (quote) {
      var price = quote.c != null ? parseFloat(quote.c).toFixed(2) : '--';
      var change = quote.d != null ? parseFloat(quote.d).toFixed(2) : null;
      var changePct = quote.dp != null ? parseFloat(quote.dp).toFixed(2) : null;
      var isPos = change !== null && parseFloat(change) >= 0;

      document.getElementById('he-detail-price').textContent = price;
      var changeEl = document.getElementById('he-detail-change');
      if (changeEl) {
        changeEl.textContent = change !== null
          ? (isPos ? '+' : '') + change + ' (' + (isPos ? '+' : '') + changePct + '%)'
          : '--';
        changeEl.style.color = change !== null ? (isPos ? '#16a34a' : '#dc2626') : '';
      }
      document.getElementById('he-detail-open').textContent   = quote.o != null ? '$' + parseFloat(quote.o).toFixed(2) : '--';
      document.getElementById('he-detail-high').textContent   = quote.h != null ? '$' + parseFloat(quote.h).toFixed(2) : '--';
      document.getElementById('he-detail-low').textContent    = quote.l != null ? '$' + parseFloat(quote.l).toFixed(2) : '--';
      document.getElementById('he-detail-volume').textContent = formatVolume(quote.v);
    }

    if (profile) {
      if (profile.name) document.getElementById('he-detail-name').textContent = profile.name;
      var logoImg = document.getElementById('he-detail-logo');
      if (logoImg && profile.logo) {
        logoImg.src = profile.logo;
        logoImg.style.display = 'inline-block';
        logoImg.onerror = function () { logoImg.style.display = 'none'; };
      } else if (stockLogos[symbol] && logoImg) {
        logoImg.src = stockLogos[symbol];
        logoImg.style.display = 'inline-block';
        logoImg.onerror = function () { logoImg.style.display = 'none'; };
      }
      if (profile.description) {
        var descDiv = document.getElementById('he-company-description');
        var descText = document.getElementById('he-company-desc-text');
        if (descDiv && descText) {
          descText.textContent = profile.description;
          descDiv.style.display = 'block';
        }
      }
    }
  }

  // ── Stock Chart ───────────────────────────────────────────────────────────────

  function updateHeStockChart(symbol) {
    var canvas = document.getElementById('heStockChart');
    if (!canvas) return;

    var now   = Math.floor(Date.now() / 1000);
    var month = now - 30 * 24 * 60 * 60;

    finnhubCandles(symbol, month, now).then(function (data) {
      if (!data || data.s !== 'ok' || !data.c || data.c.length === 0) return;

      var labels = data.t.map(function (ts) {
        return new Date(ts * 1000).toLocaleDateString('he-IL', { month: 'short', day: 'numeric' });
      });
      var prices = data.c;

      if (heStockChart) {
        heStockChart.destroy();
        heStockChart = null;
      }

      var ctx = canvas.getContext('2d');
      var isPositive = prices[prices.length - 1] >= prices[0];
      var color = isPositive ? '#16a34a' : '#dc2626';
      var bgColor = isPositive ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)';

      heStockChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: symbol,
            data: prices,
            borderColor: color,
            backgroundColor: bgColor,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (ctx) { return '$' + ctx.parsed.y.toFixed(2); }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxTicksLimit: 6, font: { family: 'Heebo', size: 11 } }
            },
            y: {
              grid: { color: 'rgba(0,0,0,0.05)' },
              ticks: {
                callback: function (v) { return '$' + v.toFixed(0); },
                font: { family: 'Heebo', size: 11 }
              }
            }
          }
        }
      });
    }).catch(function () {});
  }

  // ── Crypto ────────────────────────────────────────────────────────────────────

  function loadHeCryptoData() {
    var loader    = document.getElementById('crypto-loader-he');
    var errEl     = document.getElementById('crypto-error-he');
    var container = document.getElementById('crypto-data-he');
    if (!container) return;
    if (loader) loader.style.display = 'block';

    var promises = CRYPTO_SYMBOLS.map(function (sym) {
      return finnhubQuote(sym)
        .then(function (data) { return { symbol: sym, quote: data }; })
        .catch(function () { return { symbol: sym, quote: null }; });
    });

    Promise.all(promises).then(function (results) {
      if (loader) loader.style.display = 'none';
      container.innerHTML = '';

      results.forEach(function (r) {
        var label   = CRYPTO_LABELS[r.symbol] || r.symbol;
        var quote   = r.quote;
        var price   = quote && quote.c != null ? parseFloat(quote.c).toFixed(2) : '--';
        var change  = quote && quote.d != null ? parseFloat(quote.d).toFixed(2) : null;
        var changePct = quote && quote.dp != null ? parseFloat(quote.dp).toFixed(2) : null;
        var isPos   = change !== null && parseFloat(change) >= 0;
        var changeClass = change === null ? '' : (isPos ? 'positive' : 'negative');
        var changeStr = change !== null
          ? (isPos ? '▲ +' : '▼ ') + change + ' (' + (isPos ? '+' : '') + changePct + '%)'
          : '--';

        var col = document.createElement('div');
        col.className = 'col-6 col-md-3';
        col.innerHTML =
          '<div class="he-stock-card text-center" style="cursor:default;">' +
            '<div class="fw-bold mb-1" style="font-size:1.1rem;">₿</div>' +
            '<div class="stock-symbol" style="font-size:0.85rem;">' + label + '</div>' +
            '<div class="stock-price">$' + price + '</div>' +
            '<div class="stock-change ' + changeClass + '">' + changeStr + '</div>' +
          '</div>';
        container.appendChild(col);
      });
    }).catch(function () {
      if (loader) loader.style.display = 'none';
      if (errEl) { errEl.textContent = 'שגיאה בטעינת מחירי קריפטו.'; errEl.classList.remove('d-none'); }
    });
  }

  // ── Stock News from Firestore ─────────────────────────────────────────────────

  function loadHeStockNews() {
    var loader    = document.getElementById('stock-news-loader-he');
    var errEl     = document.getElementById('stock-news-error-he');
    var container = document.getElementById('stock-news-articles-he');
    if (!container) return;

    var db = null;
    var attempts = 0;

    function tryLoad() {
      db = getDb();
      if (!db && attempts < 30) {
        attempts++;
        setTimeout(tryLoad, 200);
        return;
      }
      if (!db) {
        if (loader) loader.style.display = 'none';
        if (errEl) { errEl.textContent = 'לא ניתן להתחבר לבסיס הנתונים.'; errEl.classList.remove('d-none'); }
        return;
      }

      // Load sections map first
      db.collection('he_sections').get()
        .then(function (sectSnap) {
          var sectMap = {};
          sectSnap.forEach(function (doc) {
            sectMap[doc.id] = doc.data().slug || '';
          });

          // Try to find articles with שוק-ההון category
          return db.collection('he_articles')
            .where('published', '==', true)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get()
            .then(function (snap) {
              if (loader) loader.style.display = 'none';
              var articles = [];
              snap.forEach(function (doc) {
                var d = doc.data();
                var catSlug = sectMap[d.category] || '';
                // Include articles from stock-related categories
                if (catSlug === 'shuk-hon' || catSlug === 'שוק-ההון' ||
                    (d.tags && Array.isArray(d.tags) && (d.tags.indexOf('שוק-ההון') !== -1 || d.tags.indexOf('שוק ההון') !== -1 || d.tags.indexOf('מניות') !== -1))) {
                  articles.push({ id: doc.id, data: d, catSlug: catSlug });
                }
              });

              // If none match specifically, show latest 6 articles
              if (articles.length === 0) {
                snap.forEach(function (doc) {
                  if (articles.length < 6) {
                    var d = doc.data();
                    var catSlug = sectMap[d.category] || '';
                    articles.push({ id: doc.id, data: d, catSlug: catSlug });
                  }
                });
              }

              articles = articles.slice(0, 6);

              if (articles.length === 0) {
                container.innerHTML =
                  '<div class="col-12"><p class="text-muted text-center py-3">אין כתבות עדיין בקטגוריה זו.</p></div>';
                return;
              }

              container.innerHTML = '';
              articles.forEach(function (art) {
                var d = art.data;
                var artSlug = d.slug || '';
                var url = art.catSlug && artSlug ? '/he/' + art.catSlug + '/' + artSlug : '#';
                var dateStr = heFormatDateLocal(d.createdAt);
                var excerpt = (d.excerpt || '').substring(0, 120);
                if (excerpt && excerpt.length === 120) excerpt += '...';

                var col = document.createElement('div');
                col.className = 'col-md-6';
                col.innerHTML =
                  '<div class="he-news-card">' +
                    '<h6>' +
                      (url !== '#'
                        ? '<a href="' + url + '" style="color:inherit;text-decoration:none;">' + (d.title || 'כתבה') + '</a>'
                        : (d.title || 'כתבה')) +
                    '</h6>' +
                    (excerpt ? '<p class="excerpt">' + excerpt + '</p>' : '') +
                    '<div class="meta">' +
                      (dateStr ? '<i class="bi bi-calendar3 me-1"></i>' + dateStr : '') +
                    '</div>' +
                    '<div class="disclaimer-inline">' +
                      '<i class="bi bi-info-circle me-1"></i>' + DISCLAIMER_HE +
                    '</div>' +
                  '</div>';
                container.appendChild(col);
              });
            });
        })
        .catch(function () {
          if (loader) loader.style.display = 'none';
          if (errEl) { errEl.textContent = 'שגיאה בטעינת חדשות שוק ההון.'; errEl.classList.remove('d-none'); }
        });
    }

    tryLoad();
  }

  // ── Tel Aviv Stock Exchange (TASE) ────────────────────────────────────────────

  function loadHeTaseStocks() {
    var container = document.getElementById('tase-data');
    if (!container) return;
    fetchHeStockData(ISRAELI_SYMBOLS, 'tase-data', false);
  }

  // ── Sidebar Stock Articles ────────────────────────────────────────────────────

  function loadHeStockArticles() {
    var container = document.getElementById('he-stock-articles-sidebar');
    if (!container) return;

    var db = null;
    var attempts = 0;

    function tryLoad() {
      db = getDb();
      if (!db && attempts < 30) {
        attempts++;
        setTimeout(tryLoad, 200);
        return;
      }
      if (!db) { container.innerHTML = '<p class="text-muted small text-center">לא ניתן לטעון כתבות.</p>'; return; }

      db.collection('he_sections').get()
        .then(function (sectSnap) {
          var sectMap = {};
          sectSnap.forEach(function (doc) { sectMap[doc.id] = doc.data().slug || ''; });
          return db.collection('he_articles')
            .where('published', '==', true)
            .orderBy('createdAt', 'desc')
            .limit(8)
            .get()
            .then(function (snap) {
              container.innerHTML = '';
              if (snap.empty) {
                container.innerHTML = '<p class="text-muted small">אין כתבות זמינות.</p>';
                return;
              }
              snap.forEach(function (doc) {
                var d = doc.data();
                var catSlug = sectMap[d.category] || '';
                var artSlug = d.slug || '';
                var url = catSlug && artSlug ? '/he/' + catSlug + '/' + artSlug : '#';
                var dateStr = heFormatDateLocal(d.createdAt);
                var item = document.createElement('div');
                item.className = 'sidebar-article-item';
                item.innerHTML =
                  '<a href="' + url + '">' + (d.title || 'כתבה') + '</a>' +
                  (dateStr ? '<div class="text-muted mt-1" style="font-size:0.7rem;">' + dateStr + '</div>' : '');
                container.appendChild(item);
              });
            });
        })
        .catch(function () { container.innerHTML = '<p class="text-muted small">שגיאה בטעינת כתבות.</p>'; });
    }

    tryLoad();
  }

  // ── Search ────────────────────────────────────────────────────────────────────

  function setupHeSearch() {
    var input   = document.getElementById('stock-search-he');
    var btn     = document.getElementById('search-btn-he');
    var dropdown = document.getElementById('search-suggestions-he');
    if (!input) return;

    // Input with debounce
    input.addEventListener('input', function () {
      clearTimeout(searchTimeout);
      var q = input.value.trim();
      if (q.length < 1) {
        if (dropdown) dropdown.style.display = 'none';
        return;
      }
      searchTimeout = setTimeout(function () {
        showHeSearchSuggestions(q, dropdown);
      }, 300);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var q = input.value.trim().toUpperCase();
        if (q) { window.heSearchStock(q); }
      }
    });

    input.addEventListener('blur', function () {
      setTimeout(function () { if (dropdown) dropdown.style.display = 'none'; }, 200);
    });

    if (btn) {
      btn.addEventListener('click', function () {
        var q = input.value.trim().toUpperCase();
        if (q) { window.heSearchStock(q); }
      });
    }

    // Quick-select buttons (data-symbol)
    document.querySelectorAll('[data-symbol]').forEach(function (el) {
      if (el.tagName === 'BUTTON') {
        el.addEventListener('click', function () {
          var sym = el.getAttribute('data-symbol');
          if (sym) { window.heSearchStock(sym); }
        });
      }
    });
  }

  function showHeSearchSuggestions(query, dropdown) {
    if (!dropdown) return;

    // First check local known symbols
    var known = DEFAULT_SYMBOLS.concat(ISRAELI_SYMBOLS);
    var localMatches = known.filter(function (s) {
      return s.toUpperCase().indexOf(query.toUpperCase()) !== -1;
    });

    if (localMatches.length > 0) {
      renderSuggestions(localMatches.map(function (s) { return { symbol: s, description: stockLogos[s] ? s : s }; }), dropdown, query);
    }

    // Also search Finnhub
    finnhubSearch(query).then(function (data) {
      if (data && data.result && data.result.length > 0) {
        var results = data.result.slice(0, 8).map(function (r) {
          return { symbol: r.symbol, description: r.description || '' };
        });
        renderSuggestions(results, dropdown, query);
      }
    }).catch(function () {});
  }

  function renderSuggestions(items, dropdown, query) {
    if (!dropdown) return;
    dropdown.innerHTML = '';
    if (items.length === 0) {
      dropdown.innerHTML = '<div style="padding:12px;text-align:center;color:#666;font-size:0.85rem;">לא נמצאו תוצאות</div>';
      dropdown.style.display = 'block';
      return;
    }
    items.forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'he-suggestion-item';
      var logo = stockLogos[item.symbol] || '';
      var logoHtml = logo
        ? '<img src="' + logo + '" alt="" class="he-suggestion-logo" onerror="this.style.display=\'none\'">'
        : '<div class="he-suggestion-logo-placeholder">' + item.symbol.substring(0, 3) + '</div>';
      div.innerHTML =
        logoHtml +
        '<div class="he-suggestion-text">' +
          '<strong>' + item.symbol + '</strong>' +
          (item.description ? '<div class="suggestion-name" style="font-size:0.78rem;color:#666;">' + item.description + '</div>' : '') +
        '</div>';
      div.addEventListener('mousedown', function () {
        window.heSearchStock(item.symbol);
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(div);
    });
    dropdown.style.display = 'block';
  }

  // ── Global search function for sidebar buttons ────────────────────────────────
  window.heSearchStock = function (symbol) {
    if (!symbol) return;
    symbol = symbol.toUpperCase();
    var input = document.getElementById('stock-search-he');
    if (input) input.value = symbol;
    var dropdown = document.getElementById('search-suggestions-he');
    if (dropdown) dropdown.style.display = 'none';
    openHeStockDetail(symbol);
  };

  // ── Recommended Books ─────────────────────────────────────────────────────────

  var HE_BOOKS = [
    {
      title: 'המשקיע הנבון',
      author: 'בנג\'מין גראהם',
      desc: 'הספר הקלאסי ביותר על השקעות ערך — מורו של וורן באפט. מלמד כיצד לנתח מניות, לחשוב לטווח ארוך ולהישאר רגוע בתנודות שוק.',
      query: 'The Intelligent Investor Benjamin Graham',
      buyUrl: 'https://www.steimatzky.co.il/catalogsearch/result/?q=המשקיע+הנבון',
      badge: 'קלאסיק',
      badgeColor: 'bg-primary'
    },
    {
      title: 'הלך אקראי בוול סטריט',
      author: 'ברטון מלקיאל',
      desc: 'מדוע כמעט אף מנהל קרן לא מצליח לנצח את המדד לאורך זמן? מסביר בבהירות מדוע קרנות אינדקס עדיפות לרוב המשקיעים.',
      query: 'A Random Walk Down Wall Street Malkiel',
      buyUrl: 'https://www.steimatzky.co.il/catalogsearch/result/?q=הלך+אקראי+בוול+סטריט',
      badge: 'השקעה פסיבית',
      badgeColor: 'bg-success'
    },
    {
      title: 'אבא עשיר אבא עני',
      author: 'רוברט קיוסאקי',
      desc: 'הספר הפיננסי הנמכר ביותר בעולם. שינה את חשיבתם של מיליונים על כסף, נכסים, התחייבויות ועצמאות פיננסית.',
      query: 'Rich Dad Poor Dad Kiyosaki',
      buyUrl: 'https://www.steimatzky.co.il/catalogsearch/result/?q=אבא+עשיר+אבא+עני',
      badge: 'רב מכר עולמי',
      badgeColor: 'bg-danger'
    },
    {
      title: 'לחשוב מהר, לחשוב לאט',
      author: 'דניאל קהנמן',
      desc: 'זוכה פרס נובל לכלכלה. מסביר את ההטיות הקוגניטיביות שגורמות לנו לטעויות פיננסיות — ידע חיוני לכל משקיע.',
      query: 'Thinking Fast and Slow Kahneman',
      buyUrl: 'https://www.steimatzky.co.il/catalogsearch/result/?q=לחשוב+מהר+לחשוב+לאט',
      badge: 'פסיכולוגיית כסף',
      badgeColor: 'bg-warning text-dark'
    },
    {
      title: 'פסיכולוגיה של כסף',
      author: 'מורגן האוסל',
      desc: 'כיצד אנשים חושבים, מתנהגים ומרגישים לגבי כסף. האוסל מראה שהגישה הנפשית להשקעות חשובה לא פחות מהידע הטכני.',
      query: 'The Psychology of Money Morgan Housel',
      buyUrl: 'https://www.steimatzky.co.il/catalogsearch/result/?q=פסיכולוגיה+של+כסף',
      badge: 'חדש ומומלץ',
      badgeColor: 'bg-info text-dark'
    },
    {
      title: 'מניות לטווח ארוך',
      author: 'ג\'רמי סיגל',
      desc: 'מחקר מקיף המוכיח כי מניות הן ההשקעה הטובה ביותר לטווח ארוך. בסיס אקדמי חשוב לכל מי שמשקיע בשוק ההון.',
      query: 'Stocks for the Long Run Jeremy Siegel',
      buyUrl: 'https://www.steimatzky.co.il/catalogsearch/result/?q=מניות+לטווח+ארוך+סיגל',
      badge: 'אקדמי',
      badgeColor: 'bg-secondary'
    }
  ];

  var BOOK_COVER_COLORS = [
    'linear-gradient(135deg,#1A1A2E,#16213e)',
    'linear-gradient(135deg,#1a2e0a,#2d5a16)',
    'linear-gradient(135deg,#2e0a0a,#6b1f1f)',
    'linear-gradient(135deg,#0a1628,#1e3a5f)',
    'linear-gradient(135deg,#2e1a0a,#6b4c1f)',
    'linear-gradient(135deg,#1a0a2e,#3b1f6e)'
  ];

  function fetchGoogleBookCover(query) {
    var url = 'https://www.googleapis.com/books/v1/volumes?q=' +
              encodeURIComponent(query) + '&maxResults=1&fields=items(volumeInfo/imageLinks)';
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var links = data && data.items && data.items[0] && data.items[0].volumeInfo && data.items[0].volumeInfo.imageLinks;
        if (!links) return null;
        var raw = links.extraLarge || links.large || links.medium || links.thumbnail || null;
        // Force HTTPS and larger zoom
        if (raw) raw = raw.replace('http://', 'https://').replace('zoom=1', 'zoom=2');
        return raw || null;
      })
      .catch(function () { return null; });
  }

  function loadHeRecommendedBooks() {
    var container = document.getElementById('he-books-grid');
    if (!container) return;

    // Render skeleton cards first
    container.innerHTML = '';
    HE_BOOKS.forEach(function (book, idx) {
      var col = document.createElement('div');
      col.className = 'col-6 col-md-4';
      col.id = 'he-book-col-' + idx;
      col.innerHTML =
        '<div class="he-book-card">' +
          '<div class="he-book-cover-wrap">' +
            '<div class="he-book-cover-placeholder" style="background:' + BOOK_COVER_COLORS[idx % BOOK_COVER_COLORS.length] + '" id="he-book-ph-' + idx + '">' +
              '<i class="bi bi-book fs-2 mb-1"></i><br>' + book.title +
            '</div>' +
          '</div>' +
          '<div class="book-body">' +
            '<span class="badge ' + book.badgeColor + ' book-badge">' + book.badge + '</span>' +
            '<div class="book-title">' + book.title + '</div>' +
            '<div class="book-author">' + book.author + '</div>' +
            '<div class="book-desc">' + book.desc + '</div>' +
            '<a href="' + book.buyUrl + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-primary w-100 mt-auto">' +
              '<i class="bi bi-cart me-1"></i>להזמנה בסטימצקי' +
            '</a>' +
          '</div>' +
        '</div>';
      container.appendChild(col);
    });

    // Asynchronously load real covers
    HE_BOOKS.forEach(function (book, idx) {
      fetchGoogleBookCover(book.query).then(function (coverUrl) {
        if (!coverUrl) return;
        var coverWrap = document.querySelector('#he-book-col-' + idx + ' .he-book-cover-wrap');
        if (!coverWrap) return;
        var img = document.createElement('img');
        img.src = coverUrl;
        img.alt = book.title;
        img.onload = function () {
          // Replace placeholder with real cover
          coverWrap.innerHTML = '';
          coverWrap.appendChild(img);
        };
        img.onerror = function () { /* keep placeholder */ };
      });
    });
  }

  // ── YouTube Videos ────────────────────────────────────────────────────────────

  function getFirebaseFunctions() {
    if (typeof firebase !== 'undefined' && firebase.app && firebase.functions) {
      try { return firebase.app().functions('us-central1'); } catch (e) {}
    }
    return null;
  }

  function renderHeVideoCarousel() {
    var container = document.getElementById('videos-grid');
    if (!container || heVideoList.length === 0) return;

    var perPage = window.innerWidth < 768 ? 1 : 2;
    var total   = heVideoList.length;
    var end     = Math.min(heVideoIndex + perPage, total);
    var visible = heVideoList.slice(heVideoIndex, end);

    container.innerHTML = '';

    visible.forEach(function (video) {
      var col = document.createElement('div');
      col.className = 'col-md-6';
      col.innerHTML =
        '<div class="video-card" tabindex="0" role="button" aria-label="' + (video.title || 'סרטון') + '" data-videoid="' + video.id + '">' +
          '<div class="video-card-thumb" style="background: linear-gradient(135deg,#0f172a,#1e3a5f); position:relative;">' +
            '<img src="' + video.thumbnail + '" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.7;" onerror="this.style.display=\'none\'">' +
            '<i class="bi bi-play-circle-fill play-icon" style="position:relative;z-index:1;"></i>' +
          '</div>' +
          '<div class="video-card-body">' +
            '<div class="video-card-title">' + (video.title || '') + '</div>' +
            '<p class="video-card-desc">' + (video.channel || '') + '</p>' +
          '</div>' +
        '</div>';

      // Click: open YouTube in new tab
      col.querySelector('.video-card').addEventListener('click', function () {
        window.open('https://www.youtube.com/watch?v=' + video.id, '_blank', 'noopener,noreferrer');
      });
      col.querySelector('.video-card').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.open('https://www.youtube.com/watch?v=' + video.id, '_blank', 'noopener,noreferrer'); }
      });

      container.appendChild(col);
    });

    // Navigation row
    var navRow = document.createElement('div');
    navRow.className = 'col-12 d-flex justify-content-between align-items-center mt-2';
    navRow.innerHTML =
      '<button class="btn btn-sm btn-outline-secondary" id="he-video-prev" ' + (heVideoIndex === 0 ? 'disabled' : '') + '><i class="bi bi-chevron-right me-1"></i>הקודם</button>' +
      '<span class="text-muted small">' + (heVideoIndex + 1) + '–' + end + ' מתוך ' + total + '</span>' +
      '<button class="btn btn-sm btn-outline-secondary" id="he-video-next" ' + (end >= total ? 'disabled' : '') + '>הבא <i class="bi bi-chevron-left ms-1"></i></button>';

    container.appendChild(navRow);

    var prevBtn = container.querySelector('#he-video-prev');
    var nextBtn = container.querySelector('#he-video-next');
    if (prevBtn) prevBtn.addEventListener('click', function () { heVideoIndex = Math.max(0, heVideoIndex - perPage); renderHeVideoCarousel(); resetVideoTimer(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { heVideoIndex = Math.min(total - perPage, heVideoIndex + perPage); renderHeVideoCarousel(); resetVideoTimer(); });
  }

  function startVideoCarousel() {
    if (heVideoTimer) clearInterval(heVideoTimer);
    heVideoTimer = setInterval(function () {
      var perPage = window.innerWidth < 768 ? 1 : 2;
      heVideoIndex = (heVideoIndex + perPage) % (heVideoList.length || 1);
      if (heVideoIndex + perPage > heVideoList.length) heVideoIndex = 0;
      renderHeVideoCarousel();
    }, 9000);
  }

  function resetVideoTimer() {
    if (heVideoTimer) { clearInterval(heVideoTimer); heVideoTimer = null; }
    startVideoCarousel();
  }

  function renderFallbackVideos() {
    var container = document.getElementById('videos-grid');
    if (!container) return;
    container.innerHTML =
      '<div class="col-md-6"><a href="https://www.youtube.com/results?search_query=%D7%A9%D7%95%D7%A7+%D7%94%D7%95%D7%9F+%D7%9E%D7%A0%D7%99%D7%95%D7%AA+%D7%91%D7%A2%D7%91%D7%A8%D7%99%D7%AA" target="_blank" rel="noopener" class="video-card"><div class="video-card-thumb"><i class="bi bi-play-circle-fill play-icon"></i></div><div class="video-card-body"><div class="video-card-title">סרטוני שוק ההון בעברית</div><p class="video-card-desc">חיפוש ביוטיוב — ניתוח מניות ושוק ההון</p></div></a></div>' +
      '<div class="col-md-6"><a href="https://www.youtube.com/results?search_query=%D7%91%D7%95%D7%A8%D7%A1%D7%94+%D7%AA%D7%9C+%D7%90%D7%91%D7%99%D7%91+%D7%A0%D7%99%D7%AA%D7%95%D7%97" target="_blank" rel="noopener" class="video-card"><div class="video-card-thumb" style="background:linear-gradient(135deg,#0a1628,#1e3a5f)"><i class="bi bi-play-circle-fill play-icon"></i></div><div class="video-card-body"><div class="video-card-title">בורסת תל אביב</div><p class="video-card-desc">ניתוח מניות ישראליות ביוטיוב</p></div></a></div>';
  }

  function loadHeYouTubeVideos() {
    var container = document.getElementById('videos-grid');
    if (!container) return;
    container.innerHTML =
      '<div class="col-12 text-center py-4">' +
        '<div class="spinner-border text-danger" role="status"><span class="visually-hidden">טוען...</span></div>' +
        '<p class="mt-2 text-muted small">טוען סרטונים...</p>' +
      '</div>';

    var attempt = 0;
    function tryCall() {
      var fns = getFirebaseFunctions();
      if (!fns) {
        if (attempt++ < 25) { setTimeout(tryCall, 300); return; }
        renderFallbackVideos();
        return;
      }
      var callable = fns.httpsCallable('getRecommendedVideos');
      callable({
        keywords: ['שוק ההון מניות בעברית', 'בורסה ישראל ניתוח', 'השקעות כסף בעברית'],
        maxResults: 8
      }).then(function (res) {
        heVideoList = (res.data && res.data.videos) || [];
        if (heVideoList.length === 0) { renderFallbackVideos(); return; }
        heVideoIndex = 0;
        renderHeVideoCarousel();
        startVideoCarousel();
      }).catch(function () {
        renderFallbackVideos();
      });
    }
    tryCall();
  }

  // ── Main Init ─────────────────────────────────────────────────────────────────

  function initHeShukPage() {
    // Load logos first, then load market data
    loadStockLogos().then(function () {
      fetchHeStockData(DEFAULT_SYMBOLS, 'market-data-he', false);
    });

    setupHeSearch();
    initHeWatchlist();

    // Initialize Bootstrap modal
    var modalEl = document.getElementById('heStockDetailModal');
    if (modalEl) {
      heStockModal = new bootstrap.Modal(modalEl);
      // Draw chart AFTER the modal animation completes (canvas has real dimensions)
      modalEl.addEventListener('shown.bs.modal', function () {
        if (heCurrentSymbol) {
          updateHeStockChart(heCurrentSymbol);
        }
      });
      modalEl.addEventListener('hidden.bs.modal', function () {
        if (heStockChart) {
          heStockChart.destroy();
          heStockChart = null;
        }
        heCurrentSymbol = null;
      });
    }
  }

  // ── DOMContentLoaded ──────────────────────────────────────────────────────────

  // Create the שוק ההון section in Firestore if it doesn't exist yet (silently, admin only)
  function ensureHeShukSection() {
    var waitForDb = function (attempts) {
      if (typeof db !== 'undefined') {
        db.collection('he_sections').where('slug', '==', 'shuk-hon').limit(1).get()
          .then(function (snap) {
            if (snap.empty) {
              return db.collection('he_sections').add({
                name: 'שוק ההון',
                slug: 'shuk-hon',
                description: 'חדשות וניתוחים על שוק ההון, מניות ובורסות ישראל ועולם',
                active: true,
                order: 10,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              }).then(function () {
                console.log('he_sections: שוק ההון created');
              });
            }
          })
          .catch(function () { /* not admin — silently ignore */ });
      } else if (attempts > 0) {
        setTimeout(function () { waitForDb(attempts - 1); }, 500);
      }
    };
    waitForDb(10);
  }

  function onReady() {
    initHeShukPage();
    loadHeCryptoData();
    loadHeStockNews();
    loadHeTaseStocks();
    loadHeStockArticles();
    initHeWatchlist();
    loadHeRecommendedBooks();
    loadHeYouTubeVideos();
    ensureHeShukSection();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

})();
