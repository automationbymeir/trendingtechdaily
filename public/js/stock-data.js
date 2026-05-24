// Enhanced Stock Data JavaScript with fixed scope and issues

// Define global variables that need to be accessed across functions
let STOCK_SYMBOLS = [];
let allStocksLoaded = false;
let DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
let watchlist = [];
let allDisplayedStocks = [...DEFAULT_SYMBOLS];
let lastSearchQuery = '';
// Finnhub API key - replace with your own API key from https://finnhub.io/
const FINNHUB_API_KEY = 'd00dsnpr01qmsivsdiu0d00dsnpr01qmsivsdiug'; 
let stockDetailModal;
let stockChart = null; // Global chart instance

// Configuration
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the stock data functionality
    initStockDataPage();
    
    // Initialize Bootstrap modal
    const modalElement = document.getElementById('stockDetailModal');
    if (modalElement) {
        stockDetailModal = new bootstrap.Modal(modalElement);
        
        // Add event listener for when modal is shown
        modalElement.addEventListener('shown.bs.modal', function() {
            // Attempt to update the chart when modal is shown
            const symbol = document.getElementById('detail-symbol').textContent;
            if (symbol) {
                updateStockChart(symbol);
            }
        });
    }
    
    // Make stock cards clickable
    makeStockCardsClickable();
    initPremarketDrawer();

    // Load latest stock news
    loadStockNews();
    loadCryptoData();
    loadMarketPodcasts();
    loadRecommendedStockArticles();
});

function initStockDataPage() {
    // Load stock symbols from JSON file
    loadStockData();
    
    // DOM Elements
    const stockSearch = document.getElementById('stock-search');
    const searchBtn = document.getElementById('search-btn');
    const searchSuggestions = document.createElement('div');
    searchSuggestions.className = 'search-suggestions';

    // Add search suggestions container after search input
    if (stockSearch && stockSearch.parentNode) {
        stockSearch.parentNode.insertBefore(searchSuggestions, stockSearch.nextSibling);
        searchSuggestions.style.display = 'none';
    }

    // Setup search functionality
    setupSearchFunctionality(stockSearch, searchBtn, searchSuggestions);

    // Initial loading
    initializePage();
    
    // Set up auto-refresh (every 5 minutes during market hours)
    setInterval(() => {
        const now = new Date();
        const hours = now.getHours();
        // Only refresh during potential market hours (4 AM - 8 PM Eastern)
        if (hours >= 4 && hours < 20) {
            refreshStockData();
        }
    }, 300000); // 5 minutes
}

function setupSearchFunctionality(stockSearch, searchBtn, searchSuggestions) {
    if (!stockSearch) return;

    let searchTimeout;

    // Focus event - show suggestions
    stockSearch.addEventListener('focus', () => {
        if (stockSearch.value.trim().length > 0) {
            showSearchSuggestions(stockSearch.value.trim(), searchSuggestions);
        }
    });

    // Input event - filter suggestions with debounce
    stockSearch.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = stockSearch.value.trim();
        
        if (query.length > 0) {
            searchTimeout = setTimeout(() => {
                showSearchSuggestions(query, searchSuggestions);
            }, 200);
        } else {
            searchSuggestions.style.display = 'none';
            // Reset to default view if search is cleared
            if (lastSearchQuery.length > 0) {
                lastSearchQuery = '';
                fetchDefaultStocks();
            }
        }
    });

    // Blur event - hide suggestions after a delay
    stockSearch.addEventListener('blur', () => {
        setTimeout(() => {
            searchSuggestions.style.display = 'none';
        }, 200);
    });

    // Enter key handler
    stockSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchStock();
        }
    });

    // Search button click handler
    if (searchBtn) {
        searchBtn.addEventListener('click', searchStock);
    }

    // Handle suggestion clicks with event delegation
    searchSuggestions.addEventListener('click', (event) => {
        const suggestionItem = event.target.closest('.suggestion-item');
        if (suggestionItem && suggestionItem.dataset.symbol) {
            stockSearch.value = suggestionItem.dataset.symbol;
            searchSuggestions.style.display = 'none';
            searchStock();
        }
    });
}

