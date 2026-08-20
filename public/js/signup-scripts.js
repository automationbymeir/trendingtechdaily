// js/signup-scripts.js — Unified Signup Engine for TrendingTech Daily

document.addEventListener('DOMContentLoaded', () => {
  const isHe = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';
  const homeUrl = isHe ? '/he' : '/';
  const profileUrl = isHe ? '/he/profile.html' : '/profile.html';

  const signupForm = document.getElementById('signup-form');
  const signupErrorDiv = document.getElementById('signup-error');
  const googleSignupBtn = document.getElementById('google-signup-btn') || document.getElementById('google-login-btn');

  const getAuth = () => {
    return (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth() : null;
  };

  const getDb = () => {
    return (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
  };

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const auth = getAuth();
      const db = getDb();
      if (!auth) {
        if (signupErrorDiv) signupErrorDiv.textContent = isHe ? 'שירות ההרשמה אינו זמין כרגע.' : 'Auth service unavailable.';
        return;
      }

      const nameInput = document.getElementById('signup-name') || document.getElementById('name');
      const emailInput = document.getElementById('signup-email') || document.getElementById('email');
      const passwordInput = document.getElementById('signup-password') || document.getElementById('password');
      const submitBtn = signupForm.querySelector('button[type="submit"]');

      const displayName = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      if (signupErrorDiv) {
        signupErrorDiv.textContent = '';
        signupErrorDiv.style.display = 'none';
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> ${isHe ? 'יוצר חשבון...' : 'Creating Account...'}`;
      }

      try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const user = cred.user;

        if (displayName) {
          await user.updateProfile({ displayName: displayName });
        }

        if (db) {
          await db.collection('users').doc(user.uid).set({
            displayName: displayName || email.split('@')[0],
            email: email,
            photoURL: user.photoURL || '/img/default-avatar.png',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            role: 'member'
          }, { merge: true });
        }

        if (window.updateAuthUI) window.updateAuthUI(user);
        window.location.href = profileUrl;
      } catch (err) {
        console.error('Signup error:', err);
        let msg = err.message;
        if (err.code === 'auth/email-already-in-use') {
          msg = isHe ? 'כתובת אימייל זו כבר רשומה במערכת.' : 'Email already in use. Try signing in.';
        } else if (err.code === 'auth/weak-password') {
          msg = isHe ? 'הסיסמה חלשה מדי (נדרשים לפחות 6 תווים).' : 'Password is too weak (minimum 6 characters).';
        } else if (err.code === 'auth/invalid-email') {
          msg = isHe ? 'כתובת אימייל לא תקינה.' : 'Invalid email address.';
        }
        if (signupErrorDiv) {
          signupErrorDiv.textContent = msg;
          signupErrorDiv.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = isHe ? 'צור חשבון' : 'Create Free Account';
        }
      }
    });
  }

  if (googleSignupBtn) {
    googleSignupBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const auth = getAuth();
      const db = getDb();
      if (!auth) return;

      const provider = new firebase.auth.GoogleAuthProvider();
      if (signupErrorDiv) {
        signupErrorDiv.textContent = '';
        signupErrorDiv.style.display = 'none';
      }

      googleSignupBtn.disabled = true;
      googleSignupBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> ${isHe ? 'מתחבר עם Google...' : 'Connecting...'}`;

      try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        if (db && result.additionalUserInfo?.isNewUser) {
          await db.collection('users').doc(user.uid).set({
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            provider: 'google',
            role: 'member'
          }, { merge: true });
        }

        if (window.updateAuthUI) window.updateAuthUI(user);
        window.location.href = profileUrl;
      } catch (err) {
        console.error('Google signup error:', err);
        if (err.code !== 'auth/popup-closed-by-user') {
          if (signupErrorDiv) {
            signupErrorDiv.textContent = isHe ? `שגיאה בהרשמה: ${err.message}` : `Google signup error: ${err.message}`;
            signupErrorDiv.style.display = 'block';
          }
        }
      } finally {
        googleSignupBtn.disabled = false;
        googleSignupBtn.innerHTML = `<i class="bi bi-google me-1"></i> ${isHe ? 'המשך עם Google' : 'Continue with Google'}`;
      }
    });
  }
});
