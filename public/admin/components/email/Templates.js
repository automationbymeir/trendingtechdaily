// Templates.js - Email template management component

class EmailTemplates {
    constructor() {
      this.container = null;
      this.editingTemplate = null;
    }
  
    render(containerId) {
      this.container = document.getElementById(containerId);
      
      if (!this.container) {
        console.error(`Container with ID ${containerId} not found`);
        return;
      }
  
      this.renderTemplatesList();
    }
  
    async renderTemplatesList() {
      try {
        this.container.innerHTML = `
          <div class="templates-container">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h1 class="h3 mb-0">Email Templates</h1>
              <button id="create-template-btn" class="btn btn-primary">
                <i class="bi bi-plus-circle me-1"></i> Create Template
              </button>
            </div>
            
            <div class="card shadow mb-4">
              <div class="card-header py-3">
                <h6 class="m-0 font-weight-bold text-primary">All Templates</h6>
              </div>
              <div class="card-body">
                <div id="templates-table-container">
                  <div class="d-flex justify-content-center">
                    <div class="spinner-border" role="status">
                      <span class="visually-hidden">Loading...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Template Modal -->
          <div class="modal fade" id="templateModal" tabindex="-1" aria-labelledby="templateModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-xl">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="templateModalLabel">Create Template</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <form id="template-form">
                    <div class="row mb-3">
                      <div class="col-md-6">
                        <label for="template-name" class="form-label">Template Name</label>
                        <input type="text" class="form-control" id="template-name" required>
                      </div>
                      <div class="col-md-6">
                        <label for="template-subject" class="form-label">Email Subject</label>
                        <input type="text" class="form-control" id="template-subject" required>
                      </div>
                    </div>
                    
                    <div class="mb-3">
                      <label for="template-category" class="form-label">Category</label>
                      <select class="form-select" id="template-category">
                        <option value="general">General</option>
                        <option value="onboarding">Onboarding</option>
                        <option value="newsletter">Newsletter</option>
                        <option value="promotional">Promotional</option>
                        <option value="transactional">Transactional</option>
                      </select>
                    </div>
                    
                    <div class="mb-3">
                      <div class="d-flex justify-content-between align-items-center mb-2">
                        <label for="template-html" class="form-label">HTML Content</label>
                        <div class="btn-group" role="group">
                          <button type="button" class="btn btn-sm btn-outline-primary active" id="edit-mode-btn">Edit</button>
                          <button type="button" class="btn btn-sm btn-outline-primary" id="preview-mode-btn">Preview</button>
                        </div>
                      </div>
                      
                      <div id="editor-container">
                        <textarea class="form-control" id="template-html" rows="15" required></textarea>
                      </div>
                      
                      <div id="preview-container" style="display: none; border: 1px solid #ced4da; min-height: 400px;">
                        <iframe id="preview-frame" style="width: 100%; height: 600px; border: none;"></iframe>
                      </div>
                    </div>
                    
                    <div class="mb-3">
                      <h6>Available Placeholders:</h6>
                      <div>
                        <span class="badge bg-primary me-1">{{name}}</span>
                        <span class="badge bg-primary me-1">{{email}}</span>
                        <span class="badge bg-primary me-1">{{token}}</span>
                        <span class="badge bg-primary me-1">{{email_encoded}}</span>
                        <span class="badge bg-primary me-1">{{unsubscribe_url}}</span>
                      </div>
                    </div>
                  </form>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                  <button type="button" class="btn btn-primary" id="save-template-btn">Save Template</button>
                </div>
              </div>
            </div>
          </div>
        `;
  
        // Add event listeners
        document.getElementById('create-template-btn').addEventListener('click', () => this.showTemplateModal());
        document.getElementById('save-template-btn').addEventListener('click', () => this.saveTemplate());
        
        // Toggle edit/preview mode
        document.getElementById('edit-mode-btn').addEventListener('click', () => this.toggleEditMode(true));
        document.getElementById('preview-mode-btn').addEventListener('click', () => this.toggleEditMode(false));
        
        // Load templates
        await this.loadTemplates();
        
      } catch (error) {
        console.error('Error rendering templates:', error);
        this.container.innerHTML = `
          <div class="alert alert-danger">
            Error loading templates: ${error.message}
          </div>
        `;
      }
    }
    
