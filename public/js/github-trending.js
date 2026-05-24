// github-trending.js
// This script fetches trending GitHub repositories created within the last week
// and displays them in the sidebar section. It uses GitHub's search API to
// approximate trending repos by sorting new repositories by star count.

document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('trending-github-list');
  const loaderEl = document.getElementById('trending-github-loader');
  // Exit if container is not present (e.g., on pages without sidebar)
  if (!listEl || !loaderEl) return;

  // Compute date string for the last 7 days
  const daysAgo = 7;
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const dateString = date.toISOString().split('T')[0];

  // GitHub Search API: fetch top repos created after dateString, sorted by stars
  const apiUrl = `https://api.github.com/search/repositories?q=created:>${dateString}&sort=stars&order=desc&per_page=5`;

  fetch(apiUrl)
    .then(response => {
      // Basic error handling for non-OK responses
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      loaderEl.style.display = 'none';
      const repos = data.items || [];
      // Display message if no repos returned
      if (repos.length === 0) {
        const noItem = document.createElement('li');
        noItem.textContent = 'No trending repositories found.';
        noItem.classList.add('list-group-item');
        listEl.appendChild(noItem);
        return;
      }
      // Populate list with repos
      repos.forEach(repo => {
        const li = document.createElement('li');
        li.classList.add('list-group-item');
        // Build inner HTML with repository link, description and star count
        const description = repo.description ? repo.description.substring(0, 80) : '';
        li.innerHTML = `
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1 me-2 repo-info">
              <a href="${repo.html_url}" target="_blank" rel="noopener" class="fw-semibold repo-name">
                ${repo.full_name}
              </a>
              <p class="small mb-0 text-muted repo-description">${description}</p>
            </div>
            <span class="badge bg-secondary flex-shrink-0">★ ${repo.stargazers_count}</span>
          </div>
        `;
        listEl.appendChild(li);
      });
    })
    .catch(error => {
      // Hide loader and show error message on failure
      loaderEl.style.display = 'none';
      const errItem = document.createElement('li');
      errItem.textContent = 'Error loading trending repositories.';
      errItem.classList.add('list-group-item');
      listEl.appendChild(errItem);
      // Optionally log error to console
      console.error('Error fetching trending repos:', error);
    });
});
