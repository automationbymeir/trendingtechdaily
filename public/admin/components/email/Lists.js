// Lists.js - Email list management component

class EmailLists {
    constructor() {
      this.container = null;
      this.editingList = null;
    }
  
    render(containerId) {
      this.container = document.getElementById(containerId);
      
      if (!this.container) {
        console.error(`Container with ID ${containerId} not found`);
        return;
      }
  
      this.renderListsPage();
    }
  
    async renderListsPage() {
      try {
        this.container.innerHTML = `
          <div class="lists-container">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h1 class="h3 mb-0">Email Lists</h1>
              <button id="create-list-btn" class="btn btn-primary">
                <i class="bi bi-plus-circle me-1"></i> Create List
              </button>
            </div>
            
            <div class="card shadow mb-4">
              <div class="card-header py-3">
                <h6 class="m-0 font-weight-bold text-primary">All Lists</h6>
              </div>
              <div class="card-body">
                <div id="lists-table-container">
                  <div class="d-flex justify-content-center">
                    <div class="spinner-border" role="status">
                      <span class="visually-hidden">Loading...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- List Modal -->
          <div class="modal fade" id="listModal" tabindex="-1" aria-labelledby="listModalLabel" aria-hidden="true">
            <div class="modal-dialog">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="listModalLabel">Create List</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <form id="list-form">
                    <div class="mb-3">
                      <label for="list-name" class="form-label">List Name</label>
                      <input type="text" class="form-control" id="list-name" required>
                    </div>
                    
                    <div class="mb-3">
                      <label for="list-description" class="form-label">Description</label>
                      <textarea class="form-control" id="list-description" rows="3"></textarea>
                    </div>
                  </form>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                  <button type="button" class="btn btn-primary" id="save-list-btn">Save List</button>
                </div>
              </div>
            </div>
          </div>

          <!-- View Members Modal -->
          <div class="modal fade" id="membersModal" tabindex="-1" aria-labelledby="membersModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="membersModalLabel">List Members</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <div class="d-flex justify-content-between mb-3">
                    <span id="members-count" class="text-muted">Loading...</span>
                    <button id="add-members-btn" class="btn btn-sm btn-outline-primary">
                      <i class="bi bi-person-plus me-1"></i> Add Members
                    </button>
                  </div>
                  <div id="members-list-container">
                    <div class="d-flex justify-content-center">
                      <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  </div>
                  <div id="members-pagination" class="d-flex justify-content-center mt-3">
                    <!-- Pagination will be added here -->
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Add Members Modal -->
          <div class="modal fade" id="addMembersModal" tabindex="-1" aria-labelledby="addMembersModalLabel" aria-hidden="true">
            <div class="modal-dialog">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="addMembersModalLabel">Add Members to List</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <div class="mb-3">
                    <label for="member-search" class="form-label">Search Subscribers</label>
                    <div class="input-group mb-3">
                      <input type="text" class="form-control" id="member-search" placeholder="Search by email">
                      <button class="btn btn-outline-secondary" type="button" id="search-members-btn">
                        <i class="bi bi-search"></i>
                      </button>
                    </div>
                  </div>
                  <div id="subscriber-selection-container" class="mb-3">
                    <div class="alert alert-info">
                      <i class="bi bi-info-circle me-2"></i>
                      Search for subscribers to add to this list.
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                  <button type="button" class="btn btn-primary" id="confirm-add-members-btn">Add Selected</button>
                </div>
              </div>
            </div>
          </div>
        `;
  
        // Add event listeners
        document.getElementById('create-list-btn').addEventListener('click', () => this.showListModal());
        document.getElementById('save-list-btn').addEventListener('click', () => this.saveList());
        
        // Load lists
        await this.loadLists();
        
      } catch (error) {
        console.error('Error rendering lists:', error);
        this.container.innerHTML = `
          <div class="alert alert-danger">
            Error loading lists: ${error.message}
          </div>
        `;
      }
    }
    