// Function to display search suggestions
function showSearchSuggestions(query, suggestionsContainer) {
    if (!allStocksLoaded || STOCK_SYMBOLS.length === 0) {
        return;
    }

    query = query.toUpperCase();

    const matches = STOCK_SYMBOLS.filter(stock =>
        stock.symbol.includes(query) ||
        stock.name.toUpperCase().includes(query)
    ).sort((a, b) => {
        const q = query;
        const aSymbol = a.symbol.toUpperCase();
        const bSymbol = b.symbol.toUpperCase();
        const aName = a.name.toUpperCase();
        const bName = b.name.toUpperCase();

        if (aSymbol === q && bSymbol !== q) return -1;
        if (bSymbol === q && aSymbol !== q) return 1;

        const aStarts = aSymbol.startsWith(q) || aName.startsWith(q);
        const bStarts = bSymbol.startsWith(q) || bName.startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (bStarts && !aStarts) return 1;

        const aIdx = Math.min(
            aSymbol.indexOf(q) !== -1 ? aSymbol.indexOf(q) : Number.MAX_VALUE,
            aName.indexOf(q) !== -1 ? aName.indexOf(q) : Number.MAX_VALUE
        );
        const bIdx = Math.min(
            bSymbol.indexOf(q) !== -1 ? bSymbol.indexOf(q) : Number.MAX_VALUE,
            bName.indexOf(q) !== -1 ? bName.indexOf(q) : Number.MAX_VALUE
        );
        if (aIdx !== bIdx) return aIdx - bIdx;

        return aSymbol.localeCompare(bSymbol);
    });

    if (matches.length > 0) {
        let suggestionsHTML = '<div class="suggestions-container">';
        
        // Take first 6 matches
        matches.slice(0, 6).forEach(stock => {
            const hasLogo = stock.logoUrl && stock.logoUrl !== '';
            
            suggestionsHTML += `
                <div class="suggestion-item" data-symbol="${stock.symbol}">
                    ${hasLogo ? 
                        `<img src="${stock.logoUrl}" alt="${stock.symbol}" class="suggestion-logo" onerror="this.style.display='none'">` : 
                        '<div class="suggestion-logo-placeholder"></div>'}
                    <div class="suggestion-text">
                        <strong>${stock.symbol}</strong>
                        <span class="suggestion-name">${stock.name}</span>
                    </div>
                </div>
            `;
        });
        
        if (matches.length > 6) {
            suggestionsHTML += `
                <div class="suggestion-more">
                    ${matches.length - 6} more results available...
                </div>
            `;
        }
        
        suggestionsHTML += '</div>';
        suggestionsContainer.innerHTML = suggestionsHTML;
        suggestionsContainer.style.display = 'block';
    } else {
        suggestionsContainer.innerHTML = `
            <div class="suggestion-no-results">
                No stocks found matching "${query}"
            </div>
        `;
        suggestionsContainer.style.display = 'block';
    }
}

// Initialize the page
async function initializePage() {
    const premarketLoader = document.getElementById('premarket-loader');
    const marketLoader = document.getElementById('market-loader');
    const premarketError = document.getElementById('premarket-error');
    const marketError = document.getElementById('market-error');
    
    // Show loaders
    if (premarketLoader) premarketLoader.style.display = 'block';
    if (marketLoader) marketLoader.style.display = 'block';
    
    // Clear errors
    if (premarketError) premarketError.textContent = '';
    if (marketError) marketError.textContent = '';
    
    try {
        // Get watchlist from localStorage
        watchlist = JSON.parse(localStorage.getItem('stockWatchlist')) || [];
        
        // If user is authenticated, sync with Firestore
        if (typeof auth !== 'undefined' && auth.currentUser) {
            try {
                const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
                if (userDoc.exists && userDoc.data().stockWatchlist) {
                    watchlist = userDoc.data().stockWatchlist;
                    localStorage.setItem('stockWatchlist', JSON.stringify(watchlist));
                } else {
                    // Create watchlist in Firestore if it doesn't exist
                    await db.collection('users').doc(auth.currentUser.uid).set({
                        stockWatchlist: watchlist
                    }, { merge: true });
                }
            } catch (error) {
                console.error("Error syncing watchlist with Firestore:", error);
            }
        }
        
        fetchDefaultStocks();
    } catch (error) {
        console.error('Error initializing page:', error);
        if (premarketLoader) premarketLoader.style.display = 'none';
        if (marketLoader) marketLoader.style.display = 'none';
        if (marketError) marketError.textContent = 'Error initializing page. Please refresh.';
    }
}

// Fetch default stocks
async function fetchDefaultStocks() {
    allDisplayedStocks = [...new Set([...DEFAULT_SYMBOLS, ...watchlist])];
    await fetchStockData(allDisplayedStocks);
    updateWatchlistDisplay();
}

// Search for a stock
function searchStock() {
    const searchInput = document.getElementById('stock-search');
    if (!searchInput) return;
    
    const symbol = searchInput.value.trim().toUpperCase();
    if (!symbol) {
        lastSearchQuery = '';
        fetchDefaultStocks();
        return;
    }
    
    lastSearchQuery = symbol;
    allDisplayedStocks = [symbol];
    fetchStockData([symbol]);
}

// Refresh current stock data
async function refreshStockData() {
    if (lastSearchQuery) {
        await fetchStockData([lastSearchQuery]);
    } else {
        await fetchStockData(allDisplayedStocks);
    }
    
    const lastUpdated = document.getElementById('last-updated');
    if (lastUpdated) lastUpdated.textContent = new Date().toLocaleString();
}

