// js/auth.js — Universal Authentication Engine for TrendingTech Daily

window.currentUser = null;

function updateAuthUI(user) {
  window.currentUser = user;

  const isHe = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';

  // Desktop Elements
  const navLoggedOut = document.getElementById('nav-logged-out');
  const authSignupLink = document.getElementById('auth-signup-link');
  const authLoginLink = document.getElementById('auth-login-link');
  const authProfileMenu = document.getElementById('auth-profile-menu');
  const userProfilePicNav = document.getElementById('user-profile-pic-nav');
  const userNameNav = document.getElementById('user-name-nav');
  const navAdminBtn = document.getElementById('nav-admin-btn');
  const authLogoutBtn = document.getElementById('auth-logout-btn');

  // Mobile Drawer Elements
  const drawerLoggedOut = document.getElementById('drawer-logged-out');
  const drawerLoggedIn = document.getElementById('drawer-logged-in');
  const drawerProfilePic = document.getElementById('drawer-profile-pic');
  const drawerUserName = document.getElementById('drawer-user-name');
  const drawerAdminBtn = document.getElementById('drawer-admin-btn');
  const drawerLogoutBtn = document.getElementById('drawer-logout-btn');

  if (user) {
    console.log('Auth: User is signed in:', user.email || user.uid);

    const displayName = user.displayName || user.email?.split('@')[0] || (isHe ? 'החשבון שלי' : 'My Account');
    const photoUrl = user.photoURL || '/img/default-avatar.png';

    // 1. Hide logged-out buttons
    if (navLoggedOut) {
      navLoggedOut.classList.add('d-none');
      navLoggedOut.style.display = 'none';
    }
    if (authSignupLink) authSignupLink.style.display = 'none';
    if (authLoginLink) authLoginLink.style.display = 'none';

    // 2. Show desktop profile menu
    if (authProfileMenu) {
      authProfileMenu.classList.remove('d-none');
      authProfileMenu.style.setProperty('display', 'flex', 'important');
    }
    if (userProfilePicNav) {
      userProfilePicNav.src = photoUrl;
      userProfilePicNav.style.display = 'block';
    }
    if (userNameNav) {
      userNameNav.textContent = displayName;
    }

    // 3. Update Mobile Drawer
    if (drawerLoggedOut) {
      drawerLoggedOut.classList.add('d-none');
      drawerLoggedOut.style.display = 'none';
    }
    if (drawerLoggedIn) {
      drawerLoggedIn.classList.remove('d-none');
      drawerLoggedIn.style.setProperty('display', 'flex', 'important');
    }
    if (drawerProfilePic) {
      drawerProfilePic.src = photoUrl;
    }
    if (drawerUserName) {
      drawerUserName.textContent = displayName;
    }

    // 4. Admin check
    user.getIdTokenResult().then(idTokenResult => {
      const isAdmin = !!(idTokenResult.claims && idTokenResult.claims.admin) || 
                      (user.email && (user.email.includes('meir') || user.email.includes('admin')));
      if (isAdmin) {
        if (navAdminBtn) {
          navAdminBtn.classList.remove('d-none');
          navAdminBtn.style.display = 'inline-flex';
        }
        if (drawerAdminBtn) {
          drawerAdminBtn.classList.remove('d-none');
          drawerAdminBtn.style.display = 'block';
        }
      }
    }).catch(() => {});

    // 5. Logout event listeners
    const handleLogout = (e) => {
      e.preventDefault();
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut().then(() => {
          console.log('User signed out successfully.');
          window.location.reload();
        }).catch(err => {
          console.error('Error signing out:', err);
        });
      }
    };

    if (authLogoutBtn && !authLogoutBtn.dataset.bound) {
      authLogoutBtn.dataset.bound = '1';
      authLogoutBtn.addEventListener('click', handleLogout);
    }
    if (drawerLogoutBtn && !drawerLogoutBtn.dataset.bound) {
      drawerLogoutBtn.dataset.bound = '1';
      drawerLogoutBtn.addEventListener('click', handleLogout);
    }

  } else {
    console.log('Auth: User is signed out.');

    // 1. Show logged-out buttons
    if (navLoggedOut) {
      navLoggedOut.classList.remove('d-none');
      navLoggedOut.style.setProperty('display', 'flex', 'important');
    }
    if (authSignupLink) authSignupLink.style.display = '';
    if (authLoginLink) authLoginLink.style.display = '';

    // 2. Hide desktop profile menu
    if (authProfileMenu) {
      authProfileMenu.classList.add('d-none');
      authProfileMenu.style.display = 'none';
    }
    if (navAdminBtn) {
      navAdminBtn.classList.add('d-none');
      navAdminBtn.style.display = 'none';
    }

    // 3. Update Mobile Drawer
    if (drawerLoggedOut) {
      drawerLoggedOut.classList.remove('d-none');
      drawerLoggedOut.style.setProperty('display', 'flex', 'important');
    }
    if (drawerLoggedIn) {
      drawerLoggedIn.classList.add('d-none');
      drawerLoggedIn.style.display = 'none';
    }
    if (drawerAdminBtn) {
      drawerAdminBtn.classList.add('d-none');
      drawerAdminBtn.style.display = 'none';
    }
  }
}

window.updateAuthUI = updateAuthUI;
window.initializeAuth = function() {
  if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
    const auth = firebase.auth();
    updateAuthUI(auth.currentUser);
    auth.onAuthStateChanged(user => {
      updateAuthUI(user);
    });
  }
};

// Initialize auth listeners as soon as Firebase is ready
document.addEventListener('DOMContentLoaded', () => {
  if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
    window.initializeAuth();
  } else {
    const checkInterval = setInterval(() => {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        clearInterval(checkInterval);
        window.initializeAuth();
      }
    }, 100);
    setTimeout(() => clearInterval(checkInterval), 5000);
  }
});
