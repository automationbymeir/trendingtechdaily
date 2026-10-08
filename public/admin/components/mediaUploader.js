/* mediaUploader.js – Handle image uploads */

/* db and storage are initialized by dashboard.html. */
const mediaCollection = db.collection("media");

function loadMediaUploader() {
  const contentArea = document.getElementById("content-area");
  contentArea.innerHTML = `
    <div class="section-container">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h3>Media Library</h3>
        <button id="upload-media-btn" class="btn btn-primary">
          <i class="bi bi-cloud-upload me-2"></i>Upload Media
        </button>
      </div>
      <div class="mb-3">
        <input type="text" id="media-search" class="form-control" placeholder="Search media…" />
      </div>
      <div class="mb-4" id="upload-form-container" style="display:none;">
        <div class="card">
          <div class="card-body">
            <h5 class="card-title">Upload New Media</h5>
            <form id="media-upload-form">
              <div class="mb-3">
                <label for="media-title" class="form-label">Title</label>
                <input type="text" class="form-control" id="media-title" required>
              </div>
              
              <div class="mb-3">
                <label for="media-description" class="form-label">Description (optional)</label>
                <textarea class="form-control" id="media-description" rows="2"></textarea>
              </div>
              
              <div class="mb-3">
                <label for="media-file" class="form-label">Select File</label>
                <input type="file" class="form-control" id="media-file" accept="image/*" required>
              </div>
              
              <div id="upload-preview-container" style="display: none;" class="mb-3">
                <label class="form-label">Preview</label>
                <div class="border p-2">
                  <img id="upload-preview" class="img-fluid" style="max-height: 200px;">
                </div>
              </div>
              
              <div class="progress mb-3" style="display: none;" id="upload-progress-container">
                <div class="progress-bar" id="upload-progress-bar" role="progressbar" style="width: 0%"></div>
              </div>
              
              <div class="d-flex justify-content-end">
                <button type="button" class="btn btn-outline-secondary me-2" id="cancel-upload-btn">Cancel</button>
                <button type="submit" class="btn btn-primary" id="submit-upload-btn">Upload</button>
              </div>
            </form>
          </div>
        </div>
      </div>
      
      <div class="row g-3" id="media-grid">
        <div class="text-center w-100">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <p>Loading media...</p>
        </div>
      </div>
    </div>
  `;

  // Add event listeners
  document.getElementById('upload-media-btn').addEventListener('click', function() {
    const uploadFormContainer = document.getElementById('upload-form-container');
    uploadFormContainer.style.display = uploadFormContainer.style.display === 'none' ? 'block' : 'none';
  });
  
  document.getElementById('cancel-upload-btn').addEventListener('click', function() {
    document.getElementById('upload-form-container').style.display = 'none';
    document.getElementById('media-upload-form').reset();
    document.getElementById('upload-preview-container').style.display = 'none';
  });
  
  document.getElementById('media-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('upload-preview').src = e.target.result;
        document.getElementById('upload-preview-container').style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      document.getElementById('upload-preview-container').style.display = 'none';
    }
  });
  
  document.getElementById('media-upload-form').addEventListener('submit', function(e) {
    e.preventDefault();
    uploadMedia();
  });
  
  document.getElementById('media-search').addEventListener('input', function() {
    const searchTerm = this.value.toLowerCase();
    filterMedia(searchTerm);
  });
  
  // Load media items
  loadMediaItems();
}

function mediaText(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function mediaUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? mediaText(url.href) : '';
  } catch (_) {
    return '';
  }
}

function mediaStorageRoot() {
  if (typeof storage === 'undefined' || !storage || typeof storage.ref !== 'function') {
    throw new Error('Image storage is unavailable. Reload the page and try again.');
  }
  return storage.ref();
}

function mediaUploadStatus(message, isError = false) {
  let status = document.getElementById('media-upload-status');
  if (!status) {
    status = document.createElement('p');
    status.id = 'media-upload-status';
    status.setAttribute('role', 'status');
    document.getElementById('media-upload-form').prepend(status);
  }
  status.className = isError ? 'text-danger' : 'text-success';
  status.textContent = message;
}