    async loadLists() {
      try {
        const db = firebase.firestore();
        const listsSnapshot = await db.collection('lists')
          .orderBy('name')
          .get();
        
        const tableContainer = document.getElementById('lists-table-container');
        
        if (listsSnapshot.empty) {
          tableContainer.innerHTML = `
            <div class="text-center py-5">
              <p class="text-muted mb-0">No lists yet</p>
              <p class="text-muted">Click "Create List" to get started</p>
            </div>
          `;
          return;
        }
        
        // Create lists table
        tableContainer.innerHTML = `
          <div class="table-responsive">
            <table class="table table-bordered" id="lists-table" width="100%" cellspacing="0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Subscribers</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        `;
        
        const tableBody = document.querySelector('#lists-table tbody');
        
        listsSnapshot.forEach(doc => {
          const list = doc.data();
          const row = document.createElement('tr');
          
          // Name
          const nameCell = document.createElement('td');
          nameCell.textContent = list.name;
          row.appendChild(nameCell);
          
          // Description
          const descriptionCell = document.createElement('td');
          descriptionCell.textContent = list.description || '-';
          row.appendChild(descriptionCell);
          
          // Subscribers Count
          const subscribersCell = document.createElement('td');
          subscribersCell.textContent = list.subscriberCount || 0;
          row.appendChild(subscribersCell);
          
          // Created
          const createdCell = document.createElement('td');
          if (list.createdAt) {
            const date = new Date(list.createdAt.seconds * 1000);
            createdCell.textContent = date.toLocaleDateString();
          } else {
            createdCell.textContent = '-';
          }
          row.appendChild(createdCell);
          
          // Actions
          const actionsCell = document.createElement('td');
          
          // View Members button
          const membersBtn = document.createElement('button');
          membersBtn.className = 'btn btn-sm btn-outline-info me-1';
          membersBtn.innerHTML = '<i class="bi bi-people"></i>';
          membersBtn.title = 'View Members';
          membersBtn.addEventListener('click', () => this.viewListMembers(doc.id, list.name));
          actionsCell.appendChild(membersBtn);
          
          // Edit button
          const editBtn = document.createElement('button');
          editBtn.className = 'btn btn-sm btn-outline-primary me-1';
          editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
          editBtn.title = 'Edit List';
          editBtn.addEventListener('click', () => this.editList(doc.id));
          actionsCell.appendChild(editBtn);
          
          // Delete button
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'btn btn-sm btn-outline-danger';
          deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
          deleteBtn.title = 'Delete List';
          deleteBtn.addEventListener('click', () => this.deleteList(doc.id));
          actionsCell.appendChild(deleteBtn);
          
          row.appendChild(actionsCell);
          
          tableBody.appendChild(row);
        });
        
      } catch (error) {
        console.error('Error loading lists:', error);
        document.getElementById('lists-table-container').innerHTML = `
          <div class="alert alert-danger">
            Error loading lists: ${error.message}
          </div>
        `;
      }
    }
    
    showListModal(listId = null) {
      this.editingList = listId;
      
      // Reset form
      document.getElementById('list-form').reset();
      
      // Update modal title
      const modalTitle = document.getElementById('listModalLabel');
      modalTitle.textContent = listId ? 'Edit List' : 'Create List';
      
      if (listId) {
        // Load list data for editing
        this.loadListData(listId);
      }
      
      // Show modal
      const modal = new bootstrap.Modal(document.getElementById('listModal'));
      modal.show();
    }
    
    async loadListData(listId) {
      try {
        const db = firebase.firestore();
        const listDoc = await db.collection('lists').doc(listId).get();
        
        if (!listDoc.exists) {
          console.error('List not found');
          return;
        }
        
        const list = listDoc.data();
        
        // Fill form fields
        document.getElementById('list-name').value = list.name || '';
        document.getElementById('list-description').value = list.description || '';
        
      } catch (error) {
        console.error('Error loading list data:', error);
      }
    }
    
