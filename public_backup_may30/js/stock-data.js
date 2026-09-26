// Enhanced Stock Data JavaScript with fixed scope

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
            updateStockChart();
        });
    }
    
    // Make stock cards clickable
    makeStockCardsClickable();
    initPremarketDrawer();
});

function initStockDataPage() {
    // Load stock symbols from JSON file
    loadStockData();
    
    // DOM Elements
    const stockSearch = document.getElementById('stock-search');
    const searchBtn = document.getElementById('search-btn');
    const searchSuggestions = document.createElement('div');
    searchSuggestions.className = 'search-suggestions';
    const premarketData = document.getElementById('premarket-data');
    const marketData = document.getElementById('market-data');
    const premarketLoader = document.getElementById('premarket-loader');
    const marketLoader = document.getElementById('market-loader');
    const premarketError = document.getElementById('premarket-error');
    const marketError = document.getElementById('market-error');
    const watchlistStocks = document.getElementById('watchlist-stocks');
    const lastUpdated = document.getElementById('last-updated');
    const apiProvider = document.getElementById('api-provider');

    // Add search suggestions container after search input
    if (stockSearch) {
        stockSearch.parentNode.insertBefore(searchSuggestions, stockSearch.nextSibling);
        searchSuggestions.style.display = 'none';
    }

    // Set API provider name
    if (apiProvider) apiProvider.textContent = 'Finnhub';

    // Setup search input and suggestions
    if (stockSearch) {
        // Focus event - show suggestions
        stockSearch.addEventListener('focus', () => {
            if (stockSearch.value.trim().length > 0) {
                showSearchSuggestions(stockSearch.value.trim());
            }
        });

        // Input event - filter suggestions
        stockSearch.addEventListener('input', () => {
            const query = stockSearch.value.trim();
            if (query.length > 0) {
                showSearchSuggestions(query);
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
            }, 200); // Small delay to allow clicking on suggestions
        });

        // Keypress event - handle enter key
        stockSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchStock();
            }
        });
    }

    // Add search button click handler
    if (searchBtn) {
        searchBtn.addEventListener('click', searchStock);
    }

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

    // Function to display search suggestions
    function showSearchSuggestions(query) {
        if (!allStocksLoaded && STOCK_SYMBOLS.length === 0) {
            console.log('Stock data not yet loaded for suggestions');
            return;
        }

        query = query.toUpperCase();
        
        // Filter stocks that match the query in symbol or name
        const matches = STOCK_SYMBOLS.filter(stock => 
            stock.symbol.includes(query) || 
            stock.name.toUpperCase().includes(query)
        );

        if (matches.length > 0) {
            let suggestionsHTML = '<div class="suggestions-container">';
            
            // Take first 6 matches to keep dropdown manageable
            matches.slice(0, 6).forEach(stock => {
                // Check if logo exists
                const hasLogo = stock.logoUrl && stock.logoUrl !== '';
                
                suggestionsHTML += `
                    <div class="suggestion-item" data-symbol="${stock.symbol}">
                        ${hasLogo ? `<img src="${stock.logoUrl}" alt="${stock.symbol}" class="suggestion-logo" onerror="this.style.display='none'">` : '<div class="suggestion-logo-placeholder"></div>'}
                        <div class="suggestion-text">
                            <strong>${stock.symbol}</strong>
                            <span class="suggestion-name">${stock.name}</span>
                        </div>
                    </div>
                `;
            });
            
            // Add "View all results" if there are more matches
            if (matches.length > 6) {
                suggestionsHTML += `
                    <div class="suggestion-more">
                        ${matches.length - 6} more results available...
                    </div>
                `;
            }
            
            suggestionsHTML += '</div>';
            searchSuggestions.innerHTML = suggestionsHTML;
            searchSuggestions.style.display = 'block';

            // Add click event to suggestion items
            document.querySelectorAll('.suggestion-item').forEach(item => {
                item.addEventListener('click', () => {
                    stockSearch.value = item.dataset.symbol;
                    searchSuggestions.style.display = 'none';
                    searchStock();
                });
            });
        } else {
            searchSuggestions.innerHTML = `
                <div class="suggestion-no-results">
                    No stocks found matching "${query}"
                </div>
            `;
            searchSuggestions.style.display = 'block';
        }
    }

    // Initialize the page
    async function initializePage() {
        // Show loaders
        if (premarketLoader) premarketLoader.style.display = 'block';
        if (marketLoader) marketLoader.style.display = 'block';
        
        // Clear any previous errors
        if (premarketError) premarketError.textContent = '';
        if (marketError) marketError.textContent = '';
        
        try {
            // First try to get watchlist from localStorage
            watchlist = JSON.parse(localStorage.getItem('stockWatchlist')) || [];
            
            // If user is authenticated, try to get their watchlist from Firestore
            if (auth.currentUser) {
                try {
                    const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
                    if (userDoc.exists && userDoc.data().stockWatchlist) {
                        watchlist = userDoc.data().stockWatchlist;
                        localStorage.setItem('stockWatchlist', JSON.stringify(watchlist));
                    } else {
                        // If user document exists but has no watchlist, create one
                        await db.collection('users').doc(auth.currentUser.uid).update({
                            stockWatchlist: watchlist
                        });
                    }
                } catch (error) {
                    console.error("Error fetching user watchlist:", error);
                    // If the document doesn't exist, create it
                    if (error.code === 'not-found') {
                        try {
                            await db.collection('users').doc(auth.currentUser.uid).set({
                                stockWatchlist: watchlist
                            }, { merge: true });
                        } catch (setError) {
                            console.error("Error creating user watchlist:", setError);
                        }
                    }
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

    // Fetch default stocks (DEFAULT_SYMBOLS + watchlist)
    async function fetchDefaultStocks() {
        allDisplayedStocks = [...new Set([...DEFAULT_SYMBOLS, ...watchlist])];
        await fetchStockData(allDisplayedStocks);
        updateWatchlistDisplay();
    }

    // Refresh current stock data without changing the displayed stocks
    async function refreshStockData() {
        if (lastSearchQuery) {
            // If there was a search query, refresh that stock
            await fetchStockData([lastSearchQuery]);
        } else {
            // Otherwise refresh all displayed stocks
            await fetchStockData(allDisplayedStocks);
        }
        
        // Update last updated time
        if (lastUpdated) lastUpdated.textContent = new Date().toLocaleString();
    }

    function searchStock() {
        const symbol = stockSearch.value.trim().toUpperCase();
        if (!symbol) {
            // If search is cleared, go back to default view
            lastSearchQuery = '';
            fetchDefaultStocks();
            return;
        }
        
        // Store the search query
        lastSearchQuery = symbol;
        allDisplayedStocks = [symbol];
        
        // Fetch data for the searched stock
        fetchStockData([symbol]);
    }
}

// Function to load stock data from JSON file with better error handling
async function loadStockData() {
    try {
        console.log("Attempting to load stock-data.json...");
        const response = await fetch('/json/stock-data.json');
        
        if (!response.ok) {
            throw new Error(`Failed to load stock data JSON: ${response.status} ${response.statusText}`);
        }
        
        // Get the text first to log it if there's an error
        const text = await response.text();
        
        try {
            // Try to parse the JSON
            const data = JSON.parse(text);
            STOCK_SYMBOLS = data;
            allStocksLoaded = true;
            console.log(`Successfully loaded ${STOCK_SYMBOLS.length} stocks from JSON file`);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            console.error('First 100 characters of response:', text.substring(0, 100));
            
            // Fallback to basic symbols
            STOCK_SYMBOLS = [
                { symbol: 'AAPL', name: 'Apple Inc.' },
                { symbol: 'MSFT', name: 'Microsoft Corporation' },
                { symbol: 'GOOGL', name: 'Alphabet Inc.' },
                { symbol: 'AMZN', name: 'Amazon.com Inc.' },
                { symbol: 'TSLA', name: 'Tesla Inc.' }
            ];
        }
    } catch (error) {
        console.error('Error loading stock data JSON:', error);
        // Fallback to basic symbols
        STOCK_SYMBOLS = [
            { symbol: 'AAPL', name: 'Apple Inc.' },
            { symbol: 'MSFT', name: 'Microsoft Corporation' },
            { symbol: 'GOOGL', name: 'Alphabet Inc.' },
            { symbol: 'AMZN', name: 'Amazon.com Inc.' },
            { symbol: 'TSLA', name: 'Tesla Inc.' }
        ];
    }
}

// Main function to fetch stock data
async function fetchStockData(symbols) {
    const marketData = document.getElementById('market-data');
    const marketLoader = document.getElementById('market-loader');
    
    if (!marketData) return;
    
    marketData.innerHTML = '';
    
    if (marketLoader) marketLoader.style.display = 'block';
    
    try {
        // Process each symbol individually
        const stockDataMap = {};
        
        // Find logo URLs from our loaded stock data
        const logoMap = {};
        STOCK_SYMBOLS.forEach(stock => {
            logoMap[stock.symbol] = {
                name: stock.name,
                logoUrl: stock.logoUrl
            };
        });
        
        // Use Promise.all to fetch data for all symbols in parallel
        await Promise.all(symbols.map(async (symbol, index) => {
            try {
                // Add a small delay between requests to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, index * 300));
                
                // Use Finnhub API directly
                const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`Error fetching data for ${symbol}: ${response.status}`);
                }
                
                const data = await response.json();
                
                // Add name and logo from our data
                if (logoMap[symbol]) {
                    data.name = logoMap[symbol].name;
                    data.logoUrl = logoMap[symbol].logoUrl;
                } else {
                    data.name = symbol;
                }
                
                stockDataMap[symbol] = data;
            } catch (error) {
                console.error(`Error fetching data for ${symbol}:`, error);
                // Add a placeholder with just the name and logo
                stockDataMap[symbol] = {
                    error: true,
                    name: logoMap[symbol]?.name || symbol,
                    logoUrl: logoMap[symbol]?.logoUrl || ''
                };
            }
        }));
        
        // Display the data
        for (const symbol of symbols) {
            const stockInfo = stockDataMap[symbol];
            
            // Create market data card
            const marketStockCard = createMarketStockCard(symbol, stockInfo, watchlist.includes(symbol));
            marketData.appendChild(marketStockCard);
        }
        
        // Update last updated time
        const lastUpdated = document.getElementById('last-updated');
        if (lastUpdated) lastUpdated.textContent = new Date().toLocaleString();
    } catch (error) {
        console.error(`Error fetching stock data:`, error);
        marketData.innerHTML = '<div class="error-message">Failed to fetch stock data. Please try again later.</div>';
    } finally {
        // Hide loaders
        if (marketLoader) marketLoader.style.display = 'none';
    }
}

function createPremarketStockCard(symbol, stockInfo, isInWatchlist) {
    // Use provided data or fallback to defaults
    const preMarketPrice = stockInfo.premarketPrice || stockInfo.c || 0;
    const preMarketChange = stockInfo.premarketChange || 0;
    const preMarketChangePercent = stockInfo.premarketChangePercent || 0;
    const isPositive = preMarketChange >= 0;
    
    const card = document.createElement('div');
    card.className = 'stock-card';
    
    // Add a special class if it's in the watchlist
    if (isInWatchlist) {
        card.classList.add('in-watchlist');
    }
    
    // Get logo
    const logoUrl = stockInfo.logoUrl || '';
    const hasLogo = logoUrl && logoUrl !== '';
    
    card.innerHTML = `
        <div class="stock-header">
            <div class="stock-header-title">
                ${hasLogo ? `<img src="${logoUrl}" alt="${symbol}" class="stock-logo" onerror="this.style.display='none'">` : ''}
                <h3>${symbol}</h3>
            </div>
            <button class="watchlist-btn ${isInWatchlist ? 'in-watchlist' : ''}" data-symbol="${symbol}" title="${isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}">
                ★
            </button>
        </div>
        <div class="stock-price">$${preMarketPrice.toFixed(2)}</div>
        <div class="stock-change ${isPositive ? 'positive' : 'negative'}">
            ${isPositive ? '+' : ''}${preMarketChange.toFixed(2)} (${isPositive ? '+' : ''}${preMarketChangePercent.toFixed(2)}%)
        </div>
        <div class="market-status">Pre-market</div>
        <div class="stock-details">
            <div>Prev Close: $${stockInfo.pc?.toFixed(2) || 'N/A'}</div>
            <div>Volume: ${stockInfo.v?.toLocaleString() || 'N/A'}</div>
        </div>
    `;
    
    // Add event listener to watchlist button
    const watchlistBtn = card.querySelector('.watchlist-btn');
    watchlistBtn.addEventListener('click', event => {
        event.stopPropagation(); // Prevent card click
        toggleWatchlist(symbol);
    });
    
    return card;
}

function createMarketStockCard(symbol, stockInfo, isInWatchlist) {
    const card = document.createElement('div');
    card.className = 'stock-card';
    
    // Add a special class if it's in the watchlist
    if (isInWatchlist) {
        card.classList.add('in-watchlist');
    }
    
    // Get logo
    const logoUrl = stockInfo.logoUrl || '';
    const hasLogo = logoUrl && logoUrl !== '';
    
    if (stockInfo.error) {
        // Create error card
        card.classList.add('error-card');
        card.innerHTML = `
            <div class="stock-header">
                <div class="stock-header-title">
                    ${hasLogo ? `<img src="${logoUrl}" alt="${symbol}" class="stock-logo" onerror="this.style.display='none'">` : ''}
                    <h3>${symbol}</h3>
                </div>
                <button class="watchlist-btn ${isInWatchlist ? 'in-watchlist' : ''}" data-symbol="${symbol}" title="${isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}">
                    ★
                </button>
            </div>
            <div class="stock-name">${stockInfo.name || symbol}</div>
            <div class="error-message">Unable to load stock data</div>
        `;
    } else {
        // Use Finnhub's data structure
        // c: Current price, d: Change, dp: Percent change, o: Open, h: High, l: Low, pc: Previous close
        const price = stockInfo.c || 0;
        const change = stockInfo.d || 0;
        const changePercent = stockInfo.dp || 0;
        const isPositive = change >= 0;
        
        card.innerHTML = `
            <div class="stock-header">
                <div class="stock-header-title">
                    ${hasLogo ? `<img src="${logoUrl}" alt="${symbol}" class="stock-logo" onerror="this.style.display='none'">` : ''}
                    <h3>${symbol}</h3>
                </div>
                <button class="watchlist-btn ${isInWatchlist ? 'in-watchlist' : ''}" data-symbol="${symbol}" title="${isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}">
                    ★
                </button>
            </div>
            <div class="stock-name">${stockInfo.name || symbol}</div>
            <div class="stock-price">$${price.toFixed(2)}</div>
            <div class="stock-change ${isPositive ? 'positive' : 'negative'}">
                ${isPositive ? '+' : ''}${change.toFixed(2)} (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)
            </div>
            <div class="stock-details">
                <div>Open: $${stockInfo.o?.toFixed(2) || 'N/A'}</div>
                <div>High: $${stockInfo.h?.toFixed(2) || 'N/A'}</div>
                <div>Low: $${stockInfo.l?.toFixed(2) || 'N/A'}</div>
                <div>Volume: ${stockInfo.v?.toLocaleString() || 'N/A'}</div>
            </div>
        `;
    }
    
    // Add event listener to watchlist button
    const watchlistBtn = card.querySelector('.watchlist-btn');
    watchlistBtn.addEventListener('click', event => {
        event.stopPropagation(); // Prevent card click
        toggleWatchlist(symbol);
    });
    
    return card;
}

async function toggleWatchlist(symbol) {
    const isAdding = !watchlist.includes(symbol);
    
    if (isAdding) {
        watchlist.push(symbol);
        // If adding a new stock, make sure it's displayed
        if (!allDisplayedStocks.includes(symbol) && !lastSearchQuery) {
            allDisplayedStocks.push(symbol);
        }
    } else {
        watchlist = watchlist.filter(s => s !== symbol);
    }
    
    // Save watchlist to localStorage
    localStorage.setItem('stockWatchlist', JSON.stringify(watchlist));
    
    // If user is authenticated, save to Firestore
    if (auth.currentUser) {
        try {
            await db.collection('users').doc(auth.currentUser.uid).update({
                stockWatchlist: watchlist,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Stock ${isAdding ? 'added to' : 'removed from'} watchlist in Firestore`);
        } catch (error) {
            console.error("Error updating watchlist in Firestore:", error);
            // Try to create the document if it doesn't exist
            if (error.code === 'not-found') {
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
    }
    
    // Update UI to reflect watchlist status
    updateWatchlistStatus(symbol, isAdding);
    
    // Update watchlist display
    updateWatchlistDisplay();
}

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
    document.querySelectorAll(`.stock-card`).forEach(card => {
        const cardSymbol = card.querySelector('h3')?.textContent;
        if (cardSymbol === symbol) {
            if (isInWatchlist) {
                card.classList.add('in-watchlist');
            } else {
                card.classList.remove('in-watchlist');
            }
        }
    });
    
    // Also update the detail modal if it's open
    const detailWatchlistBtn = document.getElementById('detail-watchlist-btn');
    if (detailWatchlistBtn && detailWatchlistBtn.dataset.symbol === symbol) {
        detailWatchlistBtn.classList.toggle('in-watchlist', isInWatchlist);
        detailWatchlistBtn.querySelector('i').className = isInWatchlist ? 'bi bi-star-fill' : 'bi bi-star';
        detailWatchlistBtn.querySelector('span').textContent = isInWatchlist ? ' Remove from Watchlist' : ' Add to Watchlist';
    }
}

function updateWatchlistDisplay() {
    const watchlistStocks = document.getElementById('watchlist-stocks');
    if (!watchlistStocks) return;
    
    // Clear the watchlist container
    watchlistStocks.innerHTML = '';
    
    if (watchlist.length === 0) {
        watchlistStocks.innerHTML = '<p class="no-stocks">No stocks in your watchlist yet.</p>';
        return;
    }
    
    // Show loading state
    watchlistStocks.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    
    // Fetch data for watchlist stocks
    fetchWatchlistData();
}

async function fetchWatchlistData() {
    const watchlistStocks = document.getElementById('watchlist-stocks');
    if (!watchlistStocks || watchlist.length === 0) return;
    
    try {
        // Process each watchlist symbol
        const stockDataMap = {};
        const logoMap = {};
        
        // Pre-populate logo info from our loaded data
        STOCK_SYMBOLS.forEach(stock => {
            if (watchlist.includes(stock.symbol)) {
                logoMap[stock.symbol] = {
                    name: stock.name,
                    logoUrl: stock.logoUrl
                };
            }
        });
        
        // Use Promise.all to fetch data in parallel (with delays to avoid rate limiting)
        await Promise.all(watchlist.map(async (symbol, index) => {
            try {
                // Add a small delay between requests
                await new Promise(resolve => setTimeout(resolve, index * 300));
                
                // Use Finnhub API directly
                const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`Error fetching data for ${symbol}: ${response.status}`);
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
        
        for (const symbol of watchlist) {
            const stockInfo = stockDataMap[symbol];
            const logoInfo = logoMap[symbol] || { name: symbol, logoUrl: '' };
            const hasLogo = logoInfo.logoUrl && logoInfo.logoUrl !== '';
            
            if (stockInfo && !stockInfo.error) {
                const price = stockInfo.c || 0;
                const change = stockInfo.d || 0;
                const changePercent = stockInfo.dp || 0;
                const isPositive = change >= 0;
                
                watchlistHTML += `
                    <div class="watchlist-item">
                        <div class="watchlist-info">
                            ${hasLogo ? `<img src="${logoInfo.logoUrl}" alt="${symbol}" class="watchlist-logo" onerror="this.style.display='none'">` : ''}
                            <div class="watchlist-details">
                                <span class="watchlist-symbol">${symbol}</span>
                                <span class="watchlist-name">${logoInfo.name}</span>
                            </div>
                            <span class="watchlist-price">$${price.toFixed(2)}</span>
                            <span class="watchlist-change ${isPositive ? 'positive' : 'negative'}">
                                ${isPositive ? '+' : ''}${change.toFixed(2)} (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)
                            </span>
                        </div>
                        <button class="remove-btn" data-symbol="${symbol}">✕</button>
                    </div>
                `;
            } else {
                watchlistHTML += `
                <div class="watchlist-item">
                    <div class="watchlist-info">
                        ${hasLogo ? `<img src="${logoInfo.logoUrl}" alt="${symbol}" class="watchlist-logo" onerror="this.style.display='none'">` : ''}
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
    }
    
    // Update watchlist container
    watchlistStocks.innerHTML = watchlistHTML;
    
    // Add event listeners to remove buttons
    watchlistStocks.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', event => {
            event.stopPropagation(); // Prevent watchlist item click
            toggleWatchlist(btn.dataset.symbol);
        });
    });
    
} catch (error) {
    console.error('Error fetching watchlist data:', error);
    watchlistStocks.innerHTML = '<p class="error-text">Error loading watchlist data.</p>';
}
}

