// js/login.js — Clean & Resilient Authentication for TrendingTech Daily

document.addEventListener('DOMContentLoaded', () => {
  const isHe = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';
  const homeUrl = isHe ? '/he' : '/';
  const profileUrl = isHe ? '/he/profile.html' : '/profile.html';

  const loginForm = document.getElementById('login-form');
  const loginEmailInput = document.getElementById('login-email');
  const loginPasswordInput = document.getElementById('login-password');
  const loginErrorDiv = document.getElementById('login-error');
  const googleLoginBtn = document.getElementById('google-login-btn');

  const getAuth = () => {
    return (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth() : null;
  };

  const getDb = () => {
    return (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
  };

  // If already logged in, redirect to profile or home
  const checkExistingUser = () => {
    const auth = getAuth();
    if (auth && auth.currentUser) {
      console.log("Already signed in:", auth.currentUser.email);
      window.location.href = profileUrl;
    }
  };

  setTimeout(checkExistingUser, 500);

  // Email & Password Submit
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const auth = getAuth();
      if (!auth) {
        if (loginErrorDiv) loginErrorDiv.textContent = isHe ? 'שירות ההתחברות אינו זמין כרגע.' : 'Auth service unavailable.';
        return;
      }

      const email = loginEmailInput ? loginEmailInput.value.trim() : '';
      const password = loginPasswordInput ? loginPasswordInput.value : '';
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (loginErrorDiv) loginErrorDiv.textContent = '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> ${isHe ? 'מתחבר...' : 'Signing in...'}`;
      }

      try {
        const cred = await auth.signInWithEmailAndPassword(email, password);
        console.log('Login successful:', cred.user.uid);
        if (window.updateAuthUI) window.updateAuthUI(cred.user);
        window.location.href = homeUrl;
      } catch (err) {
        console.error('Login error:', err);
        let msg = err.message;
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          msg = isHe ? 'שם משתמש או סיסמה שגויים.' : 'Incorrect email or password.';
        } else if (err.code === 'auth/user-not-found') {
          msg = isHe ? 'לא נמצא חשבון עם כתובת אימייל זו.' : 'No account found with this email.';
        } else if (err.code === 'auth/invalid-email') {
          msg = isHe ? 'כתובת אימייל לא חוקית.' : 'Invalid email address.';
        }
        if (loginErrorDiv) loginErrorDiv.textContent = msg;
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = isHe ? 'התחבר' : 'Sign In';
        }
      }
    });
  }

  // Google Login
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const auth = getAuth();
      const db = getDb();
      if (!auth) return;

      const provider = new firebase.auth.GoogleAuthProvider();
      if (loginErrorDiv) loginErrorDiv.textContent = '';
      googleLoginBtn.disabled = true;
      googleLoginBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> ${isHe ? 'מתחבר עם Google...' : 'Connecting...'}`;

      try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        console.log('Google login successful:', user.uid);

        if (db && result.additionalUserInfo?.isNewUser) {
          await db.collection('users').doc(user.uid).set({
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            provider: 'google'
          }, { merge: true });
        }

        if (window.updateAuthUI) window.updateAuthUI(user);
        window.location.href = homeUrl;
      } catch (err) {
        console.error('Google sign-in error:', err);
        if (err.code !== 'auth/popup-closed-by-user') {
          if (loginErrorDiv) loginErrorDiv.textContent = isHe ? `שגיאה בהתחברות: ${err.message}` : `Google sign-in error: ${err.message}`;
        }
      } finally {
        googleLoginBtn.disabled = false;
        googleLoginBtn.innerHTML = `<i class="bi bi-google me-1"></i> ${isHe ? 'המשך עם Google' : 'Continue with Google'}`;
      }
    });
  }
});
