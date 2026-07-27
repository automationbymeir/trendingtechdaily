// js/stories.js

let storiesData = [];
let currentStoryIndex = 0;

document.addEventListener("DOMContentLoaded", () => {
    const wrapper = document.getElementById("stories-wrapper");
    if (!wrapper) return;

    // Determine language based on URL path
    const isHebrew = window.location.pathname.startsWith('/he');
    const lang = isHebrew ? 'he' : 'en';

    function initStories() {
        if (typeof firebase === 'undefined' || !firebase.apps || firebase.apps.length === 0) {
            setTimeout(initStories, 100);
            return;
        }

        try {
            const db = firebase.firestore();
            db.collection("stories")
                .where("language", "==", lang)
                .get()
                .then(storiesSnapshot => {
                    storiesData = storiesSnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));

                    // Sort by createdAt descending and limit to 10
                    storiesData.sort((a, b) => {
                        const dateA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
                        const dateB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
                        return dateB - dateA;
                    });
                    storiesData = storiesData.slice(0, 10);

                    // Fallback to hardcoded promo videos if no dynamic stories exist yet
                    if (storiesData.length === 0) {
                        if (lang === 'he') {
                            storiesData.push({
                                id: "hebrewPromo",
                                title: "פרומו למגזין",
                                videoSrc: "/videos/stories/hebrewPromo.mp4",
                                thumbnail: "/img/logo.png"
                            });
                        } else {
                            storiesData.push({
                                id: "englishPromo",
                                title: "Weekly Promo",
                                videoSrc: "/videos/stories/englishPromo.mp4",
                                thumbnail: "/img/logo.png"
                            });
                        }
                    }

                    // Render Story Circles
                    if (storiesData.length > 0) {
                        storiesData.forEach((story, index) => {
                            const item = document.createElement("div");
                            item.className = "story-item";
                            item.innerHTML = `
                                <div class="story-circle">
                                    <img src="${story.thumbnail || '/img/logo.png'}" alt="${story.title}" />
                                </div>
                                <div class="story-title">${story.title}</div>
                            `;
                            item.addEventListener("click", () => openStory(index));
                            wrapper.appendChild(item);
                        });
                    } else {
                        // Hide the container if no stories
                        document.querySelector('.stories-container').style.display = 'none';
                    }

                    setupStoryModal();
                })
                .catch(error => {
                    console.error("Error fetching stories:", error);
                    document.querySelector('.stories-container').style.display = 'none';
                });
        } catch (error) {
            console.error("Error initializing stories DB:", error);
            document.querySelector('.stories-container').style.display = 'none';
        }
    }

    initStories();
});

function setupStoryModal() {
    const closeBtn = document.getElementById("story-viewer-close");
    const videoPlayer = document.getElementById("story-video-player");

    if (closeBtn) {
        closeBtn.addEventListener("click", closeStory);
    }
    
    if (videoPlayer) {
        videoPlayer.addEventListener("ended", playNextStory);
        videoPlayer.addEventListener("timeupdate", updateProgressBar);
        // Allow clicking on right/left half of video to navigate
        videoPlayer.addEventListener("click", (e) => {
            const rect = videoPlayer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (x > rect.width / 2) {
                playNextStory();
            } else {
                playPrevStory();
            }
        });
    }
}

function openStory(index) {
    if (index < 0 || index >= storiesData.length) return;
    currentStoryIndex = index;

    const modal = document.getElementById("story-viewer-modal");
    const videoPlayer = document.getElementById("story-video-player");
    const progressContainer = document.getElementById("story-progress-container");

    if (!modal || !videoPlayer || !progressContainer) return;

    modal.classList.add("active");
    
    // Setup progress bars
    progressContainer.innerHTML = "";
    storiesData.forEach((_, i) => {
        const bar = document.createElement("div");
        bar.className = "story-progress-bar";
        
        const fill = document.createElement("div");
        fill.className = "story-progress-fill";
        fill.id = `story-progress-fill-${i}`;
        
        // if this story is already past, fill it completely
        if (i < currentStoryIndex) {
            fill.style.width = "100%";
        }
        
        bar.appendChild(fill);
        progressContainer.appendChild(bar);
    });

    const currentStory = storiesData[currentStoryIndex];
    videoPlayer.src = currentStory.videoUrl || currentStory.videoSrc; // Handle old vs new format
    videoPlayer.play().catch(e => console.error("Error playing video:", e));
}

function closeStory() {
    const modal = document.getElementById("story-viewer-modal");
    const videoPlayer = document.getElementById("story-video-player");
    if (modal) modal.classList.remove("active");
    if (videoPlayer) {
        videoPlayer.pause();
        videoPlayer.src = "";
    }
}

function playNextStory() {
    if (currentStoryIndex + 1 < storiesData.length) {
        // Complete current progress bar
        const currentFill = document.getElementById(`story-progress-fill-${currentStoryIndex}`);
        if (currentFill) currentFill.style.width = "100%";
        
        openStory(currentStoryIndex + 1);
    } else {
        closeStory();
    }
}

function playPrevStory() {
    if (currentStoryIndex - 1 >= 0) {
        // Reset current progress bar
        const currentFill = document.getElementById(`story-progress-fill-${currentStoryIndex}`);
        if (currentFill) currentFill.style.width = "0%";
        
        openStory(currentStoryIndex - 1);
    } else {
        // Reset current video to start
        const videoPlayer = document.getElementById("story-video-player");
        if (videoPlayer) {
            videoPlayer.currentTime = 0;
            videoPlayer.play();
        }
    }
}

function updateProgressBar() {
    const videoPlayer = document.getElementById("story-video-player");
    if (!videoPlayer || videoPlayer.duration === 0) return;

    const percentage = (videoPlayer.currentTime / videoPlayer.duration) * 100;
    const currentFill = document.getElementById(`story-progress-fill-${currentStoryIndex}`);
    if (currentFill) {
        currentFill.style.width = `${percentage}%`;
    }
}