    async loadTemplates() {
      try {
        const db = firebase.firestore();
        const templatesSnapshot = await db.collection('templates')
          .orderBy('updatedAt', 'desc')
          .get();
        
        const tableContainer = document.getElementById('templates-table-container');
        
        if (templatesSnapshot.empty) {
          tableContainer.innerHTML = `
            <div class="text-center py-5">
              <p class="text-muted mb-0">No templates yet</p>
              <p class="text-muted">Click "Create Template" to get started</p>
            </div>
          `;
          return;
        }
        
        // Create templates table
        tableContainer.innerHTML = `
          <div class="table-responsive">
            <table class="table table-bordered" id="templates-table" width="100%" cellspacing="0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Placeholders</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        `;
        
        const tableBody = document.querySelector('#templates-table tbody');
        
        templatesSnapshot.forEach(doc => {
          const template = doc.data();
          const row = document.createElement('tr');
          
          // Name
          const nameCell = document.createElement('td');
          nameCell.textContent = template.name;
          row.appendChild(nameCell);
          
          // Subject
          const subjectCell = document.createElement('td');
          subjectCell.textContent = template.subject;
          row.appendChild(subjectCell);
          
          // Category
          const categoryCell = document.createElement('td');
          const categoryBadge = document.createElement('span');
          categoryBadge.className = 'badge bg-info';
          categoryBadge.textContent = template.category || 'general';
          categoryCell.appendChild(categoryBadge);
          row.appendChild(categoryCell);
          
          // Placeholders
          const placeholdersCell = document.createElement('td');
          if (template.placeholders && template.placeholders.length > 0) {
            template.placeholders.forEach(placeholder => {
              const badge = document.createElement('span');
              badge.className = 'badge bg-secondary me-1';
              badge.textContent = placeholder;
              placeholdersCell.appendChild(badge);
            });
          } else {
            placeholdersCell.textContent = 'None';
          }
          row.appendChild(placeholdersCell);
          
          // Last Updated
          const updatedCell = document.createElement('td');
          if (template.updatedAt) {
            const date = new Date(template.updatedAt.seconds * 1000);
            updatedCell.textContent = date.toLocaleString();
          } else {
            updatedCell.textContent = '-';
          }
          row.appendChild(updatedCell);
          
          // Actions
          const actionsCell = document.createElement('td');
          
          // Edit button
          const editBtn = document.createElement('button');
          editBtn.className = 'btn btn-sm btn-outline-primary me-1';
          editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
          editBtn.addEventListener('click', () => this.editTemplate(doc.id));
          actionsCell.appendChild(editBtn);
          
          // Preview button
          const previewBtn = document.createElement('button');
          previewBtn.className = 'btn btn-sm btn-outline-info me-1';
          previewBtn.innerHTML = '<i class="bi bi-eye"></i>';
          previewBtn.addEventListener('click', () => this.previewTemplate(doc.id));
          actionsCell.appendChild(previewBtn);
          
          // Delete button
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'btn btn-sm btn-outline-danger';
          deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
          deleteBtn.addEventListener('click', () => this.deleteTemplate(doc.id));
          actionsCell.appendChild(deleteBtn);
          
          row.appendChild(actionsCell);
          
          tableBody.appendChild(row);
        });
        
      } catch (error) {
        console.error('Error loading templates:', error);
        document.getElementById('templates-table-container').innerHTML = `
          <div class="alert alert-danger">
            Error loading templates: ${error.message}
          </div>
        `;
      }
    }
    
    showTemplateModal(templateId = null) {
      this.editingTemplate = templateId;
      
      // Reset form
      document.getElementById('template-form').reset();
      document.getElementById('template-html').value = '';
      
      // Reset edit mode
      this.toggleEditMode(true);
      
      // Update modal title
      const modalTitle = document.getElementById('templateModalLabel');
      modalTitle.textContent = templateId ? 'Edit Template' : 'Create Template';
      
      if (templateId) {
        // Load template data for editing
        this.loadTemplateData(templateId);
      } else {
        // Load welcome template for new templates
        this.loadWelcomeTemplate();
      }
      
      // Show modal
      const modal = new bootstrap.Modal(document.getElementById('templateModal'));
      modal.show();
    }
    
