/* automation.js – Scheduler logs and trigger management */

function loadAutomationPanel() {
  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = `
    <div class="section-container">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h3><i class="bi bi-cpu me-2"></i>Automation &amp; Scheduler</h3>
        <button id="refresh-logs-btn" class="btn btn-sm btn-outline-secondary">
          <i class="bi bi-arrow-clockwise me-1"></i>Refresh
        </button>
      </div>

      <!-- Trigger Details -->
      <div class="row mb-4">
        <div class="col-md-6">
          <div class="card border-primary h-100">
            <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
              <span><i class="bi bi-calendar-event me-2"></i>Scheduled Triggers</span>
              <span class="badge bg-light text-primary">Active</span>
            </div>
            <div class="card-body">
              <table class="table table-sm mb-0">
                <thead><tr><th>Function</th><th>Schedule (UTC)</th><th>Action</th></tr></thead>
                <tbody>
                  <tr>
                    <td><strong>Trending Articles</strong><br><small class="text-muted">2 AI articles from news crawl</small></td>
                    <td><code>0 8,20 * * *</code><br><small class="text-muted">Daily at 8:00 AM &amp; 8:00 PM UTC</small></td>
                    <td><span id="next-trending-run" class="badge bg-info text-dark">Calculating...</span></td>
                  </tr>
                  <tr>
                    <td><strong>Auto Article</strong><br><small class="text-muted">Single article, hourly check</small></td>
                    <td><code>every 1 hours</code><br><small class="text-muted">Runs if quota not met</small></td>
                    <td><span id="next-auto-run" class="badge bg-secondary">~Every hour</span></td>
                  </tr>
                  <tr>
                    <td><strong>IG Comparison Carousel</strong><br><small class="text-muted">Posts 4 fresh "X vs Y" comparisons as a Hebrew image carousel</small></td>
                    <td><code>0 10,18 * * *</code><br><small class="text-muted">10:00 &amp; 18:00 Asia/Jerusalem</small></td>
                    <td><span id="next-carousel-run" class="badge bg-info text-dark">Calculating…</span></td>
                  </tr>
                  <tr>
                    <td><strong>AI Tools Daily Carousel (EN)</strong><br><small class="text-muted">5 trending AI tools with real logos, Claude's Take, posted to IG</small></td>
                    <td><code>0 9 * * *</code><br><small class="text-muted">Daily 09:00 Asia/Jerusalem</small></td>
                    <td><span class="badge bg-info text-dark">Daily</span></td>
                  </tr>
                  <tr>
                    <td><strong>AI Tools Daily Carousel (HE)</strong><br><small class="text-muted">גרסת עברית של הקרוסלה היומית — 5 כלים טרנדיים</small></td>
                    <td><code>15 9 * * *</code><br><small class="text-muted">Daily 09:15 Asia/Jerusalem</small></td>
                    <td><span class="badge bg-info text-dark">Daily</span></td>
                  </tr>
                  <tr>
                    <td><strong>Design Systems Daily Carousel (EN)</strong><br><small class="text-muted">7-slide IG carousel of trending design systems</small></td>
                    <td><code>30 10 * * *</code><br><small class="text-muted">Daily 10:30 Asia/Jerusalem</small></td>
                    <td><span class="badge bg-info text-dark">Daily</span></td>
                  </tr>
                  <tr>
                    <td><strong>Design Systems Daily Carousel (HE)</strong><br><small class="text-muted">גרסת עברית של הקרוסלה היומית</small></td>
                    <td><code>45 10 * * *</code><br><small class="text-muted">Daily 10:45 Asia/Jerusalem</small></td>
                    <td><span class="badge bg-info text-dark">Daily</span></td>
                  </tr>
                  <tr>
                    <td><strong>Design Systems Weekly Reel (EN)</strong><br><small class="text-muted">Weekly cartoon reel decoding one design system</small></td>
                    <td><code>0 11 * * 3</code><br><small class="text-muted">Wednesdays 11:00 Asia/Jerusalem</small></td>
                    <td><span class="badge bg-info text-dark">Weekly</span></td>
                  </tr>
                  <tr>
                    <td><strong>Design Systems Weekly Reel (HE)</strong><br><small class="text-muted">ריל שבועי בעברית</small></td>
                    <td><code>15 11 * * 3</code><br><small class="text-muted">Wednesdays 11:15 Asia/Jerusalem</small></td>
                    <td><span class="badge bg-info text-dark">Weekly</span></td>
                  </tr>
                  <tr>
                    <td><strong>BIT Weekly Digest (HE)</strong><br><small class="text-muted">Auto-publishes the Hebrew cartoon news digest to YT + IG</small></td>
                    <td><code>0 18 * * 5</code><br><small class="text-muted">Fridays 18:00 Asia/Jerusalem</small></td>
                    <td><span class="badge bg-info text-dark">Weekly</span></td>
                  </tr>
                  <tr>
                    <td><strong>BIT Weekly Digest (EN)</strong><br><small class="text-muted">Auto-publishes the English cartoon news digest to YT + IG</small></td>
                    <td><code>0 19 * * 5</code><br><small class="text-muted">Fridays 19:00 IL ≈ 12:00 ET</small></td>
                    <td><span class="badge bg-info text-dark">Weekly</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="card border-success h-100">
            <div class="card-header bg-success text-white">
              <i class="bi bi-play-circle me-2"></i>Manual Triggers
            </div>
            <div class="card-body d-flex flex-column gap-3">
              <div>
                <p class="mb-1"><strong>Trending AI Articles</strong> — crawl news &amp; publish 2 articles now</p>
                <button id="trigger-trending-btn" class="btn btn-success btn-sm">
                  <i class="bi bi-robot me-1"></i>Run Now (2 Articles)
                </button>
              </div>
              <hr class="my-1">
              <div id="trigger-status" class="d-none alert alert-info py-2 mb-0"></div>
              <hr class="my-1">
              <div>
                <p class="mb-1"><strong>Trending Comparisons</strong> — generate "X vs Y" comparisons for EN and HE</p>
                <button id="trigger-comparisons-btn" class="btn btn-info btn-sm text-white">
                  <i class="bi bi-robot me-1"></i>Generate Comparisons
                </button>
              </div>
              <div id="trigger-comparisons-status" class="d-none alert alert-info py-2 mb-0"></div>
              <hr class="my-1">
              <div>
                <p class="mb-1"><strong>IG Comparison Carousel</strong> — post 4 comparisons to Instagram now</p>
                <button id="trigger-carousel-btn" class="btn btn-primary btn-sm">
                  <i class="bi bi-instagram me-1"></i>Post Carousel Now
                </button>
              </div>
              <div id="trigger-carousel-status" class="d-none alert alert-info py-2 mb-0"></div>
              <hr class="my-1">
              <div>
                <p class="mb-1"><strong>AI Tools Pulse — Daily Carousel</strong> — render 7-slide IG carousel of 5 trending AI tools with real logos</p>
                <div class="d-flex align-items-center gap-3 flex-wrap">
                  <button id="trigger-ai-tools-carousel-en-btn" class="btn btn-sm" style="background:#2196F3;color:#fff;border-color:#2196F3;">
                    <i class="bi bi-instagram me-1"></i>Render AI Tools Carousel (EN)
                  </button>
                  <button id="trigger-ai-tools-carousel-he-btn" class="btn btn-sm" style="background:#FFC107;color:#222;border-color:#FFC107;">
                    <i class="bi bi-instagram me-1"></i>Render AI Tools Carousel (HE)
                  </button>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="trigger-ai-tools-publish" checked>
                    <label class="form-check-label small" for="trigger-ai-tools-publish">Publish to IG</label>
                  </div>
                </div>
              </div>
              <div id="trigger-ai-tools-carousel-status" class="d-none alert alert-info py-2 mb-0"></div>
              <hr class="my-1">
              <div>
                <p class="mb-1"><strong>AI Tools Pulse — Explainer Videos</strong> — render the 6 short BIT explainer videos (landing/guide/glossary × EN+HE, ~30-45s each, 9:16). Takes ~30-60 min total.</p>
                <button id="trigger-ai-tools-explainers-btn" class="btn btn-sm" style="background:#0F8BD9;color:#fff;border-color:#0F8BD9;">
                  <i class="bi bi-camera-reels me-1"></i>Render all AI Tools explainer videos (6×)
                </button>
              </div>
              <div id="trigger-ai-tools-explainers-status" class="d-none alert alert-info py-2 mb-0"></div>
              <hr class="my-1">
              <div>
                <p class="mb-1"><strong>Design Systems Decoded — Daily Carousel + Weekly Reel</strong> — render IG carousel + cartoon reel</p>
                <div class="d-flex align-items-center gap-2 flex-wrap mb-2">
                  <button id="trigger-ds-carousel-en-btn" class="btn btn-sm" style="background:#0F8BD9;color:#fff;border-color:#0F8BD9;">
                    <i class="bi bi-images me-1"></i>Render Carousel (EN)
                  </button>
                  <button id="trigger-ds-carousel-he-btn" class="btn btn-sm" style="background:#1f7a4e;color:#fff;border-color:#1f7a4e;">
                    <i class="bi bi-images me-1"></i>Render Carousel (HE)
                  </button>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="trigger-ds-carousel-publish" checked>
                    <label class="form-check-label small" for="trigger-ds-carousel-publish">Publish to IG</label>
                  </div>
                </div>
                <div class="d-flex align-items-center gap-2 flex-wrap">
                  <button id="trigger-ds-reel-en-btn" class="btn btn-sm" style="background:#673AB7;color:#fff;border-color:#673AB7;">
                    <i class="bi bi-camera-reels me-1"></i>Render Reel (EN)
                  </button>
                  <button id="trigger-ds-reel-he-btn" class="btn btn-sm" style="background:#9C27B0;color:#fff;border-color:#9C27B0;">
                    <i class="bi bi-camera-reels me-1"></i>Render Reel (HE)
                  </button>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="trigger-ds-reel-publish">
                    <label class="form-check-label small" for="trigger-ds-reel-publish">Publish to YT + IG</label>
                  </div>
                </div>
              </div>
              <div id="trigger-ds-status" class="d-none alert alert-info py-2 mb-0"></div>
              <hr class="my-1">
              <div>
                <p class="mb-1"><strong>BIT Weekly Tech Digest</strong> — render 3-min cartoon news video summarising this week's 5 top stories</p>
                <div class="d-flex align-items-center gap-3 flex-wrap">
                  <button id="trigger-digest-btn" class="btn btn-sm" style="background:#0F8BD9;color:#fff;border-color:#0F8BD9;">
                    <i class="bi bi-broadcast me-1"></i>Render Weekly Digest (EN)
                  </button>
                  <button id="trigger-digest-he-btn" class="btn btn-sm" style="background:#1f7a4e;color:#fff;border-color:#1f7a4e;">
                    <i class="bi bi-broadcast me-1"></i>Render Weekly Digest (HE)
                  </button>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="trigger-digest-publish">
                    <label class="form-check-label small" for="trigger-digest-publish">Publish to IG + YT</label>
                  </div>
                </div>
              </div>
              <div id="trigger-digest-status" class="d-none alert alert-info py-2 mb-0"></div>
              <hr class="my-1">
              <div>
                <p class="mb-1"><strong>BIT Single Story Anchor</strong> — pick one article and have BIT report on it (~35s)</p>
                <div class="d-flex gap-2 align-items-center flex-wrap">
                  <select id="trigger-single-select" class="form-select form-select-sm" style="max-width:55%;">
                    <option value="">Loading recent articles…</option>
                  </select>
                  <button id="trigger-single-btn" class="btn btn-sm" style="background:#0F8BD9;color:#fff;border-color:#0F8BD9;" disabled>
                    <i class="bi bi-broadcast-pin me-1"></i>Render Anchor
                  </button>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="trigger-single-publish">
                    <label class="form-check-label small" for="trigger-single-publish">Publish</label>
                  </div>
                </div>
              </div>
              <div id="trigger-single-status" class="d-none alert alert-info py-2 mb-0"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats row -->
      <div class="row mb-4" id="stats-row">
        <div class="col-md-3">
          <div class="card text-center border-0 bg-light">
            <div class="card-body py-3">
              <div class="fs-3 fw-bold text-primary" id="stat-total">—</div>
              <div class="small text-muted">Total Runs</div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card text-center border-0 bg-light">
            <div class="card-body py-3">
              <div class="fs-3 fw-bold text-success" id="stat-success">—</div>
              <div class="small text-muted">Successful</div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card text-center border-0 bg-light">
            <div class="card-body py-3">
              <div class="fs-3 fw-bold text-danger" id="stat-error">—</div>
              <div class="small text-muted">Errors</div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card text-center border-0 bg-light">
            <div class="card-body py-3">
              <div class="fs-3 fw-bold text-info" id="stat-articles">—</div>
              <div class="small text-muted">Articles Published</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Logs Table -->
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <strong><i class="bi bi-journal-text me-2"></i>Generation Logs</strong>
          <span class="badge bg-secondary" id="log-count">Loading...</span>
        </div>
        <div class="card-body p-0">
          <div id="logs-loading" class="text-center py-4">
            <div class="spinner-border spinner-border-sm me-2"></div>Loading logs...
          </div>
          <div id="logs-table-container" class="d-none">
            <table class="table table-hover table-sm mb-0">
              <thead class="table-light">
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Articles Published</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody id="logs-tbody"></tbody>
            </table>
          </div>
          <div id="logs-empty" class="d-none text-center text-muted py-4">
            <i class="bi bi-inbox fs-3 d-block mb-2"></i>No logs yet. Run the scheduler or trigger manually.
          </div>
        </div>
      </div>
    </div>
  `;

  computeNextRun();
  loadLogs();

  document.getElementById('refresh-logs-btn').addEventListener('click', loadLogs);
  document.getElementById('trigger-trending-btn').addEventListener('click', triggerTrending);
  document.getElementById('trigger-comparisons-btn').addEventListener('click', triggerComparisons);
  document.getElementById('trigger-carousel-btn').addEventListener('click', triggerCarousel);
  document.getElementById('trigger-ai-tools-carousel-en-btn').addEventListener('click', () => triggerAiToolsCarousel('en'));
  document.getElementById('trigger-ai-tools-carousel-he-btn').addEventListener('click', () => triggerAiToolsCarousel('he'));
  const explainersBtn = document.getElementById('trigger-ai-tools-explainers-btn');
  if (explainersBtn) explainersBtn.addEventListener('click', triggerAllAiToolsExplainers);
  const dsCarEn = document.getElementById('trigger-ds-carousel-en-btn');
  if (dsCarEn) dsCarEn.addEventListener('click', () => triggerDesignSystemsCarousel('en'));
  const dsCarHe = document.getElementById('trigger-ds-carousel-he-btn');
  if (dsCarHe) dsCarHe.addEventListener('click', () => triggerDesignSystemsCarousel('he'));
  const dsReelEn = document.getElementById('trigger-ds-reel-en-btn');
  if (dsReelEn) dsReelEn.addEventListener('click', () => triggerDesignSystemsReel('en'));
  const dsReelHe = document.getElementById('trigger-ds-reel-he-btn');
  if (dsReelHe) dsReelHe.addEventListener('click', () => triggerDesignSystemsReel('he'));
  document.getElementById('trigger-digest-btn').addEventListener('click', triggerDigestEn);
  document.getElementById('trigger-digest-he-btn').addEventListener('click', triggerDigestHe);
  document.getElementById('trigger-single-btn').addEventListener('click', triggerSingleEn);
  loadSingleStoryOptions('en');
}

