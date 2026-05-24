// Campaigns.js - Email campaign management component

class EmailCampaigns {
    constructor() {
      this.container = null;
      this.templates = [];
      this.lists = [];
      this.editingCampaign = null;
    }
  
    render(containerId) {
      this.container = document.getElementById(containerId);
      
      if (!this.container) {
        console.error(`Container with ID ${containerId} not found`);
        return;
      }
  
      this.renderCampaignsList();
    }
  
    async renderCampaignsList() {
      try {
        this.container.innerHTML = `
          <div class="campaigns-container">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h1 class="h3 mb-0">Email Campaigns</h1>
              <button id="create-campaign-btn" class="btn btn-primary">
                <i class="bi bi-plus-circle me-1"></i> Create Campaign
              </button>
            </div>
            
            <div class="card shadow mb-4">
              <div class="card-header py-3">
                <h6 class="m-0 font-weight-bold text-primary">All Campaigns</h6>
              </div>
              <div class="card-body">
                <div id="campaigns-table-container">
                  <div class="d-flex justify-content-center">
                    <div class="spinner-border" role="status">
                      <span class="visually-hidden">Loading...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Campaign Modal -->
          <div class="modal fade" id="campaignModal" tabindex="-1" aria-labelledby="campaignModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="campaignModalLabel">Create Campaign</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <form id="campaign-form">
                    <div class="mb-3">
                      <label for="campaign-name" class="form-label">Campaign Name</label>
                      <input type="text" class="form-control" id="campaign-name" required>
                    </div>
                    
                    <div class="mb-3">
                      <label for="campaign-subject" class="form-label">Email Subject</label>
                      <input type="text" class="form-control" id="campaign-subject" required>
                    </div>
                    
                    <div class="mb-3">
                      <label for="campaign-template" class="form-label">Email Template</label>
                      <select class="form-select" id="campaign-template" required>
                        <option value="">Select a template</option>
                      </select>
                    </div>
                    
                    <div class="mb-3">
                      <label for="campaign-lists" class="form-label">Recipient Lists</label>
                      <select class="form-select" id="campaign-lists" multiple required>
                      </select>
                      <div class="form-text">Hold Ctrl (or Cmd) to select multiple lists</div>
                    </div>
                    
                    <div class="mb-3">
                      <label for="schedule-type" class="form-label">When to Send</label>
                      <div class="form-check">
                        <input class="form-check-input" type="radio" name="schedule-type" id="schedule-draft" value="draft" checked>
                        <label class="form-check-label" for="schedule-draft">
                          Save as Draft
                        </label>
                      </div>
                      <div class="form-check">
                        <input class="form-check-input" type="radio" name="schedule-type" id="schedule-now" value="now">
                        <label class="form-check-label" for="schedule-now">
                          Send Now
                        </label>
                      </div>
                      <div class="form-check">
                        <input class="form-check-input" type="radio" name="schedule-type" id="schedule-later" value="later">
                        <label class="form-check-label" for="schedule-later">
                          Schedule for Later
                        </label>
                      </div>
                    </div>
                    
                    <div id="schedule-datetime-container" class="mb-3" style="display: none;">
                      <label for="schedule-datetime" class="form-label">Schedule Date & Time</label>
                      <input type="datetime-local" class="form-control" id="schedule-datetime">
                    </div>
                  </form>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                  <button type="button" class="btn btn-primary" id="save-campaign-btn">Save Campaign</button>
                </div>
              </div>
            </div>
          </div>
        `;
  
        // Add event listeners
        document.getElementById('create-campaign-btn').addEventListener('click', () => this.showCampaignModal());
        document.getElementById('save-campaign-btn').addEventListener('click', () => this.saveCampaign());
        
        // Show/hide schedule datetime field based on selection
        document.querySelectorAll('input[name="schedule-type"]').forEach(radio => {
          radio.addEventListener('change', () => {
            const scheduleContainer = document.getElementById('schedule-datetime-container');
            scheduleContainer.style.display = radio.value === 'later' ? 'block' : 'none';
          });
        });
        
        // Load data
        await Promise.all([
          this.loadTemplates(),
          this.loadLists(),
          this.loadCampaigns()
        ]);
        
      } catch (error) {
        console.error('Error rendering campaigns:', error);
        this.container.innerHTML = `
          <div class="alert alert-danger">
            Error loading campaigns: ${error.message}
          </div>
        `;
      }
    }
    
