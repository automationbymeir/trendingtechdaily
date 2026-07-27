/* design-systems.js – Design Systems Decoded admin panel
 *
 * Manages the `design_systems` Firestore collection and `design_system_reviews`
 * moderation. Provides manual triggers for seed / refresh-trending / daily
 * carousel / weekly reel callables, an inline CRUD table, and a reviews
 * moderation panel. Mirrors ai-tools.js.
 */

(function () {
  const TYPE_OPTIONS = [
    { value: 'corporate',   label: 'Corporate',    color: 'primary' },
    { value: 'open-source', label: 'Open Source',  color: 'success' },
    { value: 'government',  label: 'Government',   color: 'dark' },
    { value: 'community',   label: 'Community',    color: 'info' },
    { value: 'product',     label: 'Product',      color: 'warning' },
    { value: 'agency',      label: 'Agency',       color: 'secondary' },
  ];

  const YEAR_OPTIONS = (() => {
    const years = [];
    const now = new Date().getFullYear();
    for (let y = now; y >= 2000; y--) years.push(y);
    return years;
  })();

  const BEST_FOR_OPTIONS = [
    'web', 'mobile', 'enterprise', 'consumer', 'data-viz', 'forms',
    'marketing', 'docs', 'dashboards', 'accessibility', 'ai-products',
  ];

  // Module-level cache so the table can be filtered without re-reading
  let _systemsCache = [];
  let _topSystemsForReel = [];
  let _filterText = '';
  let _filterType = '';

  function escapeHtml(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(s) { return escapeHtml(s); }

  function typeBadge(type) {
    const t = TYPE_OPTIONS.find(o => o.value === type);
    if (!t) return `<span class="badge bg-secondary">${escapeHtml(type || '—')}</span>`;
    return `<span class="badge bg-${t.color}">${t.label}</span>`;
  }

  function loadDesignSystemsPanel() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `
      <div class="section-container">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h3><i class="bi bi-brush me-2"></i>Design Systems Decoded</h3>
          <button id="ds-refresh-btn" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-arrow-clockwise me-1"></i>Refresh
          </button>
        </div>

        <!-- Manual Triggers -->
        <div class="card border-success mb-4">
          <div class="card-header bg-success text-white">
            <i class="bi bi-play-circle me-2"></i>Manual Triggers
          </div>
          <div class="card-body d-flex flex-column gap-3">
            <div>
              <p class="mb-1"><strong>Seed Catalog</strong> — writes ~60 curated design systems to Firestore</p>
              <button id="ds-seed-btn" class="btn btn-success btn-sm">
                <i class="bi bi-database-add me-1"></i>Seed Catalog
              </button>
            </div>
            <div id="ds-seed-status" class="d-none alert alert-info py-2 mb-0"></div>

            <hr class="my-1">
            <div>
              <p class="mb-1"><strong>Refresh Trending Scores</strong> — recomputes <code>trendingScore</code> for every system</p>
              <button id="ds-refresh-trending-btn" class="btn btn-info btn-sm text-white">
                <i class="bi bi-graph-up-arrow me-1"></i>Refresh Trending Scores
              </button>
            </div>
            <div id="ds-refresh-trending-status" class="d-none alert alert-info py-2 mb-0"></div>

            <hr class="my-1">
            <div>
              <p class="mb-1"><strong>Daily Carousel</strong> — render the design-systems daily IG carousel</p>
              <div class="d-flex align-items-center gap-3 flex-wrap">
                <button id="ds-carousel-en-btn" class="btn btn-sm" style="background:#0F8BD9;color:#fff;border-color:#0F8BD9;">
                  <i class="bi bi-images me-1"></i>Render Carousel (EN)
                </button>
                <button id="ds-carousel-he-btn" class="btn btn-sm" style="background:#1f7a4e;color:#fff;border-color:#1f7a4e;">
                  <i class="bi bi-images me-1"></i>Render Carousel (HE)
                </button>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="ds-carousel-publish" checked>
                  <label class="form-check-label small" for="ds-carousel-publish">Publish to IG</label>
                </div>
              </div>
            </div>
            <div id="ds-carousel-status" class="d-none alert alert-info py-2 mb-0"></div>

            <hr class="my-1">
            <div>
              <p class="mb-1"><strong>Weekly Reel</strong> — render the design-systems weekly reel (optional specific system)</p>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <div class="d-flex align-items-center gap-2">
                  <button id="ds-reel-en-btn" class="btn btn-sm" style="background:#673AB7;color:#fff;border-color:#673AB7;">
                    <i class="bi bi-camera-reels me-1"></i>Render Reel (EN)
                  </button>
                  <select id="ds-reel-system-select" class="form-select form-select-sm" style="max-width:240px;">
                    <option value="">— Auto-pick top trending —</option>
                    <option value="" disabled>Loading top 30…</option>
                  </select>
                </div>
                <button id="ds-reel-he-btn" class="btn btn-sm" style="background:#9C27B0;color:#fff;border-color:#9C27B0;">
                  <i class="bi bi-camera-reels me-1"></i>Render Reel (HE)
                </button>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="ds-reel-publish">
                  <label class="form-check-label small" for="ds-reel-publish">Publish to YT + IG</label>
                </div>
              </div>
            </div>
            <div id="ds-reel-status" class="d-none alert alert-info py-2 mb-0"></div>
          </div>
        </div>

        <!-- Stats row -->
        <div class="row mb-4">
          <div class="col-md-3">
            <div class="card text-center border-0 bg-light">
              <div class="card-body py-3">
                <div class="fs-3 fw-bold text-primary" id="ds-stat-total">—</div>
                <div class="small text-muted">Total Systems</div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card text-center border-0 bg-light">
              <div class="card-body py-3">
                <div class="fs-3 fw-bold text-warning" id="ds-stat-featured">—</div>
                <div class="small text-muted">Featured</div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card text-center border-0 bg-light">
              <div class="card-body py-3">
                <div class="fs-3 fw-bold text-info" id="ds-stat-avg-score">—</div>
                <div class="small text-muted">Avg Trending Score</div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card text-center border-0 bg-light">
              <div class="card-body py-3">
                <div class="fs-6 fw-bold text-success" id="ds-stat-last-carousel">—</div>
                <div class="small text-muted">Last Carousel Run</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Systems table -->
        <div class="card mb-4">
          <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
            <strong><i class="bi bi-table me-2"></i>Design Systems</strong>
            <div class="d-flex gap-2 align-items-center flex-wrap">
              <input id="ds-search" type="search" class="form-control form-control-sm" placeholder="Search name, slug, company…" style="max-width:240px;">
              <select id="ds-type-filter" class="form-select form-select-sm" style="max-width:180px;">
                <option value="">All types</option>
                ${TYPE_OPTIONS.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
              </select>
              <span class="badge bg-secondary" id="ds-systems-count">Loading…</span>
            </div>
          </div>
          <div class="card-body p-0">
            <div id="ds-systems-loading" class="text-center py-4">
              <div class="spinner-border spinner-border-sm me-2"></div>Loading systems…
            </div>
            <div id="ds-systems-table-wrap" class="d-none table-responsive">
              <table class="table table-hover table-sm mb-0 align-middle">
                <thead class="table-light">
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Company</th>
                    <th>Year</th>
                    <th>Type</th>
                    <th class="text-end">Score</th>
                    <th class="text-center">Featured</th>
                    <th class="text-center">Published</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="ds-systems-tbody"></tbody>
              </table>
            </div>
            <div id="ds-systems-empty" class="d-none text-center text-muted py-4">
              <i class="bi bi-inbox fs-3 d-block mb-2"></i>No design systems yet. Click "Seed Catalog" above to populate.
            </div>
          </div>
        </div>

        <!-- Reviews moderation -->
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center" style="cursor:pointer;" id="ds-reviews-toggle">
            <strong><i class="bi bi-chat-left-text me-2"></i>Reviews Moderation</strong>
            <span>
              <span class="badge bg-danger me-2" id="ds-reviews-pending-badge">—</span>
              <i class="bi bi-chevron-down" id="ds-reviews-chevron"></i>
            </span>
          </div>
          <div class="card-body p-0 d-none" id="ds-reviews-body">
            <div id="ds-reviews-loading" class="text-center py-4">
              <div class="spinner-border spinner-border-sm me-2"></div>Loading reviews…
            </div>
            <div id="ds-reviews-list" class="d-none"></div>
            <div id="ds-reviews-empty" class="d-none text-center text-muted py-4">
              <i class="bi bi-check2-circle fs-3 d-block mb-2"></i>No reviews awaiting moderation.
            </div>
          </div>
        </div>
      </div>
    `;

    // Wire triggers
    document.getElementById('ds-refresh-btn').addEventListener('click', () => {
      loadSystems();
      loadStats();
      loadTopSystemsForReel();
    });
    document.getElementById('ds-seed-btn').addEventListener('click', seedCatalog);
    document.getElementById('ds-refresh-trending-btn').addEventListener('click', refreshTrending);
    document.getElementById('ds-carousel-en-btn').addEventListener('click', () => triggerCarousel('en'));
    document.getElementById('ds-carousel-he-btn').addEventListener('click', () => triggerCarousel('he'));
    document.getElementById('ds-reel-en-btn').addEventListener('click', () => triggerReel('en'));
    document.getElementById('ds-reel-he-btn').addEventListener('click', () => triggerReel('he'));

    // Filters
    document.getElementById('ds-search').addEventListener('input', (e) => {
      _filterText = e.target.value.toLowerCase().trim();
      renderSystemsTable();
    });
    document.getElementById('ds-type-filter').addEventListener('change', (e) => {
      _filterType = e.target.value;
      renderSystemsTable();
    });

    // Reviews collapse
    document.getElementById('ds-reviews-toggle').addEventListener('click', () => {
      const body = document.getElementById('ds-reviews-body');
      const chevron = document.getElementById('ds-reviews-chevron');
      const opening = body.classList.contains('d-none');
      body.classList.toggle('d-none');
      chevron.classList.toggle('bi-chevron-down');
      chevron.classList.toggle('bi-chevron-up');
      if (opening) loadPendingReviews();
    });

    loadSystems();
    loadStats();
    loadTopSystemsForReel();
  }

  // ─── Firestore helpers ────────────────────────────────────────────────────
  function fsDb() {
    return window.adminDb || (typeof db !== 'undefined' ? db : firebase.firestore());
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
  function loadStats() {
    const dbi = fsDb();
    dbi.collection('design_systems').get().then((snap) => {
      let featured = 0;
      let scoreSum = 0;
      let scoreCount = 0;
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.featured) featured++;
        if (typeof d.trendingScore === 'number') {
          scoreSum += d.trendingScore;
          scoreCount++;
        }
      });
      document.getElementById('ds-stat-total').textContent = snap.size;
      document.getElementById('ds-stat-featured').textContent = featured;
      document.getElementById('ds-stat-avg-score').textContent =
        scoreCount > 0 ? (scoreSum / scoreCount).toFixed(1) : '—';
    }).catch((err) => {
      console.error('[design-systems] stats error', err);
    });

    dbi.collection('schedulerLogs')
      .where('type', '==', 'design_systems_carousel')
      .orderBy('startedAt', 'desc')
      .limit(1)
      .get()
      .then((snap) => {
        const el = document.getElementById('ds-stat-last-carousel');
        if (!el) return;
        if (snap.empty) {
          el.textContent = '—';
          return;
        }
        const log = snap.docs[0].data();
        const t = log.startedAt && log.startedAt.toDate ? log.startedAt.toDate() : null;
        el.textContent = t
          ? t.toLocaleString('en-IL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
          : '—';
      })
      .catch((err) => console.error('[design-systems] last-carousel err', err));

    dbi.collection('design_system_reviews').where('approved', '==', false).get().then((snap) => {
      const badge = document.getElementById('ds-reviews-pending-badge');
      if (badge) badge.textContent = snap.size;
    }).catch((err) => {
      console.error('[design-systems] pending reviews count error', err);
    });
  }

  // ─── Top-30 for reel picker ───────────────────────────────────────────────
  function loadTopSystemsForReel() {
    const sel = document.getElementById('ds-reel-system-select');
    if (!sel) return;
    fsDb().collection('design_systems')
      .orderBy('trendingScore', 'desc')
      .limit(30)
      .get()
      .then((snap) => {
        _topSystemsForReel = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const opts = ['<option value="">— Auto-pick top trending —</option>']
          .concat(_topSystemsForReel.map((s) =>
            `<option value="${escapeAttr(s.slug || s.id)}">${escapeHtml(s.name || s.id)}${s.company ? ' · ' + escapeHtml(s.company) : ''}</option>`
          ));
        sel.innerHTML = opts.join('');
      })
      .catch((err) => {
        sel.innerHTML = `<option value="">Error: ${escapeHtml(err.message)}</option>`;
      });
  }

  // ─── Systems list ─────────────────────────────────────────────────────────
  function loadSystems() {
    const dbi = fsDb();
    const loadingEl = document.getElementById('ds-systems-loading');
    const wrap = document.getElementById('ds-systems-table-wrap');
    const empty = document.getElementById('ds-systems-empty');
    const countBadge = document.getElementById('ds-systems-count');

    loadingEl.classList.remove('d-none');
    wrap.classList.add('d-none');
    empty.classList.add('d-none');

    dbi.collection('design_systems')
      .orderBy('trendingScore', 'desc')
      .get()
      .then((snap) => {
        loadingEl.classList.add('d-none');
        countBadge.textContent = `${snap.size} systems`;

        if (snap.empty) {
          _systemsCache = [];
          empty.classList.remove('d-none');
          return;
        }

        _systemsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        wrap.classList.remove('d-none');
        renderSystemsTable();
      })
      .catch((err) => {
        loadingEl.classList.add('d-none');
        empty.textContent = 'Error loading systems: ' + err.message;
        empty.classList.remove('d-none');
      });
  }

  function renderSystemsTable() {
    const tbody = document.getElementById('ds-systems-tbody');
    if (!tbody) return;

    const filtered = _systemsCache.filter((s) => {
      if (_filterType && s.type !== _filterType) return false;
      if (_filterText) {
        const hay = `${s.name || ''} ${s.slug || s.id || ''} ${s.company || ''}`.toLowerCase();
        if (!hay.includes(_filterText)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">No matches.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((s) => {
      const primary = s.primaryColor || '#e9ecef';
      const secondary = s.secondaryColor || '#adb5bd';
      const swatch = `<div class="d-inline-flex align-items-center justify-content-center" style="width:32px;height:32px;border-radius:6px;border:1px solid #dee2e6;background:linear-gradient(135deg, ${escapeAttr(primary)} 0%, ${escapeAttr(primary)} 50%, ${escapeAttr(secondary)} 50%, ${escapeAttr(secondary)} 100%);"></div>`;
      const homepage = s.homepage
        ? `<div class="small"><a href="${escapeAttr(s.homepage)}" target="_blank" rel="noopener">${escapeHtml(s.homepage)}</a></div>`
        : '';
      const score = typeof s.trendingScore === 'number' ? s.trendingScore.toFixed(1) : '—';
      const featuredIcon = s.featured ? 'bi-star-fill text-warning' : 'bi-star text-muted';
      const publishedClass = s.published ? 'btn-success' : 'btn-outline-secondary';
      const publishedLabel = s.published ? 'Published' : 'Draft';
      return `<tr data-id="${escapeAttr(s.id)}">
        <td>${swatch}</td>
        <td>
          <strong>${escapeHtml(s.name || s.id)}</strong>
          <div class="text-muted small"><code>${escapeHtml(s.slug || s.id)}</code></div>
          ${homepage}
        </td>
        <td class="small">${escapeHtml(s.company || '—')}</td>
        <td class="small">${escapeHtml(s.year || '—')}</td>
        <td>${typeBadge(s.type)}</td>
        <td class="text-end fw-bold">${score}</td>
        <td class="text-center">
          <button class="btn btn-link p-0 ds-featured-toggle" data-id="${escapeAttr(s.id)}" title="Toggle featured">
            <i class="bi ${featuredIcon} fs-5"></i>
          </button>
        </td>
        <td class="text-center">
          <button class="btn btn-sm ${publishedClass} ds-published-toggle" data-id="${escapeAttr(s.id)}">
            ${publishedLabel}
          </button>
        </td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-outline-primary ds-edit-btn" data-id="${escapeAttr(s.id)}" title="Edit">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger ds-delete-btn" data-id="${escapeAttr(s.id)}" data-name="${escapeAttr(s.name || s.id)}" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.ds-featured-toggle').forEach((btn) => {
      btn.addEventListener('click', () => toggleField(btn.dataset.id, 'featured', btn));
    });
    tbody.querySelectorAll('.ds-published-toggle').forEach((btn) => {
      btn.addEventListener('click', () => toggleField(btn.dataset.id, 'published', btn));
    });
    tbody.querySelectorAll('.ds-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    tbody.querySelectorAll('.ds-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteSystem(btn.dataset.id, btn.dataset.name));
    });
  }

  // ─── Inline-save toggles (optimistic) ─────────────────────────────────────
  function toggleField(id, field) {
    const sys = _systemsCache.find((s) => s.id === id);
    if (!sys) return;
    const prev = !!sys[field];
    const next = !prev;
    sys[field] = next;
    renderSystemsTable();

    fsDb().collection('design_systems').doc(id).update({
      [field]: next,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).then(() => {
      loadStats();
    }).catch((err) => {
      sys[field] = prev;
      renderSystemsTable();
      alert(`Failed to update ${field}: ${err.message}`);
    });
  }

  function deleteSystem(id, name) {
    if (!confirm(`Delete design system "${name}"? This cannot be undone.`)) return;
    fsDb().collection('design_systems').doc(id).delete()
      .then(() => {
        _systemsCache = _systemsCache.filter((s) => s.id !== id);
        renderSystemsTable();
        loadStats();
      })
      .catch((err) => alert('Delete failed: ' + err.message));
  }

  // ─── Edit modal ───────────────────────────────────────────────────────────
  function openEditModal(id) {
    const sys = _systemsCache.find((s) => s.id === id);
    if (!sys) return;

    const existing = document.getElementById('dsEditModal');
    if (existing) existing.remove();

    const typeOpts = TYPE_OPTIONS.map((o) =>
      `<option value="${o.value}" ${sys.type === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    const yearOpts = YEAR_OPTIONS.map((y) =>
      `<option value="${y}" ${String(sys.year) === String(y) ? 'selected' : ''}>${y}</option>`
    ).join('');
    const bestForChecks = BEST_FOR_OPTIONS.map((bf) => {
      const checked = Array.isArray(sys.bestFor) && sys.bestFor.includes(bf) ? 'checked' : '';
      const safeId = 'ds-edit-bestfor-' + bf.replace(/[^a-z0-9]/gi, '');
      return `<div class="form-check form-check-inline">
        <input class="form-check-input ds-edit-bestfor-chk" type="checkbox" value="${escapeAttr(bf)}" id="${safeId}" ${checked}>
        <label class="form-check-label small" for="${safeId}">${escapeHtml(bf)}</label>
      </div>`;
    }).join('');

    const tagsStr = Array.isArray(sys.tags) ? sys.tags.join(', ') : '';

    const html = `
      <div class="modal fade" id="dsEditModal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-pencil me-2"></i>Edit System: ${escapeHtml(sys.name || sys.id)}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">Name</label>
                  <input type="text" id="ds-edit-name" class="form-control" value="${escapeAttr(sys.name || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Slug <small class="text-muted">(doc id — read-only)</small></label>
                  <input type="text" class="form-control" value="${escapeAttr(sys.slug || sys.id)}" readonly>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Company</label>
                  <input type="text" id="ds-edit-company" class="form-control" value="${escapeAttr(sys.company || '')}">
                </div>
                <div class="col-md-3">
                  <label class="form-label">Year</label>
                  <select id="ds-edit-year" class="form-select"><option value="">—</option>${yearOpts}</select>
                </div>
                <div class="col-md-3">
                  <label class="form-label">Type</label>
                  <select id="ds-edit-type" class="form-select"><option value="">—</option>${typeOpts}</select>
                </div>
                <div class="col-md-3">
                  <label class="form-label">Primary Color</label>
                  <div class="d-flex gap-1">
                    <input type="color" id="ds-edit-primaryColor" class="form-control form-control-color" value="${escapeAttr(sys.primaryColor || '#000000')}">
                    <input type="text" id="ds-edit-primaryColor-text" class="form-control" value="${escapeAttr(sys.primaryColor || '')}">
                  </div>
                </div>
                <div class="col-md-3">
                  <label class="form-label">Secondary Color</label>
                  <div class="d-flex gap-1">
                    <input type="color" id="ds-edit-secondaryColor" class="form-control form-control-color" value="${escapeAttr(sys.secondaryColor || '#000000')}">
                    <input type="text" id="ds-edit-secondaryColor-text" class="form-control" value="${escapeAttr(sys.secondaryColor || '')}">
                  </div>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Font Stack</label>
                  <input type="text" id="ds-edit-fontStack" class="form-control" value="${escapeAttr(sys.fontStack || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Homepage URL</label>
                  <input type="url" id="ds-edit-homepage" class="form-control" value="${escapeAttr(sys.homepage || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Repo URL</label>
                  <input type="url" id="ds-edit-repoUrl" class="form-control" value="${escapeAttr(sys.repoUrl || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Figma URL</label>
                  <input type="url" id="ds-edit-figmaUrl" class="form-control" value="${escapeAttr(sys.figmaUrl || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Icon URL</label>
                  <input type="url" id="ds-edit-iconUrl" class="form-control" value="${escapeAttr(sys.iconUrl || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Short Description (EN)</label>
                  <input type="text" id="ds-edit-shortDesc_en" class="form-control" value="${escapeAttr(sys.shortDesc_en || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">תיאור קצר (HE)</label>
                  <input type="text" id="ds-edit-shortDesc_he" class="form-control text-end" dir="rtl" value="${escapeAttr(sys.shortDesc_he || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Philosophy (EN)</label>
                  <textarea id="ds-edit-philosophy_en" class="form-control" rows="3">${escapeHtml(sys.philosophy_en || '')}</textarea>
                </div>
                <div class="col-md-6">
                  <label class="form-label">פילוסופיה (HE)</label>
                  <textarea id="ds-edit-philosophy_he" class="form-control text-end" dir="rtl" rows="3">${escapeHtml(sys.philosophy_he || '')}</textarea>
                </div>
                <div class="col-12">
                  <label class="form-label">Claude's Take <small class="text-muted">(override Gemini-generated text)</small></label>
                  <textarea id="ds-edit-claudeTake" class="form-control" rows="3">${escapeHtml(sys.claudeTake || '')}</textarea>
                  <div class="form-text">By: ${escapeHtml(sys.claudeTakeBy || '—')}</div>
                </div>
                <div class="col-12">
                  <label class="form-label">Best For</label>
                  <div>${bestForChecks}</div>
                </div>
                <div class="col-12">
                  <label class="form-label">Tags <small class="text-muted">(comma-separated)</small></label>
                  <input type="text" id="ds-edit-tags" class="form-control" value="${escapeAttr(tagsStr)}">
                </div>
                <div class="col-md-3">
                  <label class="form-label">Trending Score</label>
                  <input type="number" step="0.1" id="ds-edit-trendingScore" class="form-control" value="${sys.trendingScore != null ? sys.trendingScore : 0}">
                </div>
                <div class="col-md-9 d-flex align-items-end flex-wrap gap-3">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="ds-edit-hasComponents" ${sys.hasComponents ? 'checked' : ''}>
                    <label class="form-check-label" for="ds-edit-hasComponents">Components</label>
                  </div>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="ds-edit-hasFigma" ${sys.hasFigma ? 'checked' : ''}>
                    <label class="form-check-label" for="ds-edit-hasFigma">Figma</label>
                  </div>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="ds-edit-hasOpenSource" ${sys.hasOpenSource ? 'checked' : ''}>
                    <label class="form-check-label" for="ds-edit-hasOpenSource">Open Source</label>
                  </div>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="ds-edit-hasVoiceTone" ${sys.hasVoiceTone ? 'checked' : ''}>
                    <label class="form-check-label" for="ds-edit-hasVoiceTone">Voice &amp; Tone</label>
                  </div>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="ds-edit-featured" ${sys.featured ? 'checked' : ''}>
                    <label class="form-check-label" for="ds-edit-featured">Featured</label>
                  </div>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="ds-edit-published" ${sys.published ? 'checked' : ''}>
                    <label class="form-check-label" for="ds-edit-published">Published</label>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="ds-edit-save-btn">
                <i class="bi bi-save me-1"></i>Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const modalEl = document.getElementById('dsEditModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // Sync color pickers <-> text inputs
    const syncColor = (colorId, textId) => {
      const c = document.getElementById(colorId);
      const t = document.getElementById(textId);
      c.addEventListener('input', () => { t.value = c.value; });
      t.addEventListener('input', () => {
        if (/^#[0-9a-f]{6}$/i.test(t.value)) c.value = t.value;
      });
    };
    syncColor('ds-edit-primaryColor', 'ds-edit-primaryColor-text');
    syncColor('ds-edit-secondaryColor', 'ds-edit-secondaryColor-text');

    document.getElementById('ds-edit-save-btn').addEventListener('click', () => {
      const saveBtn = document.getElementById('ds-edit-save-btn');
      const originalHtml = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving…';

      const parseList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
      const bestFor = Array.from(document.querySelectorAll('.ds-edit-bestfor-chk:checked')).map(cb => cb.value);

      const yearRaw = document.getElementById('ds-edit-year').value;
      const primaryTextRaw = document.getElementById('ds-edit-primaryColor-text').value.trim();
      const secondaryTextRaw = document.getElementById('ds-edit-secondaryColor-text').value.trim();

      const payload = {
        name: document.getElementById('ds-edit-name').value.trim(),
        company: document.getElementById('ds-edit-company').value.trim(),
        year: yearRaw ? parseInt(yearRaw, 10) : null,
        type: document.getElementById('ds-edit-type').value || null,
        primaryColor: primaryTextRaw || document.getElementById('ds-edit-primaryColor').value,
        secondaryColor: secondaryTextRaw || document.getElementById('ds-edit-secondaryColor').value,
        fontStack: document.getElementById('ds-edit-fontStack').value.trim(),
        homepage: document.getElementById('ds-edit-homepage').value.trim(),
        repoUrl: document.getElementById('ds-edit-repoUrl').value.trim(),
        figmaUrl: document.getElementById('ds-edit-figmaUrl').value.trim(),
        iconUrl: document.getElementById('ds-edit-iconUrl').value.trim(),
        shortDesc_en: document.getElementById('ds-edit-shortDesc_en').value.trim(),
        shortDesc_he: document.getElementById('ds-edit-shortDesc_he').value.trim(),
        philosophy_en: document.getElementById('ds-edit-philosophy_en').value,
        philosophy_he: document.getElementById('ds-edit-philosophy_he').value,
        claudeTake: document.getElementById('ds-edit-claudeTake').value,
        bestFor: bestFor,
        tags: parseList(document.getElementById('ds-edit-tags').value),
        hasComponents: document.getElementById('ds-edit-hasComponents').checked,
        hasFigma: document.getElementById('ds-edit-hasFigma').checked,
        hasOpenSource: document.getElementById('ds-edit-hasOpenSource').checked,
        hasVoiceTone: document.getElementById('ds-edit-hasVoiceTone').checked,
        trendingScore: parseFloat(document.getElementById('ds-edit-trendingScore').value) || 0,
        featured: document.getElementById('ds-edit-featured').checked,
        published: document.getElementById('ds-edit-published').checked,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      if (payload.claudeTake && payload.claudeTake !== (sys.claudeTake || '')) {
        payload.claudeTakeBy = 'admin';
      }

      fsDb().collection('design_systems').doc(id).update(payload)
        .then(() => {
          modal.hide();
          loadSystems();
          loadStats();
        })
        .catch((err) => {
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalHtml;
          alert('Save failed: ' + err.message);
        });
    });

    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
  }

  // ─── Manual triggers ──────────────────────────────────────────────────────
  async function seedCatalog() {
    if (!confirm('This will write ~60 design systems to Firestore. Continue?')) return;
    const btn = document.getElementById('ds-seed-btn');
    const statusEl = document.getElementById('ds-seed-status');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Seeding…';
    statusEl.className = 'alert alert-info py-2 mb-0';
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Writing ~60 design systems… this can take 3–8 minutes.';
    statusEl.classList.remove('d-none');

    try {
      const fn = firebase.functions().httpsCallable('seedDesignSystems', { timeout: 540000 });
      const res = await fn({});
      const data = (res && res.data) || {};
      statusEl.className = 'alert alert-success py-2 mb-0';
      const count = data.count != null ? data.count : (data.written != null ? data.written : null);
      statusEl.innerHTML = `<i class="bi bi-check-circle me-1"></i>Catalog seeded${count != null ? ` — ${count} systems written` : ''}.`;
      loadSystems();
      loadStats();
      loadTopSystemsForReel();
    } catch (err) {
      const isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
      if (isTimeout) {
        statusEl.className = 'alert alert-warning py-2 mb-0';
        statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Still running in background — refresh the table in ~2 minutes.';
      } else {
        statusEl.className = 'alert alert-danger py-2 mb-0';
        statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${escapeHtml(err.message)}`;
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  async function refreshTrending() {
    const btn = document.getElementById('ds-refresh-trending-btn');
    const statusEl = document.getElementById('ds-refresh-trending-status');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Refreshing…';
    statusEl.className = 'alert alert-info py-2 mb-0';
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Recomputing trending scores…';
    statusEl.classList.remove('d-none');

    try {
      const fn = firebase.functions().httpsCallable('refreshDesignSystemsTrending', { timeout: 300000 });
      const res = await fn({});
      const data = (res && res.data) || {};
      const updated = data.updated != null ? data.updated : (data.count != null ? data.count : '?');
      statusEl.className = 'alert alert-success py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-check-circle me-1"></i>Updated ${updated} systems.`;
      loadSystems();
      loadStats();
    } catch (err) {
      statusEl.className = 'alert alert-danger py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${escapeHtml(err.message)}`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  async function triggerCarousel(language) {
    const btnId = language === 'he' ? 'ds-carousel-he-btn' : 'ds-carousel-en-btn';
    const btn = document.getElementById(btnId);
    const otherBtn = document.getElementById(language === 'he' ? 'ds-carousel-en-btn' : 'ds-carousel-he-btn');
    const statusEl = document.getElementById('ds-carousel-status');
    const originalHtml = btn.innerHTML;
    const autoPublish = !!(document.getElementById('ds-carousel-publish') || {}).checked;

    btn.disabled = true;
    if (otherBtn) otherBtn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Rendering…';
    statusEl.className = 'alert alert-info py-2 mb-0';
    statusEl.innerHTML = `<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Building design-systems carousel (${language.toUpperCase()})… ${autoPublish ? 'will publish to IG when ready' : 'render only'}.`;
    statusEl.classList.remove('d-none');

    try {
      const fn = firebase.functions().httpsCallable('triggerDesignSystemsCarousel', { timeout: 540000 });
      const res = await fn({ language, autoPublish });
      const data = (res && res.data) || {};
      statusEl.className = 'alert alert-success py-2 mb-0';
      const systems = (data.systemSlugs || data.toolSlugs || []).join(', ');
      let extra = '';
      if (data.instagramUrl) extra = ` · <a href="${data.instagramUrl}" target="_blank" class="alert-link">View on Instagram</a>`;
      statusEl.innerHTML = `<i class="bi bi-check-circle me-1"></i>Carousel ready${data.slideUrls ? ` (${data.slideUrls.length} slides)` : ''}${systems ? ` — featured: ${escapeHtml(systems)}` : ''}${extra}`;
      loadStats();
    } catch (err) {
      const isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
      if (isTimeout) {
        statusEl.className = 'alert alert-warning py-2 mb-0';
        statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Still running in background — check logs in ~1 minute.';
      } else {
        statusEl.className = 'alert alert-danger py-2 mb-0';
        statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${escapeHtml(err.message)}`;
      }
    } finally {
      btn.disabled = false;
      if (otherBtn) otherBtn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  async function triggerReel(language) {
    const btnId = language === 'he' ? 'ds-reel-he-btn' : 'ds-reel-en-btn';
    const btn = document.getElementById(btnId);
    const otherBtn = document.getElementById(language === 'he' ? 'ds-reel-en-btn' : 'ds-reel-he-btn');
    const statusEl = document.getElementById('ds-reel-status');
    const originalHtml = btn.innerHTML;
    const autoPublish = !!(document.getElementById('ds-reel-publish') || {}).checked;
    const sysSelect = document.getElementById('ds-reel-system-select');
    const designSystemSlug = (language === 'en' && sysSelect) ? sysSelect.value : '';

    btn.disabled = true;
    if (otherBtn) otherBtn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Rendering…';
    statusEl.className = 'alert alert-info py-2 mb-0';
    statusEl.innerHTML = `<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Rendering weekly reel (${language.toUpperCase()})${designSystemSlug ? ` for ${escapeHtml(designSystemSlug)}` : ''}… ~8–12 minutes. ${autoPublish ? 'Will publish to YT + IG.' : 'Render only.'}`;
    statusEl.classList.remove('d-none');

    try {
      const fn = firebase.functions().httpsCallable('triggerDesignSystemsReel', { timeout: 540000 });
      const payload = { language, autoPublish };
      if (designSystemSlug) payload.designSystemSlug = designSystemSlug;
      const res = await fn(payload);
      const data = (res && res.data) || {};
      statusEl.className = 'alert alert-success py-2 mb-0';
      let extra = '';
      if (data.publish) {
        if (data.publish.youtubeUrl)   extra += ` · <a href="${data.publish.youtubeUrl}" target="_blank" class="alert-link">YouTube</a>`;
        if (data.publish.instagramUrl) extra += ` · <a href="${data.publish.instagramUrl}" target="_blank" class="alert-link">Instagram</a>`;
      }
      statusEl.innerHTML = data.videoUrl
        ? `<i class="bi bi-check-circle me-1"></i>Reel ready — <a href="${data.videoUrl}" target="_blank" class="alert-link">view MP4</a>${extra}`
        : `<i class="bi bi-check-circle me-1"></i>Reel run complete (${language.toUpperCase()})${extra}`;
    } catch (err) {
      const isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
      if (isTimeout) {
        statusEl.className = 'alert alert-warning py-2 mb-0';
        statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Still rendering — MP4 will appear shortly.';
      } else {
        statusEl.className = 'alert alert-danger py-2 mb-0';
        statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${escapeHtml(err.message)}`;
      }
    } finally {
      btn.disabled = false;
      if (otherBtn) otherBtn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  // ─── Reviews moderation ───────────────────────────────────────────────────
  function loadPendingReviews() {
    const dbi = fsDb();
    const loadingEl = document.getElementById('ds-reviews-loading');
    const listEl = document.getElementById('ds-reviews-list');
    const emptyEl = document.getElementById('ds-reviews-empty');

    loadingEl.classList.remove('d-none');
    listEl.classList.add('d-none');
    emptyEl.classList.add('d-none');

    dbi.collection('design_system_reviews')
      .where('approved', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get()
      .then(async (snap) => {
        loadingEl.classList.add('d-none');
        if (snap.empty) {
          emptyEl.classList.remove('d-none');
          return;
        }

        // Resolve system names
        const sysIds = Array.from(new Set(snap.docs.map((d) => d.data().designSystemId || d.data().systemId || d.data().toolId).filter(Boolean)));
        const sysNames = {};
        for (const sid of sysIds) {
          const cached = _systemsCache.find((t) => t.id === sid || t.slug === sid);
          if (cached) {
            sysNames[sid] = cached.name || sid;
          } else {
            try {
              const doc = await dbi.collection('design_systems').doc(sid).get();
              sysNames[sid] = doc.exists ? (doc.data().name || sid) : sid;
            } catch (_) {
              sysNames[sid] = sid;
            }
          }
        }

        const rows = snap.docs.map((doc) => {
          const r = doc.data();
          const sysId = r.designSystemId || r.systemId || r.toolId;
          const rating = Math.max(0, Math.min(5, parseInt(r.rating) || 0));
          const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
          const dateStr = r.createdAt && r.createdAt.toDate
            ? r.createdAt.toDate().toLocaleString()
            : '—';
          return `<div class="border-bottom p-3" data-review-id="${escapeAttr(doc.id)}">
            <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
              <div>
                <strong>${escapeHtml(sysNames[sysId] || sysId || '—')}</strong>
                <span class="text-warning ms-2">${stars}</span>
                <span class="badge bg-light text-dark ms-2">${escapeHtml(r.userId || 'anon')}</span>
                <div class="small text-muted">${escapeHtml(dateStr)}</div>
              </div>
              <div class="d-flex gap-2">
                <button class="btn btn-sm btn-success ds-review-approve" data-id="${escapeAttr(doc.id)}">
                  <i class="bi bi-check-lg me-1"></i>Approve
                </button>
                <button class="btn btn-sm btn-outline-danger ds-review-reject" data-id="${escapeAttr(doc.id)}">
                  <i class="bi bi-x-lg me-1"></i>Reject
                </button>
              </div>
            </div>
            <div class="text-body">${escapeHtml(r.comment || '')}</div>
          </div>`;
        }).join('');

        listEl.innerHTML = rows;
        listEl.classList.remove('d-none');

        listEl.querySelectorAll('.ds-review-approve').forEach((btn) => {
          btn.addEventListener('click', () => approveReview(btn.dataset.id));
        });
        listEl.querySelectorAll('.ds-review-reject').forEach((btn) => {
          btn.addEventListener('click', () => rejectReview(btn.dataset.id));
        });
      })
      .catch((err) => {
        loadingEl.classList.add('d-none');
        emptyEl.textContent = 'Error loading reviews: ' + err.message;
        emptyEl.classList.remove('d-none');
      });
  }

  function approveReview(id) {
    fsDb().collection('design_system_reviews').doc(id).update({
      approved: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).then(() => {
      const row = document.querySelector(`[data-review-id="${id}"]`);
      if (row) row.remove();
      loadStats();
    }).catch((err) => alert('Approve failed: ' + err.message));
  }

  function rejectReview(id) {
    if (!confirm('Reject and delete this review?')) return;
    fsDb().collection('design_system_reviews').doc(id).delete()
      .then(() => {
        const row = document.querySelector(`[data-review-id="${id}"]`);
        if (row) row.remove();
        loadStats();
      })
      .catch((err) => alert('Reject failed: ' + err.message));
  }

  // Export
  window.loadDesignSystemsPanel = loadDesignSystemsPanel;
})();
