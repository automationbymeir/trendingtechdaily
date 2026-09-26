/* settings.js – Site-wide settings */

/* db is global (created in admin.html) */
const settingsCollection = db.collection("settings");

function loadSettingsPanel() {
  const contentArea = document.getElementById("content-area");
  contentArea.innerHTML = `
    <div class="section-container">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h3>Site Settings</h3>
      </div>
      
      <div class="row">
        <div class="col-md-6">
          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">General Settings</h5>
            </div>
            <div class="card-body">
              <form id="general-settings-form">
                <div class="mb-3">
                  <label for="site-title" class="form-label">Site Title</label>
                  <input type="text" class="form-control" id="site-title" name="siteTitle">
                </div>
                
                <div class="mb-3">
                  <label for="site-description" class="form-label">Site Description</label>
                  <textarea class="form-control" id="site-description" name="siteDescription" rows="3"></textarea>
                </div>
                
                <div class="mb-3">
                  <label for="site-logo" class="form-label">Site Logo URL</label>
                  <div class="input-group">
                    <input type="text" class="form-control" id="site-logo" name="siteLogo">
                    <button type="button" class="btn btn-outline-secondary" id="select-logo-btn">Select</button>
                  </div>
                  <div id="logo-preview" class="mt-2" style="display: none;">
                    <img id="logo-preview-img" class="img-thumbnail" style="max-height: 100px;">
                  </div>
                </div>
                
                <div class="mb-3">
                  <label for="posts-per-page" class="form-label">Posts Per Page</label>
                  <input type="number" class="form-control" id="posts-per-page" name="postsPerPage" min="1" max="50">
                </div>
                
                <button type="submit" class="btn btn-primary">Save General Settings</button>
              </form>
            </div>
          </div>
        </div>
        
        <div class="col-md-6">
          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">Footer Settings</h5>
            </div>
            <div class="card-body">
              <form id="footer-settings-form">
                <div class="mb-3">
                  <label for="footer-text" class="form-label">Footer Text</label>
                  <textarea class="form-control" id="footer-text" name="footerText" rows="3"></textarea>
                </div>
                
                <div class="mb-3">
                  <label for="contact-email" class="form-label">Contact Email</label>
                  <input type="email" class="form-control" id="contact-email" name="contactEmail">
                </div>
                
                <div class="mb-3">
                  <label for="contact-address" class="form-label">Contact Address</label>
                  <textarea class="form-control" id="contact-address" name="contactAddress" rows="2"></textarea>
                </div>
                
                <button type="submit" class="btn btn-primary">Save Footer Settings</button>
              </form>
            </div>
          </div>
          
          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">Social Media Links</h5>
            </div>
            <div class="card-body">
              <form id="social-media-form">
                <div class="mb-3">
                  <label for="facebook-url" class="form-label">Facebook URL</label>
                  <input type="url" class="form-control" id="facebook-url" name="facebookUrl">
                </div>

                <div class="mb-3">
                  <label for="twitter-url" class="form-label">Twitter URL</label>
                  <input type="url" class="form-control" id="twitter-url" name="twitterUrl">
                </div>

                <div class="mb-3">
                  <label for="instagram-url" class="form-label">Instagram URL</label>
                  <input type="url" class="form-control" id="instagram-url" name="instagramUrl">
                </div>

                <div class="mb-3">
                  <label for="linkedin-url" class="form-label">LinkedIn URL</label>
                  <input type="url" class="form-control" id="linkedin-url" name="linkedinUrl">
                </div>

                <button type="submit" class="btn btn-primary">Save Social Media Links</button>
              </form>
            </div>
          </div>

          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">Auto Article Generation</h5>
            </div>
            <div class="card-body">
              <form id="auto-article-settings-form">
                <div class="mb-3">
                  <label for="article-frequency" class="form-label">Articles Per Day</label>
                  <select class="form-select" id="article-frequency">
                    <option value="1">Once Daily</option>
                    <option value="2">Twice Daily</option>
                    <option value="3">Three Times Daily</option>
                  </select>
                </div>
                <div class="mb-3">
                  <label for="articles-per-run" class="form-label">Articles Per Run</label>
                  <input type="number" class="form-control" id="articles-per-run" min="1" max="5" value="1">
                </div>
                <div class="d-flex">
                  <button type="submit" class="btn btn-primary me-2">Save Auto Article Settings</button>
                  <button type="button" class="btn btn-secondary" id="test-auto-article-btn">Generate Test Article<span class="spinner-border spinner-border-sm d-none ms-1"></span></button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Load existing settings
  loadSettings();
  loadAutoArticleSettings();
  
  // Add event listeners to forms
  document.getElementById('general-settings-form').addEventListener('submit', function(e) {
    e.preventDefault();
    saveSettings('general', {
      siteTitle: document.getElementById('site-title').value,
      siteDescription: document.getElementById('site-description').value,
      siteLogo: document.getElementById('site-logo').value,
      postsPerPage: parseInt(document.getElementById('posts-per-page').value) || 10,
    });
  });
  
  document.getElementById('footer-settings-form').addEventListener('submit', function(e) {
    e.preventDefault();
    saveSettings('footer', {
      footerText: document.getElementById('footer-text').value,
      contactEmail: document.getElementById('contact-email').value,
      contactAddress: document.getElementById('contact-address').value,
    });
  });
  
  document.getElementById('social-media-form').addEventListener('submit', function(e) {
    e.preventDefault();
    saveSettings('social', {
      facebookUrl: document.getElementById('facebook-url').value,
      twitterUrl: document.getElementById('twitter-url').value,
      instagramUrl: document.getElementById('instagram-url').value,
      linkedinUrl: document.getElementById('linkedin-url').value,
    });
  });

  document.getElementById('auto-article-settings-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const freq = parseInt(document.getElementById('article-frequency').value, 10) || 1;
    const count = parseInt(document.getElementById('articles-per-run').value, 10) || 1;
    saveAutoArticleSettings(freq, count);
  });

  const testBtn = document.getElementById('test-auto-article-btn');
  if (testBtn) {
    testBtn.addEventListener('click', async function() {
      setButtonLoading('test-auto-article-btn', true);
      try {
        const token = await firebase.auth().currentUser.getIdToken();
        const response = await fetch('https://us-central1-trendingtech-daily.cloudfunctions.net/testGenerateArticle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!response.ok) throw new Error('Failed to generate article');
        showToast('Test article generated successfully', 'success');
      } catch (err) {
        console.error('Error generating test article:', err);
        showToast('Error generating test article', 'danger');
      } finally {
        setButtonLoading('test-auto-article-btn', false);
      }
    });
  }
  
  // Add logo selection functionality
  document.getElementById('select-logo-btn').addEventListener('click', function() {
    openMediaBrowser(function(url) {
      document.getElementById('site-logo').value = url;
      document.getElementById('logo-preview-img').src = url;
      document.getElementById('logo-preview').style.display = 'block';
    });
  });
  
  // Show logo preview if URL present
  document.getElementById('site-logo').addEventListener('input', function() {
    const url = this.value;
    if (url) {
      document.getElementById('logo-preview-img').src = url;
      document.getElementById('logo-preview').style.display = 'block';
    } else {
      document.getElementById('logo-preview').style.display = 'none';
    }
  });
}

function loadSettings() {
  Promise.all([
    settingsCollection.doc('general').get(),
    settingsCollection.doc('footer').get(),
    settingsCollection.doc('social').get(),
  ])
  .then(([generalDoc, footerDoc, socialDoc]) => {
    // Load general settings
    if (generalDoc.exists) {
      const general = generalDoc.data();
      document.getElementById('site-title').value = general.siteTitle || '';
      document.getElementById('site-description').value = general.siteDescription || '';
      document.getElementById('site-logo').value = general.siteLogo || '';
      document.getElementById('posts-per-page').value = general.postsPerPage || 10;
      
      // Show logo preview if URL exists
      if (general.siteLogo) {
        document.getElementById('logo-preview-img').src = general.siteLogo;
        document.getElementById('logo-preview').style.display = 'block';
      }
    }
    
    // Load footer settings
    if (footerDoc.exists) {
      const footer = footerDoc.data();
      document.getElementById('footer-text').value = footer.footerText || '';
      document.getElementById('contact-email').value = footer.contactEmail || '';
      document.getElementById('contact-address').value = footer.contactAddress || '';
    }
    
    // Load social media settings
    if (socialDoc.exists) {
      const social = socialDoc.data();
      document.getElementById('facebook-url').value = social.facebookUrl || '';
      document.getElementById('twitter-url').value = social.twitterUrl || '';
      document.getElementById('instagram-url').value = social.instagramUrl || '';
      document.getElementById('linkedin-url').value = social.linkedinUrl || '';
    }
  })
  .catch(error => {
    console.error('Error loading settings:', error);
    showToast('Error loading settings. Please try again.', 'danger');
  });
}

function saveSettings(type, data) {
  data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

  settingsCollection.doc(type).set(data, { merge: true })
    .then(() => {
      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} settings saved successfully`, 'success');
    })
    .catch(error => {
      console.error(`Error saving ${type} settings:`, error);
      showToast(`Error saving ${type} settings: ${error.message}`, 'danger');
    });
}

