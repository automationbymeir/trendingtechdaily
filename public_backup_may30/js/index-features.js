// public/js/index-features.js - Additional features for the homepage (videos, podcasts, welcome popup)

// Helper function (from your existing code)
function getSafe(fn, defaultValue = '') {
    try {
        const value = fn();
        return (value !== null && value !== undefined) ? value : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Load Recommended Videos if container exists
    if (document.getElementById('video-recommendations-container')) {
        loadRecommendedVideos();
    }

    // Load Sidebar Podcasts if container exists
    if (document.getElementById('sidebar-podcasts-list')) {
        loadSidebarPodcasts();
    }

    // Initialize Welcome Popup if elements exist
    if (document.getElementById('welcome-popup-overlay')) {
        initWelcomePopup();
    }
});


// --- Load Recommended Videos ---
async function loadRecommendedVideos() {
    const videoContainer = document.getElementById('video-recommendations-container');
    const loader = document.getElementById('video-loader');
    // Find the "Recommended Videos" header, assuming it's a sibling or parent's sibling
    const recommendedVideosHeader = document.querySelector('.video-recommendations .section-title');


    if (!videoContainer) {
        console.error("Video container ('video-recommendations-container') not found");
        return;
    }

    if (loader) {
        // Assuming loader is handled by CSS or shown by default
    } else {
        videoContainer.innerHTML = '<p class="text-center text-gray-500 py-8">Loading recommended videos...</p>';
    }

    try {
        if (typeof functions === 'undefined') { // 'functions' should be globally available from app-base.js (firebase.functions())
            throw new Error("Firebase Functions service not available. Check app-base.js");
        }

        console.log("Calling getRecommendedVideos Cloud Function...");
        const getVideosCallable = functions.httpsCallable('getRecommendedVideos');

        const searchKeywords = ['latest technology', 'ai innovation', 'gadget reviews', 'tech news'];
        const result = await getVideosCallable({ keywords: searchKeywords, maxResults: 6 });

        const videoData = getSafe(() => result.data.videos, []);
        console.log("Received video data from Cloud Function:", videoData);

        if (recommendedVideosHeader) {
            recommendedVideosHeader.style.display = ''; // Ensure header is visible if videos load
        }
        renderVideos(videoData);

    } catch (error) {
        console.error("Error loading recommended videos via Cloud Function (raw error object):", error); // Original log
        if (loader) loader.remove();

        // === DEBUG LOGGING ===
        console.log("--- BANNER DEBUG START ---");
        console.log("Type of error object:", typeof error);
        console.log("Error object structure:", error); // See the full error in console
        if (error && error.message) {
            console.log("error.message:", error.message);
            const lowerCaseErrorMessage = error.message.toLowerCase();
            console.log("error.message.toLowerCase():", lowerCaseErrorMessage);
            const includesQuota = lowerCaseErrorMessage.includes('quota');
            console.log("lowerCaseErrorMessage.includes('quota'):", includesQuota);
            const includesExceededQuota = lowerCaseErrorMessage.includes('exceeded your quota');
            console.log("lowerCaseErrorMessage.includes('exceeded your quota'):", includesExceededQuota);
            const conditionResult = (includesQuota || includesExceededQuota);
            console.log("Condition (includesQuota || includesExceededQuota) is:", conditionResult);
        } else {
            console.log("error.message is undefined or null");
        }
        console.log("--- BANNER DEBUG END ---");
        // === END DEBUG LOGGING ===

        if (error && error.message && (error.message.toLowerCase().includes('quota') || error.message.toLowerCase().includes('exceeded your quota'))) {
            console.log("DEBUG: Quota condition met, calling displayQuotaExceededAIAgentBanner.");
            if (recommendedVideosHeader) {
                recommendedVideosHeader.style.display = 'none'; // Hide header
            }
            displayQuotaExceededAIAgentBanner(videoContainer);
        } else {
            console.log("DEBUG: Quota condition NOT met, showing fallback error message.");
            if (recommendedVideosHeader) {
                recommendedVideosHeader.style.display = ''; // Ensure header is visible for other errors
            }
            videoContainer.innerHTML = `<p class="text-danger text-center small col-12">Could not load recommended videos: ${getSafe(()=>error.message, 'Unknown error')}</p>`;
        }
    }
}

