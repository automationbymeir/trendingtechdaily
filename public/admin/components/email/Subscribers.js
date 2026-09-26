// Subscribers.js - Email subscriber management component

class EmailSubscribers {
    constructor() {
      this.container = null;
      this.lists = [];
      this.editingSubscriber = null;
      this.currentPage = 1;
      this.itemsPerPage = 10;
      this.totalItems = 0;
      this.activeFilter = null;
    }
  
    render(containerId) {
      this.container = document.getElementById(containerId);
      
      if (!this.container) {
        console.error(`Container with ID ${containerId} not found`);
        return;
      }
  
      this.renderSubscribersList();
    }
  
    async renderSubscribersList() {
      try {
        this.container.innerHTML = `
          <div class="subscribers-container">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h1 class="h3 mb-0">Email Subscribers</h1>
              <div>
                <button id="import-subscribers-btn" class="btn btn-outline-primary me-2">
                  <i class="bi bi-upload me-1"></i> Import
                </button>
                <button id="export-subscribers-btn" class="btn btn-outline-secondary me-2">
                  <i class="bi bi-download me-1"></i> Export
                </button>
                <button id="create-subscriber-btn" class="btn btn-primary">
                  <i class="bi bi-plus-circle me-1"></i> Add Subscriber
                </button>
              </div>
            </div>
            
            <div class="card shadow mb-4">
              <div class="card-header py-3 d-flex justify-content-between align-items-center">
                <h6 class="m-0 font-weight-bold text-primary">All Subscribers</h6>
                <div class="d-flex">
                  <div class="input-group me-2" style="width: 250px;">
                    <input type="text" class="form-control" id="subscriber-search" placeholder="Search subscribers">
                    <button class="btn btn-outline-primary" type="button" id="subscriber-search-btn">
                      <i class="bi bi-search"></i>
                    </button>
                  </div>
                  
                  <select class="form-select me-2" id="status-filter" style="width: 140px;">
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="unsubscribed">Unsubscribed</option>
                    <option value="bounced">Bounced</option>
                  </select>
                  
                  <select class="form-select" id="list-filter" style="width: 180px;">
                    <option value="">All Lists</option>
                  </select>
                </div>
              </div>
              <div class="card-body">
                <div id="subscribers-table-container">
                  <div class="d-flex justify-content-center">
                    <div class="spinner-border" role="status">
                      <span class="visually-hidden">Loading...</span>
                    </div>
                  </div>
                </div>
                
                <div id="pagination-container" class="d-flex justify-content-between align-items-center mt-3">
                  <div class="pagination-info">
                    Showing <span id="pagination-start">0</span> to <span id="pagination-end">0</span> of <span id="pagination-total">0</span> subscribers
                  </div>
                  <nav aria-label="Subscribers pagination">
                    <ul class="pagination" id="pagination-controls">
                    </ul>
                  </nav>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Subscriber Modal -->
          <div class="modal fade" id="subscriberModal" tabindex="-1" aria-labelledby="subscriberModalLabel" aria-hidden="true">
            <div class="modal-dialog">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="subscriberModalLabel">Add Subscriber</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <form id="subscriber-form">
                    <div class="mb-3">
                      <label for="subscriber-email" class="form-label">Email</label>
                      <input type="email" class="form-control" id="subscriber-email" required>
                    </div>
                    
                    <div class="mb-3">
                      <label for="subscriber-name" class="form-label">Name</label>
                      <input type="text" class="form-control" id="subscriber-name">
                    </div>
                    
                    <div class="mb-3">
                      <label for="subscriber-status" class="form-label">Status</label>
                      <select class="form-select" id="subscriber-status">
                        <option value="active">Active</option>
                        <option value="unsubscribed">Unsubscribed</option>
                        <option value="bounced">Bounced</option>
                      </select>
                    </div>
                    
                    <div class="mb-3">
                      <label for="subscriber-lists" class="form-label">Lists</label>
                      <select class="form-select" id="subscriber-lists" multiple>
                      </select>
                      <div class="form-text">Hold Ctrl (or Cmd) to select multiple lists</div>
                    </div>
                    
                    <div class="mb-3">
                      <label for="subscriber-tags" class="form-label">Tags</label>
                      <input type="text" class="form-control" id="subscriber-tags" placeholder="Enter tags separated by commas">
                    </div>
                    
                    <div class="mb-3">
                      <h6>Custom Fields</h6>
                      <div id="custom-fields-container">
                        <div class="row mb-2">
                          <div class="col">
                            <input type="text" class="form-control custom-field-key" placeholder="Field name">
                          </div>
                          <div class="col">
                            <input type="text" class="form-control custom-field-value" placeholder="Value">
                          </div>
                          <div class="col-auto">
                            <button type="button" class="btn btn-outline-danger remove-custom-field">
                              <i class="bi bi-trash"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                      <button type="button" class="btn btn-sm btn-outline-primary mt-2" id="add-custom-field-btn">
                        <i class="bi bi-plus-circle me-1"></i> Add Custom Field
                      </button>
                    </div>
                  </form>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                  <button type="button" class="btn btn-primary" id="save-subscriber-btn">Save</button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Import Modal -->
          <div class="modal fade" id="importModal" tabindex="-1" aria-labelledby="importModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="importModalLabel">Import Subscribers</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <form id="import-form">
                    <div class="mb-3">
                      <label for="import-file" class="form-label">CSV File</label>
                      <input type="file" class="form-control" id="import-file" accept=".csv" required>
                      <div class="form-text">CSV file must have at least an 'email' column. Other columns are optional.</div>
                    </div>
                    
                    <div class="mb-3">
                      <label for="import-lists" class="form-label">Add to Lists</label>
                      <select class="form-select" id="import-lists" multiple>
                      </select>
                      <div class="form-text">Hold Ctrl (or Cmd) to select multiple lists</div>
                    </div>
                    
                    <div class="mb-3">
                      <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="import-overwrite">
                        <label class="form-check-label" for="import-overwrite">
                          Overwrite existing subscribers
                        </label>
                      </div>
                      <div class="form-text">If checked, existing subscribers will be updated with the imported data.</div>
                    </div>
                  </form>
                  
                  <div id="import-preview-container" style="display: none;">
                    <h6>Preview</h6>
                    <div class="table-responsive">
                      <table class="table table-bordered table-sm" id="import-preview-table">
                      </table>
                    </div>
                  </div>
                  
                  <div id="import-results-container" style="display: none;">
                    <div class="alert alert-success">
                      <h6>Import Results</h6>
                      <p class="mb-1">Total rows: <span id="import-result-total">0</span></p>
                      <p class="mb-1">Added: <span id="import-result-added">0</span></p>
                      <p class="mb-1">Updated: <span id="import-result-updated">0</span></p>
                      <p class="mb-0">Errors: <span id="import-result-errors">0</span></p>
                    </div>
                    <div id="import-errors-container" style="display: none;">
                      <h6>Errors</h6>
                      <ul class="list-group" id="import-errors-list">
                      </ul>
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                  <button type="button" class="btn btn-primary" id="preview-import-btn">Preview</button>
                  <button type="button" class="btn btn-success" id="process-import-btn" style="display: none;">Import</button>
                </div>
              </div>
            </div>
          </div>
        `;
  
        // Add event listeners
        document.getElementById('create-subscriber-btn').addEventListener('click', () => this.showSubscriberModal());
        document.getElementById('save-subscriber-btn').addEventListener('click', () => this.saveSubscriber());
        document.getElementById('add-custom-field-btn').addEventListener('click', () => this.addCustomField());
        document.getElementById('import-subscribers-btn').addEventListener('click', () => this.showImportModal());
        document.getElementById('export-subscribers-btn').addEventListener('click', () => this.exportSubscribers());
        document.getElementById('preview-import-btn').addEventListener('click', () => this.previewImport());
        document.getElementById('process-import-btn').addEventListener('click', () => this.processImport());
        document.getElementById('subscriber-search-btn').addEventListener('click', () => this.searchSubscribers());
        document.getElementById('subscriber-search').addEventListener('keyup', (e) => {
          if (e.key === 'Enter') {
            this.searchSubscribers();
          }
        });
        
        // Add filter change listeners
        document.getElementById('status-filter').addEventListener('change', () => {
          this.currentPage = 1;
          this.loadSubscribers();
        });
        document.getElementById('list-filter').addEventListener('change', () => {
          this.currentPage = 1;
          this.loadSubscribers();
        });
        
        // Load data
        await Promise.all([
          this.loadLists(),
          this.loadSubscribers()
        ]);
        
      } catch (error) {
        console.error('Error rendering subscribers:', error);
        this.container.innerHTML = `
          <div class="alert alert-danger">
            Error loading subscribers: ${error.message}
          </div>
        `;
      }
    }
    