async function uploadMedia() {
  const title = document.getElementById('media-title').value;
  const description = document.getElementById('media-description').value;
  const fileInput = document.getElementById('media-file');
  const file = fileInput.files[0];
  
  if (!file) {
    alert('Please select a file to upload.');
    return;
  }
  
  const progressContainer = document.getElementById('upload-progress-container');
  const progressBar = document.getElementById('upload-progress-bar');
  const uploadButton = document.getElementById('submit-upload-btn');
  let fileRef = null;
  let uploaded = false;
  let metadataSaved = false;
  try {
    // Validate the service before disabling the form.
    const root = mediaStorageRoot();
    if (!title.trim() || !file.type.startsWith('image/')) {
      throw new Error('Enter a title and select an image file.');
    }
    mediaUploadStatus('');
    progressContainer.style.display = 'block';
    uploadButton.disabled = true;
    uploadButton.textContent = 'Uploading...';
    // A unique name makes compensating deletion safe for this attempt only.
    const uniqueName = `${Date.now()}_${crypto.randomUUID()}_${file.name}`;
    fileRef = root.child(`media/${uniqueName}`);
    const task = fileRef.put(file);
    task.on('state_changed', (snapshot) => {
      const percent = snapshot.totalBytes ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : 0;
      progressBar.style.width = `${percent}%`;
      progressBar.textContent = `${percent}%`;
    });
    const snapshot = await task;
    uploaded = true;
    const downloadURL = await snapshot.ref.getDownloadURL();
    await mediaCollection.add({
      title: title.trim(), description, fileName: uniqueName,
      fileType: file.type, fileSize: file.size, url: downloadURL,
      uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    metadataSaved = true;
    document.getElementById('media-upload-form').reset();
    document.getElementById('upload-preview-container').style.display = 'none';
    mediaUploadStatus('File uploaded successfully.');
    loadMediaItems();
  } catch (error) {
    let cleanup = '';
    if (uploaded && !metadataSaved && fileRef) {
      try {
        await fileRef.delete();
        cleanup = ' The new image was removed because its metadata could not be saved.';
      } catch (cleanupError) {
        console.error('New media cleanup failed:', cleanupError);
        cleanup = ' The image may remain in storage without a library entry. Do not retry until it is checked.';
      }
    }
    console.error('Media upload failed:', error);
    mediaUploadStatus(`Upload failed: ${error.message || 'Unknown error'}.${cleanup}`, true);
  } finally {
    progressContainer.style.display = 'none';
    uploadButton.disabled = false;
    uploadButton.textContent = 'Upload';
  }
}

function loadMediaItems() {
  const mediaGrid = document.getElementById('media-grid');
  
  mediaGrid.innerHTML = `
    <div class="text-center w-100">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p>Loading media...</p>
    </div>
  `;
  
  mediaCollection.orderBy('uploadedAt', 'desc').get()
    .then((querySnapshot) => {
      if (querySnapshot.empty) {
        mediaGrid.innerHTML = `
          <div class="col-12 text-center">
            <p>No media files found. Upload your first file!</p>
          </div>
        `;
        return;
      }
      
      let mediaHTML = '';
      
      querySnapshot.forEach((doc) => {
        const media = doc.data();
        const date = media.uploadedAt ? new Date(media.uploadedAt.toDate()).toLocaleDateString() : 'N/A';
        const isImage = media.fileType && media.fileType.startsWith('image/');
        
        mediaHTML += `
          <div class="col-md-4 col-lg-3 media-item" data-id="${mediaText(doc.id)}" data-title="${mediaText(String(media.title || "").toLowerCase())}">
            <div class="card h-100">
              <div class="card-img-top" style="height: 150px; display: flex; align-items: center; justify-content: center; background-color: #f8f9fa;">
                ${isImage ? `
                  <img src="${mediaUrl(media.url)}" alt="${mediaText(media.title)}" style="max-height: 100%; max-width: 100%; object-fit: contain;">
                ` : `
                  <div class="text-center p-4">
                    <i class="bi bi-file-earmark fs-1"></i>
                    <p class="mt-2 mb-0 small">${mediaText(media.fileType || 'Unknown file type')}</p>
                  </div>
                `}
              </div>
              <div class="card-body">
                <h6 class="card-title">${mediaText(media.title)}</h6>
                ${media.description ? `<p class="card-text small text-muted">${mediaText(media.description)}</p>` : ''}
              </div>
              <div class="card-footer d-flex justify-content-between align-items-center">
                <small class="text-muted">Uploaded: ${date}</small>
                <div>
                  <button class="btn btn-sm btn-outline-primary copy-url-btn" data-url="${mediaUrl(media.url)}">
                    <i class="bi bi-clipboard"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger delete-media-btn" data-id="${mediaText(doc.id)}">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      
      mediaGrid.innerHTML = mediaHTML;
      
      document.querySelectorAll('.copy-url-btn').forEach(button => {
        button.addEventListener('click', function() {
          const url = this.getAttribute('data-url');
          copyToClipboard(url);
          const originalHTML = this.innerHTML;
          this.innerHTML = '<i class="bi bi-check"></i>';
          this.classList.remove('btn-outline-primary');
          this.classList.add('btn-success');
          setTimeout(() => {
            this.innerHTML = originalHTML;
            this.classList.remove('btn-success');
            this.classList.add('btn-outline-primary');
          }, 2000);
        });
      });
      
      document.querySelectorAll('.delete-media-btn').forEach(button => {
        button.addEventListener('click', function() {
          const mediaId = this.getAttribute('data-id');
          if (confirm('Are you sure you want to delete this media? This action cannot be undone.')) {
            deleteMedia(mediaId);
          }
        });
      });
    })
    .catch((error) => {
      console.error('Error loading media:', error);
      mediaGrid.innerHTML = `
        <div class="col-12 text-center">
          <p class="text-danger">Error loading media. Please try again.</p>
        </div>
      `;
    });
}

function filterMedia(searchTerm) {
  const mediaItems = document.querySelectorAll('.media-item');
  mediaItems.forEach(item => {
    const title = item.getAttribute('data-title');
    item.style.display = title.includes(searchTerm) ? '' : 'none';
  });
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
    .then(() => {
      console.log('URL copied to clipboard');
    })
    .catch(err => {
      console.error('Failed to copy text: ', err);
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
}

function deleteMedia(mediaId) {
  mediaCollection.doc(mediaId).get()
    .then((doc) => {
      if (!doc.exists) {
        throw new Error('Media not found');
      }
      
      const media = doc.data();
      const fileName = media.fileName;
      if (!fileName || typeof fileName !== 'string' || fileName.includes('/')) {
        throw new Error('Invalid media storage filename. Nothing was deleted.');
      }
      const fileRef = mediaStorageRoot().child(`media/${fileName}`);
      
      return fileRef.delete().then(() => {
        return mediaCollection.doc(mediaId).delete().catch((error) => {
          throw new Error(`Image removed from storage, but its library entry remains: ${error.message}`);
        });
      });
    })
    .then(() => {
      alert('Media deleted successfully');
      loadMediaItems();
    })
    .catch((error) => {
      console.error('Error deleting media:', error);
      alert('Error deleting media: ' + error.message);
    });
}

// Expose for sidebar
window.loadMediaUploader = loadMediaUploader;
