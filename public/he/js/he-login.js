// he-login.js — Hebrew login page logic

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

    // ── Redirect if already logged in ─────────────────────────────────────────
    auth.onAuthStateChanged(function (user) {
      if (user) {
        var redirect = new URLSearchParams(window.location.search).get('redirect') || '/he/';
        window.location.href = redirect;
      }
    });

    var loginForm   = document.getElementById('he-login-form');
    var loginError  = document.getElementById('he-login-error');
    var submitBtn   = document.getElementById('he-login-submit');
    var googleBtn   = document.getElementById('he-google-login-btn');

    function heAuthError(code) {
      switch (code) {
        case 'auth/user-not-found':        return 'לא נמצא חשבון עם כתובת אימייל זו.';
        case 'auth/wrong-password':
        case 'auth/invalid-credential':    return 'סיסמה שגויה. נסו שוב.';
        case 'auth/invalid-email':         return 'כתובת אימייל לא תקינה.';
        case 'auth/user-disabled':         return 'החשבון הזה הושבת.';
        case 'auth/too-many-requests':     return 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.';
        case 'auth/popup-closed-by-user':  return 'החלון נסגר לפני סיום הכניסה.';
        case 'auth/account-exists-with-different-credential':
          return 'קיים חשבון עם אימייל זה אך עם אמצעי כניסה אחר.';
        default:                           return 'שגיאה בכניסה. נסו שוב.';
      }
    }

    // ── Email / Password login ─────────────────────────────────────────────────
    if (loginForm) {
      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email    = document.getElementById('he-login-email').value.trim();
        var password = document.getElementById('he-login-password').value;
        loginError.textContent = '';

        if (!email || !password) {
          loginError.textContent = 'נא למלא אימייל וסיסמה.';
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>נכנס...';

        auth.signInWithEmailAndPassword(email, password)
          .then(function () {
            var redirect = new URLSearchParams(window.location.search).get('redirect') || '/he/';
            window.location.href = redirect;
          })
          .catch(function (err) {
            loginError.textContent = heAuthError(err.code);
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'כניסה';
          });
      });
    }

    // ── Google login ───────────────────────────────────────────────────────────
    if (googleBtn) {
      googleBtn.addEventListener('click', function () {
        loginError.textContent = '';
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>מתחבר...';

        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider)
          .then(function (result) {
            var user   = result.user;
            var isNew  = result.additionalUserInfo && result.additionalUserInfo.isNewUser;
            var finish = function () {
              var redirect = new URLSearchParams(window.location.search).get('redirect') || '/he/';
              window.location.href = redirect;
            };
            if (isNew) {
              db.collection('users').doc(user.uid).set({
                email:       user.email,
                displayName: user.displayName,
                photoURL:    user.photoURL,
                createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
                provider:    'google',
                isAdmin:     false
              }, { merge: true }).then(finish).catch(finish);
            } else {
              finish();
            }
          })
          .catch(function (err) {
            loginError.textContent = heAuthError(err.code);
            googleBtn.disabled = false;
            googleBtn.innerHTML =
              '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18" alt="Google" /> כניסה עם Google';
          });
      });
    }

  });
});