    async loadTemplates() {
      try {
        const db = firebase.firestore();
        const templatesSnapshot = await db.collection('templates').get();
        
        this.templates = [];
        templatesSnapshot.forEach(doc => {
          this.templates.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        // Populate template dropdown
        const templateSelect = document.getElementById('campaign-template');
        templateSelect.innerHTML = '<option value="">Select a template</option>';
        
        this.templates.forEach(template => {
          const option = document.createElement('option');
          option.value = template.id;
          option.textContent = template.name;
          templateSelect.appendChild(option);
        });
        
      } catch (error) {
        console.error('Error loading templates:', error);
      }
    }
    
    async loadLists() {
      try {
        const db = firebase.firestore();
        const listsSnapshot = await db.collection('lists').get();
        
        this.lists = [];
        listsSnapshot.forEach(doc => {
          this.lists.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        // Populate lists dropdown
        const listsSelect = document.getElementById('campaign-lists');
        listsSelect.innerHTML = '';
        
        this.lists.forEach(list => {
          const option = document.createElement('option');
          option.value = list.id;
          option.textContent = `${list.name} (${list.subscriberCount || 0} subscribers)`;
          listsSelect.appendChild(option);
        });
        
      } catch (error) {
        console.error('Error loading lists:', error);
      }
    }
    
    async loadCampaigns() {
      try {
        const db = firebase.firestore();
        const campaignsSnapshot = await db.collection('campaigns')
          .orderBy('createdAt', 'desc')
          .get();
        
        const tableContainer = document.getElementById('campaigns-table-container');
        
        if (campaignsSnapshot.empty) {
          tableContainer.innerHTML = `
            <div class="text-center py-5">
              <p class="text-muted mb-0">No campaigns yet</p>
              <p class="text-muted">Click "Create Campaign" to get started</p>
            </div>
          `;
          return;
        }
        
        // Create campaigns table
        tableContainer.innerHTML = `
          <div class="table-responsive">
            <table class="table table-bordered" id="campaigns-table" width="100%" cellspacing="0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Recipients</th>
                  <th>Scheduled For</th>
                  <th>Stats</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        `;
        
        const tableBody = document.querySelector('#campaigns-table tbody');
        
        campaignsSnapshot.forEach(doc => {
          const campaign = doc.data();
          const row = document.createElement('tr');
          
          // Name
          const nameCell = document.createElement('td');
          nameCell.textContent = campaign.name;
          row.appendChild(nameCell);
          
          // Subject
          const subjectCell = document.createElement('td');
          subjectCell.textContent = campaign.subject;
          row.appendChild(subjectCell);
          
          // Status
          const statusCell = document.createElement('td');
          const statusBadge = document.createElement('span');
          statusBadge.className = `badge ${this.getStatusClass(campaign.status)}`;
          statusBadge.textContent = campaign.status.toUpperCase();
          statusCell.appendChild(statusBadge);
          row.appendChild(statusCell);
          
          // Recipients
          const recipientsCell = document.createElement('td');
          if (campaign.listIds && campaign.listIds.length > 0) {
            const listNames = campaign.listIds.map(listId => {
              const list = this.lists.find(l => l.id === listId);
              return list ? list.name : 'Unknown List';
            });
            recipientsCell.textContent = listNames.join(', ');
          } else {
            recipientsCell.textContent = 'None';
          }
          row.appendChild(recipientsCell);
          
          // Scheduled For
          const scheduledCell = document.createElement('td');
          if (campaign.scheduledFor) {
            const date = new Date(campaign.scheduledFor.seconds * 1000);
            scheduledCell.textContent = date.toLocaleString();
          } else {
            scheduledCell.textContent = '-';
          }
          row.appendChild(scheduledCell);
          
          // Stats
          const statsCell = document.createElement('td');
          if (campaign.stats) {
            const { sent, opened, clicked } = campaign.stats;
            const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
            const clickRate = sent > 0 ? Math.round((clicked / sent) * 100) : 0;
            statsCell.textContent = `${sent} sent, ${openRate}% opened, ${clickRate}% clicked`;
          } else {
            statsCell.textContent = '-';
          }
          row.appendChild(statsCell);
          
          // Actions
          const actionsCell = document.createElement('td');
          
          // Edit button
          const editBtn = document.createElement('button');
          editBtn.className = 'btn btn-sm btn-outline-primary me-1';
          editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
          editBtn.addEventListener('click', () => this.editCampaign(doc.id));
          actionsCell.appendChild(editBtn);
          
          // Schedule/Cancel button (based on status)
          if (campaign.status === 'draft') {
            const scheduleBtn = document.createElement('button');
            scheduleBtn.className = 'btn btn-sm btn-outline-success me-1';
            scheduleBtn.innerHTML = '<i class="bi bi-calendar"></i>';
            scheduleBtn.addEventListener('click', () => this.showScheduleModal(doc.id));
            actionsCell.appendChild(scheduleBtn);
          } else if (campaign.status === 'scheduled') {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-sm btn-outline-warning me-1';
            cancelBtn.innerHTML = '<i class="bi bi-x-circle"></i>';
            cancelBtn.addEventListener('click', () => this.cancelCampaign(doc.id));
            actionsCell.appendChild(cancelBtn);
          }
          
          // Delete button (only for draft)
          if (campaign.status === 'draft') {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-outline-danger';
            deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
            deleteBtn.addEventListener('click', () => this.deleteCampaign(doc.id));
            actionsCell.appendChild(deleteBtn);
          }
          
          row.appendChild(actionsCell);
          
          tableBody.appendChild(row);
        });
        
      } catch (error) {
        console.error('Error loading campaigns:', error);
        document.getElementById('campaigns-table-container').innerHTML = `
          <div class="alert alert-danger">
            Error loading campaigns: ${error.message}
          </div>
        `;
      }
    }
    
    showCampaignModal(campaignId = null) {
      this.editingCampaign = campaignId;
      
      // Reset form
      document.getElementById('campaign-form').reset();
      
      // Update modal title
      const modalTitle = document.getElementById('campaignModalLabel');
      modalTitle.textContent = campaignId ? 'Edit Campaign' : 'Create Campaign';
      
      if (campaignId) {
        // Load campaign data for editing
        this.loadCampaignData(campaignId);
      }
      
      // Show modal
      const modal = new bootstrap.Modal(document.getElementById('campaignModal'));
      modal.show();
    }
    
    async loadCampaignData(campaignId) {
      try {
        const db = firebase.firestore();
        const campaignDoc = await db.collection('campaigns').doc(campaignId).get();
        
        if (!campaignDoc.exists) {
          console.error('Campaign not found');
          return;
        }
        
        const campaign = campaignDoc.data();
        
        // Fill form fields
        document.getElementById('campaign-name').value = campaign.name || '';
        document.getElementById('campaign-subject').value = campaign.subject || '';
      document.getElementById('campaign-template').value = campaign.templateId || '';
      
      // Set selected lists
      const listsSelect = document.getElementById('campaign-lists');
      
      if (campaign.listIds && campaign.listIds.length > 0) {
        Array.from(listsSelect.options).forEach(option => {
          option.selected = campaign.listIds.includes(option.value);
        });
      }
      
      // Set schedule type
      let scheduleType = 'draft';
      
      if (campaign.status === 'scheduled' && campaign.scheduledFor) {
        scheduleType = 'later';
        
        // Set scheduled datetime
        const date = new Date(campaign.scheduledFor.seconds * 1000);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        document.getElementById('schedule-datetime').value = `${year}-${month}-${day}T${hours}:${minutes}`;
      }
      
      document.querySelector(`input[name="schedule-type"][value="${scheduleType}"]`).checked = true;
      
      // Show/hide schedule datetime field
      document.getElementById('schedule-datetime-container').style.display = scheduleType === 'later' ? 'block' : 'none';
      
    } catch (error) {
      console.error('Error loading campaign data:', error);
    }
  }
  
  async saveCampaign() {
    try {
      // Validate form
      const form = document.getElementById('campaign-form');
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      
      // --- ADD AUTH CHECK AND TOKEN REFRESH HERE ---
      const currentUser = firebase.auth().currentUser;
      if (!currentUser) {
        console.error("saveCampaign: No user is currently authenticated on the client.");
        alert("Authentication error. You might be logged out. Please refresh or log in again.");
        return;
      }

      try {
        console.log("saveCampaign: Forcing token refresh for user:", currentUser.uid);
        await currentUser.getIdToken(true); // Force refresh the ID token
        console.log("saveCampaign: Token refreshed successfully.");
      } catch (tokenError) {
        console.error("saveCampaign: Error refreshing ID token:", tokenError);
        alert("Could not verify your session. Please try logging out and back in.");
        return;
      }
      // --- END AUTH CHECK ---

      // Get form values
      const name = document.getElementById('campaign-name').value;
      const subject = document.getElementById('campaign-subject').value;
      const templateId = document.getElementById('campaign-template').value;
      
      // Get selected lists
      const listsSelect = document.getElementById('campaign-lists');
      const listIds = Array.from(listsSelect.selectedOptions).map(option => option.value);
      
      if (listIds.length === 0) {
        alert('Please select at least one recipient list');
        return;
      }
      
      // Get schedule type
      const scheduleType = document.querySelector('input[name="schedule-type"]:checked').value;
      
      // Prepare campaign data
      const campaignData = {
        name,
        subject,
        templateId,
        listIds,
        // status, scheduledFor, and scheduleNow will be determined by the callable function
        // based on the payload we send.
      };
      let callSaveCampaign = true; // Flag to control if we call the function
      
      if (scheduleType === 'now') {
        // Send immediately
        campaignData.status = 'scheduled';
        campaignData.scheduledFor = firebase.firestore.FieldValue.serverTimestamp();
      } else if (scheduleType === 'later') {
        // Schedule for later
        const scheduleDateTime = document.getElementById('schedule-datetime').value;
        
        if (!scheduleDateTime) {
          alert('Please select a date and time for scheduling');
          return;
        }
        
        const scheduledDate = new Date(scheduleDateTime);
        
        if (scheduledDate <= new Date()) {
          alert('Please select a future date and time');
          return;
        }
        
        campaignData.status = 'scheduled';
        campaignData.scheduledFor = firebase.firestore.Timestamp.fromDate(scheduledDate);
        // For callable, send ISO string for scheduledFor
        campaignData.scheduledForISO = scheduledDate.toISOString();
      } else {
        // Save as draft
        campaignData.status = 'draft';
      }
      
      // Prepare payload for the callable function
      const payload = {
        name: campaignData.name,
        subject: campaignData.subject,
        templateId: campaignData.templateId,
        listIds: campaignData.listIds,
      };

      if (this.editingCampaign) {
        payload.id = this.editingCampaign;
      }

      if (campaignData.status === 'scheduled') {
        if (scheduleType === 'now') {
          payload.scheduleNow = true;
        } else if (campaignData.scheduledForISO) {
          payload.scheduledFor = campaignData.scheduledForISO; // Send ISO string
        }
      }
      // If status is 'draft', no extra schedule parameters are needed for the callable.

      try {
        console.log("[Campaigns.js] Attempting to call 'saveCampaign' callable function with payload:", payload);
        const saveCampaignCallable = firebase.functions().httpsCallable('saveCampaign');
        const result = await saveCampaignCallable(payload); // Capture the result
        console.log("[Campaigns.js] 'saveCampaign' callable function returned:", result); // Log the result

        console.log("[Campaigns.js] Callable function call successful. Attempting to hide modal...");
        const campaignModalElement = document.getElementById('campaignModal');
        if (campaignModalElement) {
          const campaignModalInstance = bootstrap.Modal.getInstance(campaignModalElement);
          if (campaignModalInstance) {
            campaignModalInstance.hide();
            console.log("[Campaigns.js] Campaign modal hidden.");
          } else {
            console.error("[Campaigns.js] Could not get campaign modal instance to hide it. Was it initialized?");
          }
        } else {
          console.error("[Campaigns.js] Campaign modal element not found.");
        }
        
        console.log("[Campaigns.js] Attempting to reload campaigns list...");
        await this.loadCampaigns(); // Ensure this is awaited if it's async
        console.log("[Campaigns.js] Campaigns list reload initiated/completed.");
        
        alert(this.editingCampaign ? 'Campaign updated successfully via callable.' : 'Campaign created successfully via callable.');
        console.log("[Campaigns.js] Success alert displayed.");
      } catch (error) {
        console.error('Error saving campaign via callable:', error);
        alert(`Error: ${error.message}`);
      }
      
    } catch (error) {
      console.error('Error saving campaign:', error);
      alert(`Error: ${error.message}`);
    }
  }
  
  async showScheduleModal(campaignId) {
    try {
      const db = firebase.firestore(); // Keep direct Firestore read for simplicity here to get name
      const campaignDoc = await db.collection('campaigns').doc(campaignId).get();
      if (!campaignDoc.exists) {
        console.error('Campaign not found');
        return;
      }
      const campaign = campaignDoc.data();
      
      const scheduleNowConfirm = confirm(`Schedule the campaign "${campaign.name}" to be sent immediately?`);
      if (!scheduleNowConfirm) return;

      // Call the 'scheduleCampaign' callable function.
      // For "Send Now", we can use the saveCampaign callable with scheduleNow=true
      // or a dedicated scheduleCampaign callable. Let's assume a dedicated one for clarity.
      const scheduleCampaignCallable = firebase.functions().httpsCallable('scheduleCampaign');
      await scheduleCampaignCallable({ 
        campaignId: campaignId,
        // Send current time as ISO, backend can interpret this as "now" or use it directly
        scheduledFor: new Date().toISOString() 
      });
      
      this.loadCampaigns();
      alert('Campaign scheduled successfully');
    } catch (error) {
      console.error('Error scheduling campaign:', error);
      alert(`Error: ${error.message}`);
    }
  }
  
  async cancelCampaign(campaignId) {
    try {
      const db = firebase.firestore(); // Keep direct Firestore read for simplicity here to get name
      const campaignDoc = await db.collection('campaigns').doc(campaignId).get();
      if (!campaignDoc.exists) {
        console.error('Campaign not found');
        return;
      }
      const campaign = campaignDoc.data();
      
      const confirmCancel = window.confirm(`Cancel the scheduled campaign "${campaign.name}"?`);
      if (!confirmCancel) return;

      const cancelCampaignCallable = firebase.functions().httpsCallable('cancelCampaign');
      await cancelCampaignCallable({ campaignId });
      
      this.loadCampaigns();
      alert('Campaign cancelled successfully');
    } catch (error) {
      console.error('Error cancelling campaign:', error);
      alert(`Error: ${error.message}`);
    }
  }
  
  async deleteCampaign(campaignId) {
    try {
      const db = firebase.firestore(); // Keep direct Firestore read for simplicity here to get name
      const campaignDoc = await db.collection('campaigns').doc(campaignId).get();
      if (!campaignDoc.exists) {
        console.error('Campaign not found');
        return;
      }
      const campaign = campaignDoc.data();
      
      const confirmDelete = window.confirm(`Delete the campaign "${campaign.name}"? This action cannot be undone.`);
      if (!confirmDelete) return;

      const deleteCampaignCallable = firebase.functions().httpsCallable('deleteCampaign');
      await deleteCampaignCallable({ campaignId });
      
      this.loadCampaigns();
      alert('Campaign deleted successfully');
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert(`Error: ${error.message}`);
    }
  }
  
  async editCampaign(campaignId) {
    this.showCampaignModal(campaignId);
  }
  
  getStatusClass(status) {
    switch (status) {
      case 'draft':
        return 'bg-secondary';
      case 'scheduled':
        return 'bg-info';
      case 'processing': // Added based on backend status
      case 'sending':
        return 'bg-warning';
      case 'sent':
        return 'bg-success';
      case 'error':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }
}
window.EmailCampaigns = EmailCampaigns;