    async saveList() {
      try {
        // Validate form
        const form = document.getElementById('list-form');
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        
        // Get form values
        const name = document.getElementById('list-name').value;
        const description = document.getElementById('list-description').value;
        
        // Prepare list data
        const listData = {
          name,
          description
        };
        
        const db = firebase.firestore();
        
        if (this.editingList) {
          // Update existing list
          await db.collection('lists').doc(this.editingList).update({
            ...listData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          // Create new list
          await db.collection('lists').add({
            ...listData,
            subscriberCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
        
        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('listModal')).hide();
        
        // Reload lists
        this.loadLists();
        
        // Show success message
        alert(this.editingList ? 'List updated successfully' : 'List created successfully');
        
      } catch (error) {
        console.error('Error saving list:', error);
        alert(`Error: ${error.message}`);
      }
    }
    
    async deleteList(listId) {
      try {
        // Load list data
        const db = firebase.firestore();
        const listDoc = await db.collection('lists').doc(listId).get();
        
        if (!listDoc.exists) {
          console.error('List not found');
          return;
        }
        
        const list = listDoc.data();
        
        // Check if the list is used in campaigns or workflows
        const campaignsSnapshot = await db.collection('campaigns')
          .where('listIds', 'array-contains', listId)
          .limit(1)
          .get();
          
        if (!campaignsSnapshot.empty) {
          alert('This list is in use by one or more campaigns and cannot be deleted.');
          return;
        }
          
        const workflowsSnapshot = await db.collection('workflows')
          .where('steps.listId', '==', listId)
          .limit(1)
          .get();
          
        if (!workflowsSnapshot.empty) {
          alert('This list is in use by one or more workflows and cannot be deleted.');
          return;
        }
        
        // Confirm deletion
        const confirmDelete = window.confirm(`Delete the list "${list.name}"? This action cannot be undone.`);
        
        if (!confirmDelete) {
          return;
        }
        
        // Get list members
        const membersSnapshot = await db.collection('lists')
          .doc(listId)
          .collection('members')
          .get();
        
        // Use a batch to update subscribers and delete the list
        const batch = db.batch();
        let batchCount = 0;
        let currentBatch = db.batch();
        const batchSize = 400; // Firestore batch limit is 500
        
        // Process members
        for (const memberDoc of membersSnapshot.docs) {
          const subscriberId = memberDoc.id;
          
          // Remove member from list
          currentBatch.delete(memberDoc.ref);
          batchCount++;
          
          // Update subscriber's listIds
          currentBatch.update(db.collection('subscribers').doc(subscriberId), {
            listIds: firebase.firestore.FieldValue.arrayRemove(listId)
          });
          batchCount++;
          
          if (batchCount >= batchSize) {
            // Commit batch and start a new one
            await currentBatch.commit();
            currentBatch = db.batch();
            batchCount = 0;
          }
        }
        
        // Delete the list
        currentBatch.delete(db.collection('lists').doc(listId));
        batchCount++;
        
        // Commit final batch
        if (batchCount > 0) {
          await currentBatch.commit();
        }
        
        // Reload lists
        this.loadLists();
        
        // Show success message
        alert('List deleted successfully');
        
      } catch (error) {
        console.error('Error deleting list:', error);
        alert(`Error: ${error.message}`);
      }
    }
    
    async editList(listId) {
      this.showListModal(listId);
    }
    
    async viewListMembers(listId, listName) {
      this.currentListId = listId;
      this.currentPage = 1;
      this.itemsPerPage = 10;
      
      // Update modal title
      document.getElementById('membersModalLabel').textContent = `Members of "${listName}"`;
      
      // Show modal
      const modal = new bootstrap.Modal(document.getElementById('membersModal'));
      modal.show();
      
      // Set up add members button
      const addMembersBtn = document.getElementById('add-members-btn');
      addMembersBtn.onclick = () => this.showAddMembersModal(listId, listName);
      
      // Load members
      await this.loadListMembers(listId);
    }
    
    async loadListMembers(listId, page = 1) {
      try {
        const membersContainer = document.getElementById('members-list-container');
        membersContainer.innerHTML = `
          <div class="d-flex justify-content-center">
            <div class="spinner-border" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          </div>
        `;
        
        const db = firebase.firestore();
        
        // Get total count first
        const countSnapshot = await db.collection('lists')
          .doc(listId)
          .collection('members')
          .get();
        
        const totalMembers = countSnapshot.size;
        document.getElementById('members-count').textContent = `${totalMembers} members`;
        
        if (totalMembers === 0) {
          membersContainer.innerHTML = `
            <div class="text-center py-3">
              <p class="text-muted mb-0">No members in this list</p>
              <p class="text-muted">Click "Add Members" to add subscribers to this list</p>
            </div>
          `;
          document.getElementById('members-pagination').innerHTML = '';
          return;
        }
        
        // Calculate pagination
        const offset = (page - 1) * this.itemsPerPage;
        const limit = this.itemsPerPage;
        
        // Get members with pagination
        let memberQuery = db.collection('lists')
          .doc(listId)
          .collection('members');
          
        // Use limit/offset or cursor approach depending on your Firebase version
        if (offset > 0) {
          // For older Firebase versions without offset
          const cursorSnapshot = await memberQuery.limit(offset).get();
          if (cursorSnapshot.size >= offset) {
            const lastDoc = cursorSnapshot.docs[cursorSnapshot.size - 1];
            memberQuery = memberQuery.startAfter(lastDoc).limit(limit);
          } else {
            memberQuery = memberQuery.limit(limit);
          }
        } else {
          memberQuery = memberQuery.limit(limit);
        }
        
        const membersSnapshot = await memberQuery.get();
        
        // Get member IDs
        const memberIds = membersSnapshot.docs.map(doc => doc.id);
        
        if (memberIds.length === 0) {
          membersContainer.innerHTML = `
            <div class="text-center py-3">
              <p class="text-muted mb-0">No members found</p>
            </div>
          `;
          return;
        }
        
        // Get subscriber details
        const subscribers = [];
        
        // Process in batches of 10 (Firestore "in" query limit)
        for (let i = 0; i < memberIds.length; i += 10) {
          const batch = memberIds.slice(i, i + 10);
          const subscribersSnapshot = await db.collection('subscribers')
            .where(firebase.firestore.FieldPath.documentId(), 'in', batch)
            .get();
            
          subscribersSnapshot.forEach(doc => {
            subscribers.push({
              id: doc.id,
              ...doc.data()
            });
          });
        }
        
        // Create table
        membersContainer.innerHTML = `
          <div class="table-responsive">
            <table class="table table-sm table-bordered">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        `;
        
        const tableBody = membersContainer.querySelector('tbody');
        
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
          
          // Actions
          const actionsCell = document.createElement('td');
          
          // Remove button
          const removeBtn = document.createElement('button');
          removeBtn.className = 'btn btn-sm btn-outline-danger';
          removeBtn.innerHTML = '<i class="bi bi-person-dash"></i>';
          removeBtn.title = 'Remove from list';
          removeBtn.addEventListener('click', () => this.removeFromList(listId, subscriber.id));
          actionsCell.appendChild(removeBtn);
          
          row.appendChild(actionsCell);
          
          tableBody.appendChild(row);
        });
        
        // Update pagination
        this.updateMembersPagination(listId, page, totalMembers);
        
      } catch (error) {
        console.error('Error loading list members:', error);
        document.getElementById('members-list-container').innerHTML = `
          <div class="alert alert-danger">
            Error loading list members: ${error.message}
          </div>
        `;
      }
    }
    
    updateMembersPagination(listId, currentPage, totalMembers) {
      const totalPages = Math.ceil(totalMembers / this.itemsPerPage);
      const paginationContainer = document.getElementById('members-pagination');
      
      if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
      }
      
      let paginationHtml = `
        <nav>
          <ul class="pagination">
            <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
              <a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a>
            </li>
      `;
      
      // Show up to 5 page numbers
      const startPage = Math.max(1, currentPage - 2);
      const endPage = Math.min(totalPages, startPage + 4);
      
      for (let i = startPage; i <= endPage; i++) {
        paginationHtml += `
          <li class="page-item ${i === currentPage ? 'active' : ''}">
            <a class="page-link" href="#" data-page="${i}">${i}</a>
          </li>
        `;
      }
      
      paginationHtml += `
            <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
              <a class="page-link" href="#" data-page="${currentPage + 1}">Next</a>
            </li>
          </ul>
        </nav>
      `;
      
      paginationContainer.innerHTML = paginationHtml;
      
      // Add event listeners
      paginationContainer.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const page = parseInt(e.target.dataset.page);
          if (page >= 1 && page <= totalPages) {
            this.currentPage = page;
            this.loadListMembers(listId, page);
          }
        });
      });
    }
    
    async removeFromList(listId, subscriberId) {
      try {
        const confirmRemove = window.confirm('Remove this subscriber from the list?');
        
        if (!confirmRemove) {
          return;
        }
        
        const db = firebase.firestore();
        
        // Remove member from list
        await db.collection('lists')
          .doc(listId)
          .collection('members')
          .doc(subscriberId)
          .delete();
          
        // Update subscriber's listIds
        await db.collection('subscribers')
          .doc(subscriberId)
          .update({
            listIds: firebase.firestore.FieldValue.arrayRemove(listId)
          });
          
        // Update list subscriber count
        await db.collection('lists')
          .doc(listId)
          .update({
            subscriberCount: firebase.firestore.FieldValue.increment(-1),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          
        // Reload list members
        this.loadListMembers(listId, this.currentPage);
        
        // Show success message
        alert('Subscriber removed from list');
        
      } catch (error) {
        console.error('Error removing from list:', error);
        alert(`Error: ${error.message}`);
      }
    }
    
    showAddMembersModal(listId, listName) {
      // Update modal title
      document.getElementById('addMembersModalLabel').textContent = `Add Members to "${listName}"`;
      
      // Reset search
      document.getElementById('member-search').value = '';
      document.getElementById('subscriber-selection-container').innerHTML = `
        <div class="alert alert-info">
          <i class="bi bi-info-circle me-2"></i>
          Search for subscribers to add to this list.
        </div>
      `;
      
      // Set up search button
      const searchBtn = document.getElementById('search-members-btn');
      searchBtn.onclick = () => this.searchSubscribers(listId);
      
      // Set up add members button
      const addBtn = document.getElementById('confirm-add-members-btn');
      addBtn.onclick = () => this.addMembersToList(listId);
      
      // Set up enter key in search field
      document.getElementById('member-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.searchSubscribers(listId);
        }
      });
      
      // Show modal
      const modal = new bootstrap.Modal(document.getElementById('addMembersModal'));
      modal.show();
    }
    
    async searchSubscribers(listId) {
      try {
        const searchTerm = document.getElementById('member-search').value.trim();
        
        if (!searchTerm) {
          alert('Please enter a search term');
          return;
        }
        
        const selectionContainer = document.getElementById('subscriber-selection-container');
        selectionContainer.innerHTML = `
          <div class="d-flex justify-content-center">
            <div class="spinner-border" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          </div>
        `;
        
        const db = firebase.firestore();
        
        // First get current list members
        const membersSnapshot = await db.collection('lists')
          .doc(listId)
          .collection('members')
          .get();
          
        const existingMembers = new Set();
        membersSnapshot.forEach(doc => {
          existingMembers.add(doc.id);
        });
        
        // Search subscribers
        const searchSnapshot = await db.collection('subscribers')
          .where('email', '>=', searchTerm)
          .where('email', '<=', searchTerm + '\uf8ff')
          .limit(20)
          .get();
          
        if (searchSnapshot.empty) {
          selectionContainer.innerHTML = `
            <div class="alert alert-warning">
              <i class="bi bi-exclamation-circle me-2"></i>
              No subscribers found matching "${searchTerm}".
            </div>
          `;
          return;
        }
        
        // Display results with checkboxes
        selectionContainer.innerHTML = `
          <div class="list-group">
            ${searchSnapshot.docs.map(doc => {
              const subscriber = doc.data();
              const isExistingMember = existingMembers.has(doc.id);
              
              return `
                <div class="list-group-item">
                  <div class="form-check">
                    <input class="form-check-input subscriber-checkbox" type="checkbox" value="${doc.id}" id="subscriber-${doc.id}" ${isExistingMember ? 'checked disabled' : ''}>
                    <label class="form-check-label" for="subscriber-${doc.id}">
                      ${subscriber.email} ${subscriber.name ? `(${subscriber.name})` : ''}
                      ${isExistingMember ? '<span class="badge bg-info ms-2">Already in list</span>' : ''}
                    </label>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
        
      } catch (error) {
        console.error('Error searching subscribers:', error);
        document.getElementById('subscriber-selection-container').innerHTML = `
          <div class="alert alert-danger">
            Error searching subscribers: ${error.message}
          </div>
        `;
      }
    }
    
    async addMembersToList(listId) {
      try {
        // Get selected subscribers
        const checkboxes = document.querySelectorAll('.subscriber-checkbox:checked:not(:disabled)');
        
        if (checkboxes.length === 0) {
          alert('Please select at least one subscriber to add');
          return;
        }
        
        const subscriberIds = Array.from(checkboxes).map(cb => cb.value);
        
        const db = firebase.firestore();
        
        // Add in batches
        let addedCount = 0;
        let batch = db.batch();
        let batchCount = 0;
        const batchSize = 400; // Firestore batch limit is 500
        
        for (const subscriberId of subscriberIds) {
          // Add to list
          batch.set(
            db.collection('lists').doc(listId).collection('members').doc(subscriberId),
            {
              subscriberId,
              addedAt: firebase.firestore.FieldValue.serverTimestamp()
            }
          );
          batchCount++;
          
          // Update subscriber's listIds
          batch.update(
            db.collection('subscribers').doc(subscriberId),
            {
                listIds: firebase.firestore.FieldValue.arrayUnion(listId)
            }
          );
          batchCount++;
          
          addedCount++;
          
          if (batchCount >= batchSize) {
            // Commit batch and start a new one
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        }
        
        // Commit final batch
        if (batchCount > 0) {
          await batch.commit();
        }
        
        // Update list subscriber count
        await db.collection('lists').doc(listId).update({
          subscriberCount: firebase.firestore.FieldValue.increment(addedCount),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('addMembersModal')).hide();
        
        // Reload list members
        this.loadListMembers(listId, 1); // Go back to first page
        
        // Show success message
        alert(`${addedCount} subscribers added to the list`);
        
      } catch (error) {
        console.error('Error adding members to list:', error);
        alert(`Error: ${error.message}`);
      }
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
 
 // Make it globally available
 window.EmailLists = EmailLists;