    async loadLists() {
      try {
        const db = firebase.firestore();
        const listsSnapshot = await db.collection('lists').orderBy('name').get();
        
        this.lists = [];
        listsSnapshot.forEach(doc => {
          this.lists.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        // Populate lists filter dropdown
        const listFilter = document.getElementById('list-filter');
        listFilter.innerHTML = '<option value="">All Lists</option>';
        
        this.lists.forEach(list => {
          const option = document.createElement('option');
          option.value = list.id;
          option.textContent = `${list.name} (${list.subscriberCount || 0})`;
          listFilter.appendChild(option);
        });
        
        // Populate subscriber modal lists dropdown
        const subscriberLists = document.getElementById('subscriber-lists');
        subscriberLists.innerHTML = '';
        
        this.lists.forEach(list => {
          const option = document.createElement('option');
          option.value = list.id;
          option.textContent = list.name;
          subscriberLists.appendChild(option);
        });
        
        // Populate import modal lists dropdown
        const importLists = document.getElementById('import-lists');
        importLists.innerHTML = '';
        
        this.lists.forEach(list => {
          const option = document.createElement('option');
          option.value = list.id;
          option.textContent = list.name;
          importLists.appendChild(option);
        });
        
      } catch (error) {
        console.error('Error loading lists:', error);
      }
    }
    
    async loadSubscribers() {
      try {
        const tableContainer = document.getElementById('subscribers-table-container');
        tableContainer.innerHTML = `
          <div class="d-flex justify-content-center">
            <div class="spinner-border" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          </div>
        `;
        
        const db = firebase.firestore();
        let query = db.collection('subscribers');
        
        // Apply status filter
        const statusFilter = document.getElementById('status-filter').value;
        if (statusFilter) {
          query = query.where('status', '==', statusFilter);
        }
        
        // Apply list filter
        const listFilter = document.getElementById('list-filter').value;
        if (listFilter) {
          // First get subscribers in the list
          const membersSnapshot = await db.collection('lists')
            .doc(listFilter)
            .collection('members')
            .get();
          
          const subscriberIds = membersSnapshot.docs.map(doc => doc.id);
          
          if (subscriberIds.length === 0) {
            // No subscribers in this list
            tableContainer.innerHTML = `
              <div class="text-center py-5">
                <p class="text-muted mb-0">No subscribers in this list</p>
              </div>
            `;
            
            this.updatePagination(0, 0, 0);
            return;
          }
          
          // Since Firestore can't do 'where id in' directly, we need to do batched queries
          const batches = [];
          const batchSize = 10; // Firestore 'in' queries are limited to 10 items
          
          for (let i = 0; i < subscriberIds.length; i += batchSize) {
            const batch = subscriberIds.slice(i, i + batchSize);
            batches.push(batch);
          }
          
          // Execute all batch queries
          const batchQueries = batches.map(batch => 
            db.collection('subscribers')
              .where(firebase.firestore.FieldPath.documentId(), 'in', batch)
              .get()
          );
          
          const batchResults = await Promise.all(batchQueries);
          
          // Merge results
          const subscribers = [];
          batchResults.forEach(querySnapshot => {
            querySnapshot.forEach(doc => {
              subscribers.push({
                id: doc.id,
                ...doc.data()
              });
            });
          });
          
          // Apply status filter to the in-memory results
          if (statusFilter) {
            const filtered = subscribers.filter(sub => sub.status === statusFilter);
            this.renderSubscribersTable(filtered);
            return;
          }
          
          // Render the table
          this.renderSubscribersTable(subscribers);
          return;
        }
        
        // Apply search
        const searchInput = document.getElementById('subscriber-search').value.trim();
        if (searchInput) {
          // Search by email (exact match for now - Firestore doesn't support partial text search out of the box)
          query = query.where('email', '>=', searchInput)
                       .where('email', '<=', searchInput + '\uf8ff');
        }
        
        // Get total count for pagination
        const totalSnapshot = await query.get();
        this.totalItems = totalSnapshot.size;
        
        // For pagination, use a cursor-based approach instead of offset
        // First, order by email to create a consistent sorting
        query = query.orderBy('email');
        
        // If we're not on the first page, we need to get the cursor position
        if (this.currentPage > 1) {
          // Get all documents up to the start of the current page
          const prevPageItemsCount = (this.currentPage - 1) * this.itemsPerPage;
          const cursorSnapshot = await query.limit(prevPageItemsCount).get();
          
          // If we have enough documents to establish the cursor
          if (cursorSnapshot.size >= prevPageItemsCount) {
            // Get the last document as our cursor
            const lastDoc = cursorSnapshot.docs[cursorSnapshot.size - 1];
            // Start after this document for pagination
            query = query.startAfter(lastDoc);
          }
        }
        
        // Apply limit for the current page
        query = query.limit(this.itemsPerPage);
        
        // Execute the query
        const subscribersSnapshot = await query.get();
        
        if (subscribersSnapshot.empty) {
          tableContainer.innerHTML = `
            <div class="text-center py-5">
              <p class="text-muted mb-0">No subscribers found</p>
            </div>
          `;
          
          this.updatePagination(0, 0, 0);
          return;
        }
        
        // Prepare data for the table
        const subscribers = [];
        subscribersSnapshot.forEach(doc => {
          subscribers.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        // Render the table
        this.renderSubscribersTable(subscribers);
        
      } catch (error) {
        console.error('Error loading subscribers:', error);
        document.getElementById('subscribers-table-container').innerHTML = `
          <div class="alert alert-danger">
            Error loading subscribers: ${error.message}
          </div>
        `;
      }
    }
    
    renderSubscribersTable(subscribers) {
      const tableContainer = document.getElementById('subscribers-table-container');
      
      if (subscribers.length === 0) {
        tableContainer.innerHTML = `
          <div class="text-center py-5">
            <p class="text-muted mb-0">No subscribers found</p>
          </div>
        `;
        
        this.updatePagination(0, 0, 0);
        return;
      }
      
      // Create subscribers table
      tableContainer.innerHTML = `
        <div class="table-responsive">
          <table class="table table-bordered" id="subscribers-table" width="100%" cellspacing="0">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Status</th>
                <th>Lists</th>
                <th>Subscription Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      `;
      
      const tableBody = document.querySelector('#subscribers-table tbody');
      
      subscribers.forEach(subscriber => {
        const row = document.createElement('tr');
        
        // Email
        const emailCell = document.createElement('td');
        emailCell.textContent = subscriber.email;
        row.appendChild(emailCell);
        
        // Name
        const nameCell = document.createElement('td');
        nameCell.textContent = subscriber.name || '-';
        row.appendChild(nameCell);
        
        // Status
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `badge ${this.getStatusClass(subscriber.status)}`;
        statusBadge.textContent = subscriber.status || 'active';
        statusCell.appendChild(statusBadge);
        row.appendChild(statusCell);
        
        // Lists
        const listsCell = document.createElement('td');
        if (subscriber.listIds && subscriber.listIds.length > 0) {
          subscriber.listIds.forEach(listId => {
            const list = this.lists.find(l => l.id === listId);
            if (list) {
              const badge = document.createElement('span');
              badge.className = 'badge bg-primary me-1';
              badge.textContent = list.name;
              listsCell.appendChild(badge);
            }
          });
        } else {
          listsCell.textContent = '-';
        }
        row.appendChild(listsCell);
        
        // Subscription Date
        const dateCell = document.createElement('td');
        if (subscriber.subscriptionDate) {
          const date = new Date(subscriber.subscriptionDate.seconds * 1000);
          dateCell.textContent = date.toLocaleDateString();
        } else {
          dateCell.textContent = '-';
        }
        row.appendChild(dateCell);
        
        // Actions
        const actionsCell = document.createElement('td');
        
        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-outline-primary me-1';
        editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
        editBtn.addEventListener('click', () => this.editSubscriber(subscriber.id));
        actionsCell.appendChild(editBtn);
        
        // View activity button
        const activityBtn = document.createElement('button');
        activityBtn.className = 'btn btn-sm btn-outline-info me-1';
        activityBtn.innerHTML = '<i class="bi bi-activity"></i>';
        activityBtn.addEventListener('click', () => this.viewSubscriberActivity(subscriber.id));
        actionsCell.appendChild(activityBtn);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-outline-danger';
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
        deleteBtn.addEventListener('click', () => this.deleteSubscriber(subscriber.id));
        actionsCell.appendChild(deleteBtn);
        
        row.appendChild(actionsCell);
        
        tableBody.appendChild(row);
      });
      
      // Update pagination
      const start = (this.currentPage - 1) * this.itemsPerPage + 1;
      const end = Math.min(start + subscribers.length - 1, this.totalItems);
      this.updatePagination(start, end, this.totalItems);
    }
    
    updatePagination(start, end, total) {
      document.getElementById('pagination-start').textContent = start;
      document.getElementById('pagination-end').textContent = end;
      document.getElementById('pagination-total').textContent = total;
      
      const totalPages = Math.ceil(total / this.itemsPerPage);
      const paginationControls = document.getElementById('pagination-controls');
      paginationControls.innerHTML = '';
      
      if (totalPages <= 1) {
        return;
      }
      
      // Previous button
      const prevItem = document.createElement('li');
      prevItem.className = `page-item ${this.currentPage === 1 ? 'disabled' : ''}`;
      
      const prevLink = document.createElement('a');
      prevLink.className = 'page-link';
      prevLink.href = '#';
      prevLink.innerHTML = '&laquo;';
      prevLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.currentPage > 1) {
          this.currentPage--;
          this.loadSubscribers();
        }
      });
      
      prevItem.appendChild(prevLink);
      paginationControls.appendChild(prevItem);
      
      // Page numbers
      const startPage = Math.max(1, this.currentPage - 2);
      const endPage = Math.min(totalPages, startPage + 4);
      
      for (let i = startPage; i <= endPage; i++) {
        const pageItem = document.createElement('li');
        pageItem.className = `page-item ${i === this.currentPage ? 'active' : ''}`;
        
        const pageLink = document.createElement('a');
        pageLink.className = 'page-link';
        pageLink.href = '#';
        pageLink.textContent = i;
        pageLink.addEventListener('click', (e) => {
          e.preventDefault();
          this.currentPage = i;
          this.loadSubscribers();
        });
        
        pageItem.appendChild(pageLink);
        paginationControls.appendChild(pageItem);
      }
      
      // Next button
      const nextItem = document.createElement('li');
      nextItem.className = `page-item ${this.currentPage === totalPages ? 'disabled' : ''}`;
      
      const nextLink = document.createElement('a');
      nextLink.className = 'page-link';
      nextLink.href = '#';
      nextLink.innerHTML = '&raquo;';
      nextLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.loadSubscribers();
        }
      });
      
      nextItem.appendChild(nextLink);
      paginationControls.appendChild(nextItem);
    }
    
    showSubscriberModal(subscriberId = null) {
      this.editingSubscriber = subscriberId;
      
      // Reset form
      document.getElementById('subscriber-form').reset();
      
      // Clear custom fields
      const customFieldsContainer = document.getElementById('custom-fields-container');
      customFieldsContainer.innerHTML = `
        <div class="row mb-2">
          <div class="col">
            <input type="text" class="form-control custom-field-key" placeholder="Field name">
          </div>
          <div class="col">
            <input type="text" class="form-control custom-field-value" placeholder="Value">
          </div>
          <div class="col-auto">
            <button type="button" class="btn btn-outline-danger remove-custom-field">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      `;
      
      // Add remove button event
      document.querySelector('.remove-custom-field').addEventListener('click', (e) => {
        e.target.closest('.row').remove();
      });
      
      // Update modal title
      const modalTitle = document.getElementById('subscriberModalLabel');
      modalTitle.textContent = subscriberId ? 'Edit Subscriber' : 'Add Subscriber';
      
      if (subscriberId) {
        // Load subscriber data for editing
        this.loadSubscriberData(subscriberId);
      }
      
      // Show modal
      const modal = new bootstrap.Modal(document.getElementById('subscriberModal'));
      modal.show();
    }
    
    async loadSubscriberData(subscriberId) {
      try {
        const db = firebase.firestore();
        const subscriberDoc = await db.collection('subscribers').doc(subscriberId).get();
        
        if (!subscriberDoc.exists) {
          console.error('Subscriber not found');
          return;
        }
        
        const subscriber = subscriberDoc.data();
        
        // Fill form fields
        document.getElementById('subscriber-email').value = subscriber.email || '';
        document.getElementById('subscriber-name').value = subscriber.name || '';
        document.getElementById('subscriber-status').value = subscriber.status || 'active';
        
        // Set selected lists
        const listsSelect = document.getElementById('subscriber-lists');
        
        if (subscriber.listIds && subscriber.listIds.length > 0) {
          Array.from(listsSelect.options).forEach(option => {
            option.selected = subscriber.listIds.includes(option.value);
          });
        }
        
        // Set tags
        if (subscriber.tags && subscriber.tags.length > 0) {
          document.getElementById('subscriber-tags').value = subscriber.tags.join(', ');
        }
        
        // Set custom fields
        if (subscriber.customFields) {
          const customFieldsContainer = document.getElementById('custom-fields-container');
          customFieldsContainer.innerHTML = '';
          
          Object.entries(subscriber.customFields).forEach(([key, value]) => {
            const row = document.createElement('div');
            row.className = 'row mb-2';
            row.innerHTML = `
              <div class="col">
                <input type="text" class="form-control custom-field-key" value="${key}" placeholder="Field name">
              </div>
              <div class="col">
                <input type="text" class="form-control custom-field-value" value="${value}" placeholder="Value">
              </div>
              <div class="col-auto">
                <button type="button" class="btn btn-outline-danger remove-custom-field">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            `;
            
            customFieldsContainer.appendChild(row);
            
            // Add remove button event
            row.querySelector('.remove-custom-field').addEventListener('click', () => {
              row.remove();
            });
          });
        }
        
      } catch (error) {
        console.error('Error loading subscriber data:', error);
      }
    }
    
    async saveSubscriber() {
      try {
        // Validate form
        const form = document.getElementById('subscriber-form');
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        
        // Get form values
        const email = document.getElementById('subscriber-email').value;
        const name = document.getElementById('subscriber-name').value;
        const status = document.getElementById('subscriber-status').value;
        
        // Get selected lists
        const listsSelect = document.getElementById('subscriber-lists');
        const listIds = Array.from(listsSelect.selectedOptions).map(option => option.value);
        
        // Get tags
        const tagsInput = document.getElementById('subscriber-tags').value;
        const tags = tagsInput
          ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag)
          : [];
        
        // Get custom fields
        const customFields = {};
        document.querySelectorAll('.custom-field-key').forEach(keyInput => {
          const key = keyInput.value.trim();
          if (key) {
            const valueInput = keyInput.closest('.row').querySelector('.custom-field-value');
            customFields[key] = valueInput.value.trim();
          }
        });
        
        // Prepare subscriber data
        const subscriberData = {
          email,
          name,
          status,
          listIds,
          tags,
          customFields,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const db = firebase.firestore();
        
        if (this.editingSubscriber) {
          // Update existing subscriber
          await db.collection('subscribers').doc(this.editingSubscriber).update(subscriberData);
        } else {
          // Check if email already exists
        const existingSnapshot = await db.collection('subscribers')
        .where('email', '==', email)
        .limit(1)
        .get();
      
      if (!existingSnapshot.empty) {
        alert('A subscriber with this email already exists.');
        return;
      }
      
      // Create new subscriber
      subscriberData.subscriptionDate = firebase.firestore.FieldValue.serverTimestamp();
      subscriberData.emailsSent = 0;
      subscriberData.emailsOpened = 0;
      subscriberData.emailsClicked = 0;
      
      const docRef = await db.collection('subscribers').add(subscriberData);
      this.editingSubscriber = docRef.id;
    }
    
    // Update list memberships
    await this.updateListMemberships(this.editingSubscriber, listIds);
    
    // Close modal
    bootstrap.Modal.getInstance(document.getElementById('subscriberModal')).hide();
    
    // Reload subscribers
    this.loadSubscribers();
    
    // Show success message
    alert(this.editingSubscriber ? 'Subscriber updated successfully' : 'Subscriber added successfully');
    
  } catch (error) {
    console.error('Error saving subscriber:', error);
    alert(`Error: ${error.message}`);
  }
}

