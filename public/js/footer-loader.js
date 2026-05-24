// footer-loader.js - Ensures all pages use the footer.html template
document.addEventListener('DOMContentLoaded', function() {
    // Function to load footer into any page
    function loadFooter() {
        // Find any existing footer or footer placeholder
        let footerTarget = document.getElementById('footer-placeholder');
        
        // If no placeholder exists, look for hardcoded footer
        if (!footerTarget) {
            const existingFooter = document.querySelector('footer.footer');
            if (existingFooter) {
                // Replace hardcoded footer with placeholder
                footerTarget = document.createElement('div');
                footerTarget.id = 'footer-placeholder';
                existingFooter.parentNode.replaceChild(footerTarget, existingFooter);
            } else {
                // Create footer placeholder at the end of body
                footerTarget = document.createElement('div');
                footerTarget.id = 'footer-placeholder';
                document.body.appendChild(footerTarget);
            }
        }
        
        // Load footer.html
        fetch('/footer.html')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load footer.html: ${response.statusText}`);
                }
                return response.text();
            })
            .then(data => {
                footerTarget.innerHTML = data;
                
                // After footer is loaded, update categories if loadSections exists
                if (typeof window.loadSections === 'function') {
                    // This will update the footer categories list
                    window.loadSections().catch(err => {
                        console.error('Error updating footer categories:', err);
                    });
                } else {
                    // If loadSections doesn't exist, try to update categories directly
                    updateFooterCategories();
                }
                
                // Update site settings in footer if function exists
                if (typeof window.loadSiteSettings === 'function') {
                    window.loadSiteSettings();
                }
            })
            .catch(error => {
                console.error('Error loading footer:', error);
                footerTarget.innerHTML = '<footer class="footer"><div class="container"><p class="text-danger text-center">Failed to load footer.</p></div></footer>';
            });
    }
    
    // Function to update footer categories when loadSections isn't available
    function updateFooterCategories() {
        if (!window.db) return;
        
        const footerCategoriesList = document.getElementById('footer-categories-list');
        if (!footerCategoriesList) return;
        
        window.db.collection('sections')
            .where('active', '==', true)
            .orderBy('order')
            .limit(10)
            .get()
            .then(snapshot => {
                let categoriesHTML = '';
                
                snapshot.forEach(doc => {
                    const section = doc.data();
                    const url = `/${section.slug || '#'}`;
                    const name = section.name || 'Unnamed Section';
                    categoriesHTML += `<li><a href="${url}">${name}</a></li>`;
                });
                
                // Add stock data link
                categoriesHTML += `<li><a href="/stock-data">Stock Data</a></li>`;
                
                footerCategoriesList.innerHTML = categoriesHTML || '<li>No categories found.</li>';
            })
            .catch(error => {
                console.error('Error loading footer categories:', error);
                footerCategoriesList.innerHTML = '<li class="text-muted">Unable to load categories.</li>';
            });
    }
    
    // Check if we should load the footer
    // Skip if app-base.js is handling it
    if (!window.loadNavbarAndDependentContent) {
        loadFooter();
    } else {
        // Even if app-base.js exists, ensure footer is loaded
        // Check after a delay to see if footer was loaded
        setTimeout(() => {
            const footerExists = document.querySelector('footer.footer') || document.getElementById('footer-placeholder')?.innerHTML;
            if (!footerExists) {
                loadFooter();
            }
        }, 1000);
    }
});

// Global function to force footer reload
window.reloadFooter = function() {
    const footerTarget = document.getElementById('footer-placeholder');
    if (footerTarget) {
        footerTarget.innerHTML = '';
        document.dispatchEvent(new Event('DOMContentLoaded'));
    }
};