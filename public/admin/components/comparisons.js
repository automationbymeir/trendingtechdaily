/* comparisons.js — Admin panel for "X vs Y" comparison pages */
/* global firebase, db */

(function () {
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.loadComparisonsSection = function () {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;
    contentArea.innerHTML = `
      <div class="section-container">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h3>Comparison Pages <small class="text-muted">("X vs Y" SEO pages)</small></h3>
          <div>
            <button id="cmp-bulk-btn" class="btn btn-outline-success me-2" title="Paste multiple pairs to generate in batch">
              <i class="bi bi-stack me-1"></i>Bulk Generate
            </button>
            <button id="cmp-new-btn" class="btn btn-primary">
              <i class="bi bi-plus-circle me-1"></i>New Comparison
            </button>
          </div>
        </div>

        <div class="card mb-4" id="cmp-new-card" style="display:none;">
          <div class="card-body">
            <h5 class="card-title mb-3">Generate New Comparison</h5>
            <div class="row g-2">
              <div class="col-md-4"><input id="cmp-a" class="form-control" placeholder="Item A (e.g., iPhone 17 Pro)"></div>
              <div class="col-md-4"><input id="cmp-b" class="form-control" placeholder="Item B (e.g., Galaxy S26 Ultra)"></div>
              <div class="col-md-2"><input id="cmp-cat" class="form-control" placeholder="Category" value="phones"></div>
              <div class="col-md-2">
                <select id="cmp-lang" class="form-select">
                  <option value="en">English</option>
                  <option value="he">Hebrew</option>
                </select>
              </div>
            </div>
            <div class="form-check mt-2">
              <input type="checkbox" class="form-check-input" id="cmp-also-he" checked>
              <label class="form-check-label" for="cmp-also-he">Also generate Hebrew mirror (when primary is English)</label>
            </div>
            <div class="form-check">
              <input type="checkbox" class="form-check-input" id="cmp-gen-img" checked>
              <label class="form-check-label" for="cmp-gen-img">Fetch hero image from Unsplash</label>
            </div>
            <div class="mt-3">
              <button id="cmp-gen-btn" class="btn btn-primary"><i class="bi bi-robot me-1"></i>Generate</button>
              <button id="cmp-cancel-btn" class="btn btn-outline-secondary">Cancel</button>
              <span id="cmp-gen-status" class="ms-3 text-muted small"></span>
            </div>
          </div>
        </div>

        <div class="card mb-4" id="cmp-bulk-card" style="display:none;">
          <div class="card-body">
            <h5 class="card-title mb-3">Bulk Generate — paste one pair per line as <code>Item A | Item B | category</code></h5>
            <textarea id="cmp-bulk-input" class="form-control font-monospace" rows="8" placeholder="iPhone 17 Pro | Galaxy S26 Ultra | phones
GPT-5 | Claude 4 | ai
M4 MacBook Pro | Dell XPS 16 | laptops"></textarea>
            <div class="row g-2 mt-2">
              <div class="col-md-3">
                <select id="cmp-bulk-lang" class="form-select">
                  <option value="en">English</option>
                  <option value="he">Hebrew</option>
                </select>
              </div>
              <div class="col-md-4 d-flex align-items-center">
                <div class="form-check">
                  <input type="checkbox" class="form-check-input" id="cmp-bulk-also-he" checked>
                  <label class="form-check-label" for="cmp-bulk-also-he">Also generate Hebrew mirrors</label>
                </div>
              </div>
              <div class="col-md-5 text-md-end">
                <button id="cmp-bulk-run" class="btn btn-success"><i class="bi bi-play-fill me-1"></i>Run Bulk</button>
                <button id="cmp-bulk-cancel" class="btn btn-outline-secondary">Cancel</button>
              </div>
            </div>
            <div id="cmp-bulk-status" class="mt-3 small"></div>
          </div>
        </div>

        <ul class="nav nav-tabs mb-3" id="cmpTabs">
          <li class="nav-item"><a class="nav-link active" data-lang="en" href="#">English</a></li>
          <li class="nav-item"><a class="nav-link" data-lang="he" href="#">Hebrew</a></li>
        </ul>

        <div class="table-responsive">
          <table class="table table-hover align-middle">
            <thead>
              <tr>
                <th>Title</th>
                <th>Slug</th>
                <th>Category</th>
                <th>Published</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="cmp-table-body"><tr><td colspan="6" class="text-center p-4">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>`;

    let currentLang = 'en';
    const statusEl = () => document.getElementById('cmp-gen-status');
    const bulkStatus = () => document.getElementById('cmp-bulk-status');

    document.getElementById('cmp-new-btn').addEventListener('click', () => {
      document.getElementById('cmp-new-card').style.display = 'block';
      document.getElementById('cmp-bulk-card').style.display = 'none';
    });
    document.getElementById('cmp-cancel-btn').addEventListener('click', () => {
      document.getElementById('cmp-new-card').style.display = 'none';
    });
    document.getElementById('cmp-bulk-btn').addEventListener('click', () => {
      document.getElementById('cmp-bulk-card').style.display = 'block';
      document.getElementById('cmp-new-card').style.display = 'none';
    });
    document.getElementById('cmp-bulk-cancel').addEventListener('click', () => {
      document.getElementById('cmp-bulk-card').style.display = 'none';
    });

    document.getElementById('cmp-gen-btn').addEventListener('click', async () => {
      const itemA = document.getElementById('cmp-a').value.trim();
      const itemB = document.getElementById('cmp-b').value.trim();
      const category = document.getElementById('cmp-cat').value.trim() || 'general';
      const language = document.getElementById('cmp-lang').value;
      const alsoGenerateHebrew = document.getElementById('cmp-also-he').checked;
      const generateImage = document.getElementById('cmp-gen-img').checked;
      if (!itemA || !itemB) { alert('Both items are required'); return; }
      const btn = document.getElementById('cmp-gen-btn');
      btn.disabled = true;
      statusEl().textContent = 'Generating… (30–90 seconds)';
      try {
        const fn = firebase.functions().httpsCallable('generateComparison', { timeout: 300000 });
        const res = await fn({ itemA, itemB, category, language, alsoGenerateHebrew, generateImage });
        const d = res.data || {};
        statusEl().innerHTML = `✅ Created <a href="${language === 'he' ? '/he' : ''}/compare/${esc(d.slug)}" target="_blank">${esc(d.slug)}</a>` +
          (d.heSlug ? ` · <a href="/he/compare/${esc(d.heSlug)}" target="_blank">HE mirror</a>` : '') +
          (d.hebrewError ? ` · ⚠️ HE failed: ${esc(d.hebrewError)}` : '');
        document.getElementById('cmp-a').value = '';
        document.getElementById('cmp-b').value = '';
        loadTable();
      } catch (e) {
        statusEl().innerHTML = `❌ ${esc(e.message || 'Error')}`;
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('cmp-bulk-run').addEventListener('click', async () => {
      const raw = document.getElementById('cmp-bulk-input').value.trim();
      if (!raw) { alert('Paste at least one pair'); return; }
      const pairs = raw.split('\n').map(line => {
        const p = line.split('|').map(x => x.trim()).filter(Boolean);
        return p.length >= 2 ? { itemA: p[0], itemB: p[1], category: p[2] || 'general' } : null;
      }).filter(Boolean);
      if (!pairs.length) { alert('No valid rows'); return; }
      const language = document.getElementById('cmp-bulk-lang').value;
      const alsoGenerateHebrew = document.getElementById('cmp-bulk-also-he').checked;
      if (!confirm(`Generate ${pairs.length} comparisons${alsoGenerateHebrew && language === 'en' ? ' (each with HE mirror)' : ''}? This may take several minutes.`)) return;
      const btn = document.getElementById('cmp-bulk-run');
      btn.disabled = true;
      bulkStatus().textContent = `Running ${pairs.length}…`;
      try {
        const fn = firebase.functions().httpsCallable('bulkGenerateComparisons', { timeout: 540000 });
        const res = await fn({ pairs, language, alsoGenerateHebrew, generateImage: true });
        const list = (res.data && res.data.results) || [];
        const ok = list.filter(r => r.ok).length;
        const fail = list.length - ok;
        bulkStatus().innerHTML = `Done — ${ok} created, ${fail} failed.<br>` +
          list.map(r => r.ok
            ? `✅ <a href="${language === 'he' ? '/he' : ''}/compare/${esc(r.slug)}" target="_blank">${esc(r.slug)}</a>${r.heSlug ? ` · <a href="/he/compare/${esc(r.heSlug)}" target="_blank">HE</a>` : ''}`
            : `❌ ${esc(r.itemA || '')} vs ${esc(r.itemB || '')}: ${esc(r.error || 'error')}`
          ).join('<br>');
        loadTable();
      } catch (e) {
        bulkStatus().innerHTML = `❌ ${esc(e.message || 'Error')}`;
      } finally {
        btn.disabled = false;
      }
    });

    document.querySelectorAll('#cmpTabs .nav-link').forEach(a => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        document.querySelectorAll('#cmpTabs .nav-link').forEach(l => l.classList.remove('active'));
        a.classList.add('active');
        currentLang = a.dataset.lang;
        loadTable();
      });
    });

    async function loadTable() {
      const body = document.getElementById('cmp-table-body');
      if (!body) return;
      body.innerHTML = `<tr><td colspan="6" class="text-center p-4">Loading…</td></tr>`;
      try {
        const coll = currentLang === 'he' ? 'he_comparisons' : 'comparisons';
        const snap = await db.collection(coll).orderBy('createdAt', 'desc').limit(200).get();
        if (snap.empty) { body.innerHTML = `<tr><td colspan="6" class="text-center p-4 text-muted">No comparisons yet. Click <strong>New Comparison</strong>.</td></tr>`; return; }
        const rows = snap.docs.map(d => {
          const a = d.data();
          const created = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().toLocaleDateString() : '';
          const liveUrl = (currentLang === 'he' ? '/he' : '') + '/compare/' + a.slug;
          return `<tr data-id="${d.id}">
            <td>${esc(a.title || (a.itemA + ' vs ' + a.itemB))}</td>
            <td><code>${esc(a.slug)}</code></td>
            <td>${esc(a.category || '')}</td>
            <td>${a.published === false ? '<span class="badge bg-warning">Draft</span>' : '<span class="badge bg-success">Live</span>'}</td>
            <td>${esc(created)}</td>
            <td>
              <a class="btn btn-sm btn-outline-primary" href="${liveUrl}" target="_blank"><i class="bi bi-box-arrow-up-right"></i></a>
              <button class="btn btn-sm btn-outline-${a.published === false ? 'success' : 'secondary'} cmp-toggle-btn" data-id="${d.id}" data-pub="${a.published !== false}"><i class="bi bi-${a.published === false ? 'eye' : 'eye-slash'}"></i></button>
              <button class="btn btn-sm btn-outline-danger cmp-del-btn" data-id="${d.id}"><i class="bi bi-trash"></i></button>
            </td>
          </tr>`;
        }).join('');
        body.innerHTML = rows;

        body.querySelectorAll('.cmp-del-btn').forEach(btn => btn.addEventListener('click', async () => {
          if (!confirm('Delete this comparison? This cannot be undone.')) return;
          const coll2 = currentLang === 'he' ? 'he_comparisons' : 'comparisons';
          await db.collection(coll2).doc(btn.dataset.id).delete();
          loadTable();
        }));
        body.querySelectorAll('.cmp-toggle-btn').forEach(btn => btn.addEventListener('click', async () => {
          const coll2 = currentLang === 'he' ? 'he_comparisons' : 'comparisons';
          const currentlyPub = btn.dataset.pub === 'true';
          await db.collection(coll2).doc(btn.dataset.id).update({ published: !currentlyPub, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          loadTable();
        }));
      } catch (e) {
        body.innerHTML = `<tr><td colspan="6" class="text-danger p-4">${esc(e.message)}</td></tr>`;
      }
    }

    loadTable();
  };
})();