// Load stock data from JSON file
async function loadStockData() {
    try {
        const response = await fetch('/json/stock-data.json');
        
        if (!response.ok) {
            throw new Error(`Failed to load stock data: ${response.status}`);
        }
        
        const data = await response.json();
        STOCK_SYMBOLS = data;
        allStocksLoaded = true;
        console.log(`Loaded ${STOCK_SYMBOLS.length} stocks from JSON`);
    } catch (error) {
        console.error('Error loading stock data:', error);
        // Fallback to basic symbols
        STOCK_SYMBOLS = [
            { symbol: 'AAPL', name: 'Apple Inc.', logoUrl: '' },
            { symbol: 'MSFT', name: 'Microsoft Corporation', logoUrl: '' },
            { symbol: 'GOOGL', name: 'Alphabet Inc.', logoUrl: '' },
            { symbol: 'AMZN', name: 'Amazon.com Inc.', logoUrl: '' },
            { symbol: 'TSLA', name: 'Tesla Inc.', logoUrl: '' }
        ];
    }
}

// Fetch stock data from API
async function fetchStockData(symbols) {
    const marketData = document.getElementById('market-data');
    const marketLoader = document.getElementById('market-loader');
    
    if (!marketData) return;
    
    marketData.innerHTML = '';
    if (marketLoader) marketLoader.style.display = 'block';
    
    try {
        const stockDataMap = {};
        
        // Create logo map from loaded data
        const logoMap = {};
        STOCK_SYMBOLS.forEach(stock => {
            logoMap[stock.symbol] = {
                name: stock.name,
                logoUrl: stock.logoUrl
            };
        });
        
        // Fetch data for all symbols
        await Promise.all(symbols.map(async (symbol, index) => {
            try {
                // Add delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, index * 300));
                
                const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`Error fetching ${symbol}: ${response.status}`);
                }
                
                const data = await response.json();
                
                // Add name and logo
                if (logoMap[symbol]) {
                    data.name = logoMap[symbol].name;
                    data.logoUrl = logoMap[symbol].logoUrl;
                } else {
                    data.name = symbol;
                    data.logoUrl = '';
                }
                
                stockDataMap[symbol] = data;
            } catch (error) {
                console.error(`Error fetching ${symbol}:`, error);
                stockDataMap[symbol] = {
                    error: true,
                    name: logoMap[symbol]?.name || symbol,
                    logoUrl: logoMap[symbol]?.logoUrl || ''
                };
            }
        }));
        
        // Display the data
        symbols.forEach(symbol => {
            const stockInfo = stockDataMap[symbol];
            const card = createMarketStockCard(symbol, stockInfo, watchlist.includes(symbol));
            marketData.appendChild(card);
        });
        
        // Update last updated time
        const lastUpdated = document.getElementById('last-updated');
        if (lastUpdated) lastUpdated.textContent = new Date().toLocaleString();
    } catch (error) {
        console.error('Error fetching stock data:', error);
        marketData.innerHTML = '<div class="error-message">Failed to fetch stock data. Please try again later.</div>';
    } finally {
        if (marketLoader) marketLoader.style.display = 'none';
    }
}

// Create market stock card
function createMarketStockCard(symbol, stockInfo, isInWatchlist) {
    const card = document.createElement('div');
    card.className = 'stock-card';
    
    if (isInWatchlist) {
        card.classList.add('in-watchlist');
    }
    
    const logoUrl = stockInfo.logoUrl || '';
    const hasLogo = logoUrl && logoUrl !== '';
    
    if (stockInfo.error) {
        card.classList.add('error-card');
        card.innerHTML = `
            <div class="stock-header">
                <div class="stock-header-title">
                    ${hasLogo ? 
                        `<img src="${logoUrl}" alt="${symbol}" class="stock-logo" onerror="this.style.display='none'">` : 
                        ''}
                    <h3>${symbol}</h3>
                </div>
                <button class="watchlist-btn ${isInWatchlist ? 'in-watchlist' : ''}" 
                        data-symbol="${symbol}" 
                        title="${isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}">
                    ★
                </button>
            </div>
            <div class="stock-name">${stockInfo.name || symbol}</div>
            <div class="error-message">Unable to load stock data</div>
        `;
    } else {
        const price = stockInfo.c || 0;
        const change = stockInfo.d || 0;
        const changePercent = stockInfo.dp || 0;
        const isPositive = change >= 0;
        
        card.innerHTML = `
            <div class="stock-header">
                <div class="stock-header-title">
                    ${hasLogo ? 
                        `<img src="${logoUrl}" alt="${symbol}" class="stock-logo" onerror="this.style.display='none'">` : 
                        ''}
                    <h3>${symbol}</h3>
                </div>
                <button class="watchlist-btn ${isInWatchlist ? 'in-watchlist' : ''}" 
                        data-symbol="${symbol}" 
                        title="${isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}">
                    ★
                </button>
            </div>
            <div class="stock-name">${stockInfo.name || symbol}</div>
            <div class="stock-price">$${price.toFixed(2)}</div>
            <div class="stock-change ${isPositive ? 'positive' : 'negative'}">
                ${isPositive ? '+' : ''}${change.toFixed(2)} 
                (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)
            </div>
            <div class="stock-details">
                <div>Open: $${(stockInfo.o || 0).toFixed(2)}</div>
                <div>High: $${(stockInfo.h || 0).toFixed(2)}</div>
                <div>Low: $${(stockInfo.l || 0).toFixed(2)}</div>
                <div>Volume: ${(stockInfo.v || 0).toLocaleString()}</div>
            </div>
        `;
    }
    
    // Add watchlist button event listener
    const watchlistBtn = card.querySelector('.watchlist-btn');
    if (watchlistBtn) {
        watchlistBtn.addEventListener('click', event => {
            event.stopPropagation();
            toggleWatchlist(symbol);
        });
    }
    
    return card;
}