async updateListMemberships(subscriberId, listIds) {
  try {
    const db = firebase.firestore();
    
    // Get current list memberships
    const membershipsSnapshot = await db.collectionGroup('members')
      .where('subscriberId', '==', subscriberId)
      .get();
    
    const currentListIds = new Set();
    membershipsSnapshot.forEach(doc => {
      // Extract list ID from doc.ref.path
      const pathParts = doc.ref.path.split('/');
      const listId = pathParts[pathParts.indexOf('lists') + 1];
      currentListIds.add(listId);
    });
    
    // Lists to add
    const listsToAdd = listIds.filter(id => !currentListIds.has(id));
    
    // Lists to remove
    const listsToRemove = Array.from(currentListIds).filter(id => !listIds.includes(id));
    
    // Batch operations
    const batch = db.batch();
    
    // Add to new lists
    for (const listId of listsToAdd) {
      const memberRef = db.collection('lists')
        .doc(listId)
        .collection('members')
        .doc(subscriberId);
      
      batch.set(memberRef, {
        subscriberId,
        addedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Update list subscriber count
      batch.update(db.collection('lists').doc(listId), {
        subscriberCount: firebase.firestore.FieldValue.increment(1)
      });
    }
    
    // Remove from old lists
    for (const listId of listsToRemove) {
      const memberRef = db.collection('lists')
        .doc(listId)
        .collection('members')
        .doc(subscriberId);
      
      batch.delete(memberRef);
      
      // Update list subscriber count
      batch.update(db.collection('lists').doc(listId), {
        subscriberCount: firebase.firestore.FieldValue.increment(-1)
      });
    }
    
    await batch.commit();
    
  } catch (error) {
    console.error('Error updating list memberships:', error);
    throw error;
  }
}

async deleteSubscriber(subscriberId) {
  try {
    // Load subscriber data
    const db = firebase.firestore();
    const subscriberDoc = await db.collection('subscribers').doc(subscriberId).get();
    
    if (!subscriberDoc.exists) {
      console.error('Subscriber not found');
      return;
    }
    
    const subscriber = subscriberDoc.data();
    
    // Confirm deletion
    const confirmDelete = window.confirm(`Delete subscriber "${subscriber.email}"? This action cannot be undone.`);
    
    if (!confirmDelete) {
      return;
    }
    
    // Remove from lists
    const membershipsSnapshot = await db.collectionGroup('members')
      .where('subscriberId', '==', subscriberId)
      .get();
    
    const batch = db.batch();
    
    membershipsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
      
      // Extract list ID from doc.ref.path
      const pathParts = doc.ref.path.split('/');
      const listIndex = pathParts.indexOf('lists');
      if (listIndex !== -1 && listIndex + 1 < pathParts.length) {
        const listId = pathParts[listIndex + 1];
        batch.update(db.collection('lists').doc(listId), {
          subscriberCount: firebase.firestore.FieldValue.increment(-1)
        });
      }
    });
    
    // Delete subscriber
    batch.delete(db.collection('subscribers').doc(subscriberId));
    
    await batch.commit();
    
    // Reload subscribers
    this.loadSubscribers();
    
    // Show success message
    alert('Subscriber deleted successfully');
    
  } catch (error) {
    console.error('Error deleting subscriber:', error);
    alert(`Error: ${error.message}`);
  }
}

