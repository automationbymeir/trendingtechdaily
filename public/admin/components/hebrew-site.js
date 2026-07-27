// admin/components/hebrew-site.js
// Admin panel for the Hebrew TrendingTech Daily site

window.HebrewSitePanel = (function () {
  'use strict';

  var db = null;
  var functions = null;
  var unsubscribeSnapshot = null;
  var containerId = null;

  function init() {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      db = firebase.firestore();
      functions = firebase.functions();
    }
  }

  function render(targetContainerId) {
    containerId = targetContainerId;
    init();

    var container = document.getElementById(targetContainerId);
    if (!container) return;

    container.innerHTML = getBaseHTML();
    computeNextRun();
    loadStats();
    loadRecentArticles();
    loadSections();
    loadGenerationLogs();
    bindEvents();
  }

  function getBaseHTML() {
    return `
      <div class="section-container p-4" dir="rtl" style="text-align:right;">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h2 style="font-family:inherit; font-weight:700; margin:0;">
            <i class="bi bi-translate me-2"></i>אתר עברי
          </h2>
          <a href="/he/" target="_blank" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-box-arrow-up-right me-1"></i>פתח את האתר העברי
          </a>
        </div>

        <!-- Stats Row -->
        <div class="row g-3 mb-4" id="he-stats-row">
          <div class="col-md-4">
            <div class="card text-center h-100">
              <div class="card-body">
                <div class="h3 text-primary" id="he-stat-total">—</div>
                <div class="text-muted small">סה"כ כתבות</div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card text-center h-100">
              <div class="card-body">
                <div class="h3 text-success" id="he-stat-published">—</div>
                <div class="text-muted small">כתבות פורסמו</div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card text-center h-100">
              <div class="card-body">
                <div class="h3 text-warning" id="he-stat-sections">—</div>
                <div class="text-muted small">קטגוריות</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Trigger Section -->
        <div class="row g-3 mb-4">
          <!-- Scheduled triggers info -->
          <div class="col-md-6">
            <div class="card border-primary h-100">
              <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                <span><i class="bi bi-calendar-event me-2"></i>טריגרים מתוזמנים</span>
                <span class="badge bg-light text-primary">פעיל</span>
              </div>
              <div class="card-body p-0">
                <table class="table table-sm mb-0">
                  <thead><tr><th>פונקציה</th><th>לוח זמנים (UTC)</th><th>הרצה הבאה</th></tr></thead>
                  <tbody>
                    <tr>
                      <td><strong>כתבות עבריות</strong><br><small class="text-muted">2 כתבות × 2 הרצות ביום</small></td>
                      <td><code>0 5,16 * * *</code><br><small class="text-muted">05:00 ו-16:00 UTC<br>(07–08 ו-18–19 ישראל)</small></td>
                      <td><span id="he-next-run" class="badge bg-info text-dark">מחשב...</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Manual trigger -->
          <div class="col-md-6">
            <div class="card border-success h-100">
              <div class="card-header bg-success text-white">
                <i class="bi bi-play-circle me-2"></i>הפעלה ידנית
              </div>
              <div class="card-body d-flex flex-column gap-3">
                <div>
                  <p class="mb-2"><strong>צור כתבות עבריות</strong> — סרוק חדשות ופרסם עכשיו</p>
                  <div class="d-flex align-items-center gap-2">
                    <label class="mb-0 small">כמות:</label>
                    <select id="he-generate-count" class="form-select form-select-sm" style="width:70px;">
                      <option value="1">1</option>
                      <option value="2" selected>2</option>
                      <option value="3">3</option>
                      <option value="5">5</option>
                    </select>
                    <button id="he-generate-btn" class="btn btn-success btn-sm">
                      <i class="bi bi-robot me-1"></i>צור עכשיו
                    </button>
                  </div>
                </div>
                <hr class="my-0">
                <div id="he-trigger-status" class="d-none alert py-2 mb-0"></div>
                <hr class="my-0">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2" dir="rtl">
                  <div>
                    <strong>כתבות השוואה (Comparisons)</strong>
                    <div class="small text-muted">צור אוטומטית כתבת השוואה ("X vs Y") בעברית ובאנגלית.</div>
                  </div>
                  <button id="he-comparisons-btn" class="btn btn-info btn-sm text-white">
                    <i class="bi bi-robot me-1"></i>צור השוואה
                  </button>
                </div>
                <div id="he-comparisons-status" class="d-none alert py-2 mt-2 mb-0"></div>
                <hr class="my-0">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2" dir="rtl">
                  <div>
                    <strong>סיכום שבועי של BIT</strong>
                    <div class="small text-muted">סרטון אנימציה ~3 דק' שמסכם את 5 הכתבות החמות של השבוע, BIT מציג כל סיפור.</div>
                  </div>
                  <div class="d-flex gap-2 align-items-center">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" id="he-digest-publish">
                      <label class="form-check-label small" for="he-digest-publish">פרסום ל-IG + YT</label>
                    </div>
                    <button id="he-digest-btn" class="btn btn-sm" style="background:#0F8BD9;color:#fff;border-color:#0F8BD9;">
                      <i class="bi bi-broadcast me-1"></i>צור סיכום שבועי
                    </button>
                    <button id="he-publish-last-btn" class="btn btn-sm btn-outline-success">
                      <i class="bi bi-upload me-1"></i>פרסם הרצה אחרונה
                    </button>
                  </div>
                </div>
                <div id="he-digest-status" class="d-none alert py-2 mb-0"></div>
                <div id="he-publish-last-status" class="d-none alert py-2 mb-0"></div>
                <hr class="my-0">
                <div dir="rtl">
                  <div class="mb-2">
                    <strong>סרטון אנקור לכתבה ספציפית</strong>
                    <div class="small text-muted">BIT מציג כתבה אחת שתבחרו כאנקור באולפן (~35 שניות).</div>
                  </div>
                  <div class="d-flex gap-2 align-items-center flex-wrap">
                    <select id="he-single-select" class="form-select form-select-sm" style="max-width:55%;">
                      <option value="">טוען כתבות אחרונות...</option>
                    </select>
                    <button id="he-single-btn" class="btn btn-sm" style="background:#0F8BD9;color:#fff;border-color:#0F8BD9;" disabled>
                      <i class="bi bi-broadcast-pin me-1"></i>צור סרטון אנקור
                    </button>
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" id="he-single-publish">
                      <label class="form-check-label small" for="he-single-publish">פרסום</label>
                    </div>
                  </div>
                  <div id="he-single-status" class="d-none alert py-2 mt-2 mb-0"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Run stats from logs -->
        <div class="row g-3 mb-4">
          <div class="col-6 col-md-3">
            <div class="card text-center border-0 bg-light">
              <div class="card-body py-3">
                <div class="fs-3 fw-bold text-primary" id="he-run-stat-total">—</div>
                <div class="small text-muted">סה"כ הרצות</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card text-center border-0 bg-light">
              <div class="card-body py-3">
                <div class="fs-3 fw-bold text-success" id="he-run-stat-success">—</div>
                <div class="small text-muted">הצלחות</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card text-center border-0 bg-light">
              <div class="card-body py-3">
                <div class="fs-3 fw-bold text-danger" id="he-run-stat-errors">—</div>
                <div class="small text-muted">שגיאות</div>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card text-center border-0 bg-light">
              <div class="card-body py-3">
                <div class="fs-3 fw-bold text-info" id="he-run-stat-articles">—</div>
                <div class="small text-muted">כתבות פורסמו</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent Articles Table -->
        <div class="card mb-4">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h5 class="mb-0"><i class="bi bi-file-text me-2"></i>כתבות אחרונות</h5>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-success" id="he-new-article-btn">
                <i class="bi bi-plus-circle me-1"></i>כתבה חדשה
              </button>
              <button class="btn btn-sm btn-outline-secondary" id="he-refresh-articles-btn" title="רענן">
                <i class="bi bi-arrow-clockwise"></i>
              </button>
            </div>
          </div>
          <div class="card-body p-0">
            <div id="he-articles-table-container" class="table-responsive">
              <div class="text-center p-4">
                <div class="spinner-border spinner-border-sm" role="status"></div>
                <span class="ms-2">טוען כתבות...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Sections Management -->
        <div class="card mb-4">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h5 class="mb-0"><i class="bi bi-grid me-2"></i>ניהול קטגוריות</h5>
            <button class="btn btn-sm btn-success" id="he-add-section-btn">
              <i class="bi bi-plus-circle me-1"></i>הוסף קטגוריה
            </button>
          </div>
          <div class="card-body">
            <div id="he-sections-container">
              <div class="text-center p-3">
                <div class="spinner-border spinner-border-sm" role="status"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Add/Edit Section Modal -->
        <div id="he-section-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
          <div style="background:#fff; border-radius:12px; max-width:480px; width:90%; padding:2rem;">
            <h5 id="he-section-modal-title" style="margin-bottom:1.5rem;">הוסף קטגוריה</h5>
            <div class="mb-3">
              <label class="form-label">שם הקטגוריה</label>
              <input type="text" id="he-section-name" class="form-control" placeholder="בינה מלאכותית">
            </div>
            <div class="mb-3">
              <label class="form-label">Slug (אנגלית)</label>
              <input type="text" id="he-section-slug" class="form-control" placeholder="ai">
            </div>
            <div class="mb-3">
              <label class="form-label">סדר הצגה</label>
              <input type="number" id="he-section-order" class="form-control" value="10" min="1">
            </div>
            <div class="mb-3 form-check">
              <input type="checkbox" id="he-section-active" class="form-check-input" checked>
              <label for="he-section-active" class="form-check-label">פעיל</label>
            </div>
            <input type="hidden" id="he-section-edit-id" value="">
            <div class="d-flex gap-2 justify-content-end">
              <button class="btn btn-secondary" id="he-section-cancel-btn">ביטול</button>
              <button class="btn btn-primary" id="he-section-save-btn">שמור</button>
            </div>
          </div>
        </div>

        <!-- Generation Logs -->
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <strong><i class="bi bi-journal-text me-2"></i>לוגים של יצירת כתבות</strong>
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-secondary" id="he-log-count">טוען...</span>
              <button class="btn btn-sm btn-outline-secondary" id="he-refresh-logs-btn">
                <i class="bi bi-arrow-clockwise"></i>
              </button>
            </div>
          </div>
          <div class="card-body p-0">
            <div id="he-logs-loading" class="text-center py-4">
              <div class="spinner-border spinner-border-sm me-2"></div>טוען לוגים...
            </div>
            <div id="he-logs-table-container" class="d-none table-responsive">
              <table class="table table-hover table-sm mb-0">
                <thead class="table-light">
                  <tr>
                    <th>זמן</th>
                    <th>טריגר</th>
                    <th>סטטוס</th>
                    <th>כתבות שפורסמו</th>
                    <th>משך</th>
                  </tr>
                </thead>
                <tbody id="he-logs-tbody"></tbody>
              </table>
            </div>
            <div id="he-logs-empty" class="d-none text-center text-muted py-4">
              <i class="bi bi-inbox fs-3 d-block mb-2"></i>אין לוגים עדיין. הפעל את הטריגר ידנית או המתן להרצה מתוזמנת.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    // Generate articles button
    var generateBtn = document.getElementById('he-generate-btn');
    if (generateBtn) {
      generateBtn.addEventListener('click', handleGenerateArticles);
    }

    // BIT weekly digest button
    var digestBtn = document.getElementById('he-digest-btn');
    if (digestBtn) {
      digestBtn.addEventListener('click', handleGenerateDigest);
    }

    // Publish last successful run to YT + IG
    var publishLastBtn = document.getElementById('he-publish-last-btn');
    if (publishLastBtn) {
      publishLastBtn.addEventListener('click', handlePublishLastRun);
    }

    // Comparisons trigger button
    var comparisonsBtn = document.getElementById('he-comparisons-btn');
    if (comparisonsBtn) {
      comparisonsBtn.addEventListener('click', handleGenerateComparisons);
    }

    // BIT single-story anchor button + picker
    var singleBtn = document.getElementById('he-single-btn');
    if (singleBtn) {
      singleBtn.addEventListener('click', handleGenerateSingleAnchor);
    }
    loadHeSingleStoryOptions();

    // Refresh buttons
    var refreshArticlesBtn = document.getElementById('he-refresh-articles-btn');
    if (refreshArticlesBtn) {
      refreshArticlesBtn.addEventListener('click', loadRecentArticles);
    }

    // New article button
    var newArticleBtn = document.getElementById('he-new-article-btn');
    if (newArticleBtn) {
      newArticleBtn.addEventListener('click', function () { openHeArticleEditor(null); });
    }

    var refreshLogsBtn = document.getElementById('he-refresh-logs-btn');
    if (refreshLogsBtn) {
      refreshLogsBtn.addEventListener('click', loadGenerationLogs);
    }

    // Add section
    var addSectionBtn = document.getElementById('he-add-section-btn');
    if (addSectionBtn) {
      addSectionBtn.addEventListener('click', function () {
        openSectionModal(null);
      });
    }

    // Section modal buttons
    var cancelBtn = document.getElementById('he-section-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', closeSectionModal);
    }

    var saveBtn = document.getElementById('he-section-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', handleSaveSection);
    }

    // Auto-generate slug from name
    var nameInput = document.getElementById('he-section-name');
    var slugInput = document.getElementById('he-section-slug');
    if (nameInput && slugInput) {
      nameInput.addEventListener('input', function () {
        if (!slugInput.dataset.manuallyEdited) {
          slugInput.value = createSlug(nameInput.value);
        }
      });
      slugInput.addEventListener('input', function () {
        slugInput.dataset.manuallyEdited = '1';
      });
    }
  }

  function createSlug(text) {
    return (text || '').toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  function loadStats() {
    if (!db) return;

    // Total articles
    db.collection('he_articles').get().then(function (snap) {
      var totalEl = document.getElementById('he-stat-total');
      if (totalEl) totalEl.textContent = snap.size;

      // Published articles
      var published = 0;
      snap.forEach(function (doc) { if (doc.data().published) published++; });
      var pubEl = document.getElementById('he-stat-published');
      if (pubEl) pubEl.textContent = published;
    }).catch(function (err) {
      console.error('he-admin: stats error', err);
    });

    // Sections count
    db.collection('he_sections').get().then(function (snap) {
      var sectEl = document.getElementById('he-stat-sections');
      if (sectEl) sectEl.textContent = snap.size;
    }).catch(function (err) {
      console.error('he-admin: sections count error', err);
    });
  }

  // ── Next-run calculator ────────────────────────────────────────────────────

  function computeNextRun() {
    var now = new Date();
    var utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
    var runs = [5 * 60, 16 * 60]; // 05:00 and 16:00 UTC
    var minsUntil = null;
    for (var i = 0; i < runs.length; i++) {
      var diff = runs[i] - utcMins;
      if (diff > 0 && (minsUntil === null || diff < minsUntil)) minsUntil = diff;
    }
    if (minsUntil === null) minsUntil = (24 * 60) - utcMins + runs[0];
    var hh = Math.floor(minsUntil / 60);
    var mm = minsUntil % 60;
    var el = document.getElementById('he-next-run');
    if (el) el.textContent = 'בעוד ' + hh + 'ש\' ' + mm + 'ד\'';
  }

  // ── Generate Articles ──────────────────────────────────────────────────────

  var _heLogWatcher = null;

  function handleGenerateArticles() {
    if (!functions) { alert('Firebase Functions לא זמין.'); return; }

    var countSelect = document.getElementById('he-generate-count');
    var count = parseInt(countSelect ? countSelect.value : '2', 10);
    var btn = document.getElementById('he-generate-btn');
    var statusEl = document.getElementById('he-trigger-status');
    var originalHtml = btn ? btn.innerHTML : '';

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>מייצר...'; }
    if (statusEl) {
      statusEl.className = 'alert alert-info py-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>סורק חדשות ומייצר כתבות... עד 9 דקות.';
      statusEl.classList.remove('d-none');
    }

    var triggerFn = functions.httpsCallable('triggerHebrewArticles', { timeout: 540000 });

    triggerFn({ count: count })
      .then(function () {
        if (statusEl) {
          statusEl.className = 'alert alert-success py-2 mb-0';
          statusEl.innerHTML = '<i class="bi bi-check-circle me-1"></i>הכתבות נוצרו ופורסמו בהצלחה!';
        }
        loadRecentArticles();
        loadStats();
        loadGenerationLogs();
      })
      .catch(function (err) {
        var isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
        if (isTimeout) {
          if (statusEl) {
            statusEl.className = 'alert alert-warning py-2 mb-0';
            statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>ממשיך ברקע — ממתין לסיום...';
          }
          watchLatestHeLog(statusEl);
        } else {
          if (statusEl) {
            statusEl.className = 'alert alert-danger py-2 mb-0';
            statusEl.innerHTML = '<i class="bi bi-x-circle me-1"></i>שגיאה: ' + escHtml(err.message || String(err));
          }
          setTimeout(function () { loadRecentArticles(); loadStats(); }, 3000);
        }
      })
      .finally(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
      });
  }

  // ── Generate Comparisons ───────────────────────────────────────────────────

  function handleGenerateComparisons() {
    if (!functions) { alert('Firebase Functions לא זמין.'); return; }

    var btn = document.getElementById('he-comparisons-btn');
    var statusEl = document.getElementById('he-comparisons-status');
    var originalHtml = btn ? btn.innerHTML : '';

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>מייצר...'; }
    if (statusEl) {
      statusEl.className = 'alert alert-info py-2 mt-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>מייצר השוואה...';
      statusEl.classList.remove('d-none');
    }

    var triggerFn = functions.httpsCallable('triggerComparisons', { timeout: 540000 });

    triggerFn({})
      .then(function () {
        if (statusEl) {
          statusEl.className = 'alert alert-success py-2 mt-2 mb-0';
          statusEl.innerHTML = '<i class="bi bi-check-circle me-1"></i>השוואה נוצרה ופורסמה בהצלחה!';
        }
        loadRecentArticles();
        loadStats();
        loadGenerationLogs();
      })
      .catch(function (err) {
        var isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
        if (isTimeout) {
          if (statusEl) {
            statusEl.className = 'alert alert-warning py-2 mt-2 mb-0';
            statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>ממשיך ברקע — ממתין לסיום...';
          }
          watchLatestHeLog(statusEl);
        } else {
          if (statusEl) {
            statusEl.className = 'alert alert-danger py-2 mt-2 mb-0';
            statusEl.innerHTML = '<i class="bi bi-x-circle me-1"></i>שגיאה: ' + escHtml(err.message || String(err));
          }
        }
      })
      .finally(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
      });
  }

  // ─── BIT Hebrew single-story anchor ─────────────────────────────────────
  var _heSingleStoryUnsubscribe = null;
  function loadHeSingleStoryOptions() {
    var select = document.getElementById('he-single-select');
    var btn = document.getElementById('he-single-btn');
    if (!select || !db) return;
    
    if (_heSingleStoryUnsubscribe) {
      _heSingleStoryUnsubscribe();
    }
    
    _heSingleStoryUnsubscribe = db.collection('stories')
      .where('language', '==', 'he')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .onSnapshot(function (snap) {
        if (snap.empty) {
          select.innerHTML = '<option value="">אין כתבות עם וידאו עדיין</option>';
          return;
        }
        var opts = ['<option value="">— בחרו כתבה —</option>'];
        snap.forEach(function (doc) {
          var d = doc.data();
          if (!d.articleId || !d.title) return;
          var safe = d.title.replace(/</g, '&lt;').slice(0, 80);
          opts.push('<option value="' + d.articleId + '">' + safe + '</option>');
        });
        
        var currentVal = select.value;
        select.innerHTML = opts.join('');
        if (currentVal && select.querySelector('option[value="' + currentVal + '"]')) {
          select.value = currentVal;
        }
        
        btn.disabled = !select.value;
        
        select.onchange = function () {
          btn.disabled = !select.value;
        };
      }, function (err) {
        select.innerHTML = '<option value="">שגיאה: ' + escHtml(err.message) + '</option>';
      });
  }

  function handleGenerateSingleAnchor() {
    if (!functions) { alert('Firebase Functions לא זמין.'); return; }
    var select = document.getElementById('he-single-select');
    var btn = document.getElementById('he-single-btn');
    var statusEl = document.getElementById('he-single-status');
    var articleId = select ? select.value : '';
    if (!articleId) return;
    var originalHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>מרנדר...'; }
    if (statusEl) {
      statusEl.className = 'alert alert-info py-2 mt-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>BIT מקליט את הסיפור... ~3-5 דקות.';
      statusEl.classList.remove('d-none');
    }
    var autoPublish = !!(document.getElementById('he-single-publish') || {}).checked;
    var triggerFn = functions.httpsCallable('triggerWeeklyDigestAdmin', { timeout: 540000 });
    triggerFn({ language: 'he', articleId: articleId, autoPublish: autoPublish })
      .then(function (res) {
        var data = (res && res.data) || {};
        if (statusEl) {
          statusEl.className = 'alert alert-success py-2 mt-2 mb-0';
          var extra = '';
          if (data.publish) {
            if (data.publish.youtubeUrl) extra += ' · <a href="' + data.publish.youtubeUrl + '" target="_blank" class="alert-link">YouTube</a>';
            if (data.publish.instagramUrl) extra += ' · <a href="' + data.publish.instagramUrl + '" target="_blank" class="alert-link">Instagram</a>';
          }
          statusEl.innerHTML = data.videoUrl
            ? '<i class="bi bi-check-circle me-1"></i>הסרטון מוכן — <a href="' + data.videoUrl + '" target="_blank" class="alert-link">צפו ב-MP4</a>' + extra
            : '<i class="bi bi-check-circle me-1"></i>הריצה הסתיימה';
        }
      })
      .catch(function (err) {
        var isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
        if (statusEl) {
          if (isTimeout) {
            statusEl.className = 'alert alert-warning py-2 mt-2 mb-0';
            statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>ממשיך ברקע — ה-MP4 ייכנס ל-`cartoon_test_runs` בעוד כמה דקות.';
          } else {
            statusEl.className = 'alert alert-danger py-2 mt-2 mb-0';
            statusEl.innerHTML = '<i class="bi bi-x-circle me-1"></i>שגיאה: ' + escHtml(err.message || String(err));
          }
        }
      })
      .finally(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
      });
  }

  // ─── BIT Hebrew weekly digest ───────────────────────────────────────────
  function handleGenerateDigest() {
    if (!functions) { alert('Firebase Functions לא זמין.'); return; }

    var btn = document.getElementById('he-digest-btn');
    var statusEl = document.getElementById('he-digest-status');
    var originalHtml = btn ? btn.innerHTML : '';

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>מרנדר...'; }
    if (statusEl) {
      statusEl.className = 'alert alert-info py-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>BIT מצלם את החדשות... ~8-12 דקות (Veo + Remotion). אל תסגרו את הדף.';
      statusEl.classList.remove('d-none');
    }

    var autoPublish = !!(document.getElementById('he-digest-publish') || {}).checked;
    var triggerFn = functions.httpsCallable('triggerWeeklyDigestAdmin', { timeout: 540000 });
    triggerFn({ language: 'he', autoPublish: autoPublish })
      .then(function (res) {
        var data = (res && res.data) || {};
        if (statusEl) {
          statusEl.className = 'alert alert-success py-2 mb-0';
          var extra = '';
          if (data.publish) {
            if (data.publish.youtubeUrl) extra += ' · <a href="' + data.publish.youtubeUrl + '" target="_blank" class="alert-link">YouTube</a>';
            if (data.publish.instagramUrl) extra += ' · <a href="' + data.publish.instagramUrl + '" target="_blank" class="alert-link">Instagram</a>';
          }
          statusEl.innerHTML = data.videoUrl
            ? '<i class="bi bi-check-circle me-1"></i>הסיכום מוכן (' + (data.storyCount || 0) + ' כתבות) — <a href="' + data.videoUrl + '" target="_blank" class="alert-link">צפו ב-MP4</a>' + extra
            : '<i class="bi bi-check-circle me-1"></i>הריצה הסתיימה';
        }
      })
      .catch(function (err) {
        var isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
        if (statusEl) {
          if (isTimeout) {
            statusEl.className = 'alert alert-warning py-2 mb-0';
            statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>ממשיך ברקע — קובץ ה-MP4 ייכנס ל-`cartoon_test_runs` בעוד ~5 דקות.';
          } else {
            statusEl.className = 'alert alert-danger py-2 mb-0';
            statusEl.innerHTML = '<i class="bi bi-x-circle me-1"></i>שגיאה: ' + escHtml(err.message || String(err));
          }
        }
      })
      .finally(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
      });
  }

  function handlePublishLastRun() {
    var functions = window._heFunctions || (firebase.app().functions && firebase.app().functions('us-central1'));
    if (!functions) { alert('Firebase Functions לא זמין.'); return; }

    var btn = document.getElementById('he-publish-last-btn');
    var statusEl = document.getElementById('he-publish-last-status');
    var originalHtml = btn ? btn.innerHTML : '';

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>מפרסם...'; }
    if (statusEl) {
      statusEl.className = 'alert alert-info py-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>מפרסם את ההרצה האחרונה ליוטיוב ואינסטגרם... (עד 5 דקות)';
      statusEl.classList.remove('d-none');
    }

    // Call Cloud Function — it auto-finds the latest successful HE run
    var publishFn = functions.httpsCallable('publishExistingDigest', { timeout: 600000 });
    publishFn({ language: 'he' })
      .then(function (res) {
        var data = (res && res.data) || {};
        if (statusEl) {
          statusEl.className = 'alert alert-success py-2 mb-0';
          var links = '';
          if (data.youtubeUrl) links += ' · <a href="' + data.youtubeUrl + '" target="_blank" class="alert-link">YouTube</a>';
          if (data.instagramUrl) links += ' · <a href="' + data.instagramUrl + '" target="_blank" class="alert-link">Instagram</a>';
          var runInfo = data.runId ? ' (' + escHtml(data.runId) + ')' : '';
          statusEl.innerHTML = '<i class="bi bi-check-circle me-1"></i>פורסם בהצלחה!' + runInfo + links;
          if (data.youtubeError) statusEl.innerHTML += '<br><small class="text-warning">YT: ' + escHtml(data.youtubeError) + '</small>';
          if (data.instagramError) statusEl.innerHTML += '<br><small class="text-warning">IG: ' + escHtml(data.instagramError) + '</small>';
        }
      })
      .catch(function (err) {
        if (statusEl) {
          statusEl.className = 'alert alert-danger py-2 mb-0';
          statusEl.innerHTML = '<i class="bi bi-x-circle me-1"></i>שגיאה: ' + escHtml(err.message || String(err));
        }
      })
      .finally(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
      });
  }

  function watchLatestHeLog(statusEl) {
    if (_heLogWatcher) { _heLogWatcher(); _heLogWatcher = null; }
    _heLogWatcher = db.collection('schedulerLogs')
      .where('type', '==', 'hebrew')
      .orderBy('startedAt', 'desc')
      .limit(1)
      .onSnapshot(function (snap) {
        if (snap.empty) return;
        var log = snap.docs[0].data();
        if (log.status === 'success') {
          var titles = (log.articles || []).map(function (a) { return '<strong>' + escHtml(a.title) + '</strong>'; }).join(', ');
          if (statusEl) {
            statusEl.className = 'alert alert-success py-2 mb-0';
            statusEl.innerHTML = '<i class="bi bi-check-circle me-1"></i>הושלם! פורסמו: ' + (titles || '—');
          }
          if (_heLogWatcher) { _heLogWatcher(); _heLogWatcher = null; }
          loadRecentArticles(); loadStats(); loadGenerationLogs();
        } else if (log.status === 'error') {
          if (statusEl) {
            statusEl.className = 'alert alert-danger py-2 mb-0';
            statusEl.innerHTML = '<i class="bi bi-x-circle me-1"></i>נכשל: ' + escHtml(log.error || 'שגיאה לא ידועה');
          }
          if (_heLogWatcher) { _heLogWatcher(); _heLogWatcher = null; }
          loadGenerationLogs();
        }
      }, function (err) {
        console.warn('he-admin: log watcher error', err);
      });
    setTimeout(function () { if (_heLogWatcher) { _heLogWatcher(); _heLogWatcher = null; } }, 600000);
  }

  // ── Articles Table ─────────────────────────────────────────────────────────

  function loadRecentArticles() {
    if (!db) return;
    var container = document.getElementById('he-articles-table-container');
    if (!container) return;

    container.innerHTML = '<div class="text-center p-4"><div class="spinner-border spinner-border-sm" role="status"></div></div>';

    // Load sections for display
    db.collection('he_sections').get()
      .then(function (sectSnap) {
        var sectionsMap = {};
        sectSnap.forEach(function (doc) {
          sectionsMap[doc.id] = doc.data().name || doc.id;
        });

        return db.collection('he_articles')
          .orderBy('createdAt', 'desc')
          .limit(30)
          .get()
          .then(function (snap) {
            if (snap.empty) {
              container.innerHTML = '<div class="p-4 text-center text-muted">אין כתבות עדיין. לחצו על "צור כתבות עכשיו".</div>';
              return;
            }

            var rows = '';
            snap.forEach(function (doc) {
              var a = doc.data();
              var catName = sectionsMap[a.category] || '—';
              var dateStr = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().toLocaleDateString('he-IL') : '') : '—';
              var pubBadge = a.published
                ? '<span class="badge bg-success">פורסם</span>'
                : '<span class="badge bg-secondary">טיוטה</span>';
              var slug = a.slug || '';
              var catSlug = '';
              // Try to get cat slug from a section doc
              sectSnap.forEach(function (sd) {
                if (sd.id === a.category) catSlug = sd.data().slug || '';
              });
              var viewLink = catSlug && slug ? '<a href="/he/' + catSlug + '/' + slug + '" target="_blank" class="btn btn-sm btn-outline-primary py-0 px-1" title="צפה"><i class="bi bi-eye"></i></a>' : '';
              // Detect English-language titles (no Hebrew chars)
              var hasHebrew = /[\u0590-\u05FF]/.test(a.title || '');
              var retranslateBtn = !hasHebrew ? '<button class="btn btn-sm btn-outline-info py-0 px-1 he-retranslate-btn" data-id="' + doc.id + '" title="תרגם לעברית"><i class="bi bi-translate"></i></button>' : '';

              rows += '<tr' + (!hasHebrew ? ' class="table-warning"' : '') + '>' +
                '<td class="small">' + escHtml(a.title || '—').substring(0, 70) + (a.title && a.title.length > 70 ? '...' : '') + '</td>' +
                '<td class="small">' + escHtml(catName) + '</td>' +
                '<td class="small">' + dateStr + '</td>' +
                '<td>' + pubBadge + '</td>' +
                '<td>' +
                  '<div class="d-flex gap-1">' +
                  viewLink +
                  '<button class="btn btn-sm btn-outline-secondary py-0 px-1 he-edit-article-btn" data-id="' + doc.id + '" title="ערוך"><i class="bi bi-pencil"></i></button>' +
                  retranslateBtn +
                  '<button class="btn btn-sm btn-outline-' + (a.published ? 'warning' : 'success') + ' py-0 px-1 he-toggle-publish-btn" data-id="' + doc.id + '" data-published="' + a.published + '" title="' + (a.published ? 'הסר פרסום' : 'פרסם') + '"><i class="bi bi-' + (a.published ? 'eye-slash' : 'check-circle') + '"></i></button>' +
                  '<button class="btn btn-sm btn-outline-danger py-0 px-1 he-delete-article-btn" data-id="' + doc.id + '" data-title="' + escHtml(a.title || '') + '" title="מחק"><i class="bi bi-trash"></i></button>' +
                  '</div>' +
                '</td>' +
                '</tr>';
            });

            container.innerHTML = '<table class="table table-sm table-hover mb-0">' +
              '<thead><tr><th>כותרת</th><th>קטגוריה</th><th>תאריך</th><th>סטטוס</th><th>פעולות</th></tr></thead>' +
              '<tbody>' + rows + '</tbody>' +
              '</table>';

            // Bind action buttons
            container.querySelectorAll('.he-delete-article-btn').forEach(function (btn) {
              btn.addEventListener('click', function () {
                var id = this.dataset.id;
                var title = this.dataset.title;
                if (confirm('האם למחוק את הכתבה "' + title + '"?')) {
                  deleteArticle(id);
                }
              });
            });

            container.querySelectorAll('.he-toggle-publish-btn').forEach(function (btn) {
              btn.addEventListener('click', function () {
                var id = this.dataset.id;
                var isPublished = this.dataset.published === 'true';
                togglePublish(id, isPublished);
              });
            });

            container.querySelectorAll('.he-retranslate-btn').forEach(function (btn) {
              btn.addEventListener('click', function () {
                var id = this.dataset.id;
                retranslateArticle(id, btn);
              });
            });

            container.querySelectorAll('.he-edit-article-btn').forEach(function (btn) {
              btn.addEventListener('click', function () {
                openHeArticleEditor(this.dataset.id);
              });
            });
          });
      })
      .catch(function (err) {
        console.error('he-admin: loadRecentArticles error', err);
        container.innerHTML = '<div class="alert alert-danger m-3">שגיאה בטעינת הכתבות: ' + err.message + '</div>';
      });
  }

  function deleteArticle(id) {
    if (!db) return;
    db.collection('he_articles').doc(id).delete()
      .then(function () {
        loadRecentArticles();
        loadStats();
      })
      .catch(function (err) {
        alert('שגיאה במחיקה: ' + err.message);
      });
  }

  function retranslateArticle(id, btnEl) {
    if (!functions) return;
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    }
    var fn = functions.httpsCallable('retranslateHeArticle', { timeout: 120000 });
    fn({ articleId: id })
      .then(function (result) {
        if (btnEl) {
          btnEl.innerHTML = '<i class="bi bi-check-lg"></i>';
          btnEl.classList.replace('btn-outline-info', 'btn-success');
        }
        setTimeout(function () { loadRecentArticles(); }, 1200);
      })
      .catch(function (err) {
        console.error('retranslateArticle error:', err);
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.innerHTML = '<i class="bi bi-translate"></i>';
        }
        alert('שגיאה בתרגום: ' + (err.message || 'Unknown error'));
      });
  }

  function togglePublish(id, currentlyPublished) {
    if (!db) return;
    db.collection('he_articles').doc(id).update({ published: !currentlyPublished })
      .then(function () {
        loadRecentArticles();
        loadStats();
      })
      .catch(function (err) {
        alert('שגיאה בעדכון סטטוס: ' + err.message);
      });
  }

  // ── Sections Management ────────────────────────────────────────────────────

  function loadSections() {
    if (!db) return;
    var container = document.getElementById('he-sections-container');
    if (!container) return;

    db.collection('he_sections').orderBy('order', 'asc').get()
      .then(function (snap) {
        if (snap.empty) {
          container.innerHTML = '<div class="text-muted small">אין קטגוריות. <a href="#" id="he-seed-sections-btn">ייצר ברירות מחדל</a></div>';
          var seedBtn = document.getElementById('he-seed-sections-btn');
          if (seedBtn) {
            seedBtn.addEventListener('click', function (e) {
              e.preventDefault();
              seedDefaultSections();
            });
          }
          return;
        }

        // Check if shuk-hon is missing and offer a quick-add
        var hasShukHon = false;
        snap.forEach(function (doc) { if (doc.data().slug === 'shuk-hon') hasShukHon = true; });
        var quickAddHtml = !hasShukHon
          ? '<div class="alert alert-warning py-2 d-flex align-items-center gap-2 mb-3">' +
              '<i class="bi bi-exclamation-triangle-fill"></i>' +
              '<span>קטגוריית "שוק ההון" חסרה.</span>' +
              '<button class="btn btn-sm btn-warning ms-auto" id="he-add-shuk-btn"><i class="bi bi-plus-circle me-1"></i>הוסף שוק ההון</button>' +
            '</div>'
          : '';

        var items = '';
        snap.forEach(function (doc) {
          var s = doc.data();
          var activeBadge = s.active !== false
            ? '<span class="badge bg-success ms-2">פעיל</span>'
            : '<span class="badge bg-secondary ms-2">לא פעיל</span>';

          items += '<div class="d-flex align-items-center justify-content-between border-bottom py-2" data-section-id="' + doc.id + '">' +
            '<div>' +
              '<strong>' + escHtml(s.name || '') + '</strong>' +
              '<span class="text-muted ms-2 small">/' + escHtml(s.slug || '') + '</span>' +
              activeBadge +
            '</div>' +
            '<div class="d-flex gap-1">' +
              '<button class="btn btn-sm btn-outline-secondary he-edit-section-btn py-0 px-1" data-id="' + doc.id + '"><i class="bi bi-pencil"></i></button>' +
              '<button class="btn btn-sm btn-outline-danger he-delete-section-btn py-0 px-1" data-id="' + doc.id + '" data-name="' + escHtml(s.name || '') + '"><i class="bi bi-trash"></i></button>' +
            '</div>' +
            '</div>';
        });

        container.innerHTML = quickAddHtml + items;

        // Quick-add shuk-hon button
        var shukBtn = document.getElementById('he-add-shuk-btn');
        if (shukBtn) {
          shukBtn.addEventListener('click', function () {
            shukBtn.disabled = true;
            shukBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>מוסיף...';
            db.collection('he_sections').add({
              name: 'שוק ההון',
              slug: 'shuk-hon',
              active: true,
              order: 7,
              description: 'חדשות וניתוחים על שוק ההון, מניות ובורסות ישראל ועולם',
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(function () {
              loadSections();
              loadStats();
            }).catch(function (err) {
              alert('שגיאה: ' + err.message);
              shukBtn.disabled = false;
              shukBtn.innerHTML = '<i class="bi bi-plus-circle me-1"></i>הוסף שוק ההון';
            });
          });
        }

        // Bind edit/delete
        container.querySelectorAll('.he-edit-section-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = this.dataset.id;
            db.collection('he_sections').doc(id).get().then(function (doc) {
              if (doc.exists) openSectionModal(Object.assign({ id: doc.id }, doc.data()));
            });
          });
        });

        container.querySelectorAll('.he-delete-section-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = this.dataset.id;
            var name = this.dataset.name;
            if (confirm('האם למחוק את הקטגוריה "' + name + '"?')) {
              db.collection('he_sections').doc(id).delete()
                .then(function () { loadSections(); loadStats(); })
                .catch(function (err) { alert('שגיאה: ' + err.message); });
            }
          });
        });
      })
      .catch(function (err) {
        container.innerHTML = '<div class="alert alert-danger">שגיאה: ' + err.message + '</div>';
      });
  }

  function seedDefaultSections() {
    if (!db) return;
    var defaults = [
      { name: 'בינה מלאכותית', slug: 'ai', active: true, order: 1 },
      { name: 'טכנולוגיה', slug: 'technology', active: true, order: 2 },
      { name: 'סטארטאפים', slug: 'startups', active: true, order: 3 },
      { name: 'גאדג\'טים', slug: 'gadgets', active: true, order: 4 },
      { name: 'אבטחה', slug: 'security', active: true, order: 5 },
      { name: 'קריפטו', slug: 'crypto', active: true, order: 6 },
      { name: 'שוק ההון', slug: 'shuk-hon', active: true, order: 7 },
    ];

    var batch = db.batch();
    defaults.forEach(function (s) {
      var ref = db.collection('he_sections').doc();
      batch.set(ref, Object.assign({ createdAt: firebase.firestore.FieldValue.serverTimestamp() }, s));
    });

    batch.commit()
      .then(function () { loadSections(); loadStats(); })
      .catch(function (err) { alert('שגיאה: ' + err.message); });
  }

  function openSectionModal(section) {
    var modal = document.getElementById('he-section-modal');
    var title = document.getElementById('he-section-modal-title');
    var nameInput = document.getElementById('he-section-name');
    var slugInput = document.getElementById('he-section-slug');
    var orderInput = document.getElementById('he-section-order');
    var activeInput = document.getElementById('he-section-active');
    var editIdInput = document.getElementById('he-section-edit-id');

    if (!modal) return;

    if (section) {
      if (title) title.textContent = 'עריכת קטגוריה';
      if (nameInput) nameInput.value = section.name || '';
      if (slugInput) { slugInput.value = section.slug || ''; slugInput.dataset.manuallyEdited = '1'; }
      if (orderInput) orderInput.value = section.order || 10;
      if (activeInput) activeInput.checked = section.active !== false;
      if (editIdInput) editIdInput.value = section.id || '';
    } else {
      if (title) title.textContent = 'הוסף קטגוריה';
      if (nameInput) nameInput.value = '';
      if (slugInput) { slugInput.value = ''; delete slugInput.dataset.manuallyEdited; }
      if (orderInput) orderInput.value = '10';
      if (activeInput) activeInput.checked = true;
      if (editIdInput) editIdInput.value = '';
    }

    modal.style.display = 'flex';
  }

  function closeSectionModal() {
    var modal = document.getElementById('he-section-modal');
    if (modal) modal.style.display = 'none';
  }

  function handleSaveSection() {
    if (!db) return;

    var nameInput = document.getElementById('he-section-name');
    var slugInput = document.getElementById('he-section-slug');
    var orderInput = document.getElementById('he-section-order');
    var activeInput = document.getElementById('he-section-active');
    var editIdInput = document.getElementById('he-section-edit-id');

    var name = (nameInput ? nameInput.value : '').trim();
    var slug = (slugInput ? slugInput.value : '').trim();
    var order = parseInt(orderInput ? orderInput.value : '10', 10);
    var active = activeInput ? activeInput.checked : true;
    var editId = editIdInput ? editIdInput.value : '';

    if (!name || !slug) {
      alert('נא למלא שם ו-Slug.');
      return;
    }

    var data = {
      name: name,
      slug: slug,
      order: isNaN(order) ? 10 : order,
      active: active,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    var promise;
    if (editId) {
      promise = db.collection('he_sections').doc(editId).update(data);
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      promise = db.collection('he_sections').add(data);
    }

    promise
      .then(function () {
        closeSectionModal();
        loadSections();
        loadStats();
      })
      .catch(function (err) {
        alert('שגיאה בשמירה: ' + err.message);
      });
  }

  // ── Generation Logs ────────────────────────────────────────────────────────

  function loadGenerationLogs() {
    if (!db) return;
    var loading   = document.getElementById('he-logs-loading');
    var tableWrap = document.getElementById('he-logs-table-container');
    var emptyEl   = document.getElementById('he-logs-empty');
    var tbody     = document.getElementById('he-logs-tbody');
    var countBadge = document.getElementById('he-log-count');

    if (loading)   loading.classList.remove('d-none');
    if (tableWrap) tableWrap.classList.add('d-none');
    if (emptyEl)   emptyEl.classList.add('d-none');

    db.collection('schedulerLogs')
      .where('type', '==', 'hebrew')
      .orderBy('startedAt', 'desc')
      .limit(30)
      .get()
      .then(function (snap) {
        if (loading) loading.classList.add('d-none');
        if (countBadge) countBadge.textContent = snap.size + ' רשומות';

        if (snap.empty) {
          if (emptyEl) emptyEl.classList.remove('d-none');
          updateRunStats([]);
          return;
        }

        var logs = snap.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
        updateRunStats(logs);

        if (tbody) {
          tbody.innerHTML = logs.map(function (log) {
            var startedAt   = log.startedAt   ? log.startedAt.toDate()   : null;
            var completedAt = log.completedAt ? log.completedAt.toDate() : null;

            var timeStr = startedAt
              ? startedAt.toLocaleString('he-IL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
              : '—';

            var duration = (startedAt && completedAt)
              ? Math.round((completedAt - startedAt) / 1000) + 'ש\''
              : log.status === 'started'
                ? '<span class="text-warning">רץ...</span>'
                : '—';

            var statusBadge = {
              success: '<span class="badge bg-success">הצלחה</span>',
              error:   '<span class="badge bg-danger">שגיאה</span>',
              started: '<span class="badge bg-warning text-dark"><span class="spinner-border spinner-border-sm" style="width:.6rem;height:.6rem"></span> רץ</span>'
            }[log.status] || ('<span class="badge bg-secondary">' + escHtml(log.status) + '</span>');

            var triggerBadge = log.trigger === 'manual'
              ? '<span class="badge bg-warning text-dark"><i class="bi bi-hand-index me-1"></i>ידני</span>'
              : log.trigger === 'seed'
                ? '<span class="badge bg-info text-dark"><i class="bi bi-database me-1"></i>Seed</span>'
                : '<span class="badge bg-light text-dark border"><i class="bi bi-clock me-1"></i>מתוזמן</span>';

            var articlesHtml = '';
            if (Array.isArray(log.articles) && log.articles.length > 0) {
              articlesHtml = log.articles.map(function (a) {
                var href = a.slug ? '/he/ai/' + a.slug : '#';
                var titleLink = '<a href="' + href + '" target="_blank" class="d-block text-truncate" style="max-width:260px" title="' + escHtml(a.title) + '">' + escHtml(a.title) + '</a>';
                var sourcesLine = '';
                if (Array.isArray(a.sources) && a.sources.length > 0) {
                  var sourceLinks = a.sources.map(function (s) {
                    var name = escHtml(s.name || 'Source');
                    return s.url
                      ? '<a href="' + escHtml(s.url) + '" target="_blank" rel="noopener" class="text-decoration-none">' + name + '</a>'
                      : name;
                  }).join(' · ');
                  var conf = (a.coherenceConfidence != null) ? (' <span class="badge bg-success-subtle text-success border border-success-subtle ms-1" title="Coherence confidence">' + a.coherenceConfidence + '%</span>') : '';
                  sourcesLine = '<div class="small text-muted mt-1"><i class="bi bi-link-45deg me-1"></i>' + a.sources.length + ' מקורות: ' + sourceLinks + conf + '</div>';
                }
                return titleLink + sourcesLine;
              }).join('<hr class="my-2">');
            } else if (log.status === 'error') {
              articlesHtml = '<span class="text-danger small">' + escHtml((log.error || 'שגיאה לא ידועה').substring(0, 80)) + '</span>';
            } else {
              articlesHtml = '<span class="text-muted">—</span>';
            }

            return '<tr>' +
              '<td class="text-nowrap small">' + timeStr + '</td>' +
              '<td>' + triggerBadge + '</td>' +
              '<td>' + statusBadge + '</td>' +
              '<td class="small">' + articlesHtml + '</td>' +
              '<td class="text-muted small text-nowrap">' + duration + '</td>' +
              '</tr>';
          }).join('');
        }

        if (tableWrap) tableWrap.classList.remove('d-none');
      })
      .catch(function (err) {
        if (loading) loading.classList.add('d-none');
        if (emptyEl) {
          emptyEl.textContent = 'שגיאה בטעינת לוגים: ' + err.message;
          emptyEl.classList.remove('d-none');
        }
      });
  }

  function updateRunStats(logs) {
    var total    = logs.length;
    var success  = logs.filter(function (l) { return l.status === 'success'; }).length;
    var errors   = logs.filter(function (l) { return l.status === 'error'; }).length;
    var articles = logs.reduce(function (sum, l) { return sum + (Array.isArray(l.articles) ? l.articles.length : 0); }, 0);

    var t = document.getElementById('he-run-stat-total');
    var s = document.getElementById('he-run-stat-success');
    var e = document.getElementById('he-run-stat-errors');
    var a = document.getElementById('he-run-stat-articles');
    if (t) t.textContent = total;
    if (s) s.textContent = success;
    if (e) e.textContent = errors;
    if (a) a.textContent = articles;
  }

  // ── Manual Article Editor ──────────────────────────────────────────────────

  var _heQuill = null;

  function openHeArticleEditor(articleId) {
    if (!db) init();
    var panel = document.getElementById(containerId);
    if (!panel) return;
    var isEdit = !!articleId;

    panel.innerHTML = '<div class="section-container p-4 text-center" dir="rtl"><div class="spinner-border spinner-border-sm me-2"></div>טוען עורך...</div>';

    // Load sections + (if edit) the article in parallel
    var sectionsPromise = db.collection('he_sections').orderBy('order', 'asc').get();
    var articlePromise = isEdit
      ? db.collection('he_articles').doc(articleId).get()
      : Promise.resolve(null);

    Promise.all([sectionsPromise, articlePromise])
      .then(function (results) {
        var sectSnap = results[0];
        var artDoc = results[1];
        var article = { title: '', slug: '', excerpt: '', content: '', category: '',
                        tags: [], featuredImage: '', imageAltText: '', published: false };
        if (artDoc) {
          if (!artDoc.exists) throw new Error('הכתבה לא נמצאה');
          article = Object.assign(article, artDoc.data(), { id: artDoc.id });
        }

        var sectionsHtml = '<option value="">— בחר קטגוריה —</option>';
        sectSnap.forEach(function (d) {
          var s = d.data();
          if (s.active === false) return;
          sectionsHtml += '<option value="' + d.id + '"' +
            (article.category === d.id ? ' selected' : '') + '>' + escHtml(s.name || d.id) + '</option>';
        });

        var tagsValue = Array.isArray(article.tags) ? article.tags.join(', ') : '';
        var imgPreviewClass = article.featuredImage ? '' : ' d-none';

        panel.innerHTML =
          '<div class="section-container p-4" dir="rtl" style="text-align:right;">' +
            '<div class="d-flex justify-content-between align-items-center mb-4">' +
              '<h3 style="font-weight:700; margin:0;">' +
                '<i class="bi bi-' + (isEdit ? 'pencil-square' : 'plus-circle') + ' me-2"></i>' +
                (isEdit ? 'עריכת כתבה' : 'כתבה חדשה') +
              '</h3>' +
              '<button class="btn btn-outline-secondary btn-sm" id="he-editor-back-btn">' +
                '<i class="bi bi-arrow-right me-1"></i>חזרה לרשימה' +
              '</button>' +
            '</div>' +

            '<div class="row g-3">' +
              '<div class="col-lg-8">' +
                '<div class="card mb-3"><div class="card-body">' +
                  '<div class="mb-3">' +
                    '<label class="form-label fw-bold">כותרת <span class="text-danger">*</span></label>' +
                    '<input type="text" id="he-edit-title" class="form-control" dir="rtl" value="' + escHtml(article.title) + '">' +
                  '</div>' +
                  '<div class="mb-3">' +
                    '<label class="form-label fw-bold">Slug (אנגלית, לכתובת ה-URL)</label>' +
                    '<input type="text" id="he-edit-slug" class="form-control" dir="ltr" value="' + escHtml(article.slug) + '" placeholder="ai-news-today">' +
                    '<div class="form-text">יווצר אוטומטית מהכותרת אם יישאר ריק.</div>' +
                  '</div>' +
                  '<div class="mb-3">' +
                    '<label class="form-label fw-bold">תקציר</label>' +
                    '<textarea id="he-edit-excerpt" class="form-control" dir="rtl" rows="3">' + escHtml(article.excerpt) + '</textarea>' +
                  '</div>' +
                  '<div class="mb-3">' +
                    '<label class="form-label fw-bold">תוכן <span class="text-danger">*</span></label>' +
                    '<div id="he-edit-quill" style="min-height:380px; direction:rtl; text-align:right; background:#fff;"></div>' +
                  '</div>' +
                '</div></div>' +
              '</div>' +

              '<div class="col-lg-4">' +
                '<div class="card mb-3">' +
                  '<div class="card-header fw-bold">פרסום</div>' +
                  '<div class="card-body">' +
                    '<div class="form-check form-switch mb-3">' +
                      '<input type="checkbox" class="form-check-input" id="he-edit-published"' + (article.published ? ' checked' : '') + '>' +
                      '<label for="he-edit-published" class="form-check-label">פורסם (גלוי באתר)</label>' +
                    '</div>' +
                    '<div class="d-flex gap-2 flex-wrap">' +
                      '<button class="btn btn-primary btn-sm" id="he-edit-save-btn">' +
                        '<span class="spinner-border spinner-border-sm d-none me-1"></span>' +
                        '<i class="bi bi-save me-1"></i>' + (isEdit ? 'עדכן' : 'שמור') +
                      '</button>' +
                      '<button class="btn btn-outline-secondary btn-sm" id="he-edit-cancel-btn">ביטול</button>' +
                    '</div>' +
                    '<div id="he-edit-feedback" class="small mt-2"></div>' +
                  '</div>' +
                '</div>' +

                '<div class="card mb-3">' +
                  '<div class="card-header fw-bold">קטגוריה ותגיות</div>' +
                  '<div class="card-body">' +
                    '<div class="mb-3">' +
                      '<label class="form-label">קטגוריה</label>' +
                      '<select class="form-select form-select-sm" id="he-edit-category">' + sectionsHtml + '</select>' +
                    '</div>' +
                    '<div class="mb-2">' +
                      '<label class="form-label">תגיות</label>' +
                      '<input type="text" class="form-control form-control-sm" id="he-edit-tags" dir="rtl" value="' + escHtml(tagsValue) + '" placeholder="בינה מלאכותית, גוגל">' +
                      '<div class="form-text small">הפרדה בפסיקים</div>' +
                    '</div>' +
                  '</div>' +
                '</div>' +

                '<div class="card mb-3">' +
                  '<div class="card-header fw-bold">תמונה ראשית</div>' +
                  '<div class="card-body">' +
                    '<div id="he-edit-image-preview" class="mb-2 text-center' + imgPreviewClass + '">' +
                      '<img id="he-edit-image-img" src="' + escHtml(article.featuredImage || '') + '" alt="" class="img-fluid rounded" style="max-height:160px; border:1px solid #eee;">' +
                    '</div>' +
                    '<div class="input-group input-group-sm mb-2">' +
                      '<input type="text" class="form-control form-control-sm" id="he-edit-image-url" dir="ltr" value="' + escHtml(article.featuredImage || '') + '" placeholder="כתובת תמונה או העלה...">' +
                      '<button class="btn btn-outline-secondary" id="he-edit-upload-btn" title="העלה תמונה"><i class="bi bi-upload"></i><span class="spinner-border spinner-border-sm d-none ms-1"></span></button>' +
                      '<button class="btn btn-outline-danger" id="he-edit-remove-image-btn" title="הסר תמונה"' + (article.featuredImage ? '' : ' style="display:none;"') + '><i class="bi bi-x-lg"></i></button>' +
                    '</div>' +
                    '<input type="file" id="he-edit-image-file" style="display:none;" accept="image/*">' +
                    '<div>' +
                      '<label class="form-label small">טקסט חלופי (Alt)</label>' +
                      '<input type="text" class="form-control form-control-sm" id="he-edit-image-alt" dir="rtl" value="' + escHtml(article.imageAltText || '') + '">' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';

        // Init Quill (load lazily if needed)
        initHeQuill(article.content || '');

        // Bind events
        document.getElementById('he-editor-back-btn').addEventListener('click', confirmDiscardAndBack);
        document.getElementById('he-edit-cancel-btn').addEventListener('click', confirmDiscardAndBack);
        document.getElementById('he-edit-save-btn').addEventListener('click', function () {
          handleSaveHeArticle(isEdit ? articleId : null, this);
        });

        // Auto-slug from title (only if user hasn't typed in slug)
        var slugEl = document.getElementById('he-edit-slug');
        document.getElementById('he-edit-title').addEventListener('input', function () {
          if (!slugEl.dataset.touched && !isEdit) {
            slugEl.value = createSlugFromHebrew(this.value);
          }
        });
        slugEl.addEventListener('input', function () { slugEl.dataset.touched = '1'; });

        // Image URL change → live preview
        var imgUrlInput = document.getElementById('he-edit-image-url');
        imgUrlInput.addEventListener('input', function () {
          updateHeImagePreview(this.value);
        });

        // Upload button
        document.getElementById('he-edit-upload-btn').addEventListener('click', function () {
          document.getElementById('he-edit-image-file').click();
        });
        document.getElementById('he-edit-image-file').addEventListener('change', function (e) {
          if (e.target.files && e.target.files[0]) handleHeImageUpload(e.target.files[0]);
        });

        // Remove image
        document.getElementById('he-edit-remove-image-btn').addEventListener('click', function () {
          imgUrlInput.value = '';
          updateHeImagePreview('');
        });
      })
      .catch(function (err) {
        console.error('openHeArticleEditor error:', err);
        panel.innerHTML = '<div class="section-container p-4" dir="rtl">' +
          '<div class="alert alert-danger">שגיאה בטעינת העורך: ' + escHtml(err.message || String(err)) + '</div>' +
          '<button class="btn btn-secondary" onclick="window.loadHebrewSitePanel()">חזרה</button>' +
          '</div>';
      });
  }

  function confirmDiscardAndBack() {
    if (confirm('לחזור לרשימה? שינויים שלא נשמרו יאבדו.')) {
      _heQuill = null;
      if (typeof window.loadHebrewSitePanel === 'function') window.loadHebrewSitePanel();
    }
  }

  function initHeQuill(content) {
    function build() {
      try {
        _heQuill = new Quill('#he-edit-quill', {
          modules: {
            toolbar: [
              [{ 'header': [1, 2, 3, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              ['blockquote', 'code-block'],
              [{ 'list': 'ordered' }, { 'list': 'bullet' }],
              [{ 'direction': 'rtl' }, { 'align': [] }],
              ['link', 'image'],
              ['clean']
            ]
          },
          theme: 'snow',
          placeholder: 'כתוב כאן את גוף הכתבה...'
        });
        if (content) _heQuill.root.innerHTML = content;
        // Force RTL on editor body
        _heQuill.root.setAttribute('dir', 'rtl');
        _heQuill.root.style.textAlign = 'right';

        // Custom image handler — upload to Firebase Storage and embed
        var toolbar = _heQuill.getModule('toolbar');
        toolbar.addHandler('image', function () {
          var input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = function () {
            if (input.files && input.files[0]) uploadInlineHeImage(input.files[0]);
          };
          input.click();
        });
      } catch (err) {
        console.error('Quill init error:', err);
        var el = document.getElementById('he-edit-quill');
        if (el) el.innerHTML = '<div class="alert alert-danger">לא ניתן לטעון את העורך: ' + escHtml(err.message) + '</div>';
      }
    }

    if (typeof Quill === 'undefined') {
      // Lazy-load Quill assets
      if (!document.querySelector('link[href*="quill"]')) {
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdn.quilljs.com/1.3.6/quill.snow.css';
        document.head.appendChild(css);
      }
      var script = document.createElement('script');
      script.src = 'https://cdn.quilljs.com/1.3.6/quill.min.js';
      script.onload = build;
      script.onerror = function () {
        var el = document.getElementById('he-edit-quill');
        if (el) el.innerHTML = '<div class="alert alert-danger">לא ניתן לטעון את ספריית Quill.</div>';
      };
      document.head.appendChild(script);
    } else {
      build();
    }
  }

  function updateHeImagePreview(url) {
    var preview = document.getElementById('he-edit-image-preview');
    var img = document.getElementById('he-edit-image-img');
    var removeBtn = document.getElementById('he-edit-remove-image-btn');
    if (!preview || !img) return;
    if (url && url.trim()) {
      img.src = url;
      preview.classList.remove('d-none');
      if (removeBtn) removeBtn.style.display = '';
    } else {
      img.src = '';
      preview.classList.add('d-none');
      if (removeBtn) removeBtn.style.display = 'none';
    }
  }

  function handleHeImageUpload(file) {
    var btn = document.getElementById('he-edit-upload-btn');
    var spinner = btn ? btn.querySelector('.spinner-border') : null;
    if (btn) btn.disabled = true;
    if (spinner) spinner.classList.remove('d-none');
    var feedback = document.getElementById('he-edit-feedback');

    var storage = firebase.storage();
    var ref = storage.ref().child('article-images/he_' + Date.now() + '_' + file.name.replace(/[^\w.\-]+/g, '_'));
    ref.put(file)
      .then(function (snap) { return snap.ref.getDownloadURL(); })
      .then(function (url) {
        document.getElementById('he-edit-image-url').value = url;
        updateHeImagePreview(url);
        if (feedback) feedback.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>התמונה הועלתה.</span>';
      })
      .catch(function (err) {
        console.error('upload err:', err);
        if (feedback) feedback.innerHTML = '<span class="text-danger">שגיאה בהעלאת התמונה: ' + escHtml(err.message) + '</span>';
      })
      .finally(function () {
        if (btn) btn.disabled = false;
        if (spinner) spinner.classList.add('d-none');
      });
  }

  function uploadInlineHeImage(file) {
    if (!_heQuill) return;
    var range = _heQuill.getSelection(true);
    _heQuill.insertText(range.index, 'מעלה תמונה...', 'italic', true);
    var storage = firebase.storage();
    var ref = storage.ref().child('article-images/he_inline_' + Date.now() + '_' + file.name.replace(/[^\w.\-]+/g, '_'));
    ref.put(file)
      .then(function (snap) { return snap.ref.getDownloadURL(); })
      .then(function (url) {
        _heQuill.deleteText(range.index, 'מעלה תמונה...'.length);
        _heQuill.insertEmbed(range.index, 'image', url);
        _heQuill.setSelection(range.index + 1);
      })
      .catch(function (err) {
        console.error('inline upload err:', err);
        _heQuill.deleteText(range.index, 'מעלה תמונה...'.length);
        alert('שגיאה בהעלאת התמונה: ' + err.message);
      });
  }

  function createSlugFromHebrew(text) {
    if (!text) return '';
    // If text contains ASCII letters, slugify them; otherwise use timestamp suffix
    var ascii = (text.match(/[A-Za-z0-9\s\-]+/g) || []).join(' ').trim();
    if (ascii.length >= 3) {
      return ascii.toLowerCase().replace(/[^a-z0-9\s\-]/g, '').trim().replace(/\s+/g, '-').replace(/\-+/g, '-').substring(0, 80);
    }
    // Pure Hebrew → fallback to "he-article-<timestamp>"
    return 'he-article-' + Date.now();
  }

  function estimateHeReadingTime(html) {
    if (!html) return 1;
    var text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim();
    var words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }

  function handleSaveHeArticle(articleId, btn) {
    var feedback = document.getElementById('he-edit-feedback');
    var spinner = btn ? btn.querySelector('.spinner-border') : null;

    function fail(msg) {
      if (feedback) feedback.innerHTML = '<span class="text-danger">' + escHtml(msg) + '</span>';
      if (btn) btn.disabled = false;
      if (spinner) spinner.classList.add('d-none');
    }

    var title = (document.getElementById('he-edit-title').value || '').trim();
    var slugRaw = (document.getElementById('he-edit-slug').value || '').trim();
    var excerpt = (document.getElementById('he-edit-excerpt').value || '').trim();
    var category = document.getElementById('he-edit-category').value || '';
    var tagsRaw = (document.getElementById('he-edit-tags').value || '').trim();
    var featuredImage = (document.getElementById('he-edit-image-url').value || '').trim();
    var imageAltText = (document.getElementById('he-edit-image-alt').value || '').trim();
    var published = document.getElementById('he-edit-published').checked;
    var content = _heQuill ? _heQuill.root.innerHTML : '';
    var plainText = _heQuill ? _heQuill.getText().trim() : '';

    if (!title) return fail('הכותרת היא שדה חובה.');
    if (!plainText) return fail('תוכן הכתבה הוא שדה חובה.');

    var slug = slugRaw ? slugRaw.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/\-+/g, '-').replace(/^\-|\-$/g, '') : '';
    if (!slug) slug = createSlugFromHebrew(title);

    var tags = tagsRaw ? tagsRaw.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];

    if (btn) btn.disabled = true;
    if (spinner) spinner.classList.remove('d-none');
    if (feedback) feedback.innerHTML = '<span class="text-muted"><span class="spinner-border spinner-border-sm me-1"></span>שומר...</span>';

    var data = {
      title: title,
      slug: slug,
      excerpt: excerpt,
      content: content,
      category: category,
      tags: tags,
      featuredImage: featuredImage,
      imageAltText: imageAltText,
      published: published,
      readingTimeMinutes: estimateHeReadingTime(content),
      lang: 'he',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    var op;
    if (articleId) {
      op = db.collection('he_articles').doc(articleId).update(data);
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.manuallyCreated = true;
      op = db.collection('he_articles').add(data);
    }

    op.then(function () {
      if (feedback) feedback.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>נשמר. חוזר לרשימה...</span>';
      setTimeout(function () {
        _heQuill = null;
        if (typeof window.loadHebrewSitePanel === 'function') window.loadHebrewSitePanel();
      }, 700);
    }).catch(function (err) {
      console.error('save he article err:', err);
      fail('שגיאה בשמירה: ' + (err.message || String(err)));
    });
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return { render: render };
})();

// Global loader function called from sidebar
window.loadHebrewSitePanel = function () {
  var contentArea = document.getElementById('content-area');
  if (!contentArea) return;

  contentArea.innerHTML = '<div id="hebrew-site-container" class="section-container text-center p-5">טוען... <span class="spinner-border spinner-border-sm"></span></div>';

  if (window.HebrewSitePanel) {
    window.HebrewSitePanel.render('hebrew-site-container');
  } else {
    contentArea.innerHTML = '<div class="alert alert-danger">לא ניתן לטעון את לוח הניהול העברי.</div>';
  }
};