// Create premarket stock card (no watchlist controls)
function createPremarketStockCard(symbol, stockInfo) {
    const card = document.createElement('div');
    card.className = 'stock-card';

    const logoUrl = stockInfo.logoUrl || '';
    const hasLogo = logoUrl && logoUrl !== '';

    if (stockInfo.error) {
        card.classList.add('error-card');
        card.innerHTML = `
            <div class="stock-header">
                <div class="stock-header-title">
                    ${hasLogo ? `<img src="${logoUrl}" alt="${symbol}" class="stock-logo" onerror="this.style.display='none'">` : ''}
                    <h3>${symbol}</h3>
                </div>
            </div>
            <div class="stock-name">${stockInfo.name || symbol}</div>
            <div class="error-message">Unable to load stock data</div>
        `;
    } else {
        const price = stockInfo.c || 0;
        const prevClose = stockInfo.pc || 0;
        const change = price - prevClose;
        const changePercent = prevClose ? (change / prevClose) * 100 : 0;
        const isPositive = change >= 0;

        card.innerHTML = `
            <div class="stock-header">
                <div class="stock-header-title">
                    ${hasLogo ? `<img src="${logoUrl}" alt="${symbol}" class="stock-logo" onerror="this.style.display='none'">` : ''}
                    <h3>${symbol}</h3>
                </div>
            </div>
            <div class="stock-name">${stockInfo.name || symbol}</div>
            <div class="stock-price">$${price.toFixed(2)}</div>
            <div class="stock-change ${isPositive ? 'positive' : 'negative'}">
                ${isPositive ? '+' : ''}${change.toFixed(2)} (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)
            </div>
        `;
    }

    return card;
}