async editSubscriber(subscriberId) {
  this.showSubscriberModal(subscriberId);
}

async viewSubscriberActivity(subscriberId) {
  try {
    // Load subscriber data
    const db = firebase.firestore();
    const subscriberDoc = await db.collection('subscribers').doc(subscriberId).get();
    
    if (!subscriberDoc.exists) {
      console.error('Subscriber not found');
      return;
    }
    
    const subscriber = subscriberDoc.data();
    
    // Load tracking data
    const trackingSnapshot = await db.collection('tracking')
      .where('subscriberId', '==', subscriberId)
      .orderBy('sentAt', 'desc')
      .limit(20)
      .get();
    
    // Create activity modal HTML
    let activityHtml = `
      <div class="modal fade" id="activityModal" tabindex="-1" aria-labelledby="activityModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="activityModalLabel">Activity for ${subscriber.email}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="row mb-4">
                <div class="col-md-4">
                  <div class="card">
                    <div class="card-body">
                      <h5 class="card-title">Emails Sent</h5>
                      <p class="card-text display-5">${subscriber.emailsSent || 0}</p>
                    </div>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="card">
                    <div class="card-body">
                      <h5 class="card-title">Open Rate</h5>
                      <p class="card-text display-5">
                        ${subscriber.emailsSent ? Math.round((subscriber.emailsOpened / subscriber.emailsSent) * 100) : 0}%
                      </p>
                    </div>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="card">
                    <div class="card-body">
                      <h5 class="card-title">Click Rate</h5>
                      <p class="card-text display-5">
                        ${subscriber.emailsSent ? Math.round((subscriber.emailsClicked / subscriber.emailsSent) * 100) : 0}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
    `;
    
    if (trackingSnapshot.empty) {
      activityHtml += `
        <div class="text-center py-5">
          <p class="text-muted mb-0">No email activity found</p>
        </div>
      `;
    } else {
      activityHtml += `
        <h6>Recent Email Activity</h6>
        <div class="table-responsive">
          <table class="table table-bordered table-sm">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Subject</th>
                <th>Sent</th>
                <th>Opened</th>
                <th>Clicked</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      for (const doc of trackingSnapshot.docs) {
        const tracking = doc.data();
        
        // Get campaign data
        let campaignName = 'N/A';
        let subject = 'N/A';
        
        if (tracking.campaignId) {
          const campaignDoc = await db.collection('campaigns').doc(tracking.campaignId).get();
          if (campaignDoc.exists) {
            campaignName = campaignDoc.data().name;
            subject = campaignDoc.data().subject;
          }
        } else if (tracking.workflowId) {
          campaignName = 'Workflow';
        }
        
        // Format dates
        const sentDate = tracking.sentAt ? new Date(tracking.sentAt.seconds * 1000).toLocaleString() : 'N/A';
        
        const openedStatus = tracking.openedAt 
          ? `<span class="badge bg-success">Yes</span> - ${new Date(tracking.openedAt.seconds * 1000).toLocaleString()}`
          : `<span class="badge bg-secondary">No</span>`;
          
        const clickedStatus = tracking.clickedAt 
          ? `<span class="badge bg-success">Yes</span> - ${new Date(tracking.clickedAt.seconds * 1000).toLocaleString()}`
          : `<span class="badge bg-secondary">No</span>`;
        
        activityHtml += `
          <tr>
            <td>${campaignName}</td>
            <td>${subject}</td>
            <td>${sentDate}</td>
            <td>${openedStatus}</td>
            <td>${clickedStatus}</td>
          </tr>
        `;
      }
      
      activityHtml += `
            </tbody>
          </table>
        </div>
      `;
    }
    
    activityHtml += `
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Add modal to the DOM
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = activityHtml;
    document.body.appendChild(modalContainer);
    
    // Show modal
    const activityModal = new bootstrap.Modal(document.getElementById('activityModal'));
    activityModal.show();
    
    // Remove modal from DOM when hidden
    document.getElementById('activityModal').addEventListener('hidden.bs.modal', function () {
      modalContainer.remove();
    });
    
  } catch (error) {
    console.error('Error loading subscriber activity:', error);
    alert(`Error: ${error.message}`);
  }
}

addCustomField() {
  const customFieldsContainer = document.getElementById('custom-fields-container');
  
  const row = document.createElement('div');
  row.className = 'row mb-2';
  row.innerHTML = `
    <div class="col">
      <input type="text" class="form-control custom-field-key" placeholder="Field name">
    </div>
    <div class="col">
      <input type="text" class="form-control custom-field-value" placeholder="Value">
    </div>
    <div class="col-auto">
      <button type="button" class="btn btn-outline-danger remove-custom-field">
        <i class="bi bi-trash"></i>
      </button>
    </div>
  `;
  
  customFieldsContainer.appendChild(row);
  
  // Add remove button event
  row.querySelector('.remove-custom-field').addEventListener('click', () => {
    row.remove();
  });
}

showImportModal() {
  // Reset form
  document.getElementById('import-form').reset();
  
  // Reset preview and results
  document.getElementById('import-preview-container').style.display = 'none';
  document.getElementById('import-results-container').style.display = 'none';
  document.getElementById('import-errors-container').style.display = 'none';
  
  // Show preview button, hide import button
  document.getElementById('preview-import-btn').style.display = 'inline-block';
  document.getElementById('process-import-btn').style.display = 'none';
  
  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('importModal'));
  modal.show();
}