// Populate the single-story picker from the `stories` collection (latest 20).
let _singleStoryUnsubscribe = null;
function loadSingleStoryOptions(language) {
  const select = document.getElementById('trigger-single-select');
  const btn = document.getElementById('trigger-single-btn');
  if (!select) return;

  if (_singleStoryUnsubscribe) {
    _singleStoryUnsubscribe();
  }

  _singleStoryUnsubscribe = db.collection('stories')
    .where('language', '==', language)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .onSnapshot((snap) => {
      if (snap.empty) {
        select.innerHTML = '<option value="">No articles with video yet</option>';
        return;
      }
      const opts = ['<option value="">— Pick an article —</option>'];
      snap.forEach((doc) => {
        const d = doc.data();
        if (!d.articleId || !d.title) return;
        const safe = d.title.replace(/</g, '&lt;').slice(0, 80);
        opts.push(`<option value="${d.articleId}">${safe}</option>`);
      });
      
      const currentVal = select.value;
      select.innerHTML = opts.join('');
      if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
        select.value = currentVal;
      }
      
      // Update button state immediately
      btn.disabled = !select.value;

      // Add listener only once if possible, or just overwrite it
      // Using onchange instead of addEventListener to prevent multiple bindings on updates
      select.onchange = () => {
        btn.disabled = !select.value;
      };
    }, (err) => {
      select.innerHTML = `<option value="">Error: ${err.message}</option>`;
    });
}

