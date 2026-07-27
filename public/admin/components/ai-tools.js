/* ai-tools.js – AI Tools Directory admin panel
 *
 * Manages the `ai_tools` Firestore collection and `ai_tool_reviews` moderation.
 * Provides manual triggers for seed/refresh/launch-video callables, an inline
 * CRUD table, and a reviews moderation panel.
 */

(function () {
  const TYPE_OPTIONS = [
    { value: 'claude-skill',     label: 'Claude Skill',     color: 'primary' },
    { value: 'mcp-connector',    label: 'MCP Connector',    color: 'info' },
    { value: 'github-repo',      label: 'GitHub Repo',      color: 'dark' },
    { value: 'llm-product',      label: 'LLM Product',      color: 'success' },
    { value: 'agent-framework',  label: 'Agent Framework',  color: 'warning' },
  ];

  const PRICING_OPTIONS = ['free', 'freemium', 'paid', 'open-source'];

  // Module-level cache of tools so the table can be filtered without re-reading
  let _toolsCache = [];
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

  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function typeBadge(type) {
    const t = TYPE_OPTIONS.find(o => o.value === type);
    if (!t) return `<span class="badge bg-secondary">${escapeHtml(type || '—')}</span>`;
    return `<span class="badge bg-${t.color}">${t.label}</span>`;
  }

  function loadAiToolsPanel() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `
      <div class="section-container">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h3><i class="bi bi-stars me-2"></i>AI Tools Directory</h3>
          <button id="ai-tools-refresh-btn" class="btn btn-sm btn-outline-secondary">
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
              <p class="mb-1"><strong>Seed Catalog</strong> — writes ~100 curated AI tools to Firestore</p>
              <button id="ai-seed-btn" class="btn btn-success btn-sm">
                <i class="bi bi-database-add me-1"></i>Seed Catalog
              </button>
            </div>
            <div id="ai-seed-status" class="d-none alert alert-info py-2 mb-0"></div>

            <hr class="my-1">
            <div>
              <p class="mb-1"><strong>Refresh Trending Scores</strong> — recomputes <code>trendingScore</code> for every tool</p>
              <button id="ai-refresh-trending-btn" class="btn btn-info btn-sm text-white">
                <i class="bi bi-graph-up-arrow me-1"></i>Refresh Trending Scores
              </button>
            </div>
            <div id="ai-refresh-trending-status" class="d-none alert alert-info py-2 mb-0"></div>

            <hr class="my-1">
            <div>
              <p class="mb-1"><strong>Launch Promo Video</strong> — render the AI Tools Directory launch trailer</p>
              <div class="d-flex align-items-center gap-3 flex-wrap">
                <button id="ai-launch-en-btn" class="btn btn-sm" style="background:#0F8BD9;color:#fff;border-color:#0F8BD9;">
                  <i class="bi bi-broadcast me-1"></i>Render Promo (EN)
                </button>
                <button id="ai-launch-he-btn" class="btn btn-sm" style="background:#1f7a4e;color:#fff;border-color:#1f7a4e;">
                  <i class="bi bi-broadcast me-1"></i>Render Promo (HE)
                </button>
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="ai-launch-publish">
                  <label class="form-check-label small" for="ai-launch-publish">Publish to IG + YT</label>
                </div>
              </div>
            </div>
            <div id="ai-launch-status" class="d-none alert alert-info py-2 mb-0"></div>
          </div>
        </div>

        <!-- Stats row -->
        <div class="row mb-4">
          <div class="col-md-3">
            <div class="card text-center border-0 bg-light">
              <div class="card-body py-3">
                <div class="fs-3 fw-bold text-primary" id="ai-stat-total">—</div>
                <div class="small text-muted">Total Tools</div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card text-center border-0 bg-light">
              <div class="card-body py-3">
                <div class="fs-3 fw-bold text-warning" id="ai-stat-featured">—</div>
                <div class="small text-muted">Featured</div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card text-center border-0 bg-light">
              <div class="card-body py-3">
                <div class="fs-3 fw-bold text-danger" id="ai-stat-pending-reviews">—</div>
                <div class="small text-muted">Pending Reviews</div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card text-center border-0 bg-light">
              <div class="card-body py-3">
                <div class="fs-3 fw-bold text-info" id="ai-stat-avg-score">—</div>
                <div class="small text-muted">Avg Trending Score</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tools table -->
        <div class="card mb-4">
          <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
            <strong><i class="bi bi-table me-2"></i>Tools</strong>
            <div class="d-flex gap-2 align-items-center flex-wrap">
              <input id="ai-search" type="search" class="form-control form-control-sm" placeholder="Search name or slug…" style="max-width:220px;">
              <select id="ai-type-filter" class="form-select form-select-sm" style="max-width:180px;">
                <option value="">All types</option>
                ${TYPE_OPTIONS.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
              </select>
              <span class="badge bg-secondary" id="ai-tools-count">Loading…</span>
            </div>
          </div>
          <div class="card-body p-0">
            <div id="ai-tools-loading" class="text-center py-4">
              <div class="spinner-border spinner-border-sm me-2"></div>Loading tools…
            </div>
            <div id="ai-tools-table-wrap" class="d-none table-responsive">
              <table class="table table-hover table-sm mb-0 align-middle">
                <thead class="table-light">
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th class="text-end">Score</th>
                    <th class="text-center">Featured</th>
                    <th class="text-center">Published</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="ai-tools-tbody"></tbody>
              </table>
            </div>
            <div id="ai-tools-empty" class="d-none text-center text-muted py-4">
              <i class="bi bi-inbox fs-3 d-block mb-2"></i>No tools yet. Click "Seed Catalog" above to populate.
            </div>
          </div>
        </div>

        <!-- Reviews moderation -->
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center" style="cursor:pointer;" id="ai-reviews-toggle">
            <strong><i class="bi bi-chat-left-text me-2"></i>Reviews Moderation</strong>
            <span>
              <span class="badge bg-danger me-2" id="ai-reviews-pending-badge">—</span>
              <i class="bi bi-chevron-down" id="ai-reviews-chevron"></i>
            </span>
          </div>
          <div class="card-body p-0 d-none" id="ai-reviews-body">
            <div id="ai-reviews-loading" class="text-center py-4">
              <div class="spinner-border spinner-border-sm me-2"></div>Loading reviews…
            </div>
            <div id="ai-reviews-list" class="d-none"></div>
            <div id="ai-reviews-empty" class="d-none text-center text-muted py-4">
              <i class="bi bi-check2-circle fs-3 d-block mb-2"></i>No reviews awaiting moderation.
            </div>
          </div>
        </div>
      </div>
    `;

    // Wire triggers
    document.getElementById('ai-tools-refresh-btn').addEventListener('click', () => {
      loadTools();
      loadStats();
    });
    document.getElementById('ai-seed-btn').addEventListener('click', seedCatalog);
    document.getElementById('ai-refresh-trending-btn').addEventListener('click', refreshTrending);
    document.getElementById('ai-launch-en-btn').addEventListener('click', () => triggerLaunchVideo('en'));
    document.getElementById('ai-launch-he-btn').addEventListener('click', () => triggerLaunchVideo('he'));

    // Filters
    document.getElementById('ai-search').addEventListener('input', (e) => {
      _filterText = e.target.value.toLowerCase().trim();
      renderToolsTable();
    });
    document.getElementById('ai-type-filter').addEventListener('change', (e) => {
      _filterType = e.target.value;
      renderToolsTable();
    });

    // Reviews collapse
    document.getElementById('ai-reviews-toggle').addEventListener('click', () => {
      const body = document.getElementById('ai-reviews-body');
      const chevron = document.getElementById('ai-reviews-chevron');
      const opening = body.classList.contains('d-none');
      body.classList.toggle('d-none');
      chevron.classList.toggle('bi-chevron-down');
      chevron.classList.toggle('bi-chevron-up');
      if (opening) loadPendingReviews();
    });

    loadTools();
    loadStats();
  }

  // ─── Firestore helpers ────────────────────────────────────────────────────
  function fsDb() {
    return window.adminDb || (typeof db !== 'undefined' ? db : firebase.firestore());
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
  function loadStats() {
    const dbi = fsDb();
    dbi.collection('ai_tools').get().then((snap) => {
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
      document.getElementById('ai-stat-total').textContent = snap.size;
      document.getElementById('ai-stat-featured').textContent = featured;
      document.getElementById('ai-stat-avg-score').textContent =
        scoreCount > 0 ? (scoreSum / scoreCount).toFixed(1) : '—';
    }).catch((err) => {
      console.error('[ai-tools] stats error', err);
    });

    dbi.collection('ai_tool_reviews').where('approved', '==', false).get().then((snap) => {
      document.getElementById('ai-stat-pending-reviews').textContent = snap.size;
      const badge = document.getElementById('ai-reviews-pending-badge');
      if (badge) badge.textContent = snap.size;
    }).catch((err) => {
      console.error('[ai-tools] pending reviews count error', err);
    });
  }

  // ─── Tools list ───────────────────────────────────────────────────────────
  function loadTools() {
    const dbi = fsDb();
    const loadingEl = document.getElementById('ai-tools-loading');
    const wrap = document.getElementById('ai-tools-table-wrap');
    const empty = document.getElementById('ai-tools-empty');
    const countBadge = document.getElementById('ai-tools-count');

    loadingEl.classList.remove('d-none');
    wrap.classList.add('d-none');
    empty.classList.add('d-none');

    dbi.collection('ai_tools')
      .orderBy('trendingScore', 'desc')
      .get()
      .then((snap) => {
        loadingEl.classList.add('d-none');
        countBadge.textContent = `${snap.size} tools`;

        if (snap.empty) {
          _toolsCache = [];
          empty.classList.remove('d-none');
          return;
        }

        _toolsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        wrap.classList.remove('d-none');
        renderToolsTable();
      })
      .catch((err) => {
        loadingEl.classList.add('d-none');
        empty.textContent = 'Error loading tools: ' + err.message;
        empty.classList.remove('d-none');
      });
  }

  function renderToolsTable() {
    const tbody = document.getElementById('ai-tools-tbody');
    if (!tbody) return;

    const filtered = _toolsCache.filter((t) => {
      if (_filterType && t.type !== _filterType) return false;
      if (_filterText) {
        const hay = `${t.name || ''} ${t.slug || t.id || ''}`.toLowerCase();
        if (!hay.includes(_filterText)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">No matches.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((t) => {
      const iconCell = t.iconUrl
        ? `<img src="${escapeAttr(t.iconUrl)}" alt="" style="width:28px;height:28px;border-radius:6px;object-fit:cover;">`
        : `<div class="bg-light text-muted rounded d-inline-flex align-items-center justify-content-center" style="width:28px;height:28px;"><i class="bi bi-box"></i></div>`;
      const homepage = t.homepage
        ? `<div class="small"><a href="${escapeAttr(t.homepage)}" target="_blank" rel="noopener">${escapeHtml(t.homepage)}</a></div>`
        : '';
      const score = typeof t.trendingScore === 'number' ? t.trendingScore.toFixed(1) : '—';
      const featuredIcon = t.featured ? 'bi-star-fill text-warning' : 'bi-star text-muted';
      const publishedClass = t.published ? 'btn-success' : 'btn-outline-secondary';
      const publishedLabel = t.published ? 'Published' : 'Draft';
      return `<tr data-id="${escapeAttr(t.id)}">
        <td>${iconCell}</td>
        <td>
          <strong>${escapeHtml(t.name || t.id)}</strong>
          <div class="text-muted small"><code>${escapeHtml(t.slug || t.id)}</code></div>
          ${homepage}
        </td>
        <td>${typeBadge(t.type)}</td>
        <td class="small">${escapeHtml(t.category || '—')}</td>
        <td class="text-end fw-bold">${score}</td>
        <td class="text-center">
          <button class="btn btn-link p-0 ai-featured-toggle" data-id="${escapeAttr(t.id)}" title="Toggle featured">
            <i class="bi ${featuredIcon} fs-5"></i>
          </button>
        </td>
        <td class="text-center">
          <button class="btn btn-sm ${publishedClass} ai-published-toggle" data-id="${escapeAttr(t.id)}">
            ${publishedLabel}
          </button>
        </td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-outline-primary ai-edit-btn" data-id="${escapeAttr(t.id)}" title="Edit">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger ai-delete-btn" data-id="${escapeAttr(t.id)}" data-name="${escapeAttr(t.name || t.id)}" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.ai-featured-toggle').forEach((btn) => {
      btn.addEventListener('click', () => toggleField(btn.dataset.id, 'featured', btn));
    });
    tbody.querySelectorAll('.ai-published-toggle').forEach((btn) => {
      btn.addEventListener('click', () => toggleField(btn.dataset.id, 'published', btn));
    });
    tbody.querySelectorAll('.ai-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    tbody.querySelectorAll('.ai-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteTool(btn.dataset.id, btn.dataset.name));
    });
  }

  // ─── Inline-save toggles (optimistic) ─────────────────────────────────────
  function toggleField(id, field, btn) {
    const tool = _toolsCache.find((t) => t.id === id);
    if (!tool) return;
    const prev = !!tool[field];
    const next = !prev;
    tool[field] = next;
    renderToolsTable();

    fsDb().collection('ai_tools').doc(id).update({
      [field]: next,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).then(() => {
      loadStats();
    }).catch((err) => {
      // revert
      tool[field] = prev;
      renderToolsTable();
      alert(`Failed to update ${field}: ${err.message}`);
    });
  }

  function deleteTool(id, name) {
    if (!confirm(`Delete tool "${name}"? This cannot be undone.`)) return;
    fsDb().collection('ai_tools').doc(id).delete()
      .then(() => {
        _toolsCache = _toolsCache.filter((t) => t.id !== id);
        renderToolsTable();
        loadStats();
      })
      .catch((err) => alert('Delete failed: ' + err.message));
  }

  // ─── Edit modal ───────────────────────────────────────────────────────────
  function openEditModal(id) {
    const tool = _toolsCache.find((t) => t.id === id);
    if (!tool) return;

    const existing = document.getElementById('aiToolEditModal');
    if (existing) existing.remove();

    const typeOpts = TYPE_OPTIONS.map((o) =>
      `<option value="${o.value}" ${tool.type === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    const pricingOpts = PRICING_OPTIONS.map((p) =>
      `<option value="${p}" ${tool.pricing === p ? 'selected' : ''}>${p}</option>`
    ).join('');

    const bestForStr = Array.isArray(tool.bestFor) ? tool.bestFor.join(', ') : '';
    const tagsStr = Array.isArray(tool.tags) ? tool.tags.join(', ') : '';

    const html = `
      <div class="modal fade" id="aiToolEditModal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-pencil me-2"></i>Edit Tool: ${escapeHtml(tool.name || tool.id)}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">Name</label>
                  <input type="text" id="ai-edit-name" class="form-control" value="${escapeAttr(tool.name || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Slug <small class="text-muted">(doc id — read-only)</small></label>
                  <input type="text" class="form-control" value="${escapeAttr(tool.slug || tool.id)}" readonly>
                </div>
                <div class="col-md-4">
                  <label class="form-label">Type</label>
                  <select id="ai-edit-type" class="form-select">${typeOpts}</select>
                </div>
                <div class="col-md-4">
                  <label class="form-label">Category</label>
                  <input type="text" id="ai-edit-category" class="form-control" value="${escapeAttr(tool.category || '')}">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Pricing</label>
                  <select id="ai-edit-pricing" class="form-select"><option value="">—</option>${pricingOpts}</select>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Homepage URL</label>
                  <input type="url" id="ai-edit-homepage" class="form-control" value="${escapeAttr(tool.homepage || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Repo URL</label>
                  <input type="url" id="ai-edit-repoUrl" class="form-control" value="${escapeAttr(tool.repoUrl || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Icon URL</label>
                  <input type="url" id="ai-edit-iconUrl" class="form-control" value="${escapeAttr(tool.iconUrl || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Install Command</label>
                  <input type="text" id="ai-edit-installCommand" class="form-control" value="${escapeAttr(tool.installCommand || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Short Description (EN)</label>
                  <input type="text" id="ai-edit-shortDesc_en" class="form-control" value="${escapeAttr(tool.shortDesc_en || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">תיאור קצר (HE)</label>
                  <input type="text" id="ai-edit-shortDesc_he" class="form-control text-end" dir="rtl" value="${escapeAttr(tool.shortDesc_he || '')}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Description (EN)</label>
                  <textarea id="ai-edit-description_en" class="form-control" rows="4">${escapeHtml(tool.description_en || '')}</textarea>
                </div>
                <div class="col-md-6">
                  <label class="form-label">תיאור (HE)</label>
                  <textarea id="ai-edit-description_he" class="form-control text-end" dir="rtl" rows="4">${escapeHtml(tool.description_he || '')}</textarea>
                </div>
                <div class="col-12">
                  <label class="form-label">Claude's Take <small class="text-muted">(override Gemini-generated text)</small></label>
                  <textarea id="ai-edit-claudeTake" class="form-control" rows="3">${escapeHtml(tool.claudeTake || '')}</textarea>
                  <div class="form-text">By: ${escapeHtml(tool.claudeTakeBy || '—')}</div>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Best For <small class="text-muted">(comma-separated)</small></label>
                  <input type="text" id="ai-edit-bestFor" class="form-control" value="${escapeAttr(bestForStr)}">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Tags <small class="text-muted">(comma-separated)</small></label>
                  <input type="text" id="ai-edit-tags" class="form-control" value="${escapeAttr(tagsStr)}">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Trending Score</label>
                  <input type="number" step="0.1" id="ai-edit-trendingScore" class="form-control" value="${tool.trendingScore != null ? tool.trendingScore : 0}">
                </div>
                <div class="col-md-4 d-flex align-items-end">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="ai-edit-featured" ${tool.featured ? 'checked' : ''}>
                    <label class="form-check-label" for="ai-edit-featured">Featured</label>
                  </div>
                </div>
                <div class="col-md-4 d-flex align-items-end">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="ai-edit-published" ${tool.published ? 'checked' : ''}>
                    <label class="form-check-label" for="ai-edit-published">Published</label>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="ai-edit-save-btn">
                <i class="bi bi-save me-1"></i>Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const modalEl = document.getElementById('aiToolEditModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    document.getElementById('ai-edit-save-btn').addEventListener('click', () => {
      const saveBtn = document.getElementById('ai-edit-save-btn');
      const originalHtml = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving…';

      const parseList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);

      const payload = {
        name: document.getElementById('ai-edit-name').value.trim(),
        type: document.getElementById('ai-edit-type').value,
        category: document.getElementById('ai-edit-category').value.trim(),
        pricing: document.getElementById('ai-edit-pricing').value || null,
        homepage: document.getElementById('ai-edit-homepage').value.trim(),
        repoUrl: document.getElementById('ai-edit-repoUrl').value.trim(),
        iconUrl: document.getElementById('ai-edit-iconUrl').value.trim(),
        installCommand: document.getElementById('ai-edit-installCommand').value.trim(),
        shortDesc_en: document.getElementById('ai-edit-shortDesc_en').value.trim(),
        shortDesc_he: document.getElementById('ai-edit-shortDesc_he').value.trim(),
        description_en: document.getElementById('ai-edit-description_en').value,
        description_he: document.getElementById('ai-edit-description_he').value,
        claudeTake: document.getElementById('ai-edit-claudeTake').value,
        bestFor: parseList(document.getElementById('ai-edit-bestFor').value),
        tags: parseList(document.getElementById('ai-edit-tags').value),
        trendingScore: parseFloat(document.getElementById('ai-edit-trendingScore').value) || 0,
        featured: document.getElementById('ai-edit-featured').checked,
        published: document.getElementById('ai-edit-published').checked,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      // If admin overrode claudeTake, mark it as admin-edited
      if (payload.claudeTake && payload.claudeTake !== (tool.claudeTake || '')) {
        payload.claudeTakeBy = 'admin';
      }

      fsDb().collection('ai_tools').doc(id).update(payload)
        .then(() => {
          modal.hide();
          loadTools();
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
    if (!confirm('This will write ~100 tools to Firestore. Continue?')) return;
    const btn = document.getElementById('ai-seed-btn');
    const statusEl = document.getElementById('ai-seed-status');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Seeding…';
    statusEl.className = 'alert alert-info py-2 mb-0';
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Writing ~100 tools and generating Claude takes… this can take 3–8 minutes.';
    statusEl.classList.remove('d-none');

    try {
      const fn = firebase.functions().httpsCallable('seedAiToolsCatalog', { timeout: 540000 });
      const res = await fn({});
      const data = (res && res.data) || {};
      statusEl.className = 'alert alert-success py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-check-circle me-1"></i>Catalog seeded${data.count ? ` — ${data.count} tools written` : ''}.`;
      loadTools();
      loadStats();
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
    const btn = document.getElementById('ai-refresh-trending-btn');
    const statusEl = document.getElementById('ai-refresh-trending-status');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Refreshing…';
    statusEl.className = 'alert alert-info py-2 mb-0';
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Recomputing trending scores…';
    statusEl.classList.remove('d-none');

    try {
      const fn = firebase.functions().httpsCallable('refreshAiToolsTrending', { timeout: 300000 });
      const res = await fn({});
      const data = (res && res.data) || {};
      const updated = data.updated != null ? data.updated : (data.count != null ? data.count : '?');
      statusEl.className = 'alert alert-success py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-check-circle me-1"></i>Updated ${updated} tools.`;
      loadTools();
      loadStats();
    } catch (err) {
      statusEl.className = 'alert alert-danger py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${escapeHtml(err.message)}`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  async function triggerLaunchVideo(language) {
    const btnId = language === 'he' ? 'ai-launch-he-btn' : 'ai-launch-en-btn';
    const btn = document.getElementById(btnId);
    const statusEl = document.getElementById('ai-launch-status');
    const originalHtml = btn.innerHTML;
    const autoPublish = !!(document.getElementById('ai-launch-publish') || {}).checked;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Rendering…';
    statusEl.className = 'alert alert-info py-2 mb-0';
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Rendering AI Tools launch promo… ~8–12 minutes.';
    statusEl.classList.remove('d-none');

    try {
      const fn = firebase.functions().httpsCallable('triggerAiToolsLaunchVideo', { timeout: 540000 });
      const res = await fn({ language, autoPublish });
      const data = (res && res.data) || {};
      statusEl.className = 'alert alert-success py-2 mb-0';
      let extra = '';
      if (data.publish) {
        if (data.publish.youtubeUrl)   extra += ` · <a href="${data.publish.youtubeUrl}" target="_blank" class="alert-link">YouTube</a>`;
        if (data.publish.instagramUrl) extra += ` · <a href="${data.publish.instagramUrl}" target="_blank" class="alert-link">Instagram</a>`;
      }
      statusEl.innerHTML = data.videoUrl
        ? `<i class="bi bi-check-circle me-1"></i>Promo ready — <a href="${data.videoUrl}" target="_blank" class="alert-link">view MP4</a>${extra}`
        : `<i class="bi bi-check-circle me-1"></i>Launch video run complete (${language.toUpperCase()})${extra}`;
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
      btn.innerHTML = originalHtml;
    }
  }

  // ─── Reviews moderation ───────────────────────────────────────────────────
  function loadPendingReviews() {
    const dbi = fsDb();
    const loadingEl = document.getElementById('ai-reviews-loading');
    const listEl = document.getElementById('ai-reviews-list');
    const emptyEl = document.getElementById('ai-reviews-empty');

    loadingEl.classList.remove('d-none');
    listEl.classList.add('d-none');
    emptyEl.classList.add('d-none');

    dbi.collection('ai_tool_reviews')
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

        // Resolve tool names (look up in cache, else fetch)
        const toolIds = Array.from(new Set(snap.docs.map((d) => d.data().toolId).filter(Boolean)));
        const toolNames = {};
        for (const tid of toolIds) {
          const cached = _toolsCache.find((t) => t.id === tid || t.slug === tid);
          if (cached) {
            toolNames[tid] = cached.name || tid;
          } else {
            try {
              const doc = await dbi.collection('ai_tools').doc(tid).get();
              toolNames[tid] = doc.exists ? (doc.data().name || tid) : tid;
            } catch (_) {
              toolNames[tid] = tid;
            }
          }
        }

        const rows = snap.docs.map((doc) => {
          const r = doc.data();
          const rating = Math.max(0, Math.min(5, parseInt(r.rating) || 0));
          const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
          const dateStr = r.createdAt && r.createdAt.toDate
            ? r.createdAt.toDate().toLocaleString()
            : '—';
          return `<div class="border-bottom p-3" data-review-id="${escapeAttr(doc.id)}">
            <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
              <div>
                <strong>${escapeHtml(toolNames[r.toolId] || r.toolId || '—')}</strong>
                <span class="text-warning ms-2">${stars}</span>
                <span class="badge bg-light text-dark ms-2">${escapeHtml(r.userId || 'anon')}</span>
                <div class="small text-muted">${escapeHtml(dateStr)}</div>
              </div>
              <div class="d-flex gap-2">
                <button class="btn btn-sm btn-success ai-review-approve" data-id="${escapeAttr(doc.id)}">
                  <i class="bi bi-check-lg me-1"></i>Approve
                </button>
                <button class="btn btn-sm btn-outline-danger ai-review-reject" data-id="${escapeAttr(doc.id)}">
                  <i class="bi bi-x-lg me-1"></i>Reject
                </button>
              </div>
            </div>
            <div class="text-body">${escapeHtml(r.comment || '')}</div>
          </div>`;
        }).join('');

        listEl.innerHTML = rows;
        listEl.classList.remove('d-none');

        listEl.querySelectorAll('.ai-review-approve').forEach((btn) => {
          btn.addEventListener('click', () => approveReview(btn.dataset.id));
        });
        listEl.querySelectorAll('.ai-review-reject').forEach((btn) => {
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
    fsDb().collection('ai_tool_reviews').doc(id).update({
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
    fsDb().collection('ai_tool_reviews').doc(id).delete()
      .then(() => {
        const row = document.querySelector(`[data-review-id="${id}"]`);
        if (row) row.remove();
        loadStats();
      })
      .catch((err) => alert('Reject failed: ' + err.message));
  }

  // Export
  window.loadAiToolsPanel = loadAiToolsPanel;
})();