// --- Render Video Cards (Your existing function) ---
function renderVideos(videoData) {
    const videoContainer = document.getElementById('video-recommendations-container');
    const loader = document.getElementById('video-loader');
    const showMoreContainer = document.getElementById('show-more-videos-container');
    const showMoreBtn = document.getElementById('show-more-videos-btn');
    const showLessBtn = document.getElementById('show-less-videos-btn');

    if (!videoContainer || !showMoreContainer || !showMoreBtn || !showLessBtn) {
        console.error("Video container or show more/less elements not found in HTML.");
        if(loader) loader.remove();
        return;
    }

    if (loader) loader.remove();

    if (!videoData || videoData.length === 0) {
        videoContainer.innerHTML = '<p class="text-muted text-center small col-12">No recommended videos found.</p>';
        showMoreContainer.style.display = 'none';
        return;
    }

    let allVideosHTML = '';
    const videosToDisplayCount = Math.min(videoData.length, 6);
    const videosToDisplay = videoData.slice(0, videosToDisplayCount);


    videosToDisplay.forEach((video, index) => {
        const extraClass = index >= 3 ? 'video-col-more' : '';
        allVideosHTML += renderSingleVideoCard(video, extraClass);
    });

    videoContainer.innerHTML = allVideosHTML;

    const moreVideoCols = videoContainer.querySelectorAll('.video-col-more');

    if (moreVideoCols.length > 0) {
        showMoreContainer.style.display = 'block';
        showMoreBtn.style.display = 'inline-block';
        showLessBtn.style.display = 'none';

        // Re-attach event listeners to avoid issues with cloned nodes if this function is called multiple times
        const newShowMoreBtn = showMoreBtn.cloneNode(true);
        showMoreBtn.parentNode.replaceChild(newShowMoreBtn, showMoreBtn);

        const newShowLessBtn = showLessBtn.cloneNode(true);
        showLessBtn.parentNode.replaceChild(newShowLessBtn, showLessBtn);

        newShowMoreBtn.addEventListener('click', () => {
            console.log("Show More clicked");
            moreVideoCols.forEach(col => col.style.display = ''); // Assuming '' makes it default to block/flex
            newShowMoreBtn.style.display = 'none';
            newShowLessBtn.style.display = 'inline-block';
        });

        newShowLessBtn.addEventListener('click', () => {
            console.log("Show Less clicked");
            moreVideoCols.forEach(col => col.style.display = 'none');
            newShowLessBtn.style.display = 'none';
            newShowMoreBtn.style.display = 'inline-block';
        });

    } else {
        showMoreContainer.style.display = 'none';
    }
}

// --- HELPER: Render a Single Video Card (Your existing function) ---
function renderSingleVideoCard(video, extraColClass = '') {
    const videoTitle = getSafe(() => video.title, 'Untitled Video');
    const videoId = getSafe(() => video.id);
    const thumbnailUrl = getSafe(() => video.thumbnail, '/img/placeholder-video.png'); // Your placeholder
    const channelTitle = getSafe(() => video.channel, '');
    const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '#';

    if (!videoId) return ''; // Skip rendering if no video ID

    // Your existing card structure
    return `
        <div class="col ${extraColClass}" ${extraColClass ? 'style="display: none;"' : ''}>
            <div class="card h-100 shadow-sm video-card">
                <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="text-decoration-none">
                    <img src="${thumbnailUrl}" class="card-img-top" alt="${videoTitle}" loading="lazy" onerror="this.onerror=null; this.src='/img/placeholder-video.png';">
                </a>
                <div class="card-body">
                    <h5 class="card-title">
                        <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="text-decoration-none text-dark stretched-link">${videoTitle}</a>
                    </h5>
                    ${channelTitle ? `<p class="card-text text-muted small mb-0">${channelTitle}</p>` : ''}
                </div>
            </div>
        </div>
    `;
}

/**
 * Displays a promotional banner for the AI Agent when YouTube quota is exceeded.
 * @param {HTMLElement} container - The container element to display the banner in.
 */