// Function to make stock cards clickable
function makeStockCardsClickable() {
// Add click event to all stock cards (both current and future ones)
document.addEventListener('click', function(event) {
    // Check if a stock card or watchlist item was clicked (excluding buttons)
    const stockCard = event.target.closest('.stock-card');
    const watchlistItem = event.target.closest('.watchlist-item');
    
    // If clicked element is a button, don't open the detail view
    if (event.target.closest('.watchlist-btn') || event.target.closest('.remove-btn')) {
        return;
    }
    
    if (stockCard) {
        const symbol = stockCard.querySelector('h3').textContent;
        openStockDetail(symbol);
    } else if (watchlistItem) {
        const symbol = watchlistItem.querySelector('.watchlist-symbol').textContent;
        openStockDetail(symbol);
    }
});
}

// Function to open stock detail modal
async function openStockDetail(symbol) {
if (!symbol || !stockDetailModal) return;

// Reset modal content
document.getElementById('detail-symbol').textContent = symbol;
document.getElementById('detail-name').textContent = 'Loading...';
document.getElementById('detail-price').textContent = '--';
document.getElementById('detail-change').textContent = '';
document.getElementById('detail-change').className = '';
document.getElementById('detail-prev-close').textContent = '--';
document.getElementById('detail-open').textContent = '--';
document.getElementById('detail-range').textContent = '--';
document.getElementById('detail-volume').textContent = '--';
document.getElementById('detail-about-name').textContent = symbol;
document.getElementById('detail-description').textContent = 'Loading company information...';
document.getElementById('detail-external-link').href = `https://finance.yahoo.com/quote/${symbol}`;

// Update last updated time
document.getElementById('detail-last-updated').textContent = new Date().toLocaleString();

// Find company info from loaded stock data
const stockInfo = STOCK_SYMBOLS.find(s => s.symbol === symbol);
if (stockInfo) {
    document.getElementById('detail-name').textContent = stockInfo.name;
    document.getElementById('detail-about-name').textContent = stockInfo.name;
    document.getElementById('detail-logo').src = stockInfo.logoUrl || '';
    document.getElementById('detail-logo').alt = stockInfo.name;
    // Hide logo if URL is empty
    document.getElementById('detail-logo').style.display = stockInfo.logoUrl ? 'block' : 'none';
}

// Set up watchlist button
const watchlistBtn = document.getElementById('detail-watchlist-btn');
const isInWatchlist = watchlist.includes(symbol);
watchlistBtn.classList.toggle('in-watchlist', isInWatchlist);
watchlistBtn.querySelector('i').className = isInWatchlist ? 'bi bi-star-fill' : 'bi bi-star';
watchlistBtn.querySelector('span').textContent = isInWatchlist ? ' Remove from Watchlist' : ' Add to Watchlist';
watchlistBtn.dataset.symbol = symbol;

// Add click event listener to watchlist button
const newBtn = watchlistBtn.cloneNode(true);
watchlistBtn.parentNode.replaceChild(newBtn, watchlistBtn);
newBtn.addEventListener('click', function() {
    toggleWatchlist(symbol);
    const isNowInWatchlist = watchlist.includes(symbol);
    this.classList.toggle('in-watchlist', isNowInWatchlist);
    this.querySelector('i').className = isNowInWatchlist ? 'bi bi-star-fill' : 'bi bi-star';
    this.querySelector('span').textContent = isNowInWatchlist ? ' Remove from Watchlist' : ' Add to Watchlist';
});

// Show the modal
stockDetailModal.show();

// Fetch stock data
try {
    // Show loading
    document.getElementById('detail-loading').style.display = 'block';
    document.getElementById('detail-error').style.display = 'none';
    
    // Use the API with a delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Fetch data from Finnhub
    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Update UI with the data
    updateDetailView(symbol, data);
    
    // Try to fetch additional company information
    fetchCompanyProfile(symbol);
    
} catch (error) {
    console.error('Error fetching stock details:', error);
    document.getElementById('detail-error').textContent = `Error loading stock data: ${error.message}`;
    document.getElementById('detail-error').style.display = 'block';
    
    // Try to use mock data as fallback
    const mockData = generateMockStockData(symbol);
    updateDetailView(symbol, mockData);
} finally {
    document.getElementById('detail-loading').style.display = 'none';
}
}

