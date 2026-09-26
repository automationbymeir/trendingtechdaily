// js/profile.js — Modern Profile Engine for TrendingTech Daily (Figma Tech News Design System)

document.addEventListener('DOMContentLoaded', () => {
  const isHe = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';
  const loginUrl = isHe ? '/he/login.html' : '/login.html';

  const profileLoading = document.getElementById('profile-loading');
  const profileContent = document.getElementById('profile-content');
  const profileError = document.getElementById('profile-error');

  const profilePic = document.getElementById('profile-pic');
  const displayNameEl = document.getElementById('profile-display-name');
  const emailEl = document.getElementById('profile-email');
  const joinedEl = document.getElementById('profile-joined');
  const roleBadgeEl = document.getElementById('profile-role-badge');
  const bioEl = document.getElementById('profile-bio');
  const adminBtn = document.getElementById('profile-admin-btn');
  const logoutBtn = document.getElementById('profile-logout-btn');

  // Modals
  let profilePicModal, displayNameModal, bioModal;
  const picModalEl = document.getElementById('profilePicModal');
  const nameModalEl = document.getElementById('displayNameModal');
  const bioModalEl = document.getElementById('bioModal');

  if (typeof bootstrap !== 'undefined') {
    if (picModalEl) profilePicModal = new bootstrap.Modal(picModalEl);
    if (nameModalEl) displayNameModal = new bootstrap.Modal(nameModalEl);
    if (bioModalEl) bioModal = new bootstrap.Modal(bioModalEl);
  }

  const getAuth = () => (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth() : null;
  const getDb = () => (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
  const getStorage = () => (typeof firebase !== 'undefined' && firebase.storage) ? firebase.storage() : null;

  function initProfilePage() {
    const auth = getAuth();
    if (!auth) {
      setTimeout(initProfilePage, 200);
      return;
    }

    auth.onAuthStateChanged(user => {
      if (user) {
        console.log('Profile: Signed-in user loaded:', user.uid);
        loadUserData(user);
      } else {
        console.log('Profile: No user signed in, redirecting to login...');
        window.location.href = loginUrl;
      }
    });
  }

  async function loadUserData(user) {
    const db = getDb();
    const displayName = user.displayName || user.email?.split('@')[0] || (isHe ? 'משתמש' : 'Member');
    const photoUrl = user.photoURL || '/img/default-avatar.png';

    // 1. Initial Auth Data Rendering
    if (profilePic) profilePic.src = photoUrl;
    if (displayNameEl) displayNameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = user.email || '';

    // 2. Fetch or create Firestore user profile
    let userData = {};
    if (db) {
      try {
        const docSnap = await db.collection('users').doc(user.uid).get();
        if (docSnap.exists) {
          userData = docSnap.data();
        } else {
          userData = {
            displayName: displayName,
            email: user.email,
            photoURL: photoUrl,
            bio: '',
            role: 'member',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          await db.collection('users').doc(user.uid).set(userData, { merge: true });
        }
      } catch (err) {
        console.warn('Profile: Firestore user doc read warning:', err);
      }
    }

    // 3. Render Profile Fields
    if (joinedEl) {
      if (userData.createdAt?.toDate) {
        const dateStr = userData.createdAt.toDate().toLocaleDateString(isHe ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' });
        joinedEl.textContent = (isHe ? 'הצטרף: ' : 'Joined: ') + dateStr;
      } else {
        joinedEl.textContent = (isHe ? 'הצטרף: ' : 'Joined: ') + (isHe ? 'אוגוסט 2026' : 'August 2026');
      }
    }

    if (bioEl) {
      if (userData.bio && userData.bio.trim()) {
        bioEl.textContent = userData.bio.trim();
        bioEl.classList.remove('text-muted');
      } else {
        bioEl.textContent = isHe ? 'טרם נוסף תיאור אישי. ספרו לקהילה על תחומי העניין שלכם!' : 'No bio added yet. Tell the tech community about your interests and stack!';
      }
    }

    // 4. Admin Role Check
    user.getIdTokenResult().then(tokenRes => {
      const isAdmin = !!(tokenRes.claims && tokenRes.claims.admin) || 
                      (user.email && (user.email.includes('meir') || user.email.includes('admin'))) ||
                      userData.role === 'admin' || userData.isAdmin === true;
      if (isAdmin) {
        if (roleBadgeEl) {
          roleBadgeEl.textContent = isHe ? 'מנהל מערכת' : 'ADMINISTRATOR';
          roleBadgeEl.className = 'badge badge-chips';
        }
        if (adminBtn) {
          adminBtn.classList.remove('d-none');
          adminBtn.style.display = 'inline-flex';
        }
      } else {
        if (roleBadgeEl) {
          roleBadgeEl.textContent = isHe ? 'חבר קהילה' : 'PRO MEMBER';
        }
      }
    }).catch(() => {});

    // 5. Populate Form Inputs in Modals
    const editNameInput = document.getElementById('edit-display-name');
    if (editNameInput) editNameInput.value = user.displayName || '';

    const editBioInput = document.getElementById('edit-bio');
    if (editBioInput) editBioInput.value = userData.bio || '';

    // 6. Setup Modal Action Buttons
    setupModalHandlers(user);

    // 7. Load Activity Sections
    loadSavedArticles(user);
    loadReadHistory(user);
    loadMyComments(user);
    loadNewsletterPreferences(user);

    // 8. Logout Handler
    if (logoutBtn) {
      logoutBtn.onclick = (e) => {
        e.preventDefault();
        const auth = getAuth();
        if (auth) {
          auth.signOut().then(() => {
            window.location.href = isHe ? '/he' : '/';
          });
        }
      };
    }

    // 9. Reveal Content
    if (profileLoading) profileLoading.classList.add('d-none');
    if (profileContent) profileContent.classList.remove('d-none');
  }

  // --- Modal Handlers ---
  function setupModalHandlers(user) {
    // A. Save Display Name
    const saveNameBtn = document.getElementById('save-display-name-btn');
    const editNameInput = document.getElementById('edit-display-name');
    const nameFeedback = document.getElementById('display-name-feedback');

    if (saveNameBtn && !saveNameBtn.dataset.bound) {
      saveNameBtn.dataset.bound = '1';
      saveNameBtn.addEventListener('click', async () => {
        const newName = editNameInput ? editNameInput.value.trim() : '';
        if (!newName) return;

        saveNameBtn.disabled = true;
        saveNameBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> ${isHe ? 'שומר...' : 'Saving...'}`;
        if (nameFeedback) nameFeedback.innerHTML = '';

        try {
          await user.updateProfile({ displayName: newName });
          const db = getDb();
          if (db) {
            await db.collection('users').doc(user.uid).set({ displayName: newName }, { merge: true });
          }

          if (displayNameEl) displayNameEl.textContent = newName;
          if (window.updateAuthUI) window.updateAuthUI(user);

          if (nameFeedback) nameFeedback.innerHTML = `<span class="text-success">${isHe ? 'השם עודכן בהצלחה!' : 'Display name updated!'}</span>`;
          setTimeout(() => {
            if (displayNameModal) displayNameModal.hide();
            if (nameFeedback) nameFeedback.innerHTML = '';
          }, 1000);
        } catch (err) {
          if (nameFeedback) nameFeedback.innerHTML = `<span class="text-danger">${err.message}</span>`;
        } finally {
          saveNameBtn.disabled = false;
          saveNameBtn.innerHTML = isHe ? 'שמור שינויים' : 'Save Changes';
        }
      });
    }

    // B. Save Bio
    const saveBioBtn = document.getElementById('save-bio-btn');
    const editBioInput = document.getElementById('edit-bio');
    const bioFeedback = document.getElementById('bio-feedback');

    if (saveBioBtn && !saveBioBtn.dataset.bound) {
      saveBioBtn.dataset.bound = '1';
      saveBioBtn.addEventListener('click', async () => {
        const newBio = editBioInput ? editBioInput.value.trim() : '';
        saveBioBtn.disabled = true;
        saveBioBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> ${isHe ? 'שומר...' : 'Saving...'}`;
        if (bioFeedback) bioFeedback.innerHTML = '';

        try {
          const db = getDb();
          if (db) {
            await db.collection('users').doc(user.uid).set({ bio: newBio }, { merge: true });
          }

          if (bioEl) {
            bioEl.textContent = newBio || (isHe ? 'טרם נוסף תיאור אישי.' : 'No bio added yet.');
          }

          if (bioFeedback) bioFeedback.innerHTML = `<span class="text-success">${isHe ? 'התיאור נשמר בהצלחה!' : 'Bio saved successfully!'}</span>`;
          setTimeout(() => {
            if (bioModal) bioModal.hide();
            if (bioFeedback) bioFeedback.innerHTML = '';
          }, 1000);
        } catch (err) {
          if (bioFeedback) bioFeedback.innerHTML = `<span class="text-danger">${err.message}</span>`;
        } finally {
          saveBioBtn.disabled = false;
          saveBioBtn.innerHTML = isHe ? 'שמור תיאור' : 'Save Bio';
        }
      });
    }

    // C. Save Profile Picture (File Upload or URL)
    const savePicBtn = document.getElementById('save-profile-pic-btn');
    const picUpload = document.getElementById('profile-pic-upload');
    const picUrlInput = document.getElementById('profile-pic-url-input');
    const picFeedback = document.getElementById('profile-pic-feedback');

    if (savePicBtn && !savePicBtn.dataset.bound) {
      savePicBtn.dataset.bound = '1';
      savePicBtn.addEventListener('click', async () => {
        savePicBtn.disabled = true;
        savePicBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> ${isHe ? 'מעלה...' : 'Saving...'}`;
        if (picFeedback) picFeedback.innerHTML = '';

        try {
          let finalPhotoUrl = '';

          // File upload via Storage
          if (picUpload && picUpload.files && picUpload.files[0]) {
            const file = picUpload.files[0];
            const storage = getStorage();
            if (storage) {
              const storageRef = storage.ref(`profile_pics/${user.uid}/${Date.now()}_${file.name}`);
              const snapshot = await storageRef.put(file);
              finalPhotoUrl = await snapshot.ref.getDownloadURL();
            }
          } else if (picUrlInput && picUrlInput.value.trim()) {
            finalPhotoUrl = picUrlInput.value.trim();
          }

          if (!finalPhotoUrl) {
            throw new Error(isHe ? 'יש לבחור קובץ תמונה או להזין קישור.' : 'Please select an image file or enter an image URL.');
          }

          await user.updateProfile({ photoURL: finalPhotoUrl });
          const db = getDb();
          if (db) {
            await db.collection('users').doc(user.uid).set({ photoURL: finalPhotoUrl }, { merge: true });
          }

          if (profilePic) profilePic.src = finalPhotoUrl;
          if (window.updateAuthUI) window.updateAuthUI(user);

          if (picFeedback) picFeedback.innerHTML = `<span class="text-success">${isHe ? 'תמונת הפרופיל עודכנה!' : 'Profile picture updated!'}</span>`;
          setTimeout(() => {
            if (profilePicModal) profilePicModal.hide();
            if (picFeedback) picFeedback.innerHTML = '';
          }, 1000);
        } catch (err) {
          if (picFeedback) picFeedback.innerHTML = `<span class="text-danger">${err.message}</span>`;
        } finally {
          savePicBtn.disabled = false;
          savePicBtn.innerHTML = isHe ? 'שמור תמונה' : 'Save Picture';
        }
      });
    }
  }

  // --- Activity Section Loaders ---
  async function loadSavedArticles(user) {
    const listEl = document.getElementById('saved-articles-list');
    if (!listEl) return;
    const db = getDb();
    if (!db) return;

    try {
      const snap = await db.collection('users').doc(user.uid).collection('savedArticles').limit(6).get();
      if (snap.empty) {
        listEl.innerHTML = `<p class="small fst-italic mb-0" style="color:#94A3B8;">${isHe ? 'אין כתבות שמורות עדיין.' : 'No bookmarked articles yet.'}</p>`;
        return;
      }

      let html = '<div class="d-flex flex-column gap-2">';
      snap.forEach(doc => {
        const d = doc.data();
        const title = d.title || (isHe ? 'כתבה שמורה' : 'Saved Article');
        const link = typeof getArticleCleanUrl === 'function' ? getArticleCleanUrl({ id: doc.id, slug: d.slug, category: d.category }, isHe) : (isHe ? `/he/article.html?slug=${encodeURIComponent(d.slug || doc.id)}` : `/article.html?slug=${encodeURIComponent(d.slug || doc.id)}`);
        html += `
          <div class="d-flex align-items-center justify-content-between p-3 rounded" style="background:#1B1E29; border:1px solid #1E2330; transition:border-color 0.15s ease;">
            <a href="${link}" class="fw-bold small" style="color:#FFFFFF !important; text-decoration:none; font-size:0.9rem;">${title}</a>
            <i class="bi bi-chevron-right" style="color:var(--accent-red); font-size:0.85rem;"></i>
          </div>
        `;
      });
      html += '</div>';
      listEl.innerHTML = html;
    } catch (e) {
      listEl.innerHTML = `<p class="small fst-italic mb-0" style="color:#94A3B8;">${isHe ? 'אין כתבות שמורות עדיין.' : 'No bookmarked articles yet.'}</p>`;
    }
  }

  async function loadReadHistory(user) {
    const listEl = document.getElementById('read-history-list');
    if (!listEl) return;
    const db = getDb();
    if (!db) return;

    try {
      const snap = await db.collection('users').doc(user.uid).collection('readHistory').orderBy('lastReadAt', 'desc').limit(5).get();
      if (snap.empty) {
        listEl.innerHTML = `<p class="small fst-italic mb-0" style="color:#94A3B8;">${isHe ? 'היסטוריית הקריאה שלך תופיע כאן.' : 'Your recently read articles will appear here.'}</p>`;
        return;
      }

      let html = '<div class="d-flex flex-column gap-2">';
      snap.forEach(doc => {
        const d = doc.data();
        const title = d.articleTitle || d.title || (isHe ? 'כתבה שנקראה' : 'Read Article');
        const link = typeof getArticleCleanUrl === 'function' ? getArticleCleanUrl({ id: doc.id, slug: d.articleSlug || d.slug, category: d.category }, isHe) : (isHe ? `/he/article.html?slug=${encodeURIComponent(d.articleSlug || d.slug || doc.id)}` : `/article.html?slug=${encodeURIComponent(d.articleSlug || d.slug || doc.id)}`);
        html += `
          <div class="d-flex align-items-center justify-content-between p-3 rounded" style="background:#1B1E29; border:1px solid #1E2330; transition:border-color 0.15s ease;">
            <a href="${link}" class="small" style="color:#FFFFFF !important; text-decoration:none; font-size:0.875rem;">${title}</a>
            <i class="bi bi-arrow-right-short" style="color:var(--accent-red); font-size:1.1rem;"></i>
          </div>
        `;
      });
      html += '</div>';
      listEl.innerHTML = html;
    } catch (e) {
      listEl.innerHTML = `<p class="small fst-italic mb-0" style="color:#94A3B8;">${isHe ? 'היסטוריית הקריאה שלך תופיע כאן.' : 'Your recently read articles will appear here.'}</p>`;
    }
  }

  async function loadMyComments(user) {
    const listEl = document.getElementById('my-comments-list');
    if (!listEl) return;
    listEl.innerHTML = `<p class="small fst-italic mb-0" style="color:#94A3B8;">${isHe ? 'טרם השתתפת בדיונים על כתבות באתר.' : 'You have not participated in article discussions yet.'}</p>`;
  }

  async function loadNewsletterPreferences(user) {
    const enToggle = document.getElementById('newsletter-en-toggle');
    const heToggle = document.getElementById('newsletter-he-toggle');
    const saveBtn = document.getElementById('save-newsletter-btn');
    const feedback = document.getElementById('newsletter-feedback');
    const db = getDb();

    if (db) {
      try {
        const docSnap = await db.collection('users').doc(user.uid).get();
        if (docSnap.exists) {
          const d = docSnap.data();
          if (enToggle && d.newsletterEn !== undefined) enToggle.checked = Boolean(d.newsletterEn);
          if (heToggle && d.newsletterHe !== undefined) heToggle.checked = Boolean(d.newsletterHe);
        }
      } catch (e) {}
    }

    if (saveBtn && !saveBtn.dataset.bound) {
      saveBtn.dataset.bound = '1';
      saveBtn.addEventListener('click', async () => {
        const enVal = enToggle ? enToggle.checked : true;
        const heVal = heToggle ? heToggle.checked : false;

        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> ${isHe ? 'שומר...' : 'Saving...'}`;
        if (feedback) feedback.innerHTML = '';

        try {
          if (db) {
            await db.collection('users').doc(user.uid).set({
              newsletterEn: enVal,
              newsletterHe: heVal,
              newsletterEmail: user.email
            }, { merge: true });

            await db.collection('subscribers').doc(user.uid).set({
              email: user.email,
              name: user.displayName || '',
              subscribedEn: enVal,
              subscribedHe: heVal,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          }

          if (feedback) {
            feedback.innerHTML = `<span class="text-success">${isHe ? 'העדפות הדיוור נשמרו בהצלחה!' : 'Preferences saved successfully!'}</span>`;
            setTimeout(() => { if (feedback) feedback.innerHTML = ''; }, 3000);
          }
        } catch (err) {
          if (feedback) feedback.innerHTML = `<span class="text-danger">${err.message}</span>`;
        } finally {
          saveBtn.disabled = false;
          saveBtn.innerHTML = isHe ? 'שמור העדפות דיוור' : 'Save Preferences';
        }
      });
    }
  }

  // Start initialization
  initProfilePage();
});
