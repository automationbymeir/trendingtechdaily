// Category slug helper
window.categorySlugCache = {};

async function getCategorySlug(categoryId) {
    if (!categoryId) return null;
    
    // Check cache first
    if (window.categorySlugCache[categoryId]) {
        return window.categorySlugCache[categoryId];
    }
    
    try {
        const doc = await db.collection('sections').doc(categoryId).get();
        if (doc.exists) {
            const slug = doc.data().slug;
            // Cache it
            window.categorySlugCache[categoryId] = slug;
            return slug;
        }
    } catch (error) {
        console.error('Error getting category slug:', error);
    }
    return null;
}

// Preload all category slugs
async function preloadCategorySlugs() {
    try {
        const snapshot = await db.collection('sections').where('active', '==', true).get();
        snapshot.forEach(doc => {
            window.categorySlugCache[doc.id] = doc.data().slug;
        });
        console.log('Category slugs preloaded:', window.categorySlugCache);
    } catch (error) {
        console.error('Error preloading category slugs:', error);
    }
}

// Call this when the page loads
document.addEventListener('DOMContentLoaded', () => {
    if (typeof db !== 'undefined') {
        setTimeout(() => {
            preloadCategorySlugs();
        }, 1000); // Wait a bit for Firebase to initialize
    }
});