// ── Next-run calculator ────────────────────────────────────────────────────
function computeNextRun() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const minutesToday8 = 8 * 60 - (utcHour * 60 + utcMin);
  const minutesToday20 = 20 * 60 - (utcHour * 60 + utcMin);

  let minutesUntil;
  if (minutesToday8 > 0) minutesUntil = minutesToday8;
  else if (minutesToday20 > 0) minutesUntil = minutesToday20;
  else minutesUntil = (24 * 60) - (utcHour * 60 + utcMin) + 8 * 60;

  const hh = Math.floor(minutesUntil / 60);
  const mm = minutesUntil % 60;
  const label = `In ${hh}h ${mm}m`;
  const el = document.getElementById('next-trending-run');
  if (el) el.textContent = label;

  // Carousel cron: 10:00 & 18:00 Asia/Jerusalem
  // (UTC offset +2 winter / +3 summer — approximate using current locale offset)
  const ilOffsetMin = -new Date().getTimezoneOffset(); // local minutes east of UTC
  const ilMinutesNow = (utcHour * 60 + utcMin) + (3 * 60); // crude: assume IL = UTC+3
  const ilWrap = ilMinutesNow % (24 * 60);
  const c10 = 10 * 60 - ilWrap;
  const c18 = 18 * 60 - ilWrap;
  let cMinutes;
  if (c10 > 0) cMinutes = c10;
  else if (c18 > 0) cMinutes = c18;
  else cMinutes = (24 * 60) - ilWrap + 10 * 60;
  const ch = Math.floor(cMinutes / 60);
  const cm = cMinutes % 60;
  const cel = document.getElementById('next-carousel-run');
  if (cel) cel.textContent = `In ${ch}h ${cm}m`;
}

