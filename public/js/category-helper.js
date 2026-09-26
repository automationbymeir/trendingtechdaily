// Category slug helper & taxonomy cache
window.categorySlugCache = window.categorySlugCache || {};
window.categoryCache = window.categoryCache || {};

async function getCategorySlug(categoryId) {
  if (!categoryId) return 'ai';
  
  if (window.categorySlugCache[categoryId]) {
    return window.categorySlugCache[categoryId];
  }
  
  const firestoreDb = window.db || (typeof db !== 'undefined' ? db : null);
  if (!firestoreDb) return 'ai';

  try {
    const doc = await firestoreDb.collection('sections').doc(categoryId).get();
    if (doc.exists) {
      const data = doc.data();
      const slug = data.slug || categoryId;
      window.categorySlugCache[categoryId] = slug;
      window.categoryCache[categoryId] = { name: data.name, slug: slug, nameHe: data.nameHe || data.name };
      return slug;
    }
  } catch (error) {
    console.warn('Error getting category slug:', error);
  }
  return 'ai';
}

// Preload all category slugs & names
async function preloadCategorySlugs() {
  const firestoreDb = window.db || (typeof db !== 'undefined' ? db : null);
  if (!firestoreDb) return;

  try {
    const snapshot = await firestoreDb.collection('sections').get();
    snapshot.forEach(doc => {
      const data = doc.data();
      const slug = data.slug || doc.id;
      window.categorySlugCache[doc.id] = slug;
      window.categoryCache[doc.id] = { name: data.name, slug: slug, nameHe: data.nameHe || data.name };
      window.categoryCache[slug] = { id: doc.id, name: data.name, slug: slug, nameHe: data.nameHe || data.name };
    });
  } catch (error) {
    console.warn('Error preloading category slugs:', error);
  }

  try {
    const catSnapshot = await firestoreDb.collection('categories').get();
    catSnapshot.forEach(doc => {
      const data = doc.data();
      const slug = data.slug || doc.id;
      window.categorySlugCache[doc.id] = slug;
      window.categoryCache[doc.id] = { name: data.name, slug: slug, nameHe: data.nameHe || data.name };
      window.categoryCache[slug] = { id: doc.id, name: data.name, slug: slug, nameHe: data.nameHe || data.name };
    });
  } catch (error) {
    console.warn('Error preloading categories:', error);
  }
}

// Call this when the page loads
document.addEventListener('DOMContentLoaded', () => {
  preloadCategorySlugs();
});