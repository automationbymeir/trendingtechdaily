// js/signup.js — Standard Signup Script Handler

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signup-form');
  const signupErrorDiv = document.getElementById('signup-error');
  const googleSignupBtn = document.getElementById('google-signup-btn');

  const waitForAuth = () => new Promise(resolve => {
    let attempts = 0;
    const interval = setInterval(() => {
      if (typeof firebase !== 'undefined' && firebase.auth && firebase.apps && firebase.apps.length) {
        clearInterval(interval);
        resolve(firebase.auth());
      } else if (++attempts >= 30) {
        clearInterval(interval);
        resolve(null);
      }
    }, 100);
  });

  // Email & Password Signup
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (signupErrorDiv) signupErrorDiv.textContent = '';

      const nameInput = document.getElementById('signup-name');
      const emailInput = document.getElementById('signup-email');
      const passwordInput = document.getElementById('signup-password');

      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      const submitBtn = signupForm.querySelector('button[type="submit"]');

      if (!email || !password) {
        if (signupErrorDiv) signupErrorDiv.textContent = 'Please provide both email and password.';
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Creating account...';
      }

      try {
        const auth = await waitForAuth();
        if (!auth) throw new Error('Authentication service not initialized');

        const cred = await auth.createUserWithEmailAndPassword(email, password);
        if (name && cred.user) {
          await cred.user.updateProfile({ displayName: name });
        }
        window.location.href = '/';
      } catch (err) {
        console.error('Signup error:', err);
        if (signupErrorDiv) signupErrorDiv.textContent = err.message || 'Failed to create account.';
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign Up';
        }
      }
    });
  }

  // Google Signup Handler
  if (googleSignupBtn) {
    googleSignupBtn.addEventListener('click', async () => {
      try {
        const auth = await waitForAuth();
        if (!auth) throw new Error('Authentication service not ready');
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
        window.location.href = '/';
      } catch (err) {
        console.error('Google signup error:', err);
        if (signupErrorDiv) signupErrorDiv.textContent = err.message || 'Google sign-up failed.';
      }
    });
  }
});