function loadAutoArticleSettings() {
  settingsCollection.doc('autoArticleSchedule').get()
    .then(doc => {
      if (doc.exists) {
        const data = doc.data();
        document.getElementById('article-frequency').value = data.frequency || 1;
        document.getElementById('articles-per-run').value = data.articlesPerRun || 1;
      }
    })
    .catch(err => {
      console.error('Error loading auto article settings:', err);
    });
}

function saveAutoArticleSettings(freq, count) {
  settingsCollection.doc('autoArticleSchedule').set({ frequency: freq, articlesPerRun: count }, { merge: true })
    .then(() => {
      showToast('Auto article settings saved', 'success');
    })
    .catch(err => {
      console.error('Error saving auto article settings:', err);
      showToast('Error saving auto article settings', 'danger');
    });
}

function setButtonLoading(buttonId, isLoading) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  const spinner = btn.querySelector('.spinner-border');
  if (spinner) spinner.classList.toggle('d-none', !isLoading);
  btn.disabled = isLoading;
}

function showToast(message, type = 'success') {
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(toastContainer);
  }
  
  const toastId = 'toast-' + Date.now();
  const toastHTML = `
    <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header bg-${type} text-white">
        <strong class="me-auto">Notification</strong>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">
        ${message}
      </div>
    </div>
  `;
  
  toastContainer.insertAdjacentHTML('beforeend', toastHTML);
  
  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, { delay: 3000 });
  toast.show();
  
  toastElement.addEventListener('hidden.bs.toast', function() {
    toastElement.remove();
  });
}

