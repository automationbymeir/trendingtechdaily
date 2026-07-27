// js/ticker.js
document.addEventListener("DOMContentLoaded", () => {
    const tickerContent = document.getElementById('news-ticker-content');
    if (!tickerContent) return;

    const items = tickerContent.querySelectorAll('.ticker-item');
    if (items.length <= 1) return; // No need to animate if 0 or 1 item

    let currentIndex = 0;
    const intervalTime = 4000; // 4 seconds per article

    setInterval(() => {
        const currentItem = items[currentIndex];
        
        // Calculate next index
        const nextIndex = (currentIndex + 1) % items.length;
        const nextItem = items[nextIndex];

        // Animate current out
        currentItem.classList.remove('active');
        currentItem.classList.add('exit');

        // Animate next in
        nextItem.classList.remove('exit');
        // Small timeout to allow transition reset if needed
        setTimeout(() => {
            nextItem.classList.add('active');
        }, 50);

        // Clean up classes after transition finishes
        setTimeout(() => {
            currentItem.classList.remove('exit');
        }, 600); // match CSS transition duration

        currentIndex = nextIndex;
    }, intervalTime);
});
