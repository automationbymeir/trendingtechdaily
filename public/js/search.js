// search.js - Handles client-side search functionality, AI content simulation, and trending topics display

document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('searchInput');
  const searchQueryDisplay = document.getElementById('searchQueryDisplay');
  const searchResultsDiv = document.getElementById('searchResults');
  const trendingTopicsList = document.getElementById('trendingTopicsList');
  const searchMeta = document.getElementById('searchMeta');
  const resultCount = document.getElementById('resultCount');
  
  const aiSummarySection = document.getElementById('aiSummarySection');
  const aiSummaryContent = document.getElementById('aiSummaryContent');
  const aiTipsSection = document.getElementById('aiTipsSection');
  const aiTipsContent = document.getElementById('aiTipsContent');

  // Filter elements
  const categoryFilter = document.getElementById('categoryFilter');
  const sortFilter = document.getElementById('sortFilter');

  // Recent searches tracking
  const recentSearchesList = document.getElementById('recentSearchesList');
  const RECENT_SEARCHES_KEY = 'trendingtech_recent_searches';
  
  let currentResults = [];
  let currentQuery = '';

  // Check Firebase initialization
  if (!firebase || !firebase.apps.length) {
    console.error('Firebase has not been initialized. Please check config.js');
    searchResultsDiv.innerHTML = '<div class="no-results"><i class="bi bi-exclamation-triangle"></i><h3>Configuration Error</h3><p>Search is temporarily unavailable. Please try again later.</p></div>';
    return;
  }
  
  const db = firebase.firestore();

  // Generate AI Summary
  function generateAiSummary(articles) {
    if (articles.length === 0) {
      aiSummarySection.style.display = 'none';
      return;
    }

    // Create a more intelligent summary based on article content
    const topics = new Set();
    const categories = new Set();
    
    articles.forEach(article => {
      if (article.categoryName) categories.add(article.categoryName);
      if (article.tags && Array.isArray(article.tags)) {
        article.tags.forEach(tag => topics.add(tag));
      }
    });

    let summaryText = `Your search returned ${articles.length} article${articles.length !== 1 ? 's' : ''} `;
    
    if (categories.size > 0) {
      summaryText += `across ${Array.from(categories).join(', ')} categories. `;
    }
    
    if (articles.length > 0) {
      const mostRecent = articles[0];
      summaryText += `The most relevant result is "${mostRecent.title}" `;
      
      if (mostRecent.excerpt) {
        summaryText += `which discusses: ${mostRecent.excerpt.substring(0, 150)}...`;
      }
    }
    
    aiSummaryContent.textContent = summaryText;
    aiSummarySection.style.display = 'block';
  }

  // Generate AI Tips
  function generateAiTips(query, articles) {
    if (articles.length === 0) {
      aiTipsSection.style.display = 'none';
      return;
    }

    const tips = [];
    
    // Collect all unique tags from results
    const allTags = new Set();
    articles.forEach(article => {
      if (article.tags && Array.isArray(article.tags)) {
        article.tags.forEach(tag => allTags.add(tag.toLowerCase()));
      }
    });
    
    // Remove the current query from suggestions
    allTags.delete(query.toLowerCase());
    
    // Generate contextual tips
    if (allTags.size > 0) {
      const relatedTopics = Array.from(allTags).slice(0, 3);
      tips.push(`Explore related topics: <strong>${relatedTopics.join(', ')}</strong>`);
    }
    
    if (articles.length === 1) {
      tips.push(`Try broadening your search terms for more results`);
    } else if (articles.length > 10) {
      tips.push(`Use the filters on the right to narrow down your results`);
    }
    
    if (!query.includes('"') && query.split(' ').length > 1) {
      tips.push(`Use quotes around phrases for exact matches: <strong>"${query}"</strong>`);
    }
    
    // Add a tip about sorting
    tips.push(`Sort by date to see the latest articles on this topic`);
    
    // Display tips
    aiTipsContent.innerHTML = tips.map(tip => `<li>${tip}</li>`).join('');
    aiTipsSection.style.display = 'block';
  }

  // Display search results with new card layout
  function displayArticles(articles) {
    searchResultsDiv.innerHTML = '';
    
    if (articles.length === 0) {
      searchResultsDiv.innerHTML = `
            <div class="no-results">
                <i class="bi bi-search"></i>
          <h3>No Results Found</h3>
          <p>Try different keywords or browse our trending topics</p>
            </div>
        `;
      searchMeta.style.display = 'none';
        return;
    }
    
    // Update result count
    resultCount.textContent = articles.length;
    searchMeta.style.display = 'block';
    
    // Generate article cards
    articles.forEach(article => {
      const articleDate = article.createdAt && article.createdAt._seconds 
        ? new Date(article.createdAt._seconds * 1000).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          }) 
        : 'Date not available';
      
      const excerpt = article.excerpt || article.content ? 
        (article.excerpt || stripHtml(article.content).substring(0, 150) + '...') : 
        'No preview available';
      
      const articleCard = `
        <article class="search-article-card">
          <img src="${article.featuredImage || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y4ZjlmYSIvPgogIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM2Yzc1N2QiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiPk5vIEltYWdlIEF2YWlsYWJsZTwvdGV4dD4KPC9zdmc+'}" 
               alt="${article.title}" 
               class="search-article-image">
          <div class="search-article-content">
            <h2 class="article-title">
              <a href="/article/${article.slug}">${article.title}</a>
            </h2>
            <p class="article-description">${excerpt}</p>
            <div class="article-meta">
              <span class="search-category-badge">${article.categoryName || 'Uncategorized'}</span>
              <span class="text-muted small"><i class="bi bi-clock-history"></i> ${articleDate}</span>
              <span class="text-muted small"><i class="bi bi-eye"></i> ${article.views || 0} views</span>
                </div>
                </div>
            </article>
        `;
      searchResultsDiv.innerHTML += articleCard;
    });
  }

  // Strip HTML tags from content
  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  // Perform search
  async function performSearch(query, filters = {}) {
    const trimmedQuery = query.toLowerCase().trim();
    
    searchQueryDisplay.textContent = query;
    document.title = `Search: ${query} - TrendingTech Daily`;
    searchResultsDiv.innerHTML = '<div class="loading-results"><div class="loading-spinner"></div><p>Searching...</p></div>';
    
    // Hide AI sections during search
    aiSummarySection.style.display = 'none';
    aiTipsSection.style.display = 'none';

    if (trimmedQuery.length === 0) {
      searchResultsDiv.innerHTML = `
        <div class="no-results">
          <i class="bi bi-search"></i>
          <h3>Enter a Search Term</h3>
          <p>Type something in the search box above</p>
        </div>
      `;
      searchMeta.style.display = 'none';
      return;
    }

    try {
      const articles = [];
      let articlesQuery = db.collection('articles')
        .where('published', '==', true);
      
      // Apply category filter if selected
      if (filters.category) {
        articlesQuery = articlesQuery.where('category', '==', filters.category);
      }
      
      const snapshot = await articlesQuery.get();
      
      // Search through articles
      snapshot.forEach(doc => {
        const data = doc.data();
        const searchCorpus = [
          data.title || '',
          data.content || '',
          data.excerpt || '',
          ...(data.tags || [])
        ].join(' ').toLowerCase();

        if (searchCorpus.includes(trimmedQuery)) {
          articles.push({ id: doc.id, ...data });
        }
      });
      
      // Calculate relevance scores
      articles.forEach(article => {
        let score = 0;
        const titleLower = (article.title || '').toLowerCase();
        const excerptLower = (article.excerpt || '').toLowerCase();
        
        // Title matches get highest score
        if (titleLower === trimmedQuery) score += 100;
        else if (titleLower.includes(trimmedQuery)) score += 50;
        
        // Excerpt matches
        if (excerptLower.includes(trimmedQuery)) score += 20;
        
        // Tag matches
        if (article.tags && Array.isArray(article.tags)) {
          article.tags.forEach(tag => {
            if (tag.toLowerCase().includes(trimmedQuery)) score += 30;
          });
        }
        
        // Recent articles get a small boost
        if (article.createdAt && article.createdAt._seconds) {
          const daysOld = (Date.now() / 1000 - article.createdAt._seconds) / (60 * 60 * 24);
          if (daysOld < 7) score += 10;
          else if (daysOld < 30) score += 5;
        }
        
        article.relevanceScore = score;
      });
      
      // Sort based on selected filter
      if (filters.sort === 'date') {
        articles.sort((a, b) => {
          const aTime = a.createdAt?._seconds || 0;
          const bTime = b.createdAt?._seconds || 0;
          return bTime - aTime;
        });
      } else if (filters.sort === 'views') {
        articles.sort((a, b) => (b.views || 0) - (a.views || 0));
      } else {
        // Default to relevance
        articles.sort((a, b) => b.relevanceScore - a.relevanceScore);
      }

      currentResults = articles;
      currentQuery = query;
      
      displayArticles(articles);
      generateAiSummary(articles);
      generateAiTips(query, articles);
      
      // Save to recent searches
      saveRecentSearch(query);

    } catch (error) {
      console.error('Error performing search:', error);
      searchResultsDiv.innerHTML = `
        <div class="no-results">
          <i class="bi bi-exclamation-circle"></i>
          <h3>Search Error</h3>
          <p>Something went wrong. Please try again.</p>
                    </div>
                `;
      searchMeta.style.display = 'none';
    }
  }
  
  // Load trending topics
  async function loadTrendingTopics() {
    trendingTopicsList.innerHTML = '<li><div class="loading-spinner"></div></li>';
    try {
      const snapshot = await db.collection('articles')
        .where('published', '==', true)
        .orderBy('views', 'desc')
        .limit(8)
        .get();

      if (snapshot.empty) {
        trendingTopicsList.innerHTML = '<li>No trending topics found.</li>';
        return;
      }
      
      trendingTopicsList.innerHTML = '';
      snapshot.forEach(doc => {
        const article = doc.data();
        const listItem = `<li><a href="/article/${article.slug}">${article.title}</a></li>`;
        trendingTopicsList.innerHTML += listItem;
      });
        
    } catch (error) {
      console.error('Error loading trending topics:', error);
      trendingTopicsList.innerHTML = '<li class="text-danger">Failed to load topics.</li>';
    }
  }

  // Save recent searches
  function saveRecentSearch(query) {
    try {
      let recentSearches = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
      
      // Remove if already exists
      recentSearches = recentSearches.filter(q => q.toLowerCase() !== query.toLowerCase());
      
      // Add to beginning
      recentSearches.unshift(query);
      
      // Keep only last 5
      recentSearches = recentSearches.slice(0, 5);
      
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recentSearches));
      displayRecentSearches();
    } catch (error) {
      console.error('Error saving recent searches:', error);
    }
  }

  // Display recent searches
  function displayRecentSearches() {
    try {
      const recentSearches = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
      
      if (recentSearches.length === 0) {
        recentSearchesList.innerHTML = '<li class="text-muted">No recent searches</li>';
        return;
      }
      
      recentSearchesList.innerHTML = recentSearches
        .map(search => `<li><a href="/search.html?q=${encodeURIComponent(search)}">${search}</a></li>`)
        .join('');
    } catch (error) {
      console.error('Error displaying recent searches:', error);
    }
  }

  // Event Listeners
  const searchPageForm = document.getElementById('searchPageForm');
  if (searchPageForm) {
    searchPageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = searchInput.value;
      const filters = {
        category: categoryFilter.value,
        sort: sortFilter.value
      };
      window.history.pushState({}, '', `/search.html?q=${encodeURIComponent(query)}`);
      performSearch(query, filters);
    });
  }
  
  // Filter change handlers
  categoryFilter?.addEventListener('change', () => {
    if (currentQuery) {
      const filters = {
        category: categoryFilter.value,
        sort: sortFilter.value
      };
      performSearch(currentQuery, filters);
    }
  });
  
  sortFilter?.addEventListener('change', () => {
    if (currentQuery) {
      const filters = {
        category: categoryFilter.value,
        sort: sortFilter.value
      };
      // Re-sort existing results without new search
      if (currentResults.length > 0) {
        if (filters.sort === 'date') {
          currentResults.sort((a, b) => {
            const aTime = a.createdAt?._seconds || 0;
            const bTime = b.createdAt?._seconds || 0;
            return bTime - aTime;
          });
        } else if (filters.sort === 'views') {
          currentResults.sort((a, b) => (b.views || 0) - (a.views || 0));
        } else {
          currentResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
        }
        displayArticles(currentResults);
      }
    }
  });
  
  // Check for query in URL
  const urlParams = new URLSearchParams(window.location.search);
  const queryFromUrl = urlParams.get('q');

  if (queryFromUrl) {
    searchInput.value = queryFromUrl;
    performSearch(queryFromUrl);
  }

  // Load initial data
  loadTrendingTopics();
  displayRecentSearches();
  
  // Refresh trending topics every 5 minutes
  setInterval(loadTrendingTopics, 5 * 60 * 1000);
});