function displayQuotaExceededAIAgentBanner(container) {
    console.log("DEBUG: displayQuotaExceededAIAgentBanner function IS CALLED!");
    if (!document.getElementById('aiAgentPromoBannerStyles')) {
        const styleSheet = document.createElement("style");
        styleSheet.id = 'aiAgentPromoBannerStyles';
        styleSheet.innerHTML = `
            #aiAgentPromoBanner {
                background: linear-gradient(135deg, #2c3e50, #1a2533);
                color: #ecf0f1;
                padding: 25px; /* Adjusted padding */
                border-radius: 12px;
                text-align: left; /* Align text left for landscape feel */
                box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                margin-top: 20px;
                display: flex; /* Use flex for internal layout */
                flex-direction: row; /* Horizontal layout on larger screens */
                align-items: center; /* Vertically align items */
                gap: 20px; 
                border: 1px solid #34495e;
                width: 100%; /* Ensure it takes full width of its parent */
                box-sizing: border-box;
            }
            .ai-promo-icon-container { /* Container for icon */
                flex-shrink: 0; /* Prevent icon from shrinking */
            }
            .ai-promo-icon { 
                width: 50px; 
                height: 50px;
                opacity: 0.9;
                fill: #ecf0f1;
            }
            .ai-promo-text-content { /* Container for text and button */
                flex-grow: 1; /* Allow text content to take remaining space */
                text-align: left;
            }
            #aiAgentPromoBanner h3 {
                font-size: 1.6em; 
                color: #ffffff;
                margin: 0 0 8px 0; /* Add some bottom margin */
                font-weight: 600;
            }
            #aiAgentPromoBanner p {
                font-size: 1em; 
                line-height: 1.6;
                margin: 0 0 15px 0; /* Add bottom margin */
                color: #bdc3c7; 
            }
            #aiAgentPromoBanner button#openAIAgentFromBanner {
                background-color: #3498db; 
                color: white;
                border: none;
                padding: 12px 24px; /* Slightly adjusted padding */
                border-radius: 8px;
                font-size: 1em; 
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.25s ease, transform 0.2s ease, box-shadow 0.25s ease;
                box-shadow: 0 4px 10px rgba(52, 152, 219, 0.25);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                display: inline-block; /* Make button align with text */
            }
            #aiAgentPromoBanner button#openAIAgentFromBanner:hover {
                background-color: #2980b9;
                transform: translateY(-2px);
                box-shadow: 0 6px 12px rgba(52, 152, 219, 0.35);
            }
            #aiAgentPromoBanner button#openAIAgentFromBanner:active {
                transform: translateY(0);
                box-shadow: 0 3px 7px rgba(52, 152, 219, 0.2);
            }
            /* Responsive adjustments for smaller screens */
            @media (max-width: 768px) {
                #aiAgentPromoBanner {
                    flex-direction: column; /* Stack elements vertically */
                    text-align: center; /* Center text on smaller screens */
                    padding: 20px;
                }
                .ai-promo-text-content {
                    text-align: center; /* Center text content */
                }
                #aiAgentPromoBanner h3 {
                    font-size: 1.4em;
                }
                #aiAgentPromoBanner p {
                    font-size: 0.95em;
                }
                 #aiAgentPromoBanner button#openAIAgentFromBanner {
                    padding: 10px 20px;
                    font-size: 0.95em;
                }
            }
        `;
        document.head.appendChild(styleSheet);
        console.log("DEBUG: Banner styles injected.");
    }

    if (!container) {
        console.error("DEBUG: Banner container is null inside displayQuotaExceededAIAgentBanner!");
        return;
    }
    
    // Updated banner HTML content
    container.innerHTML = ` 
        <div id="aiAgentPromoBanner">
            <div class="ai-promo-icon-container">
                <svg class="ai-promo-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M0 0h24v24H0z" fill="none"/>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 15c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm0-10c-2.06 0-3.74 1.26-4.49 3.01L12 12.01l4.49-2.01C15.74 8.25 14.06 7 12 7zm0 4c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
                  <circle cx="12" cy="14" r="1"/> 
                </svg>
            </div>
            <div class="ai-promo-text-content">
                <h3>Discover Our New AI Assistant!</h3>
                <p>Explore tech topics, get article summaries, and access information instantly with your personal AI guide.</p>
                <button id="openAIAgentFromBanner">Explore with AI</button>
            </div>
        </div>
    `;
    console.log("DEBUG: Banner HTML injected into container:", container.id);


    const openAiButton = document.getElementById('openAIAgentFromBanner');
    if (openAiButton) {
        console.log("DEBUG: 'Explore with AI' button found, adding listener.");
        openAiButton.addEventListener('click', () => {
            console.log("DEBUG: 'Explore with AI' button clicked.");
            if (window.aiTechAgent && typeof window.aiTechAgent.open === 'function') {
                window.aiTechAgent.open();
            } else {
                console.warn("AI Tech Agent (window.aiTechAgent) not found or 'open' method is unavailable.");
                alert("AI Agent feature is initializing. Please try the floating button shortly!");
            }
        });
    } else {
        console.error("DEBUG: 'Explore with AI' button (openAIAgentFromBanner) NOT FOUND after injecting HTML.");
    }
}


