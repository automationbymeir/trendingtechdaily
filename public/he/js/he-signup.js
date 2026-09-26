// he-signup.js — Hebrew signup page logic

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
      if (user) window.location.href = '/he/';
    });

    var signupForm  = document.getElementById('he-signup-form');
    var signupError = document.getElementById('he-signup-error');
    var submitBtn   = document.getElementById('he-signup-submit');
    var googleBtn   = document.getElementById('he-google-signup-btn');

    function heSignupError(code) {
      switch (code) {
        case 'auth/email-already-in-use':  return 'כתובת האימייל כבר רשומה. נסו להתחבר.';
        case 'auth/invalid-email':         return 'כתובת אימייל לא תקינה.';
        case 'auth/weak-password':         return 'הסיסמה חלשה מדי. בחרו לפחות 6 תווים.';
        case 'auth/popup-closed-by-user':  return 'החלון נסגר לפני סיום ההרשמה.';
        case 'auth/account-exists-with-different-credential':
          return 'קיים חשבון עם אימייל זה. נסו להתחבר.';
        default:                           return 'שגיאה בהרשמה. נסו שוב.';
      }
    }

    function saveUserDoc(user, extraData) {
      return db.collection('users').doc(user.uid).set(Object.assign({
        email:     user.email,
        photoURL:  user.photoURL || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        isAdmin:   false
      }, extraData), { merge: true });
    }

    // ── Email / Password signup ────────────────────────────────────────────────
    if (signupForm) {
      signupForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var name     = document.getElementById('he-signup-name').value.trim();
        var email    = document.getElementById('he-signup-email').value.trim();
        var password = document.getElementById('he-signup-password').value;
        signupError.textContent = '';

        if (!name)     { signupError.textContent = 'נא להזין שם תצוגה.'; return; }
        if (!email)    { signupError.textContent = 'נא להזין כתובת אימייל.'; return; }
        if (!password) { signupError.textContent = 'נא להזין סיסמה.'; return; }
        if (password.length < 6) { signupError.textContent = 'הסיסמה חייבת להכיל לפחות 6 תווים.'; return; }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>נרשם...';

        auth.createUserWithEmailAndPassword(email, password)
          .then(function (cred) {
            var user = cred.user;
            return user.updateProfile({ displayName: name })
              .then(function () {
                return saveUserDoc(user, { displayName: name, provider: 'email' });
              })
              .then(function () {
                window.location.href = '/he/';
              });
          })
          .catch(function (err) {
            signupError.textContent = heSignupError(err.code);
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'הרשמה';
          });
      });
    }

    // ── Google signup ──────────────────────────────────────────────────────────
    if (googleBtn) {
      googleBtn.addEventListener('click', function () {
        signupError.textContent = '';
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>מתחבר...';

        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider)
          .then(function (result) {
            var user  = result.user;
            var isNew = result.additionalUserInfo && result.additionalUserInfo.isNewUser;
            var finish = function () { window.location.href = '/he/'; };
            if (isNew) {
              saveUserDoc(user, {
                displayName: user.displayName,
                provider:    'google'
              }).then(finish).catch(finish);
            } else {
              finish();
            }
          })
          .catch(function (err) {
            signupError.textContent = heSignupError(err.code);
            googleBtn.disabled = false;
            googleBtn.innerHTML =
              '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18" alt="Google" /> הרשמה עם Google';
          });
      });
    }

  });
});
