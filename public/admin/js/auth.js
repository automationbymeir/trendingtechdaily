// Initialize Firebase UI
const ui = new firebaseui.auth.AuthUI(firebase.auth());

// Firebase UI config
const uiConfig = {
  signInOptions: [
    firebase.auth.EmailAuthProvider.PROVIDER_ID
  ],
  signInSuccessUrl: '/admin/index.html',
  callbacks: {
    signInSuccessWithAuthResult: (authResult, redirectUrl) => {
      // Check if user is admin
      checkAdminStatus();
      return false; // Prevent redirect
    }
  }
};

// Check if user is an admin
async function checkAdminStatus() {
  const user = firebase.auth().currentUser;
  
  if (!user) {
    showLoginScreen();
    return;
  }
  
  try {
    // Get ID token with fresh claims
    await user.getIdToken(true);
    const idTokenResult = await user.getIdTokenResult();
    
    if (idTokenResult.claims.admin) {
      // User is admin, show admin dashboard
      showAdminDashboard();
    } else {
      // Not an admin, check if they're in the users collection with admin role
      const userDoc = await db.collection('users').doc(user.uid).get();
      
      if (userDoc.exists && userDoc.data().role === 'admin') {
        // User is in database as admin but doesn't have claim yet
        // This could happen if they just became an admin
        try {
          // Call the createAdmin function to set claims
          const createAdmin = functions.httpsCallable('createAdmin');
          await createAdmin();
          
          // Refresh token to get updated claims
          await user.getIdToken(true);
          
          // Show admin dashboard
          showAdminDashboard();
        } catch (error) {
          console.error('Error setting admin role:', error);
          showAccessDenied();
        }
      } else {
        // Not an admin in database
        showAccessDenied();
      }
    }
  } catch (error) {
    console.error('Error checking admin status:', error);
    showAccessDenied();
  }
}

// Show login screen
function showLoginScreen() {
  const appElement = document.getElementById('app');
  appElement.innerHTML = `
    <div class="auth-container">
      <h1 class="text-center mb-4">Admin Login</h1>
      <div id="firebaseui-auth-container"></div>
    </div>
  `;
  
  // Initialize Firebase UI
  ui.start('#firebaseui-auth-container', uiConfig);
}

// Show admin dashboard
function showAdminDashboard() {
  const appElement = document.getElementById('app');
  appElement.innerHTML = `
    <div class="sidebar" id="sidebar"></div>
    <div class="content" id="content">
      <div class="site-header">
        <h1>Dashboard</h1>
        <button class="btn" id="logout-btn">Logout</button>
      </div>
      <div id="main-content">
        <div class="card">
          <h2 class="mb-3">Welcome to the Admin Dashboard</h2>
          <p>Select an option from the sidebar to manage your website.</p>
        </div>
      </div>
    </div>
  `;
  
  // Load sidebar
  loadSidebar();
  
  // Add logout event listener
  document.getElementById('logout-btn').addEventListener('click', () => {
    firebase.auth().signOut().then(() => {
      window.location.reload();
    });
  });
}

// Show access denied message
function showAccessDenied() {
  const appElement = document.getElementById('app');
  appElement.innerHTML = `
    <div class="auth-container">
      <h1 class="text-center mb-4">Access Denied</h1>
      <p class="text-center mb-4">You do not have permission to access the admin area.</p>
      <div class="text-center">
        <button class="btn" id="logout-btn">Logout</button>
      </div>
    </div>
  `;
  
  // Add logout event listener
  document.getElementById('logout-btn').addEventListener('click', () => {
    firebase.auth().signOut().then(() => {
      window.location.reload();
    });
  });
}

// Initialize auth check when page loads
document.addEventListener('DOMContentLoaded', () => {
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      checkAdminStatus();
    } else {
      showLoginScreen();
    }
  });
});