// --- Load Sidebar Podcasts (Your existing function) ---
async function loadSidebarPodcasts() {
    const podcastsContainer = document.getElementById('sidebar-podcasts-list');
    const loader = document.getElementById('sidebar-podcasts-loader');
    const errorContainer = document.getElementById('sidebar-podcasts-error');

    if (!podcastsContainer) {
        console.error("Sidebar podcasts container not found");
        return;
    }

    try {
        if (typeof functions === 'undefined') {
            throw new Error("Firebase Functions service not available. Check app-base.js");
        }

        console.log("Loading sidebar podcasts...");
        const getTechPodcastsFn = functions.httpsCallable('getTechPodcasts');

        const result = await getTechPodcastsFn({
            query: "technology podcast programming ai",
            limit: 4
        });

        const podcasts = getSafe(() => result.data.podcasts, []);
        console.log("Received sidebar podcast data:", podcasts);

        if (loader) loader.remove();

        if (podcasts && podcasts.length > 0) {
            renderSidebarPodcasts(podcasts);
        } else {
            if (errorContainer) {
                errorContainer.textContent = 'No podcasts available at the moment.';
                errorContainer.classList.remove('d-none'); // Ensure d-none is removed to show message
            }
        }

    } catch (error) {
        console.error("Error loading sidebar podcasts:", error);
        if (loader) loader.remove();
        if (errorContainer) {
            errorContainer.textContent = `Could not load podcasts: ${getSafe(() => error.message, 'Unknown error')}`;
            errorContainer.classList.remove('d-none'); // Ensure d-none is removed to show message
        }
    }
}

// --- Render Sidebar Podcasts (Your existing function) ---
function renderSidebarPodcasts(podcasts) {
    const container = document.getElementById('sidebar-podcasts-list');
    if (!container) return;

    let html = '';
    podcasts.forEach(podcast => {
        const imageUrl = getSafe(() => podcast.imageUrl, '/img/default-podcast-art.png');
        const podcastName = getSafe(() => podcast.name, 'Untitled Podcast');
        const publisher = getSafe(() => podcast.publisher, 'Unknown Publisher');
        const spotifyUrl = getSafe(() => podcast.spotifyUrl, '#');
        const totalEpisodes = getSafe(() => podcast.total_episodes);

        html += `
            <a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" class="sidebar-podcast-item">
                <img src="${imageUrl}" alt="${podcastName}" class="sidebar-podcast-image"
                     onerror="this.onerror=null; this.src='/img/default-podcast-art.png';">
                <div class="sidebar-podcast-content">
                    <div class="sidebar-podcast-title">${podcastName}</div>
                    <div class="sidebar-podcast-publisher">${publisher}</div>
                    <div class="sidebar-podcast-meta">
                        <i class="bi bi-spotify spotify-icon"></i>
                        <span>Listen on Spotify</span>
                        ${totalEpisodes ? `<span>• ${totalEpisodes} episodes</span>` : ''}
                    </div>
                </div>
            </a>
        `;
    });

    container.innerHTML = html;
}