function openMediaBrowser(callback) {
  const modalId = 'media-browser-modal';
  let modalElement = document.getElementById(modalId);
  
  if (modalElement) {
    modalElement.remove();
  }
  
  const modalHTML = `
    <div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="${modalId}-label" aria-hidden="true">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="${modalId}-label">Select Media</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <input type="text" class="form-control" id="media-search-input" placeholder="Search media...">
            </div>
            <div class="row" id="media-items-container">
              <div class="col-12 text-center py-5">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">Loading media...</p>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  modalElement = document.getElementById(modalId);
  
  const modal = new bootstrap.Modal(modalElement);
  
  modalElement.addEventListener('shown.bs.modal', function() {
    loadMediaItemsForBrowser(callback);
  });
  
  modal.show();
  
  const searchInput = document.getElementById('media-search-input');
  searchInput.addEventListener('input', function() {
    const searchTerm = this.value.toLowerCase();
    const mediaItems = document.querySelectorAll('.media-browser-item');
    
    mediaItems.forEach(item => {
      const title = item.getAttribute('data-title').toLowerCase();
      item.style.display = title.includes(searchTerm) ? 'block' : 'none';
    });
  });
}

function loadMediaItemsForBrowser(callback) {
  const container = document.getElementById('media-items-container');
  
  db.collection('media')
    .where('fileType', '>=', 'image/')
    .where('fileType', '<=', 'image/\uf8ff')
    .orderBy('fileType')
    .orderBy('uploadedAt', 'desc')
    .get()
    .then(snapshot => {
      if (snapshot.empty) {
        container.innerHTML = `
          <div class="col-12 text-center py-4">
            <p>No images found. Please upload images first.</p>
          </div>
        `;
        return;
      }
      
      let html = '';
      
      snapshot.forEach(doc => {
        const media = doc.data();
        const title = media.title || 'Untitled';
        const url = media.url;
        
        html += `
          <div class="col-md-3 col-sm-4 col-6 mb-4 media-browser-item" data-title="${title}">
            <div class="card h-100 cursor-pointer" onclick="selectMediaItem('${url}', ${callback.toString()})">
              <img src="${url}" class="card-img-top" alt="${title}" style="height: 150px; object-fit: cover;">
              <div class="card-body p-2">
                <p class="card-text small text-truncate">${title}</p>
              </div>
            </div>
          </div>
        `;
      });
      
      container.innerHTML = html;
    })
    .catch(error => {
      console.error('Error loading media:', error);
      container.innerHTML = `
        <div class="col-12 text-center py-4">
          <p class="text-danger">Error loading media. Please try again.</p>
        </div>
      `;
    });
}

window.selectMediaItem = function(url, callback) {
  const modal = bootstrap.Modal.getInstance(document.getElementById('media-browser-modal'));
  if (modal) {
    modal.hide();
  }
  
  if (typeof callback === 'function') {
    callback(url);
  }
};

// Expose for sidebar
window.loadSettingsPanel = loadSettingsPanel;
