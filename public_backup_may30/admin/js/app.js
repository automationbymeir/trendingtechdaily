// Main application file

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication status
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        checkAdminStatus();
      } else {
        showLoginScreen();
      }
    });
    
    // Set up global error handler
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      alert(`An error occurred: ${event.error.message}`);
    });
  });
  
  // Add helper functions as needed...
  function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    
    try {
      // Handle Firestore timestamps
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      console.error('Error formatting date:', e);
      return 'Invalid date';
    }
  }