// Toggle watchlist
async function toggleWatchlist(symbol) {
    const isAdding = !watchlist.includes(symbol);
    
    if (isAdding) {
        watchlist.push(symbol);
        if (!allDisplayedStocks.includes(symbol) && !lastSearchQuery) {
            allDisplayedStocks.push(symbol);
        }
    } else {
        watchlist = watchlist.filter(s => s !== symbol);
    }
    
    // Save to localStorage
    localStorage.setItem('stockWatchlist', JSON.stringify(watchlist));
    
    // Save to Firestore if authenticated
    if (typeof auth !== 'undefined' && auth.currentUser) {
        try {
            await db.collection('users').doc(auth.currentUser.uid).update({
                stockWatchlist: watchlist,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error("Error updating watchlist in Firestore:", error);
            // Try to create the document if it doesn't exist
            try {
                await db.collection('users').doc(auth.currentUser.uid).set({
                    stockWatchlist: watchlist,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (setError) {
                console.error("Error creating watchlist in Firestore:", setError);
            }
        }
    }
    
    // Update UI
    updateWatchlistStatus(symbol, isAdding);
    updateWatchlistDisplay();
}

// Update watchlist status in UI
function updateWatchlistStatus(symbol, isInWatchlist) {
    // Update all watchlist buttons for this symbol
    document.querySelectorAll(`.watchlist-btn[data-symbol="${symbol}"]`).forEach(btn => {
        if (isInWatchlist) {
            btn.classList.add('in-watchlist');
            btn.title = 'Remove from watchlist';
        } else {
            btn.classList.remove('in-watchlist');
            btn.title = 'Add to watchlist';
        }
    });
    
    // Update card styling
    document.querySelectorAll('.stock-card').forEach(card => {
        const cardSymbol = card.querySelector('h3')?.textContent;
        if (cardSymbol === symbol) {
            if (isInWatchlist) {
                card.classList.add('in-watchlist');
            } else {
                card.classList.remove('in-watchlist');
            }
        }
    });
    
    // Update detail modal if open
    const modalSymbol = document.getElementById('detail-symbol')?.textContent;
    if (modalSymbol === symbol) {
        updateWatchlistButton(symbol);
    }
}

// Update watchlist display
function updateWatchlistDisplay() {
    const watchlistStocks = document.getElementById('watchlist-stocks');
    if (!watchlistStocks) return;
    
    if (watchlist.length === 0) {
        watchlistStocks.innerHTML = '<p class="no-stocks">No stocks in your watchlist yet.</p>';
        return;
    }
    
    watchlistStocks.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    fetchWatchlistData();
}

// Fetch watchlist data
async function fetchWatchlistData() {
    const watchlistStocks = document.getElementById('watchlist-stocks');
    if (!watchlistStocks || watchlist.length === 0) return;
    
    try {
        const stockDataMap = {};
        const logoMap = {};
        
        // Get logo info from loaded data
        STOCK_SYMBOLS.forEach(stock => {
            if (watchlist.includes(stock.symbol)) {
                logoMap[stock.symbol] = {
                    name: stock.name,
                    logoUrl: stock.logoUrl
                };
            }
        });
        
        // Fetch data for watchlist stocks
        await Promise.all(watchlist.map(async (symbol, index) => {
            try {
                await new Promise(resolve => setTimeout(resolve, index * 300));
                
                const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`Error fetching ${symbol}`);
                }
                
                const data = await response.json();
                stockDataMap[symbol] = data;
            } catch (error) {
                console.error(`Error fetching watchlist data for ${symbol}:`, error);
                stockDataMap[symbol] = { error: true };
            }
        }));
        
        // Build watchlist UI
        let watchlistHTML = '';
        
        watchlist.forEach(symbol => {
            const stockInfo = stockDataMap[symbol];
            const logoInfo = logoMap[symbol] || { name: symbol, logoUrl: '' };
            const hasLogo = logoInfo.logoUrl && logoInfo.logoUrl !== '';
            
            if (stockInfo && !stockInfo.error) {
                const price = stockInfo.c || 0;
                const change = stockInfo.d || 0;
                const changePercent = stockInfo.dp || 0;
                const isPositive = change >= 0;
                
                watchlistHTML += `
                    <div class="watchlist-item" data-symbol="${symbol}">
                        <div class="watchlist-info">
                            ${hasLogo ? 
                                `<img src="${logoInfo.logoUrl}" alt="${symbol}" class="watchlist-logo" onerror="this.style.display='none'">` : 
                                ''}
                            <div class="watchlist-details">
                                <span class="watchlist-symbol">${symbol}</span>
                                <span class="watchlist-name">${logoInfo.name}</span>
                            </div>
                            <span class="watchlist-price">$${price.toFixed(2)}</span>
                            <span class="watchlist-change ${isPositive ? 'positive' : 'negative'}">
                                ${isPositive ? '+' : ''}${change.toFixed(2)} 
                                (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)
                            </span>
                        </div>
                        <button class="remove-btn" data-symbol="${symbol}">✕</button>
                    </div>
                `;
            } else {
                watchlistHTML += `
                    <div class="watchlist-item" data-symbol="${symbol}">
                        <div class="watchlist-info">
                            ${hasLogo ? 
                                `<img src="${logoInfo.logoUrl}" alt="${symbol}" class="watchlist-logo" onerror="this.style.display='none'">` : 
                                ''}
                            <div class="watchlist-details">
                                <span class="watchlist-symbol">${symbol}</span>
                                <span class="watchlist-name">${logoInfo.name}</span>
                            </div>
                            <span class="watchlist-error">Unable to load data</span>
                        </div>
                        <button class="remove-btn" data-symbol="${symbol}">✕</button>
                    </div>
                `;
            }
        });
        
        watchlistStocks.innerHTML = watchlistHTML;
        
        // Add event listeners to remove buttons
        watchlistStocks.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', event => {
                event.stopPropagation();
                toggleWatchlist(btn.dataset.symbol);
            });
        });
        
        // Add click event to watchlist items
        watchlistStocks.querySelectorAll('.watchlist-item').forEach(item => {
            item.addEventListener('click', event => {
                if (!event.target.closest('.remove-btn')) {
                    const symbol = item.dataset.symbol;
                    openStockDetail(symbol);
                }
            });
        });
        
    } catch (error) {
        console.error('Error fetching watchlist data:', error);
        watchlistStocks.innerHTML = '<p class="error-text">Error loading watchlist data.</p>';
    }
}

// Make stock cards clickable
function makeStockCardsClickable() {
    document.addEventListener('click', function(event) {
        const stockCard = event.target.closest('.stock-card');
        
        if (stockCard && !event.target.closest('.watchlist-btn')) {
            const symbol = stockCard.querySelector('h3')?.textContent;
            if (symbol) {
                openStockDetail(symbol);
            }
        }
    });
}