// Function to update UI with stock data
function updateDetailView(symbol, data) {
if (!data) return;

// Update price and change
const price = data.c || 0;
const change = data.d || 0;
const changePercent = data.dp || 0;
const isPositive = change >= 0;
const open = data.o || 0;
const prevClose = data.pc || 0;
const high = data.h || 0;
const low = data.l || 0;
const volume = data.v || 0;

document.getElementById('detail-price').textContent = `$${price.toFixed(2)}`;

const changeEl = document.getElementById('detail-change');
changeEl.textContent = `${isPositive ? '+' : ''}${change.toFixed(2)} (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)`;
changeEl.className = isPositive ? 'fs-4 positive' : 'fs-4 negative';

// Update stats
document.getElementById('detail-prev-close').textContent = `$${prevClose.toFixed(2)}`;
document.getElementById('detail-open').textContent = `$${open.toFixed(2)}`;
document.getElementById('detail-range').textContent = `$${low.toFixed(2)} - $${high.toFixed(2)}`;
document.getElementById('detail-volume').textContent = volume.toLocaleString();

// Update market status
const now = new Date();
const hour = now.getHours();
const minute = now.getMinutes();
const day = now.getDay(); // 0 = Sunday, 6 = Saturday

// Simple check for market hours (9:30 AM - 4:00 PM Eastern, weekdays)
// This is simplified and doesn't account for holidays or timezone differences
const isWeekday = day > 0 && day < 6;
const isMarketHours = hour >= 9 && (hour < 16 || (hour === 9 && minute >= 30));
const marketStatus = isWeekday && isMarketHours ? 'Open' : 'Closed';

document.getElementById('detail-market-status').textContent = marketStatus;

// Update last updated time
document.getElementById('detail-last-updated').textContent = new Date().toLocaleString();
}

