// he-profile.js — Hebrew profile page logic

document.addEventListener('DOMContentLoaded', function () {
  waitForFirebase(function (db, auth) {

    // ── Load navbar ────────────────────────────────────────────────────────────
    var navPlaceholder = document.getElementById('he-nav-placeholder');
    if (navPlaceholder) {
      fetch('/he/nav.html')
        .then(function (r) { return r.text(); })
        .then(function (html) {
          navPlaceholder.innerHTML = html;
          initHeNavCategories(db);
          setupHeAuthListener(auth);
          setupHeSearch();
        })
        .catch(function () {});
    }

    var loadingEl = document.getElementById('profile-loading');
    var contentEl = document.getElementById('profile-content');

    // ── Auth state: redirect if not logged in ─────────────────────────────────
    auth.onAuthStateChanged(function (user) {
      if (!user) {
        window.location.href = '/he/login?redirect=/he/profile';
        return;
      }
      showProfile(user);
    });

    function showProfile(user) {
      // Hide loading, show content
      if (loadingEl) loadingEl.classList.add('d-none');
      if (contentEl) contentEl.classList.remove('d-none');

      // Avatar
      var avatarWrap = document.getElementById('profile-avatar-wrap');
      var initialsEl = document.getElementById('profile-initials');
      if (user.photoURL && avatarWrap) {
        var img = document.createElement('img');
        img.src = user.photoURL;
        img.alt = user.displayName || 'משתמש';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
        avatarWrap.innerHTML = '';
        avatarWrap.appendChild(img);
      } else if (initialsEl) {
        var name = user.displayName || user.email || '?';
        initialsEl.textContent = name.charAt(0).toUpperCase();
      }

      // Name & email
      var nameEl  = document.getElementById('profile-display-name');
      var emailEl = document.getElementById('profile-email');
      if (nameEl)  nameEl.textContent  = user.displayName || 'משתמש';
      if (emailEl) emailEl.textContent = user.email || '';

      // Edit name pre-fill
      var editInput = document.getElementById('edit-display-name');
      if (editInput) editInput.value = user.displayName || '';

      // Member since (from metadata)
      var sinceEl = document.getElementById('profile-member-since');
      if (sinceEl && user.metadata && user.metadata.creationTime) {
        var d = new Date(user.metadata.creationTime);
        sinceEl.textContent = 'חבר מאז ' + d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
      }

      // Stats
      var providerEl  = document.getElementById('stat-provider');
      var verifiedEl  = document.getElementById('stat-verified');
      var joinedEl    = document.getElementById('stat-joined');
      var providerMap = { 'google.com': 'Google', 'password': 'Email', 'facebook.com': 'Facebook' };
      var providerId  = (user.providerData && user.providerData[0]) ? user.providerData[0].providerId : '—';
      if (providerEl) providerEl.textContent = providerMap[providerId] || providerId;
      if (verifiedEl) {
        verifiedEl.textContent = user.emailVerified ? '✓' : '✗';
        verifiedEl.className   = 'stat-num ' + (user.emailVerified ? 'text-success' : 'text-danger');
      }
      if (joinedEl && user.metadata && user.metadata.creationTime) {
        var jd = new Date(user.metadata.creationTime);
        joinedEl.textContent = jd.toLocaleDateString('he-IL', { month: 'short', year: 'numeric' });
        joinedEl.style.fontSize = '1rem';
      }

      // Load recent articles
      loadRecentArticles(db);
    }

    // ── Edit display name ─────────────────────────────────────────────────────
    var saveNameBtn = document.getElementById('save-display-name-btn');
    var editMsg     = document.getElementById('edit-name-msg');
    if (saveNameBtn) {
      saveNameBtn.addEventListener('click', function () {
        var newName = (document.getElementById('edit-display-name').value || '').trim();
        if (!newName) {
          editMsg.textContent = 'נא להזין שם.';
          editMsg.style.color = '#dc3545';
          return;
        }
        var user = auth.currentUser;
        if (!user) return;

        saveNameBtn.disabled = true;
        saveNameBtn.textContent = 'שומר...';

        user.updateProfile({ displayName: newName })
          .then(function () {
            return db.collection('users').doc(user.uid).set({ displayName: newName }, { merge: true });
          })
          .then(function () {
            editMsg.textContent = 'השם עודכן בהצלחה!';
            editMsg.style.color = '#198754';
            var nameEl = document.getElementById('profile-display-name');
            if (nameEl) nameEl.textContent = newName;
            saveNameBtn.disabled = false;
            saveNameBtn.textContent = 'שמור שם';
          })
          .catch(function (err) {
            editMsg.textContent = 'שגיאה בעדכון: ' + err.message;
            editMsg.style.color = '#dc3545';
            saveNameBtn.disabled = false;
            saveNameBtn.textContent = 'שמור שם';
          });
      });
    }

    // ── Logout ─────────────────────────────────────────────────────────────────
    var logoutBtn = document.getElementById('profile-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        logoutBtn.disabled = true;
        logoutBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>מתנתק...';
        auth.signOut()
          .then(function () { window.location.href = '/he/'; })
          .catch(function () {
            logoutBtn.disabled = false;
            logoutBtn.innerHTML = '<i class="bi bi-box-arrow-right me-2"></i>התנתקות';
          });
      });
    }

    // ── Recent articles ────────────────────────────────────────────────────────
    function loadRecentArticles(db) {
      var listEl = document.getElementById('recent-articles-list');
      if (!listEl) return;

      // Load sections for slugs first
      var sectionsMap = {};
      db.collection('he_sections').get()
        .then(function (sectSnap) {
          sectSnap.forEach(function (doc) {
            sectionsMap[doc.id] = doc.data();
          });
          return db.collection('he_articles')
            .where('published', '==', true)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
        })
        .then(function (snap) {
          if (snap.empty) {
            listEl.innerHTML = '<p class="text-muted small text-center py-2">אין כתבות עדיין.</p>';
            return;
          }
          var html = '';
          snap.forEach(function (doc) {
            var a = doc.data();
            var catInfo = sectionsMap[a.category] || {};
            var catSlug = catInfo.slug || 'technology';
            var artSlug = a.slug || '';
            var href    = artSlug ? '/he/' + catSlug + '/' + artSlug : '#';
            var img     = a.featuredImage || '';
            var date    = a.createdAt && a.createdAt.toDate
              ? a.createdAt.toDate().toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
              : '';
            var catName = catInfo.name || '';

            html += '<div class="article-mini">';
            if (img) {
              html += '<img src="' + img + '" class="article-mini-img" alt="" loading="lazy" />';
            } else {
              html += '<div class="article-mini-img" style="background:linear-gradient(135deg,#e8eaf6,#c5cae9);border-radius:8px;"></div>';
            }
            html += '<div class="flex-grow-1">';
            html += '<a href="' + href + '" class="article-mini-title d-block">' + heEscape(a.title || '') + '</a>';
            html += '<div class="article-mini-meta">';
            if (catName) html += '<span class="badge bg-primary bg-opacity-10 text-primary me-1" style="font-size:0.7rem;">' + heEscape(catName) + '</span>';
            if (date) html += date;
            html += '</div></div></div>';
          });
          listEl.innerHTML = html;
        })
        .catch(function (err) {
          listEl.innerHTML = '<p class="text-muted small">שגיאה בטעינת כתבות.</p>';
          console.warn('he-profile: article load error', err);
        });
    }

  });
});
