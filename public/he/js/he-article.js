// he-article.js — Hebrew article page loader (with share, comments, AI agent)

(function () {
  'use strict';

  function initHeArticlePage(db, auth) {
    var routingRaw = sessionStorage.getItem('heArticleRouting');
    var routing = null;
    try { routing = routingRaw ? JSON.parse(routingRaw) : null; } catch (e) { routing = null; }

    var loadingEl  = document.getElementById('article-loading');
    var errorEl    = document.getElementById('article-error');
    var errorMsgEl = document.getElementById('article-error-message');
    var wrapperEl  = document.getElementById('article-content-wrapper');
    var bodyEl     = document.getElementById('he-article-body');

    function showError(msg) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) { errorEl.style.display = ''; if (errorMsgEl) errorMsgEl.textContent = msg || 'לא ניתן לטעון את הכתבה.'; }
    }
    function showArticle() {
      if (loadingEl) loadingEl.style.display = 'none';
      if (wrapperEl) wrapperEl.style.display = '';
    }

    if (!routing || !routing.slug) {
      var rawPathname = window.location.pathname;
      var decodedPathname = rawPathname;
      try { decodedPathname = decodeURIComponent(rawPathname); } catch (e) {}
      var pathParts = decodedPathname.replace(/^\/he\//, '').split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        routing = { category: pathParts[0], slug: pathParts[1] };
      } else if (pathParts.length === 1) {
        showError('כתובת הכתבה אינה תקינה.'); return;
      } else {
        showError('לא נמצאו פרטי ניתוב לכתבה.'); return;
      }
    }

    var articleSlug  = routing.slug;
    var categorySlug = routing.category || '';
    sessionStorage.removeItem('heArticleRouting');

    db.collection('he_articles').where('slug', '==', articleSlug).limit(1).get()
      .then(function (snapshot) {
        if (snapshot.empty) { showError('הכתבה לא נמצאה.'); return; }
        var doc     = snapshot.docs[0];
        var article = Object.assign({ id: doc.id }, doc.data());
        if (!article.published) { showError('הכתבה אינה זמינה כרגע.'); return; }

        var catInfo = (window.heApp && window.heApp.heCategoryCache) ? window.heApp.heCategoryCache[article.category] : null;
        if (catInfo) {
          renderArticle(article, catInfo);
        } else {
          db.collection('he_sections').doc(article.category).get()
            .then(function (catDoc) {
              catInfo = catDoc.exists
                ? { name: catDoc.data().name || '', slug: catDoc.data().slug || categorySlug }
                : { name: '', slug: categorySlug };
              renderArticle(article, catInfo);
            }).catch(function () { renderArticle(article, { name: '', slug: categorySlug }); });
        }
      })
      .catch(function (err) { showError('שגיאה בטעינת הכתבה: ' + (err.message || '')); });

    // ── Helpers ──────────────────────────────────────────────────────────────

    function formatDate(ts) {
      if (!ts) return '';
      var d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function heEsc(str) {
      if (!str) return '';
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Render article ────────────────────────────────────────────────────────

    function renderArticle(article, catInfo) {
      document.title = (article.title || '') + ' | TrendingTech Daily';
      var metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && article.excerpt) metaDesc.setAttribute('content', article.excerpt);

      var canonicalPath = '/he/' + (catInfo.slug || 'tech') + '/' + (article.slug || '');
      var canonicalFull = 'https://www.trendingtechdaily.com' + canonicalPath;
      var canonicalLink = document.querySelector('link[rel="canonical"]');
      if (!canonicalLink) { canonicalLink = document.createElement('link'); canonicalLink.rel = 'canonical'; document.head.appendChild(canonicalLink); canonicalLink.href = canonicalFull; }

      var bc = document.getElementById('breadcrumb-category');
      var bt = document.getElementById('breadcrumb-title');
      if (bc && catInfo.name) bc.innerHTML = '<a href="/he/' + catInfo.slug + '" style="color:#2196F3;">' + heEsc(catInfo.name) + '</a>';
      if (bt) bt.textContent = (article.title || '').substring(0, 60) + ((article.title || '').length > 60 ? '...' : '');

      var dateStr  = formatDate(article.createdAt);
      var readTime = article.readingTimeMinutes ? article.readingTimeMinutes + ' דק\' קריאה' : '';
      var html = '';

      if (article.featuredImage) {
        html += '<figure class="mb-4"><img src="' + heEsc(article.featuredImage) + '" alt="' + heEsc(article.imageAltText || article.title || '') + '" class="img-fluid rounded" style="width:100%;max-height:450px;object-fit:cover;"></figure>';
      }
      if (catInfo.name) html += '<div class="mb-3"><a href="/he/' + catInfo.slug + '" class="category-badge">' + heEsc(catInfo.name) + '</a></div>';
      html += '<h1 class="featured-article-title mb-3" style="font-size:1.9rem;">' + heEsc(article.title || '') + '</h1>';
      if (dateStr || readTime) {
        html += '<div class="d-flex gap-3 text-muted small mb-4 flex-wrap">';
        if (dateStr)  html += '<span><i class="bi bi-calendar3 me-1"></i>' + dateStr + '</span>';
        if (readTime) html += '<span><i class="bi bi-clock me-1"></i>' + readTime + '</span>';
        html += '</div>';
      }
      if (article.excerpt) {
        html += '<p class="lead mb-4" style="font-size:1.1rem;color:#444;">' + heEsc(article.excerpt) + '</p>';
        html += '<hr class="mb-4">';
      }
      html += '<div class="article-content">' + (article.content || '<p>אין תוכן זמין.</p>') + '</div>';

      // Embedded tweets
      if (article.tweetUrls && article.tweetUrls.length > 0) {
        html += '<div class="article-tweets mt-5 pt-4 border-top">' +
          '<h4 class="mb-3 fw-bold" style="font-size:1.1rem;">' +
            '<i class="bi bi-twitter-x me-2"></i>מה אומרים ב-X' +
          '</h4>' +
          '<div class="row g-3">';
        article.tweetUrls.forEach(function(url) {
          html += '<div class="col-12 col-md-4">' +
            '<blockquote class="twitter-tweet" data-dnt="true" data-theme="light" data-align="center" dir="ltr">' +
              '<a href="' + url + '"></a>' +
            '</blockquote>' +
          '</div>';
        });
        html += '</div></div>';
      }

      // Embedded YouTube videos
      if (article.youtubeVideos && article.youtubeVideos.length > 0) {
        html += '<div class="article-youtube mt-5 pt-4 border-top">' +
          '<h4 class="mb-3 fw-bold" style="font-size:1.1rem;">' +
            '<i class="bi bi-youtube me-2 text-danger"></i>סרטונים רלוונטיים' +
          '</h4>' +
          '<div class="row g-4">';
        article.youtubeVideos.forEach(function(v) {
          var safeId = (v && v.videoId ? String(v.videoId) : '').replace(/[^A-Za-z0-9_-]/g, '');
          if (!safeId) return;
          var titleAttr = heEsc(v.title || '');
          html += '<div class="col-12 col-md-6">' +
            '<div class="ratio ratio-16x9 rounded overflow-hidden shadow-sm">' +
              '<iframe src="https://www.youtube.com/embed/' + safeId + '"' +
                ' title="' + titleAttr + '"' +
                ' frameborder="0"' +
                ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"' +
                ' referrerpolicy="strict-origin-when-cross-origin"' +
                ' loading="lazy" allowfullscreen></iframe>' +
            '</div>' +
            '<div class="mt-2 small" dir="rtl">' +
              '<div class="fw-bold text-truncate" title="' + titleAttr + '">' + heEsc(v.title || '') + '</div>' +
              (v.channelTitle ? '<div class="text-muted">' + heEsc(v.channelTitle) + '</div>' : '') +
            '</div>' +
          '</div>';
        });
        html += '</div></div>';
      }

      // Tags
      if (article.tags && article.tags.length > 0) {
        html += '<div class="mt-4 pt-3 border-top"><strong>תגיות: </strong>';
        article.tags.forEach(function (tag) {
          html += '<a href="/search.html?q=' + encodeURIComponent(tag) + '" class="badge bg-secondary me-1 text-decoration-none" style="font-size:0.8rem;">' + heEsc(tag) + '</a>';
        });
        html += '</div>';
      }

      // ── Share buttons ─────────────────────────────────────────────────────
      html += '<div class="he-share-section my-4 py-3 border-top border-bottom">' +
        '<div class="d-flex align-items-center gap-2 flex-wrap">' +
        '<span class="fw-bold small text-muted">שיתוף:</span>' +
        '<a id="he-share-whatsapp" href="#" target="_blank" rel="noopener" class="btn btn-sm btn-success he-share-btn"><i class="bi bi-whatsapp me-1"></i>WhatsApp</a>' +
        '<a id="he-share-twitter"  href="#" target="_blank" rel="noopener" class="btn btn-sm btn-dark he-share-btn"><i class="bi bi-twitter-x me-1"></i>X</a>' +
        '<a id="he-share-facebook" href="#" target="_blank" rel="noopener" class="btn btn-sm he-share-btn" style="background:#1877f2;color:#fff;border-color:#1877f2;"><i class="bi bi-facebook me-1"></i>Facebook</a>' +
        '<button id="he-share-copy" class="btn btn-sm btn-outline-secondary he-share-btn"><i class="bi bi-link-45deg me-1"></i>העתק קישור</button>' +
        '<span id="he-copy-feedback" class="small text-success" style="display:none;">✓ הקישור הועתק!</span>' +
        '</div>' +
        '</div>';

      // ── Comments section ───────────────────────────────────────────────────
      html += '<div class="he-comments-section mt-5">' +
        '<h4 class="mb-4 fw-700" style="font-size:1.2rem;"><i class="bi bi-chat-dots me-2 text-primary"></i>תגובות</h4>' +
        '<div id="he-comment-form-area" class="mb-4"></div>' +
        '<div id="he-comments-list"><div class="text-center py-3 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>טוען תגובות...</div></div>' +
        '</div>';

      bodyEl.innerHTML = html;
      showArticle();

      // Load Twitter widget for embedded tweets
      if (article.tweetUrls && article.tweetUrls.length > 0) {
        if (window.twttr && window.twttr.widgets) {
          window.twttr.widgets.load();
        } else if (!document.getElementById('twitter-widgets-script')) {
          var twitterScript = document.createElement('script');
          twitterScript.id = 'twitter-widgets-script';
          twitterScript.async = true;
          twitterScript.src = 'https://platform.twitter.com/widgets.js';
          document.body.appendChild(twitterScript);
        }
      }

      // Setup share buttons after DOM is set
      setupHeShare(article, catInfo, canonicalFull);

      // Load comments
      loadHeComments(db, auth, article.id);

      // Update sidebar categories
      if (window.heApp) window.heApp.loadHeCategories(db);
    }

    // ── Share buttons setup ───────────────────────────────────────────────────

    function setupHeShare(article, catInfo, pageUrl) {
      var url   = pageUrl || window.location.href;
      var title = article.title || '';
      var text  = article.excerpt || title;

      var wa = document.getElementById('he-share-whatsapp');
      if (wa) wa.href = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(title + '\n' + url);

      var tw = document.getElementById('he-share-twitter');
      if (tw) tw.href = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(title);

      var fb = document.getElementById('he-share-facebook');
      if (fb) fb.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);

      var copyBtn  = document.getElementById('he-share-copy');
      var feedback = document.getElementById('he-copy-feedback');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          navigator.clipboard.writeText(url).then(function () {
            if (feedback) { feedback.style.display = 'inline'; setTimeout(function () { feedback.style.display = 'none'; }, 2500); }
          }).catch(function () {
            // Fallback for browsers without clipboard API
            var ta = document.createElement('textarea');
            ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (feedback) { feedback.style.display = 'inline'; setTimeout(function () { feedback.style.display = 'none'; }, 2500); }
          });
        });
      }
    }

    // ── Comments ──────────────────────────────────────────────────────────────

    function loadHeComments(db, auth, articleId) {
      var formArea    = document.getElementById('he-comment-form-area');
      var commentList = document.getElementById('he-comments-list');
      if (!formArea || !commentList) return;

      // Render comment form based on auth state
      function renderCommentForm(user) {
        if (user) {
          formArea.innerHTML =
            '<div class="he-comment-form p-3 rounded" style="background:#f7f8fc;border:1px solid #e5e7eb;">' +
              '<div class="d-flex gap-2 align-items-start">' +
                '<div class="he-comment-avatar" style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0;font-size:0.85rem;">' +
                  (user.photoURL
                    ? '<img src="' + user.photoURL + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />'
                    : (user.displayName || user.email || '?').charAt(0).toUpperCase()) +
                '</div>' +
                '<div class="flex-grow-1">' +
                  '<textarea id="he-comment-text" class="form-control mb-2" rows="2" placeholder="כתבו תגובה..." style="resize:none;border-radius:10px;border:1.5px solid #e5e7eb;font-family:Heebo,sans-serif;" maxlength="1000"></textarea>' +
                  '<div class="d-flex justify-content-between align-items-center">' +
                    '<span class="small text-muted" id="he-comment-charcount">0/1000</span>' +
                    '<button id="he-comment-submit" class="btn btn-primary btn-sm px-3" style="border-radius:8px;">פרסם תגובה</button>' +
                  '</div>' +
                  '<div id="he-comment-error" class="text-danger small mt-1"></div>' +
                '</div>' +
              '</div>' +
            '</div>';

          var textarea = document.getElementById('he-comment-text');
          var charCount = document.getElementById('he-comment-charcount');
          if (textarea && charCount) {
            textarea.addEventListener('input', function () {
              charCount.textContent = textarea.value.length + '/1000';
            });
          }

          var submitBtn = document.getElementById('he-comment-submit');
          if (submitBtn) {
            submitBtn.addEventListener('click', function () {
              var text = (textarea ? textarea.value : '').trim();
              var errEl = document.getElementById('he-comment-error');
              if (!text) { if (errEl) errEl.textContent = 'נא לכתוב תגובה לפני הפרסום.'; return; }
              if (text.length > 1000) { if (errEl) errEl.textContent = 'התגובה ארוכה מדי.'; return; }

              submitBtn.disabled = true;
              submitBtn.textContent = 'שולח...';

              db.collection('he_comments').add({
                articleId:   articleId,
                userId:      user.uid,
                displayName: user.displayName || user.email.split('@')[0] || 'משתמש',
                photoURL:    user.photoURL || null,
                text:        text,
                createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
                approved:    true
              }).then(function () {
                if (textarea)  textarea.value = '';
                if (charCount) charCount.textContent = '0/1000';
                if (errEl)     errEl.textContent = '';
                submitBtn.disabled = false;
                submitBtn.textContent = 'פרסם תגובה';
              }).catch(function (err) {
                if (errEl) errEl.textContent = 'שגיאה בפרסום התגובה. נסו שוב.';
                submitBtn.disabled = false;
                submitBtn.textContent = 'פרסם תגובה';
              });
            });
          }

        } else {
          // Not logged in
          formArea.innerHTML =
            '<div class="p-3 rounded text-center" style="background:#f7f8fc;border:1px dashed #d1d5db;">' +
              '<i class="bi bi-chat-square-text text-muted d-block mb-2" style="font-size:1.5rem;"></i>' +
              '<p class="mb-2 small text-muted">כדי להגיב עליכם להתחבר</p>' +
              '<a href="/he/login?redirect=' + encodeURIComponent(window.location.pathname) + '" class="btn btn-primary btn-sm px-4" style="border-radius:8px;">כניסה לחשבון</a>' +
              '<span class="mx-2 text-muted small">או</span>' +
              '<a href="/he/signup" class="btn btn-outline-primary btn-sm px-4" style="border-radius:8px;">הרשמה חינם</a>' +
            '</div>';
        }
      }

      // Listen for auth state
      auth.onAuthStateChanged(function (user) { renderCommentForm(user); });

      // Real-time comments listener
      db.collection('he_comments')
        .where('articleId', '==', articleId)
        .where('approved', '==', true)
        .orderBy('createdAt', 'asc')
        .onSnapshot(function (snap) {
          if (snap.empty) {
            commentList.innerHTML =
              '<p class="text-muted small text-center py-3"><i class="bi bi-chat-dots me-1"></i>היו הראשונים להגיב!</p>';
            return;
          }
          var html = '';
          snap.forEach(function (doc) {
            var c = doc.data();
            var dateStr = '';
            if (c.createdAt && c.createdAt.toDate) {
              var d = c.createdAt.toDate();
              dateStr = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }) +
                ' · ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
            }
            var initials = (c.displayName || '?').charAt(0).toUpperCase();
            var avatarHtml = c.photoURL
              ? '<img src="' + escH(c.photoURL) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />'
              : initials;

            html += '<div class="he-comment d-flex gap-3 mb-3">' +
              '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0;font-size:0.85rem;overflow:hidden;">' + avatarHtml + '</div>' +
              '<div class="flex-grow-1">' +
                '<div class="d-flex align-items-center gap-2 mb-1">' +
                  '<strong class="small">' + escH(c.displayName || 'משתמש') + '</strong>' +
                  (dateStr ? '<span class="text-muted" style="font-size:0.75rem;">' + escH(dateStr) + '</span>' : '') +
                '</div>' +
                '<div class="small" style="color:#374151;line-height:1.6;">' + escH(c.text || '') + '</div>' +
              '</div>' +
              '</div>';
          });
          commentList.innerHTML = html;
        }, function (err) {
          commentList.innerHTML = '<p class="text-muted small">שגיאה בטעינת תגובות.</p>';
          console.warn('he-comments: error', err);
        });
    }

    function escH(str) {
      if (!str) return '';
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', function () {
    var attempts = 0;
    function tryInit() {
      if (window.heApp && window.heApp.waitForFirebase) {
        window.heApp.waitForFirebase(function (db, auth) {
          if (window.heApp.loadHeSections) {
            window.heApp.loadHeSections(db).then(function () { initHeArticlePage(db, auth); });
          } else {
            initHeArticlePage(db, auth);
          }
        });
      } else if (attempts < 30) {
        attempts++;
        setTimeout(tryInit, 200);
      } else {
        console.error('he-article.js: heApp not available.');
      }
    }
    tryInit();
  });
})();
