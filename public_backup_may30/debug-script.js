// Add this script to your site temporarily to debug URL issues
// You can add it to your HTML or include it as a separate JS file

(function() {
    console.log('=== URL Debug Script Active ===');
    
    // Log current page info
    console.log('Current URL:', window.location.href);
    console.log('Pathname:', window.location.pathname);
    console.log('Search params:', window.location.search);
    
    // Intercept all link clicks
    document.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (link && link.href) {
            const url = new URL(link.href, window.location.origin);
            
            // Check for problematic URLs
            if (url.pathname.includes('/category') && url.search.includes('slug=')) {
                console.error('❌ OLD URL FORMAT DETECTED:', link.href);
                console.error('Link element:', link);
                console.error('Parent element:', link.parentElement);
                console.error('Link HTML:', link.outerHTML);
                
                // Show where in the DOM this link is
                const path = [];
                let el = link;
                while (el && el !== document.body) {
                    const identifier = el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase();
                    path.unshift(identifier);
                    el = el.parentElement;
                }
                console.error('DOM path:', path.join(' > '));
                
                // Try to fix the URL on the fly
                const slug = url.searchParams.get('slug');
                if (slug) {
                    e.preventDefault();
                    console.log('🔧 Redirecting to clean URL:', `/${slug}`);
                    window.location.href = `/${slug}`;
                }
            } else if (url.pathname.includes('.html') && !url.pathname.includes('admin')) {
                console.warn('⚠️ HTML extension detected:', link.href);
            }
        }
    }, true);
    
    // Monitor DOM mutations for dynamically added links
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // Element node
                    const links = node.querySelectorAll ? node.querySelectorAll('a[href*="/category?slug="]') : [];
                    links.forEach(link => {
                        console.error('❌ OLD URL FORMAT ADDED TO DOM:', link.href);
                        console.error('Added in element:', node);
                        
                        // Auto-fix the URL
                        const url = new URL(link.href, window.location.origin);
                        const slug = url.searchParams.get('slug');
                        if (slug) {
                            link.href = `/${slug}`;
                            console.log('✅ Fixed URL to:', link.href);
                        }
                    });
                }
            });
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Check all existing links on page load
    document.addEventListener('DOMContentLoaded', function() {
        const allLinks = document.querySelectorAll('a[href]');
        let oldFormatCount = 0;
        let htmlExtensionCount = 0;
        
        allLinks.forEach(link => {
            const url = new URL(link.href, window.location.origin);
            if (url.pathname.includes('/category') && url.search.includes('slug=')) {
                oldFormatCount++;
                console.error('❌ Old format link found:', link.href, 'in', link);
            }
            if (url.pathname.includes('.html') && !url.pathname.includes('admin')) {
                htmlExtensionCount++;
            }
        });
        
        console.log(`=== URL Debug Summary ===`);
        console.log(`Total links: ${allLinks.length}`);
        console.log(`Old format links: ${oldFormatCount}`);
        console.log(`HTML extension links: ${htmlExtensionCount}`);
    });
})();