// Open stock detail modal
async function openStockDetail(symbol) {
    if (!symbol || !stockDetailModal) return;

    // Reset modal content
    document.getElementById('detail-symbol').textContent = symbol;
    document.getElementById('detail-name').textContent = 'Loading...';
    document.getElementById('detail-price').textContent = '--';
    document.getElementById('detail-change').textContent = '';
    document.getElementById('detail-change').className = '';
    const descContainer = document.getElementById('company-description');
    if (descContainer) {
        descContainer.style.display = 'none';
    }
    const descText = document.getElementById('company-desc-text');
    if (descText) {
        descText.textContent = '';
    }
    
    // Find company info
    const stockInfo = STOCK_SYMBOLS.find(s => s.symbol === symbol);
    if (stockInfo) {
        document.getElementById('detail-name').textContent = stockInfo.name;
        const logo = document.getElementById('detail-logo');
        if (logo) {
            logo.src = stockInfo.logoUrl || '';
            logo.style.display = stockInfo.logoUrl ? 'block' : 'none';
        }
    }
    
    // Update watchlist button
    updateWatchlistButton(symbol);
    
    // Show the modal
    stockDetailModal.show();
    
    // Fetch stock data
    try {
        document.getElementById('detail-loading').style.display = 'block';
        document.getElementById('detail-error').style.display = 'none';
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.status}`);
        }
        
        const data = await response.json();
        updateDetailView(symbol, data);
        
        // Fetch company profile
        fetchCompanyProfile(symbol);
        
    } catch (error) {
        console.error('Error fetching stock details:', error);
        document.getElementById('detail-error').textContent = `Error loading stock data: ${error.message}`;
        document.getElementById('detail-error').style.display = 'block';
    } finally {
        document.getElementById('detail-loading').style.display = 'none';
    }
}

// Update detail view
function updateDetailView(symbol, data) {
    if (!data) return;
    
    const price = data.c || 0;
    const change = data.d || 0;
    const changePercent = data.dp || 0;
    const isPositive = change >= 0;
    
    document.getElementById('detail-price').textContent = `$${price.toFixed(2)}`;
    
    const changeEl = document.getElementById('detail-change');
    changeEl.textContent = `${isPositive ? '+' : ''}${change.toFixed(2)} (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)`;
    changeEl.className = isPositive ? 'fs-4 positive' : 'fs-4 negative';
    
    // Update stats
    const statsElements = {
        'detail-prev-close': data.pc,
        'detail-open': data.o,
        'detail-high': data.h,
        'detail-low': data.l,
        'detail-volume': data.v
    };
    
    Object.entries(statsElements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            if (id === 'detail-volume') {
                element.textContent = value ? value.toLocaleString() : 'N/A';
            } else if (id === 'detail-range') {
                element.textContent = `$${(data.l || 0).toFixed(2)} - $${(data.h || 0).toFixed(2)}`;
            } else {
                element.textContent = value ? `$${value.toFixed(2)}` : 'N/A';
            }
        }
    });
    
    // Update last updated time
    const lastUpdatedEl = document.getElementById('detail-last-updated');
    if (lastUpdatedEl) {
        lastUpdatedEl.textContent = new Date().toLocaleString();
    }
}

// Update watchlist button
async function updateWatchlistButton(symbol) {
    const watchlistBtn = document.getElementById('watchlist-toggle-btn');
    if (!watchlistBtn) return;
    
    const isInWatchlist = watchlist.includes(symbol);
    
    const icon = watchlistBtn.querySelector('i');
    const text = watchlistBtn.querySelector('span');
    
    if (icon) icon.className = isInWatchlist ? 'bi bi-star-fill' : 'bi bi-star';
    if (text) text.textContent = isInWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist';
    
    watchlistBtn.classList.toggle('in-watchlist', isInWatchlist);
    
    // Remove old event listeners and add new one
    const newBtn = watchlistBtn.cloneNode(true);
    watchlistBtn.parentNode.replaceChild(newBtn, watchlistBtn);
    
    newBtn.addEventListener('click', () => {
        toggleWatchlist(symbol);
    });
}

// Fetch company profile
async function fetchCompanyProfile(symbol) {
    try {
        const response = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch company profile: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.name) {
            document.getElementById('detail-name').textContent = data.name;

            const descEl = document.getElementById('company-desc-text');
            const container = document.getElementById('company-description');
            if (descEl && container) {
                let description = '';
                if (data.name) description += `${data.name} (${symbol}) `;
                if (data.exchange) description += `is listed on the ${data.exchange}. `;
                if (data.finnhubIndustry) description += `The company operates in the ${data.finnhubIndustry} industry. `;
                if (data.country) description += `Headquartered in ${data.country}. `;
                if (data.marketCapitalization) {
                    const marketCap = (data.marketCapitalization / 1000).toFixed(2);
                    description += `Market Cap: $${marketCap}B. `;
                }
                descEl.textContent = description || 'No company description available.';
                container.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error fetching company profile:', error);
        const descEl = document.getElementById('company-desc-text');
        if (descEl) {
            descEl.textContent = `Unable to load company information for ${symbol}.`;
        }
    }
}

// Update stock chart
async function updateStockChart(symbol) {
    const chartContainer = document.getElementById('stock-chart');
    if (!chartContainer || !symbol) return;
    
    // Show loading state
    chartContainer.innerHTML = `
        <div class="chart-placeholder text-center py-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading chart...</span>
            </div>
            <p class="text-muted mt-2">Loading price chart...</p>
        </div>
    `;
    
    try {
        const ALPHA_VANTAGE_API_KEY = 'N7S0XMBRM3X27Q4W';
        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}&outputsize=compact`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch historical data: ${response.status}`);
        }

        const data = await response.json();
        if (data['Error Message'] || !data['Time Series (Daily)']) {
            throw new Error('Invalid data received from Alpha Vantage');
        }

        const timeSeries = data['Time Series (Daily)'];
        const dates = Object.keys(timeSeries).sort().slice(-14);
        const chartData = dates.map(d => ({
            date: new Date(d).toLocaleDateString(),
            close: parseFloat(timeSeries[d]['4. close'])
        }));

        chartContainer.innerHTML = '<canvas id="stockPriceChart" width="100%" height="250"></canvas>';
        const ctx = document.getElementById('stockPriceChart').getContext('2d');

        if (stockChart) {
            stockChart.destroy();
        }

        const firstPrice = chartData[0].close;
        const lastPrice = chartData[chartData.length - 1].close;
        const priceChange = lastPrice - firstPrice;
        const chartColor = priceChange >= 0 ? 'rgba(40, 167, 69, 1)' : 'rgba(220, 53, 69, 1)';
        const chartColorLight = priceChange >= 0 ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)';

        stockChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.map(d => d.date),
                datasets: [{
                    label: `${symbol} Price`,
                    data: chartData.map(d => d.close),
                    borderColor: chartColor,
                    backgroundColor: chartColorLight,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: chartColor,
                    pointBorderColor: '#fff',
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: chartColor,
                    pointHoverBorderColor: '#fff',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: ctx => `$${ctx.raw.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: {
                            callback: val => '$' + val
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating stock chart:', error);
        chartContainer.innerHTML = `
            <div class="text-center p-3">
                <p class="text-danger">Unable to load chart data.</p>
            </div>
        `;
    }
}

// Initialize premarket drawer
function initPremarketDrawer() {
    const premarketContent = document.getElementById('premarketContent');
    if (!premarketContent) return;
    
    premarketContent.addEventListener('show.bs.collapse', function() {
        const premarketData = document.getElementById('premarket-data');
        if (premarketData && premarketData.innerHTML.trim() === '') {
            loadPremarketData(allDisplayedStocks);
        }
    });
}

// Load premarket data
async function loadPremarketData(symbols) {
    const premarketData = document.getElementById('premarket-data');
    const premarketLoader = document.getElementById('premarket-loader');
    if (!premarketData) return;

    premarketData.innerHTML = '';
    if (premarketLoader) premarketLoader.style.display = 'block';

    try {
        const now = new Date();
        const hour = now.getHours();
        const isPreMarketHours = hour >= 4 && hour < 9.5;

        if (!isPreMarketHours) {
            premarketData.innerHTML = '<div class="no-data">Premarket data is only available between 4:00 AM and 9:30 AM Eastern Time.</div>';
            if (premarketLoader) premarketLoader.style.display = 'none';
            return;
        }

        const logoMap = {};
        STOCK_SYMBOLS.forEach(stock => {
            logoMap[stock.symbol] = { name: stock.name, logoUrl: stock.logoUrl };
        });

        const dataMap = {};
        await Promise.all(symbols.map(async (symbol, index) => {
            try {
                await new Promise(resolve => setTimeout(resolve, index * 300));
                const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Error fetching ${symbol}: ${response.status}`);
                const data = await response.json();
                if (logoMap[symbol]) {
                    data.name = logoMap[symbol].name;
                    data.logoUrl = logoMap[symbol].logoUrl;
                } else {
                    data.name = symbol;
                    data.logoUrl = '';
                }
                dataMap[symbol] = data;
            } catch (err) {
                console.error(`Error fetching ${symbol}:`, err);
                dataMap[symbol] = { error: true, name: logoMap[symbol]?.name || symbol, logoUrl: logoMap[symbol]?.logoUrl || '' };
            }
        }));

        symbols.forEach(symbol => {
            const info = dataMap[symbol];
            const card = createPremarketStockCard(symbol, info);
            premarketData.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading premarket data:', error);
        premarketData.innerHTML = '<div class="error-message">Failed to fetch premarket data.</div>';
    } finally {
        if (premarketLoader) premarketLoader.style.display = 'none';
    }
}

// Load latest stock news articles
async function loadStockNews() {
    const container = document.getElementById('stock-news-articles');
    const loadingEl = document.getElementById('stock-news-loading');
    const errorEl = document.getElementById('stock-news-error');

    if (!container) return;

    if (loadingEl) loadingEl.style.display = 'block';
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }

    try {
        if (typeof functions === 'undefined') {
            throw new Error('Functions service not available');
        }

        const callable = functions.httpsCallable('getNewsApiArticles');
        const result = await callable({ endpoint: 'everything', query: 'stock market' });
        const articles = (result.data && result.data.articles) ? result.data.articles : [];

        if (loadingEl) loadingEl.style.display = 'none';

        if (!articles.length) {
            container.innerHTML = '<p class="text-muted">No recent articles found.</p>';
            return;
        }

        container.innerHTML = '';
        articles.forEach(article => {
            const col = document.createElement('div');
            col.className = 'col-md-4 mb-4';
            const card = document.createElement('div');
            card.className = 'card h-100';
            if (article.urlToImage) {
                const img = document.createElement('img');
                img.className = 'card-img-top';
                img.src = article.urlToImage;
                img.alt = article.title;
                img.onerror = () => img.remove();
                card.appendChild(img);
            }
            const body = document.createElement('div');
            body.className = 'card-body';
            body.innerHTML = `<h5 class="card-title"><a href="${article.url}" target="_blank" rel="noopener noreferrer">${article.title}</a></h5>`;
            if (article.source && article.source.name) {
                body.innerHTML += `<p class="card-text small text-muted">${article.source.name}</p>`;
            }
            card.appendChild(body);
            col.appendChild(card);
            container.appendChild(col);
        });

    } catch (error) {
        console.error('Error loading stock news:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) {
            errorEl.textContent = 'Failed to load news.';
            errorEl.style.display = 'block';
        }
    }
}

// Load cryptocurrency prices using CoinGecko API
async function loadCryptoData() {
    const container = document.getElementById('crypto-data');
    const loader = document.getElementById('crypto-loader');
    if (!container) return;

    container.innerHTML = '';
    if (loader) loader.style.display = 'block';

    try {
        const coins = [
            { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png' },
            { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png' },
            { id: 'solana', symbol: 'SOL', name: 'Solana', image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png' }
        ];
        const ids = coins.map(c => c.id).join(',');
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
        if (!response.ok) throw new Error('Failed to fetch crypto prices');
        const data = await response.json();

        coins.forEach(coin => {
            const info = data[coin.id];
            if (!info) return;
            const price = info.usd || 0;
            const change = info.usd_24h_change || 0;
            const isPositive = change >= 0;
            const card = document.createElement('div');
            card.className = 'stock-card';
            card.innerHTML = `
                <div class="stock-header">
                    <div class="stock-header-title">
                        <img src="${coin.image}" alt="${coin.symbol}" class="stock-logo" onerror="this.style.display='none'">
                        <h3>${coin.symbol}</h3>
                    </div>
                </div>
                <div class="stock-name">${coin.name}</div>
                <div class="stock-price">$${price.toFixed(2)}</div>
                <div class="stock-change ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${change.toFixed(2)}%</div>
            `;
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading crypto data:', error);
        container.innerHTML = '<div class="error-message">Failed to load crypto prices.</div>';
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

// Load market podcasts via Spotify API (Cloud Function)
async function loadMarketPodcasts() {
    const container = document.getElementById('market-podcasts-list');
    const loader = document.getElementById('market-podcasts-loader');
    const errorEl = document.getElementById('market-podcasts-error');
    if (!container) return;

    container.innerHTML = '';
    if (loader) loader.style.display = 'block';
    if (errorEl) errorEl.textContent = '';

    try {
        if (typeof functions === 'undefined') throw new Error('Functions service not available');
        const callable = functions.httpsCallable('getTechPodcasts');
        const result = await callable({ query: 'stock market podcast', limit: 4 });
        const podcasts = (result.data && result.data.podcasts) ? result.data.podcasts : [];
        renderMarketPodcasts(podcasts);
    } catch (error) {
        console.error('Error loading podcasts:', error);
        if (errorEl) errorEl.textContent = 'Failed to load podcasts.';
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function renderMarketPodcasts(podcasts) {
    const container = document.getElementById('market-podcasts-list');
    if (!container) return;
    if (!podcasts || podcasts.length === 0) {
        container.innerHTML = '<p class="text-muted small">No podcasts available.</p>';
        return;
    }
    let html = '';
    podcasts.forEach(podcast => {
        const imageUrl = podcast.imageUrl || '/img/default-podcast-art.png';
        const name = podcast.name || 'Untitled Podcast';
        const publisher = podcast.publisher || '';
        const url = podcast.spotifyUrl || '#';
        html += `
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="sidebar-podcast-item">
                <img src="${imageUrl}" alt="${name}" class="sidebar-podcast-image" onerror="this.onerror=null; this.src='/img/default-podcast-art.png';">
                <div class="sidebar-podcast-content">
                    <div class="sidebar-podcast-title">${name}</div>
                    <div class="sidebar-podcast-publisher">${publisher}</div>
                </div>
            </a>
        `;
    });
    container.innerHTML = html;
}

// Load recommended stock market articles from Firestore
async function loadRecommendedStockArticles() {
    const container = document.getElementById('stock-articles-list');
    if (!container) return;

    container.innerHTML = '';

    try {
        if (typeof db === 'undefined') throw new Error('Database not available');
        const sectionSnap = await db.collection('sections').where('slug', '==', 'stock-market').limit(1).get();
        if (sectionSnap.empty) {
            container.innerHTML = '<p class="text-muted small">No articles found.</p>';
            return;
        }
        const sectionId = sectionSnap.docs[0].id;
        const articlesSnap = await db.collection('articles')
            .where('category', '==', sectionId)
            .where('published', '==', true)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

        if (articlesSnap.empty) {
            container.innerHTML = '<p class="text-muted small">No articles found.</p>';
            return;
        }

        let html = '';
        articlesSnap.forEach(doc => {
            const data = doc.data();
            const title = data.title || 'Untitled';
            const slug = data.slug || '';
            const url = `/stock-market/${slug}`;
            html += `<div class="mb-2"><a href="${url}" class="text-decoration-none">${title}</a></div>`;
        });
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading articles:', error);
        container.innerHTML = '<p class="text-danger small">Failed to load articles.</p>';
    }
}