// --- Welcome Popup Functionality (MODIFIED FOR SCROLL TRIGGER) ---
function initWelcomePopup() {
    const popupOverlay = document.getElementById('welcome-popup-overlay');
    const closeBtn = document.getElementById('popup-close-btn');
    const maybeLaterBtn = document.getElementById('popup-maybe-later');
    let popupShownOnScroll = false; // Flag to ensure popup shows only once per session via scroll

    if (!popupOverlay || !closeBtn || !maybeLaterBtn) {
        console.warn("One or more welcome popup elements are missing. Popup cannot initialize.");
        return;
    }

    function shouldShowPopupConditions() {
        // Assuming 'auth' is a global Firebase auth object
        if (typeof auth !== 'undefined' && auth.currentUser) {
            return false;
        }

        if (sessionStorage.getItem('welcomePopupDismissed')) { // Checks if dismissed in current session
            return false;
        }
        
        // Check if dismissed permanently (or for 7 days)
        const lastDismissed = localStorage.getItem('welcomePopupLastDismissed');
        if (lastDismissed) {
            const daysSinceDismissed = (Date.now() - parseInt(lastDismissed)) / (1000 * 60 * 60 * 24);
            if (daysSinceDismissed < 7) {
                return false;
            }
        }
        return true;
    }

    function triggerPopupDisplay() {
        if (popupOverlay.classList.contains('show')) return; // Already showing

        popupOverlay.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    
    function actuallyShowPopup() { // Renamed to avoid confusion
        if (shouldShowPopupConditions()) {
            triggerPopupDisplay();
        }
    }

    function hidePopup() {
        popupOverlay.classList.remove('show');
        document.body.style.overflow = '';
        sessionStorage.setItem('welcomePopupDismissed', 'true'); // Dismiss for current session
    }

    function dismissPopupPermanently() { // Renamed for clarity
        hidePopup();
        localStorage.setItem('welcomePopupLastDismissed', Date.now().toString()); // Dismiss for 7 days
    }

    closeBtn.addEventListener('click', hidePopup);
    maybeLaterBtn.addEventListener('click', dismissPopupPermanently);

    popupOverlay.addEventListener('click', (e) => {
        if (e.target === popupOverlay) {
            hidePopup();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popupOverlay.classList.contains('show')) {
            hidePopup();
        }
    });

    // Scroll event listener
    const handleScroll = () => {
        if (popupShownOnScroll || !shouldShowPopupConditions() || popupOverlay.classList.contains('show')) {
            // If already shown by scroll, or conditions not met, or already visible, do nothing
            return;
        }

        const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        const documentHeight = Math.max(
            document.body.scrollHeight, document.documentElement.scrollHeight,
            document.body.offsetHeight, document.documentElement.offsetHeight,
            document.body.clientHeight, document.documentElement.clientHeight
        );

        // Ensure documentHeight is greater than windowHeight to prevent division by zero or negative results
        if (documentHeight <= windowHeight) {
             // If content is not scrollable, this condition won't be met by scrolling.
            return;
        }

        const scrollPercentage = (scrollPosition / (documentHeight - windowHeight)) * 100;

        if (scrollPercentage >= 20) {
            console.log("User scrolled 20%, attempting to show popup.");
            actuallyShowPopup();
            popupShownOnScroll = true; 
            window.removeEventListener('scroll', handleScroll); 
        }
    };
    
    setTimeout(() => {
        const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        const documentHeight = Math.max(
            document.body.scrollHeight, document.documentElement.scrollHeight,
            document.body.offsetHeight, document.documentElement.offsetHeight,
            document.body.clientHeight, document.documentElement.clientHeight
        );
        
        if (documentHeight > windowHeight) { 
            const initialScrollPercentage = (scrollPosition / (documentHeight - windowHeight)) * 100;
            if (initialScrollPercentage >= 20 && shouldShowPopupConditions()) {
                console.log("Already scrolled 20% on load, attempting to show popup.");
                actuallyShowPopup();
                popupShownOnScroll = true;
            } else if (shouldShowPopupConditions() && !popupShownOnScroll) { 
                 window.addEventListener('scroll', handleScroll, { passive: true });
            }
        } else if (shouldShowPopupConditions() && !popupOverlay.classList.contains('show')) { 
            if (!popupShownOnScroll) { 
                window.addEventListener('scroll', handleScroll, { passive: true });
            }
        }
    }, 100); 
}