// Function to fetch company profile information
// Function to fetch company profile information with market cap fix
async function fetchCompanyProfile(symbol) {
    try {
        // First try Finnhub for general company data
        const response = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch company profile: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Check if we got meaningful data
        if (data && data.name) {
            // Update company information
            document.getElementById('detail-name').textContent = data.name;
            document.getElementById('detail-about-name').textContent = data.name;
            
            // In parallel, try to get market cap from Alpha Vantage since Finnhub may not provide it
            try {
                const ALPHA_VANTAGE_API_KEY = 'N7S0XMBRM3X27Q4W';
                const overviewResponse = await fetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`);
                
                if (overviewResponse.ok) {
                    const overviewData = await overviewResponse.json();
                    
                    // Update market cap if available
                    if (overviewData.MarketCapitalization) {
                        const marketCap = (parseFloat(overviewData.MarketCapitalization) / 1000000000).toFixed(2);
                        data.marketCapitalization = parseFloat(overviewData.MarketCapitalization);
                        
                        // Add other useful data if available
                        if (overviewData.Description && !data.description) {
                            data.description = overviewData.Description;
                        }
                        
                        if (overviewData.Sector && !data.industry) {
                            data.industry = `${overviewData.Sector}${overviewData.Industry ? ` (${overviewData.Industry})` : ''}`;
                        }
                    }
                }
            } catch (alphaVantageError) {
                console.warn('Error fetching additional company data:', alphaVantageError);
                // Continue anyway, this is just supplementary data
            }
            
            // Create a description with available data
            let description = data.description || '';
            if (!description) {
                description = `${data.name} (${symbol}) `;
                if (data.exchange) description += `is listed on the ${data.exchange}. `;
                if (data.industry) description += `The company operates in the ${data.industry} industry. `;
                if (data.country) description += `Headquartered in ${data.country}. `;
                if (data.ipo) description += `IPO Date: ${new Date(data.ipo).toLocaleDateString()}. `;
                
                // Only add market cap if it's actually available and not zero
                if (data.marketCapitalization && data.marketCapitalization > 0) {
                    const marketCap = (data.marketCapitalization / 1000000000).toFixed(2);
                    description += `Market Cap: $${marketCap} billion. `;
                }
            }
            
            document.getElementById('detail-description').textContent = description || 'No company description available.';
        } else {
            // If Finnhub doesn't provide good data, fall back to Alpha Vantage
            await fetchAlphaVantageCompanyData(symbol);
        }
    } catch (error) {
        console.error('Error fetching company profile from Finnhub:', error);
        
        // Try Alpha Vantage as fallback
        try {
            await fetchAlphaVantageCompanyData(symbol);
        } catch (fallbackError) {
            console.error('Error fetching from fallback source:', fallbackError);
            document.getElementById('detail-description').textContent = 
                `Unable to load detailed company information for ${symbol} at this time.`;
        }
    }
}

// Fallback function to get company data from Alpha Vantage
async function fetchAlphaVantageCompanyData(symbol) {
    const ALPHA_VANTAGE_API_KEY = 'N7S0XMBRM3X27Q4W';
    const response = await fetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch company data: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check if we got meaningful data
    if (Object.keys(data).length > 1) { // More than just the API call metadata
        document.getElementById('detail-name').textContent = data.Name || symbol;
        document.getElementById('detail-about-name').textContent = data.Name || symbol;
        
        let description = data.Description || '';
        if (!description) {
            description = `${data.Name || symbol} `;
            if (data.Exchange) description += `is listed on the ${data.Exchange}. `;
            if (data.Sector) description += `The company operates in the ${data.Sector} industry. `;
            if (data.Country) description += `Headquartered in ${data.Country}. `;
            
            // Only add market cap if it's actually available and not zero
            if (data.MarketCapitalization && parseInt(data.MarketCapitalization) > 0) {
                const marketCap = (parseInt(data.MarketCapitalization) / 1000000000).toFixed(2);
                description += `Market Cap: $${marketCap} billion. `;
            }
            
            if (data.DividendYield && parseFloat(data.DividendYield) > 0) {
                const dividendYield = (parseFloat(data.DividendYield) * 100).toFixed(2);
                description += `Dividend Yield: ${dividendYield}%. `;
            }
            
            if (data.PERatio && parseFloat(data.PERatio) > 0) {
                description += `P/E Ratio: ${parseFloat(data.PERatio).toFixed(2)}. `;
            }
        }
        
        document.getElementById('detail-description').textContent = description || 'No company description available.';
    } else {
        throw new Error('Insufficient company data available');
    }
}

// Function to update the stock chart


// Function to generate mock stock data
function generateMockStockData(symbol) {
const basePrice = Math.floor(Math.random() * 500) + 50;
const change = (Math.random() * 20 - 10);
const changePercent = (change / basePrice) * 100;

return {
    c: basePrice,                // Current price
    d: change,                   // Change
    dp: changePercent,           // Percent change
    h: basePrice + Math.random() * 5,  // High
    l: basePrice - Math.random() * 5,  // Low
    o: basePrice - change,       // Open
    pc: basePrice - change,      // Previous close
    v: Math.floor(Math.random() * 10000000)  // Volume
};
}
// Function to update the stock chart with real data
async function updateStockChart() {
    const chartContainer = document.getElementById('stock-chart');
    if (!chartContainer) return;
    
    const symbol = document.getElementById('detail-symbol').textContent;
    if (!symbol) return;
    
    // First, show loading state
    chartContainer.innerHTML = `
        <div class="chart-placeholder text-center py-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading chart...</span>
            </div>
            <p class="text-muted mt-2">Loading price chart...</p>
        </div>
    `;
    
    try {
        // Alpha Vantage API key - free tier allows 5 calls per minute, 500 per day
        const ALPHA_VANTAGE_API_KEY = 'N7S0XMBRM3X27Q4W'; // Replace with your own key if needed
        
        // Fetch historical data for the last 30 days
        const response = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}&outputsize=compact`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch historical data: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Check if we got valid data
        if (data['Error Message'] || !data['Time Series (Daily)']) {
            throw new Error('Invalid data received from Alpha Vantage');
        }
        
        // Format data for the chart
        const timeSeriesData = data['Time Series (Daily)'];
        const chartData = [];
        
        // Get the last 14 days of data
        const dates = Object.keys(timeSeriesData).sort().slice(-14);
        
        for (const date of dates) {
            const dailyData = timeSeriesData[date];
            chartData.push({
                date: new Date(date).toLocaleDateString(),
                close: parseFloat(dailyData['4. close']),
                volume: parseInt(dailyData['5. volume'])
            });
        }
        
        // Clear the container and add a canvas for the chart
        chartContainer.innerHTML = '<canvas id="stockPriceChart" width="100%" height="250"></canvas>';
        
        // Get the canvas context
        const ctx = document.getElementById('stockPriceChart').getContext('2d');
        
        // Determine chart color based on price trend
        const firstPrice = chartData[0].close;
        const lastPrice = chartData[chartData.length - 1].close;
        const priceChange = lastPrice - firstPrice;
        const chartColor = priceChange >= 0 ? 'rgba(40, 167, 69, 1)' : 'rgba(220, 53, 69, 1)';
        const chartColorLight = priceChange >= 0 ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)';
        
        // Create the chart
        new Chart(ctx, {
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
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `$${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '$' + value;
                            }
                        }
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error creating stock chart:', error);
        
        // Show fallback message on error
        chartContainer.innerHTML = `
            <div class="text-center p-3">
                <p class="mb-2">Unable to load chart data at this time. ${error.message}</p>
                <a href="https://finance.yahoo.com/quote/${symbol}/chart" target="_blank" class="btn btn-sm btn-outline-primary">
                    View Chart on Yahoo Finance
                </a>
            </div>
        `;
    }
}
// Function to initialize the premarket drawer
function initPremarketDrawer() {
    // Get the premarket toggle button
    const premarketToggle = document.querySelector('.premarket-toggle-btn');
    const premarketContent = document.getElementById('premarketContent');
    
    if (!premarketToggle || !premarketContent) return;
    
    // Add Bootstrap collapse event listeners
    premarketContent.addEventListener('show.bs.collapse', function() {
        // When drawer is opening, load premarket data if it hasn't been loaded yet
        const premarketData = document.getElementById('premarket-data');
        
        // Only reload data if the container is empty
        if (premarketData && premarketData.innerHTML.trim() === '') {
            // Check if there's a 'no-data' message
            const noDataElem = premarketData.querySelector('.no-data');
            if (!noDataElem) {
                // If we have displayed stocks, load premarket data for them
                if (allDisplayedStocks && allDisplayedStocks.length > 0) {
                    loadPremarketData(allDisplayedStocks);
                }
            }
        }
    });
    
    premarketContent.addEventListener('shown.bs.collapse', function() {
        // After it's fully open, scroll to it if needed
        premarketToggle.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}
// Function to specifically load premarket data
async function loadPremarketData(symbols) {
    const premarketData = document.getElementById('premarket-data');
    const premarketLoader = document.getElementById('premarket-loader');
    const premarketError = document.getElementById('premarket-error');
    
    if (!premarketData) return;
    
    // Clear container and show loader
    premarketData.innerHTML = '';
    if (premarketLoader) premarketLoader.style.display = 'block';
    if (premarketError) premarketError.textContent = '';
    
    try {
        // Get current hour to check if we're in premarket hours
        const now = new Date();
        const hour = now.getHours();
        const isPreMarketHours = hour >= 4 && hour < 9.5; // 4 AM to 9:30 AM EST
        
        if (!isPreMarketHours) {
            premarketData.innerHTML = '<div class="no-data">Premarket data is only available between 4:00 AM and 9:30 AM Eastern Time.</div>';
            if (premarketLoader) premarketLoader.style.display = 'none';
            return;
        }
        
        // Find logo URLs from our loaded stock data
        const logoMap = {};
        STOCK_SYMBOLS.forEach(stock => {
            logoMap[stock.symbol] = {
                name: stock.name,
                logoUrl: stock.logoUrl
            };
        });
        
        // Process each symbol individually
        const stockDataMap = {};
        
        // Use Promise.all to fetch data for all symbols in parallel
        await Promise.all(symbols.map(async (symbol, index) => {
            try {
                // Add a small delay between requests to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, index * 300));
                
                // Use Finnhub API
                const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`Error fetching data for ${symbol}: ${response.status}`);
                }
                
                const data = await response.json();
                
                // Add name and logo from our data
                if (logoMap[symbol]) {
                    data.name = logoMap[symbol].name;
                    data.logoUrl = logoMap[symbol].logoUrl;
                } else {
                    data.name = symbol;
                }
                
                stockDataMap[symbol] = data;
            } catch (error) {
                console.error(`Error fetching premarket data for ${symbol}:`, error);
                // Add a placeholder with just the name and logo
                stockDataMap[symbol] = {
                    error: true,
                    name: logoMap[symbol]?.name || symbol,
                    logoUrl: logoMap[symbol]?.logoUrl || ''
                };
            }
        }));
        
        // Create premarket cards for each stock
        for (const symbol of symbols) {
            const stockInfo = stockDataMap[symbol];
            
            if (stockInfo && !stockInfo.error) {
                // Create fake premarket data based on current price
                // In a real implementation, you'd get actual premarket data from a provider that offers it
                const fakePremarketChange = stockInfo.c * 0.003 * (Math.random() > 0.5 ? 1 : -1);
                const fakePremarketData = {
                    ...stockInfo,
                    premarketPrice: stockInfo.c + fakePremarketChange,
                    premarketChange: fakePremarketChange,
                    premarketChangePercent: (fakePremarketChange / stockInfo.c) * 100
                };
                
                const premarketStockCard = createPremarketStockCard(symbol, fakePremarketData, watchlist.includes(symbol));
                premarketData.appendChild(premarketStockCard);
            }
        }
        
        // If no premarket data was created
        if (premarketData.innerHTML === '') {
            premarketData.innerHTML = '<div class="no-data">No premarket data available for the current stocks.</div>';
        }
    } catch (error) {
        console.error('Error loading premarket data:', error);
        premarketData.innerHTML = '<div class="error-message">Failed to fetch premarket data. Please try again later.</div>';
    } finally {
        // Hide loader
        if (premarketLoader) premarketLoader.style.display = 'none';
    }
}