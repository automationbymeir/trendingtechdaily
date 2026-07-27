class VideoLogs {
  constructor() {
    this.containerId = null;
    this.db = firebase.firestore();
    this.unsubscribe = null;
  }

  render(containerId) {
    this.containerId = containerId;
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2><i class="bi bi-rocket-takeoff me-2"></i>Social Media Automation Logs</h2>
        <button class="btn btn-primary btn-sm" id="refresh-logs-btn">
          <i class="bi bi-arrow-clockwise me-1"></i>Refresh
        </button>
      </div>
      
      <div class="card shadow-sm mb-4">
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th scope="col" class="ps-4">Article / Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Render ID</th>
                  <th scope="col">YouTube</th>
                  <th scope="col">Instagram</th>
                  <th scope="col">Facebook</th>
                  <th scope="col">X (Twitter)</th>
                  <th scope="col">Last Updated</th>
                </tr>
              </thead>
              <tbody id="logs-table-body">
                <tr>
                  <td colspan="8" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                      <span class="visually-hidden">Loading...</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.getElementById('refresh-logs-btn').addEventListener('click', () => {
      this.loadLogs();
    });

    this.loadLogs();
  }

  formatDate(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleString();
  }

  getStatusBadge(status) {
    switch (status) {
      case 'generating':
      case 'rendering':
      case 'uploading':
        return `<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i>${status}</span>`;
      case 'success':
        return '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Success</span>';
      case 'error':
        return '<span class="badge bg-danger"><i class="bi bi-x-circle me-1"></i>Error</span>';
      default:
        return `<span class="badge bg-secondary">${status || 'Unknown'}</span>`;
    }
  }

  loadLogs() {
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;

    if (this.unsubscribe) {
      this.unsubscribe();
    }

    this.unsubscribe = this.db.collection('video_logs')
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .onSnapshot((snapshot) => {
        if (snapshot.empty) {
          tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No automation logs found yet. Publish an article to generate media.</td></tr>';
          return;
        }

        let html = '';
        snapshot.forEach(doc => {
          const data = doc.data();
          const badge = this.getStatusBadge(data.status);
          
          let ytLink = '—';
          if (data.youtubeUrl) {
            ytLink = `<a href="${data.youtubeUrl}" target="_blank" class="text-decoration-none"><i class="bi bi-youtube text-danger me-1"></i>${data.youtubeVideoId || 'View'}</a>`;
          } else if (data.videoDownloadUrl) {
            ytLink = `<a href="${data.videoDownloadUrl}" target="_blank" class="text-decoration-none" download><i class="bi bi-download me-1"></i>Video</a>`;
          }
          
          let igLink = '—';
          if (data.instagramUrl || data.instagramHighlightUrl) {
            let links = [];
            if (data.instagramUrl) links.push(`<a href="${data.instagramUrl}" target="_blank" class="text-decoration-none" style="color: #E1306C;"><i class="bi bi-instagram me-1"></i>Reel</a>`);
            if (data.instagramHighlightUrl) links.push(`<a href="${data.instagramHighlightUrl}" target="_blank" class="text-decoration-none" style="color: #E1306C;"><i class="bi bi-instagram me-1"></i>Story</a>`);
            igLink = links.join(' | ');
          }

          let fbLink = '—';
          if (data.facebookUrl) {
            fbLink = `<a href="${data.facebookUrl}" target="_blank" class="text-decoration-none" style="color: #1877F2;"><i class="bi bi-facebook me-1"></i>Post</a>`;
          }

          let twitterLink = '—';
          if (data.twitterUrl) {
            twitterLink = `<a href="${data.twitterUrl}" target="_blank" class="text-decoration-none" style="color: #000000;"><i class="bi bi-twitter-x me-1"></i>Post</a>`;
          }

          let errorInfo = '';
          if (data.status === 'error' && data.error) {
            errorInfo = `
              <details class="text-danger small mt-2 p-2 rounded" style="background-color: rgba(220,53,69,0.05); border: 1px solid rgba(220,53,69,0.2);">
                <summary style="cursor: pointer;" class="fw-bold"><i class="bi bi-exclamation-triangle me-1"></i>View Error Details</summary>
                <div class="mt-2" style="max-height: 150px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; font-family: monospace; font-size: 0.85em;">
                  ${data.error}
                </div>
              </details>
            `;
          }

          html += `
            <tr>
              <td class="ps-4">
                <div class="fw-bold">${data.title || 'Unknown Title'}</div>
                <div class="text-muted small">ID: ${data.articleId || doc.id} (${data.language === 'he' ? 'Hebrew' : 'English'})</div>
                ${errorInfo}
              </td>
              <td>${badge}</td>
              <td>${data.renderId ? `<code>${data.renderId}</code>` : '—'}</td>
              <td>${ytLink}</td>
              <td>${igLink}</td>
              <td>${fbLink}</td>
              <td>${twitterLink}</td>
              <td>${this.formatDate(data.updatedAt)}</td>
            </tr>
          `;
        });
        
        tbody.innerHTML = html;
      }, (error) => {
        console.error("Error fetching video logs: ", error);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger"><i class="bi bi-exclamation-triangle me-2"></i>Failed to load logs: ${error.message}</td></tr>`;
      });
  }
}

window.VideoLogs = VideoLogs;