async previewImport() {
  try {
    // Validate form
    const form = document.getElementById('import-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    
    // Get file
    const fileInput = document.getElementById('import-file');
    const file = fileInput.files[0];
    
    if (!file) {
      alert('Please select a CSV file');
      return;
    }
    
    // Read file
    const fileReader = new FileReader();
    
    fileReader.onload = (event) => {
      const csvContent = event.target.result;
      
      // Parse CSV
      const rows = csvContent.split('\n');
      const headers = rows[0].split(',').map(header => header.trim());
      
      // Validate headers
      const emailIndex = headers.findIndex(header => 
        header.toLowerCase() === 'email' || 
        header.toLowerCase() === 'email address'
      );
      
      if (emailIndex === -1) {
        alert('CSV file must have an "email" or "email address" column');
        return;
      }
      
      // Show preview
      const previewContainer = document.getElementById('import-preview-container');
      previewContainer.style.display = 'block';
      
      const previewTable = document.getElementById('import-preview-table');
      
      // Create table headers
      let tableHtml = '<thead><tr>';
      headers.forEach(header => {
        tableHtml += `<th>${header}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';
      
      // Add table rows (up to 5)
      const maxPreviewRows = Math.min(5, rows.length - 1);
      
      for (let i = 1; i <= maxPreviewRows; i++) {
        if (!rows[i].trim()) continue;
        
        const values = this.parseCSVRow(rows[i]);
        
        tableHtml += '<tr>';
        headers.forEach((header, index) => {
          const value = index < values.length ? values[index] : '';
          tableHtml += `<td>${value}</td>`;
        });
        tableHtml += '</tr>';
      }
      
      tableHtml += '</tbody>';
      previewTable.innerHTML = tableHtml;
      
      // Show import button
      document.getElementById('preview-import-btn').style.display = 'none';
      document.getElementById('process-import-btn').style.display = 'inline-block';
    };
    
    fileReader.readAsText(file);
    
  } catch (error) {
    console.error('Error previewing import:', error);
    alert(`Error: ${error.message}`);
  }
}

async processImport() {
  try {
    // Get file
    const fileInput = document.getElementById('import-file');
    const file = fileInput.files[0];
    
    // Get selected lists
    const listsSelect = document.getElementById('import-lists');
    const listIds = Array.from(listsSelect.selectedOptions).map(option => option.value);
    
    // Get overwrite option
    const overwrite = document.getElementById('import-overwrite').checked;
    
    // Read file
    const fileReader = new FileReader();
    
    fileReader.onload = async (event) => {
      try {
        const csvContent = event.target.result;
        
        // Parse CSV
        const rows = csvContent.split('\n');
        const headers = rows[0].split(',').map(header => header.trim());
        
        // Validate headers
        const emailIndex = headers.findIndex(header => 
          header.toLowerCase() === 'email' || 
          header.toLowerCase() === 'email address'
        );
        
        if (emailIndex === -1) {
          alert('CSV file must have an "email" or "email address" column');
          return;
        }
        
        // Find name column if exists
        const nameIndex = headers.findIndex(header => 
          header.toLowerCase() === 'name' || 
          header.toLowerCase() === 'full name' || 
          header.toLowerCase() === 'first name'
        );
        
        // Process subscribers
        const db = firebase.firestore();
        const results = {
          total: 0,
          added: 0,
          updated: 0,
          errors: []
        };
        
        // Process in batches for large imports
        const batchSize = 20;
        let batch = db.batch();
        let batchCount = 0;
        let currentBatch = 1;
        const totalBatches = Math.ceil((rows.length - 1) / batchSize);
        
        // Loop through rows
        for (let i = 1; i < rows.length; i++) {
          if (!rows[i].trim()) continue;
          
          const values = this.parseCSVRow(rows[i]);
          
          // Skip if no email
          if (emailIndex >= values.length || !values[emailIndex].trim()) {
            results.errors.push(`Row ${i}: Missing email`);
            continue;
          }
          
          const email = values[emailIndex].trim();
          
          // Validate email
          if (!this.validateEmail(email)) {
            results.errors.push(`Row ${i}: Invalid email format - ${email}`);
            continue;
          }
          
          // Get name if available
          const name = nameIndex !== -1 && nameIndex < values.length ? values[nameIndex].trim() : '';
          
          // Build custom fields
          const customFields = {};
          
          headers.forEach((header, index) => {
            if (index !== emailIndex && index !== nameIndex && index < values.length && values[index].trim()) {
              customFields[header] = values[index].trim();
            }
          });
          
          results.total++;
          
          // Check if subscriber already exists
          const existingSnapshot = await db.collection('subscribers')
            .where('email', '==', email)
            .limit(1)
            .get();
          
          if (!existingSnapshot.empty) {
            // Subscriber exists
            if (overwrite) {
              // Update existing subscriber
              const subscriberId = existingSnapshot.docs[0].id;
              
              const updateData = {
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              };
              
              if (name) updateData.name = name;
              if (Object.keys(customFields).length > 0) updateData.customFields = customFields;
              
              batch.update(db.collection('subscribers').doc(subscriberId), updateData);
              
              // Add to selected lists
              if (listIds.length > 0) {
                for (const listId of listIds) {
                  batch.set(
                    db.collection('lists').doc(listId).collection('members').doc(subscriberId),
                    {
                      subscriberId,
                      addedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }
                  );
                }
              }
              
              results.updated++;
            }
          } else {
            // Create new subscriber
            const newSubscriberRef = db.collection('subscribers').doc();
            
            batch.set(newSubscriberRef, {
              email,
              name,
              customFields,
              status: 'active',
              subscriptionDate: firebase.firestore.FieldValue.serverTimestamp(),
              listIds: listIds,
              emailsSent: 0,
              emailsOpened: 0,
              emailsClicked: 0
            });
            
            // Add to selected lists
            if (listIds.length > 0) {
              for (const listId of listIds) {
                batch.set(
                  db.collection('lists').doc(listId).collection('members').doc(newSubscriberRef.id),
                  {
                    subscriberId: newSubscriberRef.id,
                    addedAt: firebase.firestore.FieldValue.serverTimestamp()
                  }
                );
                
                // Update list subscriber count
                batch.update(db.collection('lists').doc(listId), {
                  subscriberCount: firebase.firestore.FieldValue.increment(1)
                });
              }
            }
            
            results.added++;
          }
          
          batchCount++;
          
          // Commit batch if it's full
          if (batchCount >= batchSize) {
            await batch.commit();
            console.log(`Batch ${currentBatch}/${totalBatches} committed`);
            
            batch = db.batch();
            batchCount = 0;
            currentBatch++;
          }
        }
        
        // Commit final batch if not empty
        if (batchCount > 0) {
          await batch.commit();
          console.log(`Final batch committed`);
        }
        
        // Show results
        document.getElementById('import-result-total').textContent = results.total;
        document.getElementById('import-result-added').textContent = results.added;
        document.getElementById('import-result-updated').textContent = results.updated;
        document.getElementById('import-result-errors').textContent = results.errors.length;
        
        document.getElementById('import-results-container').style.display = 'block';
        
        // Show errors if any
        if (results.errors.length > 0) {
          const errorsContainer = document.getElementById('import-errors-container');
          errorsContainer.style.display = 'block';
          
          const errorsList = document.getElementById('import-errors-list');
          errorsList.innerHTML = '';
          
          results.errors.forEach(error => {
            const listItem = document.createElement('li');
            listItem.className = 'list-group-item list-group-item-danger';
            listItem.textContent = error;
            errorsList.appendChild(listItem);
          });
        }
        
        // Reload subscribers list
        this.loadSubscribers();
        
      } catch (error) {
        console.error('Error processing import:', error);
        alert(`Error: ${error.message}`);
      }
    };
    
    fileReader.readAsText(file);
    
  } catch (error) {
    console.error('Error processing import:', error);
    alert(`Error: ${error.message}`);
  }
}

async exportSubscribers() {
  try {
    const db = firebase.firestore();
    
    // Apply filters
    let query = db.collection('subscribers');
    
    const statusFilter = document.getElementById('status-filter').value;
    if (statusFilter) {
      query = query.where('status', '==', statusFilter);
    }
    
    const searchInput = document.getElementById('subscriber-search').value.trim();
    if (searchInput) {
      query = query.where('email', '>=', searchInput)
                   .where('email', '<=', searchInput + '\uf8ff');
    }
    
    const listFilter = document.getElementById('list-filter').value;
    let subscribers = [];
    
    if (listFilter) {
      // First get subscribers in the list
      const membersSnapshot = await db.collection('lists')
        .doc(listFilter)
        .collection('members')
        .get();
      
      const subscriberIds = membersSnapshot.docs.map(doc => doc.id);
      
      if (subscriberIds.length === 0) {
        alert('No subscribers found with the current filters');
        return;
      }
      
      // Since Firestore can't do 'where id in' directly, we need to do batched queries
      const batches = [];
      const batchSize = 10; // Firestore 'in' queries are limited to 10 items
      
      for (let i = 0; i < subscriberIds.length; i += batchSize) {
        const batch = subscriberIds.slice(i, i + batchSize);
        batches.push(batch);
      }
      
      // Execute all batch queries
      const batchQueries = batches.map(batch => 
        db.collection('subscribers')
          .where(firebase.firestore.FieldPath.documentId(), 'in', batch)
          .get()
      );
      
      const batchResults = await Promise.all(batchQueries);
      
      // Merge results
      batchResults.forEach(querySnapshot => {
        querySnapshot.forEach(doc => {
          subscribers.push({
            id: doc.id,
            ...doc.data()
          });
        });
      });
      
      // Apply status filter to the in-memory results
      if (statusFilter) {
        subscribers = subscribers.filter(sub => sub.status === statusFilter);
      }
    } else {
      // Get all subscribers with filters applied
      const subscribersSnapshot = await query.get();
      
      subscribersSnapshot.forEach(doc => {
        subscribers.push({
          id: doc.id,
          ...doc.data()
        });
      });
    }
    
    if (subscribers.length === 0) {
      alert('No subscribers found with the current filters');
      return;
    }
    
    // Generate CSV
    let csv = 'email,name,status,subscriptionDate';
    
    // Find all custom fields
    const customFields = new Set();
    
    subscribers.forEach(subscriber => {
      if (subscriber.customFields) {
        Object.keys(subscriber.customFields).forEach(field => {
          customFields.add(field);
        });
      }
    });
    
    // Add custom fields to header
    customFields.forEach(field => {
      csv += `,${field}`;
    });
    
    csv += '\n';
    
    // Add subscriber data
    subscribers.forEach(subscriber => {
      const subscriptionDate = subscriber.subscriptionDate 
        ? new Date(subscriber.subscriptionDate.seconds * 1000).toISOString().split('T')[0]
        : '';
      
      csv += `${this.escapeCSV(subscriber.email)},`;
      csv += `${this.escapeCSV(subscriber.name || '')},`;
      csv += `${this.escapeCSV(subscriber.status || 'active')},`;
      csv += `${this.escapeCSV(subscriptionDate)}`;
      
      // Add custom fields
      customFields.forEach(field => {
        const value = subscriber.customFields && subscriber.customFields[field]
          ? subscriber.customFields[field]
          : '';
        
        csv += `,${this.escapeCSV(value)}`;
      });
      
      csv += '\n';
    });
    
    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `subscribers_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
  } catch (error) {
    console.error('Error exporting subscribers:', error);
    alert(`Error: ${error.message}`);
  }
}

searchSubscribers() {
  this.currentPage = 1;
  this.loadSubscribers();
}

escapeCSV(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}

parseCSVRow(row) {
  const result = [];
  let inQuotes = false;
  let currentValue = '';
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if (char === '"') {
      if (inQuotes && i + 1 < row.length && row[i + 1] === '"') {
        // Double quotes inside quotes
        currentValue += '"';
        i++; // Skip the next quote
      } else {
        // Toggle quotes mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  
  // Add the last field
  result.push(currentValue);
  
  return result;
}

validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

getStatusClass(status) {
  switch (status) {
    case 'active':
      return 'bg-success';
    case 'unsubscribed':
      return 'bg-danger';
    case 'bounced':
      return 'bg-warning';
    default:
      return 'bg-secondary';
  }
}
}
window.EmailSubscribers = EmailSubscribers;