// ── Load logs from Firestore ───────────────────────────────────────────────
function loadLogs() {
  const tbody = document.getElementById('logs-tbody');
  const loading = document.getElementById('logs-loading');
  const tableContainer = document.getElementById('logs-table-container');
  const emptyEl = document.getElementById('logs-empty');
  const countBadge = document.getElementById('log-count');

  loading.classList.remove('d-none');
  tableContainer.classList.add('d-none');
  emptyEl.classList.add('d-none');

  db.collection('schedulerLogs')
    .orderBy('startedAt', 'desc')
    .limit(50)
    .get()
    .then(snapshot => {
      loading.classList.add('d-none');
      countBadge.textContent = `${snapshot.size} entries`;

      if (snapshot.empty) {
        emptyEl.classList.remove('d-none');
        updateStats([]);
        return;
      }

      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateStats(logs);

      tbody.innerHTML = logs.map(log => {
        const startedAt = log.startedAt ? log.startedAt.toDate() : null;
        const completedAt = log.completedAt ? log.completedAt.toDate() : null;

        const timeStr = startedAt
          ? startedAt.toLocaleString('en-IL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
          : '—';

        const duration = (startedAt && completedAt)
          ? `${Math.round((completedAt - startedAt) / 1000)}s`
          : log.status === 'started' ? '<span class="text-warning">Running…</span>' : '—';

        const statusBadge = {
          success: '<span class="badge bg-success">Success</span>',
          error:   '<span class="badge bg-danger">Error</span>',
          started: '<span class="badge bg-warning text-dark"><span class="spinner-border spinner-border-sm" style="width:.6rem;height:.6rem"></span> Running</span>',
        }[log.status] || `<span class="badge bg-secondary">${log.status}</span>`;

        const typeBadge = log.type === 'trending'
          ? '<span class="badge bg-primary">Trending</span>'
          : log.type === 'instagram_carousel'
          ? '<span class="badge bg-info text-dark"><i class="bi bi-instagram me-1"></i>IG Carousel</span>'
          : '<span class="badge bg-secondary">Auto</span>';

        const triggerBadge = log.trigger === 'manual'
          ? '<span class="badge bg-warning text-dark"><i class="bi bi-hand-index me-1"></i>Manual</span>'
          : '<span class="badge bg-light text-dark border"><i class="bi bi-clock me-1"></i>Scheduled</span>';

        // Render IG-carousel rows distinctly: list comparison ids + IG media link
        let carouselCell = '';
        if (log.type === 'instagram_carousel') {
          const ids = Array.isArray(log.comparisonIds) ? log.comparisonIds : [];
          const mediaLink = log.mediaId
            ? `<a href="https://www.instagram.com/p/${log.mediaId}/" target="_blank" rel="noopener" class="d-block small"><i class="bi bi-link-45deg me-1"></i>View on Instagram</a>`
            : '';
          const err = log.status === 'error' ? `<div class="text-danger small">${log.error || ''}</div>` : '';
          carouselCell = `<div class="small">${ids.length} comparisons</div>${mediaLink}${err}`;
        }

        const articles = log.type === 'instagram_carousel'
          ? carouselCell
          : Array.isArray(log.articles) && log.articles.length > 0
          ? log.articles.map(a => {
              const titleEsc = (a.title || '').replace(/"/g, '&quot;');
              const titleLink = `<a href="/uncategorized/${a.id}" target="_blank" class="d-block text-truncate" style="max-width:260px" title="${titleEsc}">${titleEsc}</a>`;
              let sourcesLine = '';
              if (Array.isArray(a.sources) && a.sources.length > 0) {
                const links = a.sources.map(s => {
                  const name = (s.name || 'Source').replace(/</g, '&lt;');
                  return s.url
                    ? `<a href="${(s.url || '').replace(/"/g, '&quot;')}" target="_blank" rel="noopener" class="text-decoration-none">${name}</a>`
                    : name;
                }).join(' · ');
                const conf = (a.coherenceConfidence != null) ? ` <span class="badge bg-success-subtle text-success border border-success-subtle ms-1" title="Coherence confidence">${a.coherenceConfidence}%</span>` : '';
                sourcesLine = `<div class="small text-muted mt-1"><i class="bi bi-link-45deg me-1"></i>${a.sources.length} source${a.sources.length>1?'s':''}: ${links}${conf}</div>`;
              }
              return titleLink + sourcesLine;
            }).join('<hr class="my-2">')
          : log.status === 'error'
            ? `<span class="text-danger small">${log.error || 'Unknown error'}</span>`
            : '<span class="text-muted">—</span>';

        return `<tr>
          <td class="text-nowrap small">${timeStr}</td>
          <td>${typeBadge}</td>
          <td>${triggerBadge}</td>
          <td>${statusBadge}</td>
          <td class="small">${articles}</td>
          <td class="text-muted small text-nowrap">${duration}</td>
        </tr>`;
      }).join('');

      tableContainer.classList.remove('d-none');
    })
    .catch(err => {
      loading.classList.add('d-none');
      emptyEl.textContent = 'Error loading logs: ' + err.message;
      emptyEl.classList.remove('d-none');
    });
}

// ── Update stats cards ─────────────────────────────────────────────────────
function updateStats(logs) {
  const total = logs.length;
  const success = logs.filter(l => l.status === 'success').length;
  const errors = logs.filter(l => l.status === 'error').length;
  const articles = logs.reduce((sum, l) => sum + (Array.isArray(l.articles) ? l.articles.length : 0), 0);

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-success').textContent = success;
  document.getElementById('stat-error').textContent = errors;
  document.getElementById('stat-articles').textContent = articles;
}

// ── Manual trigger ─────────────────────────────────────────────────────────
let _logWatcher = null; // holds active onSnapshot unsubscribe

async function triggerTrending() {
  const btn = document.getElementById('trigger-trending-btn');
  const statusEl = document.getElementById('trigger-status');
  const originalHtml = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating…';
  statusEl.className = 'alert alert-info py-2 mb-0';
  statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Crawling 8 news sites and generating articles… this may take 2–3 minutes.';
  statusEl.classList.remove('d-none');

  try {
    const triggerFn = firebase.functions().httpsCallable('triggerTrendingArticles', { timeout: 540000 });
    await triggerFn({ count: 2 });
    statusEl.className = 'alert alert-success py-2 mb-0';
    statusEl.innerHTML = '<i class="bi bi-check-circle me-1"></i>Articles generated and published successfully!';
    loadLogs();
  } catch (err) {
    const isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
    if (isTimeout) {
      // Function is still running server-side — watch Firestore for the result
      statusEl.className = 'alert alert-warning py-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Still running in background — watching for completion…';
      watchLatestLog(statusEl);
    } else {
      statusEl.className = 'alert alert-danger py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${err.message}`;
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// Watch the most recent schedulerLogs entry until it finishes
function watchLatestLog(statusEl) {
  if (_logWatcher) { _logWatcher(); _logWatcher = null; }

  _logWatcher = db.collection('schedulerLogs')
    .orderBy('startedAt', 'desc')
    .limit(1)
    .onSnapshot(snapshot => {
      if (snapshot.empty) return;
      const log = snapshot.docs[0].data();

      if (log.status === 'success') {
        statusEl.className = 'alert alert-success py-2 mb-0';
        const titles = (log.articles || []).map(a => `<strong>${a.title}</strong>`).join(', ');
        statusEl.innerHTML = `<i class="bi bi-check-circle me-1"></i>Done! Published: ${titles || '—'}`;
        if (_logWatcher) { _logWatcher(); _logWatcher = null; }
        loadLogs();
      } else if (log.status === 'error') {
        statusEl.className = 'alert alert-danger py-2 mb-0';
        statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Failed: ${log.error || 'Unknown error'}`;
        if (_logWatcher) { _logWatcher(); _logWatcher = null; }
        loadLogs();
      }
      // status === 'started' → still running, keep watching
    }, err => {
      statusEl.className = 'alert alert-danger py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Watcher error: ${err.message}`;
    });
}

// ── Manual comparisons trigger ────────────────────────────────────────────
async function triggerComparisons() {
  const btn = document.getElementById('trigger-comparisons-btn');
  const statusEl = document.getElementById('trigger-comparisons-status');
  const originalHtml = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating…';
  statusEl.className = 'alert alert-info py-2 mb-0';
  statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Generating comparisons… this may take 1-2 minutes.';
  statusEl.classList.remove('d-none');

  try {
    const fn = firebase.functions().httpsCallable('triggerComparisons', { timeout: 540000 });
    await fn();
    statusEl.className = 'alert alert-success py-2 mb-0';
    statusEl.innerHTML = '<i class="bi bi-check-circle me-1"></i>Comparisons generated and published successfully!';
    loadLogs();
  } catch (err) {
    const isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
    if (isTimeout) {
      statusEl.className = 'alert alert-warning py-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Still running in background — watching for completion…';
      watchLatestLog(statusEl);
    } else {
      statusEl.className = 'alert alert-danger py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${err.message}`;
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ── Manual carousel trigger ───────────────────────────────────────────────
async function triggerCarousel() {
  const btn = document.getElementById('trigger-carousel-btn');
  const statusEl = document.getElementById('trigger-carousel-status');
  const originalHtml = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Posting…';
  statusEl.className = 'alert alert-info py-2 mb-0';
  statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Building 6 slides, generating cover image, and publishing to Instagram… (~30–60s)';
  statusEl.classList.remove('d-none');

  try {
    const fn = firebase.functions().httpsCallable('triggerInstagramCarousel', { timeout: 540000 });
    const res = await fn({ count: 4 });
    const mediaId = res && res.data && res.data.mediaId;
    statusEl.className = 'alert alert-success py-2 mb-0';
    statusEl.innerHTML = mediaId
      ? `<i class="bi bi-check-circle me-1"></i>Carousel published! <a href="https://www.instagram.com/p/${mediaId}/" target="_blank" class="alert-link">View on Instagram</a>`
      : '<i class="bi bi-check-circle me-1"></i>Carousel published!';
    loadLogs();
  } catch (err) {
    const isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
    if (isTimeout) {
      statusEl.className = 'alert alert-warning py-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Still running — check the logs table below in ~1 minute.';
      setTimeout(loadLogs, 30000);
    } else {
      statusEl.className = 'alert alert-danger py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${err.message}`;
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ── AI Tools Pulse daily carousel trigger ─────────────────────────────────
async function triggerAiToolsCarousel(language) {
  const btnId = language === 'he' ? 'trigger-ai-tools-carousel-he-btn' : 'trigger-ai-tools-carousel-en-btn';
  const btn = document.getElementById(btnId);
  const statusEl = document.getElementById('trigger-ai-tools-carousel-status');
  const otherBtn = document.getElementById(language === 'he' ? 'trigger-ai-tools-carousel-en-btn' : 'trigger-ai-tools-carousel-he-btn');
  const originalHtml = btn.innerHTML;
  const autoPublish = !!(document.getElementById('trigger-ai-tools-publish') || {}).checked;

  btn.disabled = true;
  if (otherBtn) otherBtn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Rendering…';
  statusEl.className = 'alert alert-info py-2 mb-0';
  statusEl.innerHTML = `<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Building 7-slide carousel with real logos (${language.toUpperCase()})… ${autoPublish ? 'will publish to IG when ready' : 'render only'}.`;
  statusEl.classList.remove('d-none');

  try {
    const fn = firebase.functions().httpsCallable('triggerAiToolsCarousel', { timeout: 540000 });
    const res = await fn({ language, autoPublish });
    const data = (res && res.data) || {};
    statusEl.className = 'alert alert-success py-2 mb-0';
    const tools = (data.toolSlugs || []).join(', ');
    let extra = '';
    if (data.instagramUrl) {
      extra = ` · <a href="${data.instagramUrl}" target="_blank" class="alert-link">View on Instagram</a>`;
    }
    statusEl.innerHTML = `<i class="bi bi-check-circle me-1"></i>Carousel ready (${data.slideUrls ? data.slideUrls.length : 0} slides) — featured: ${tools}${extra}`;
    loadLogs();
  } catch (err) {
    const isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
    if (isTimeout) {
      statusEl.className = 'alert alert-warning py-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Still running in background — check logs in ~1 minute.';
      setTimeout(loadLogs, 30000);
    } else {
      statusEl.className = 'alert alert-danger py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${err.message}`;
    }
  } finally {
    btn.disabled = false;
    if (otherBtn) otherBtn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ── AI Tools Explainer videos — render all 6 ──────────────────────────────
// Calls the renderAllAiToolsExplainers HTTPS-callable wrapper. The render
// itself takes ~30-60 min, so on the front-end we accept the "deadline
// exceeded" we'll inevitably get and tell the user to watch the logs.
async function triggerAllAiToolsExplainers() {
  const btn = document.getElementById('trigger-ai-tools-explainers-btn');
  const statusEl = document.getElementById('trigger-ai-tools-explainers-status');
  if (!btn || !statusEl) return;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Rendering 6 videos…';
  statusEl.className = 'alert alert-info py-2 mb-0';
  statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Kicking off all 6 explainer renders. This runs in the background for ~30-60 min. Watch the Generation Logs below for progress.';
  statusEl.classList.remove('d-none');
  try {
    // The callable wrapper triggers the same pipeline as the HTTP endpoint.
    const fn = firebase.functions().httpsCallable('triggerAiToolsExplainer', { timeout: 540000 });
    // Fire 6 in parallel as separate callable invocations — the backend
    // serialises Lambda renders per-call anyway, and this avoids hitting
    // the single-call 9-minute Cloud Functions client timeout.
    const combos = [
      { topic: 'landing',  language: 'en' },
      { topic: 'landing',  language: 'he' },
      { topic: 'guide',    language: 'en' },
      { topic: 'guide',    language: 'he' },
      { topic: 'glossary', language: 'en' },
      { topic: 'glossary', language: 'he' },
    ];
    const results = await Promise.allSettled(combos.map((c) => fn(c)));
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value && r.value.data && r.value.data.success).length;
    statusEl.className = ok === 6 ? 'alert alert-success py-2 mb-0' : 'alert alert-warning py-2 mb-0';
    statusEl.innerHTML = `<i class="bi bi-check-circle me-1"></i>${ok}/6 explainer renders completed. Check Firestore <code>ai_tools_explainers</code> for the URLs.`;
    loadLogs();
  } catch (err) {
    const isTimeout = err && (err.code === 'deadline-exceeded' || (err.message || '').includes('deadline'));
    if (isTimeout) {
      statusEl.className = 'alert alert-warning py-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Render is still running in the background — watch the logs below.';
      setTimeout(loadLogs, 60000);
    } else {
      statusEl.className = 'alert alert-danger py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${(err && err.message) || 'unknown'}`;
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ── BIT Weekly Digest trigger (EN) ────────────────────────────────────────
async function triggerDigestEn() { return triggerDigest('en', 'trigger-digest-btn'); }
async function triggerDigestHe() { return triggerDigest('he', 'trigger-digest-he-btn'); }

async function triggerDigest(language, btnId) {
  const btn = document.getElementById(btnId);
  const statusEl = document.getElementById('trigger-digest-status');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Rendering…';
  statusEl.className = 'alert alert-info py-2 mb-0';
  statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>BIT is recording the news… ~8–12 minutes (Veo + Remotion). Don\'t close the page.';
  statusEl.classList.remove('d-none');
  const autoPublish = !!(document.getElementById('trigger-digest-publish') || {}).checked;
  try {
    const fn = firebase.functions().httpsCallable('triggerWeeklyDigestAdmin', { timeout: 540000 });
    const res = await fn({ language, autoPublish });
    const data = (res && res.data) || {};
    statusEl.className = 'alert alert-success py-2 mb-0';
    let extra = '';
    if (data.publish) {
      if (data.publish.youtubeUrl) extra += ` · <a href="${data.publish.youtubeUrl}" target="_blank" class="alert-link">YouTube</a>`;
      if (data.publish.instagramUrl) extra += ` · <a href="${data.publish.instagramUrl}" target="_blank" class="alert-link">Instagram</a>`;
      if (data.publish.youtubeError) extra += ` · YT err: ${data.publish.youtubeError}`;
      if (data.publish.instagramError) extra += ` · IG err: ${data.publish.instagramError}`;
    }
    statusEl.innerHTML = data.videoUrl
      ? `<i class="bi bi-check-circle me-1"></i>Digest ready (${data.storyCount} stories) — <a href="${data.videoUrl}" target="_blank" class="alert-link">view MP4</a>${extra}`
      : '<i class="bi bi-check-circle me-1"></i>Digest run complete';
  } catch (err) {
    const isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
    if (isTimeout) {
      statusEl.className = 'alert alert-warning py-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Still rendering — the MP4 will land in `cartoon_test_runs` in ~5 more minutes.';
    } else {
      statusEl.className = 'alert alert-danger py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${err.message}`;
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ── BIT Single Story Anchor (EN) ──────────────────────────────────────────
async function triggerSingleEn() {
  const select = document.getElementById('trigger-single-select');
  const btn = document.getElementById('trigger-single-btn');
  const statusEl = document.getElementById('trigger-single-status');
  const articleId = select ? select.value : '';
  if (!articleId) return;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Rendering…';
  statusEl.className = 'alert alert-info py-2 mb-0';
  statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>BIT is recording your story… ~3–5 minutes (single story, fewer Veo clips than weekly).';
  statusEl.classList.remove('d-none');
  const autoPublish = !!(document.getElementById('trigger-single-publish') || {}).checked;
  try {
    const fn = firebase.functions().httpsCallable('triggerWeeklyDigestAdmin', { timeout: 540000 });
    const res = await fn({ language: 'en', articleId, autoPublish });
    const data = (res && res.data) || {};
    statusEl.className = 'alert alert-success py-2 mb-0';
    let extra = '';
    if (data.publish) {
      if (data.publish.youtubeUrl) extra += ` · <a href="${data.publish.youtubeUrl}" target="_blank" class="alert-link">YouTube</a>`;
      if (data.publish.instagramUrl) extra += ` · <a href="${data.publish.instagramUrl}" target="_blank" class="alert-link">Instagram</a>`;
    }
    statusEl.innerHTML = data.videoUrl
      ? `<i class="bi bi-check-circle me-1"></i>Anchor video ready — <a href="${data.videoUrl}" target="_blank" class="alert-link">view MP4</a>${extra}`
      : '<i class="bi bi-check-circle me-1"></i>Run complete';
  } catch (err) {
    const isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
    if (isTimeout) {
      statusEl.className = 'alert alert-warning py-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Still rendering — MP4 will appear in `cartoon_test_runs` in a moment.';
    } else {
      statusEl.className = 'alert alert-danger py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${err.message}`;
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ── Design Systems carousel trigger ───────────────────────────────────────
async function triggerDesignSystemsCarousel(language) {
  const btnId = language === 'he' ? 'trigger-ds-carousel-he-btn' : 'trigger-ds-carousel-en-btn';
  const btn = document.getElementById(btnId);
  const otherBtn = document.getElementById(language === 'he' ? 'trigger-ds-carousel-en-btn' : 'trigger-ds-carousel-he-btn');
  const statusEl = document.getElementById('trigger-ds-status');
  const originalHtml = btn.innerHTML;
  const autoPublish = !!(document.getElementById('trigger-ds-carousel-publish') || {}).checked;

  btn.disabled = true;
  if (otherBtn) otherBtn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Rendering…';
  statusEl.className = 'alert alert-info py-2 mb-0';
  statusEl.innerHTML = `<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Building design-systems carousel (${language.toUpperCase()})… ${autoPublish ? 'will publish to IG.' : 'render only.'}`;
  statusEl.classList.remove('d-none');

  try {
    const fn = firebase.functions().httpsCallable('triggerDesignSystemsCarousel', { timeout: 540000 });
    const res = await fn({ language, autoPublish });
    const data = (res && res.data) || {};
    statusEl.className = 'alert alert-success py-2 mb-0';
    let extra = '';
    if (data.instagramUrl) extra = ` · <a href="${data.instagramUrl}" target="_blank" class="alert-link">View on Instagram</a>`;
    statusEl.innerHTML = `<i class="bi bi-check-circle me-1"></i>Carousel ready${data.slideUrls ? ` (${data.slideUrls.length} slides)` : ''}${extra}`;
    loadLogs();
  } catch (err) {
    const isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
    if (isTimeout) {
      statusEl.className = 'alert alert-warning py-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Still running in background — check logs in ~1 minute.';
      setTimeout(loadLogs, 30000);
    } else {
      statusEl.className = 'alert alert-danger py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${err.message}`;
    }
  } finally {
    btn.disabled = false;
    if (otherBtn) otherBtn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function triggerDesignSystemsReel(language) {
  const btnId = language === 'he' ? 'trigger-ds-reel-he-btn' : 'trigger-ds-reel-en-btn';
  const btn = document.getElementById(btnId);
  const otherBtn = document.getElementById(language === 'he' ? 'trigger-ds-reel-en-btn' : 'trigger-ds-reel-he-btn');
  const statusEl = document.getElementById('trigger-ds-status');
  const originalHtml = btn.innerHTML;
  const autoPublish = !!(document.getElementById('trigger-ds-reel-publish') || {}).checked;

  btn.disabled = true;
  if (otherBtn) otherBtn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Rendering…';
  statusEl.className = 'alert alert-info py-2 mb-0';
  statusEl.innerHTML = `<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Rendering weekly reel (${language.toUpperCase()})… ~8–12 minutes. ${autoPublish ? 'Will publish to YT + IG.' : 'Render only.'}`;
  statusEl.classList.remove('d-none');

  try {
    const fn = firebase.functions().httpsCallable('triggerDesignSystemsReel', { timeout: 540000 });
    const res = await fn({ language, autoPublish });
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
    loadLogs();
  } catch (err) {
    const isTimeout = err.code === 'deadline-exceeded' || (err.message || '').includes('deadline');
    if (isTimeout) {
      statusEl.className = 'alert alert-warning py-2 mb-0';
      statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width:.8rem;height:.8rem"></span>Still rendering — MP4 will appear shortly.';
    } else {
      statusEl.className = 'alert alert-danger py-2 mb-0';
      statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Error: ${err.message}`;
    }
  } finally {
    btn.disabled = false;
    if (otherBtn) otherBtn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

window.loadAutomationPanel = loadAutomationPanel;