    async loadTemplateData(templateId) {
      try {
        const db = firebase.firestore();
        const templateDoc = await db.collection('templates').doc(templateId).get();
        
        if (!templateDoc.exists) {
          console.error('Template not found');
          return;
        }
        
        const template = templateDoc.data();
        
        // Fill form fields
        document.getElementById('template-name').value = template.name || '';
        document.getElementById('template-subject').value = template.subject || '';
        document.getElementById('template-category').value = template.category || 'general';
        document.getElementById('template-html').value = template.htmlContent || '';
        
      } catch (error) {
        console.error('Error loading template data:', error);
      }
    }
    
    loadWelcomeTemplate() {
      // Load a basic welcome template
      document.getElementById('template-name').value = 'Welcome Email';
      document.getElementById('template-subject').value = 'Welcome to TrendingTechDaily!';
      document.getElementById('template-category').value = 'onboarding';
      document.getElementById('template-html').value = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to TrendingTechDaily</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        margin: 0;
        padding: 0;
        background-color: #f5f5f5;
        color: #333;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background: #ffffff;
        padding: 20px;
      }
      .header {
        background: #3a7bd5;
        padding: 20px;
        text-align: center;
        color: white;
      }
      .content {
        padding: 20px;
      }
      .button {
        display: inline-block;
        background: #3a7bd5;
        color: white;
        padding: 10px 20px;
        text-decoration: none;
        border-radius: 5px;
      }
      .footer {
        background: #f5f5f5;
        padding: 20px;
        text-align: center;
        font-size: 12px;
        color: #666;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Welcome to TrendingTechDaily!</h1>
      </div>
      <div class="content">
        <p>Hello {{name}},</p>
        <p>Thank you for joining TrendingTechDaily! We're excited to have you as part of our community.</p>
        <p>From now on, you'll receive the latest tech news, expert analysis, and exclusive content directly in your inbox.</p>
        <p>Click the button below to explore your account:</p>
        <p style="text-align: center;">
          <a href="https://trendingtechdaily.com/account" class="button">Go to My Account</a>
        </p>
      </div>
      <div class="footer">
        <p>&copy; 2025 TrendingTechDaily. All rights reserved.</p>
        <p>
          <a href="{{unsubscribe_url}}">Unsubscribe</a>
        </p>
      </div>
    </div>
  </body>
  </html>`;
    }
    
    async saveTemplate() {
      try {
        // Validate form
        const form = document.getElementById('template-form');
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        
        // Get form values
        const name = document.getElementById('template-name').value;
        const subject = document.getElementById('template-subject').value;
        const category = document.getElementById('template-category').value;
        const htmlContent = document.getElementById('template-html').value;
        
        // Extract placeholders from HTML content
        const placeholders = this.extractPlaceholders(htmlContent);
        
        // Prepare template data
        const templateData = {
          name,
          subject,
          category,
          htmlContent,
          placeholders,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const db = firebase.firestore();
        
        if (this.editingTemplate) {
          // Update existing template
          await db.collection('templates').doc(this.editingTemplate).update(templateData);
        } else {
          // Create new template
          templateData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          await db.collection('templates').add(templateData);
        }
        
        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('templateModal')).hide();
        
        // Reload templates
        this.loadTemplates();
        
        // Show success message
        alert(this.editingTemplate ? 'Template updated successfully' : 'Template created successfully');
        
      } catch (error) {
        console.error('Error saving template:', error);
        alert(`Error: ${error.message}`);
      }
    }
    
    async deleteTemplate(templateId) {
      try {
        // Load template data
        const db = firebase.firestore();
        const templateDoc = await db.collection('templates').doc(templateId).get();
        
        if (!templateDoc.exists) {
          console.error('Template not found');
          return;
        }
        
        const template = templateDoc.data();
        
        // Check if template is used in campaigns
        const campaignsSnapshot = await db.collection('campaigns')
          .where('templateId', '==', templateId)
          .limit(1)
          .get();
        
        if (!campaignsSnapshot.empty) {
          alert('This template is used in one or more campaigns and cannot be deleted.');
          return;
        }
        
        // Check if template is used in workflows
        const workflowsSnapshot = await db.collection('workflows')
          .where('steps.templateId', '==', templateId)
          .limit(1)
          .get();
        
        if (!workflowsSnapshot.empty) {
          alert('This template is used in one or more workflows and cannot be deleted.');
          return;
        }
        
        // Confirm deletion
        const confirmDelete = window.confirm(`Delete the template "${template.name}"? This action cannot be undone.`);
        
        if (!confirmDelete) {
          return;
        }
        
        // Delete template
        await db.collection('templates').doc(templateId).delete();
        
        // Reload templates
        this.loadTemplates();
        
        // Show success message
        alert('Template deleted successfully');
        
      } catch (error) {
        console.error('Error deleting template:', error);
        alert(`Error: ${error.message}`);
      }
    }
    
    async editTemplate(templateId) {
      this.showTemplateModal(templateId);
    }
    
    async previewTemplate(templateId) {
      try {
        const db = firebase.firestore();
        const templateDoc = await db.collection('templates').doc(templateId).get();
        
        if (!templateDoc.exists) {
          console.error('Template not found');
          return;
        }
        
        const template = templateDoc.data();
        
        // Create a preview window
        const previewWindow = window.open('', '_blank', 'width=800,height=600');
        
        if (!previewWindow) {
          alert('Pop-up blocked. Please allow pop-ups for this site to preview templates.');
          return;
        }
        
        // Replace placeholders with sample values
        let htmlContent = template.htmlContent;
        
        const sampleValues = {
          name: 'John Doe',
          email: 'john.doe@example.com',
          token: 'abc123def456',
          email_encoded: 'john.doe%40example.com',
          unsubscribe_url: '#'
        };
        
        for (const [key, value] of Object.entries(sampleValues)) {
          const regex = new RegExp(`{{${key}}}`, 'g');
          htmlContent = htmlContent.replace(regex, value);
        }
        
        // Write the HTML content to the preview window
        previewWindow.document.open();
        previewWindow.document.write(htmlContent);
        previewWindow.document.close();
        
      } catch (error) {
        console.error('Error previewing template:', error);
        alert(`Error: ${error.message}`);
      }
    }
    
    toggleEditMode(isEditMode) {
      const editorContainer = document.getElementById('editor-container');
      const previewContainer = document.getElementById('preview-container');
      const editBtn = document.getElementById('edit-mode-btn');
      const previewBtn = document.getElementById('preview-mode-btn');
      
      if (isEditMode) {
        editorContainer.style.display = 'block';
        previewContainer.style.display = 'none';
        editBtn.classList.add('active');
        previewBtn.classList.remove('active');
      } else {
        // Show preview
        editorContainer.style.display = 'none';
        previewContainer.style.display = 'block';
        editBtn.classList.remove('active');
        previewBtn.classList.add('active');
        
        // Update preview
        const htmlContent = document.getElementById('template-html').value;
        
        // Replace placeholders with sample values
        let previewContent = htmlContent;
        
        const sampleValues = {
          name: 'John Doe',
          email: 'john.doe@example.com',
          token: 'abc123def456',
          email_encoded: 'john.doe%40example.com',
          unsubscribe_url: '#'
        };
        
        for (const [key, value] of Object.entries(sampleValues)) {
          const regex = new RegExp(`{{${key}}}`, 'g');
          previewContent = previewContent.replace(regex, value);
        }
        
        // Update iframe content
        const iframe = document.getElementById('preview-frame');
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        
        iframeDoc.open();
        iframeDoc.write(previewContent);
        iframeDoc.close();
      }
    }
    
    extractPlaceholders(htmlContent) {
      const placeholderRegex = /{{([^}]+)}}/g;
      const placeholders = new Set();
      let match;
      
      while ((match = placeholderRegex.exec(htmlContent)) !== null) {
        placeholders.add(match[1]);
      }
      
      return Array.from(placeholders);
    }
  }
  window.EmailTemplates = EmailTemplates;