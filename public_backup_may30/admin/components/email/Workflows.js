// Workflows.js - Email workflow automation component

class EmailWorkflows {
    constructor() {
      this.container = null;
      this.templates = [];
      this.lists = [];
      this.subscribers = [];
      this.editingWorkflow = null;
    }
  
    render(containerId) {
      this.container = document.getElementById(containerId);
      
      if (!this.container) {
        console.error(`Container with ID ${containerId} not found`);
        return;
      }
  
      this.renderWorkflowsList();
    }
  
    async renderWorkflowsList() {
      try {
        this.container.innerHTML = `
          <div class="workflows-container">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h1 class="h3 mb-0">Email Workflows</h1>
              <button id="create-workflow-btn" class="btn btn-primary">
                <i class="bi bi-plus-circle me-1"></i> Create Workflow
              </button>
            </div>
            
            <div class="card shadow mb-4">
              <div class="card-header py-3">
                <h6 class="m-0 font-weight-bold text-primary">All Workflows</h6>
              </div>
              <div class="card-body">
                <div id="workflows-table-container">
                  <div class="d-flex justify-content-center">
                    <div class="spinner-border" role="status">
                      <span class="visually-hidden">Loading...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Workflow Modal -->
          <div class="modal fade" id="workflowModal" tabindex="-1" aria-labelledby="workflowModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-xl modal-dialog-scrollable">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="workflowModalLabel">Create Workflow</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <form id="workflow-form">
                    <div class="row mb-3">
                      <div class="col-md-6">
                        <label for="workflow-name" class="form-label">Workflow Name</label>
                        <input type="text" class="form-control" id="workflow-name" required>
                      </div>
                      <div class="col-md-6">
                        <label for="workflow-trigger" class="form-label">Trigger</label>
                        <select class="form-select" id="workflow-trigger" required>
                          <option value="">Select a trigger</option>
                          <option value="new_registration">New Subscriber Registration</option>
                          <option value="list_subscription">List Subscription</option>
                          <option value="specific_date">Specific Date</option>
                        </select>
                      </div>
                    </div>
                    
                    <div id="trigger-options-container" class="mb-3" style="display: none;">
                      <!-- Dynamic trigger options will be added here -->
                    </div>
                    
                    <hr>
                    
                    <h5 class="mb-3">Workflow Steps</h5>
                    
                    <div id="workflow-steps-container" class="mb-3">
                      <div class="text-center py-3 border rounded mb-3">
                        <p class="text-muted mb-0">No steps added yet</p>
                        <p class="text-muted">Add a step below to get started</p>
                      </div>
                    </div>
                    
                    <div class="mb-3">
                      <div class="dropdown">
                        <button class="btn btn-outline-primary dropdown-toggle" type="button" id="addStepDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                          <i class="bi bi-plus-circle me-1"></i> Add Step
                        </button>
                        <ul class="dropdown-menu" aria-labelledby="addStepDropdown">
                          <li><a class="dropdown-item" href="#" data-step-type="send_email">Send Email</a></li>
                          <li><a class="dropdown-item" href="#" data-step-type="add_tag">Add Tag</a></li>
                          <li><a class="dropdown-item" href="#" data-step-type="remove_tag">Remove Tag</a></li>
                          <li><a class="dropdown-item" href="#" data-step-type="add_to_list">Add to List</a></li>
                          <li><a class="dropdown-item" href="#" data-step-type="remove_from_list">Remove from List</a></li>
                          <li><a class="dropdown-item" href="#" data-step-type="update_custom_field">Update Custom Field</a></li>
                        </ul>
                      </div>
                    </div>
                  </form>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                  <button type="button" class="btn btn-primary" id="save-workflow-btn">Save Workflow</button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Workflow Execution Modal -->
          <div class="modal fade" id="executionModal" tabindex="-1" aria-labelledby="executionModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="executionModalLabel">Workflow Executions</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <div id="executions-container">
                    <div class="d-flex justify-content-center">
                      <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Test Workflow Modal -->
          <div class="modal fade" id="testWorkflowModal" tabindex="-1" aria-labelledby="testWorkflowModalLabel" aria-hidden="true">
            <div class="modal-dialog">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="testWorkflowModalLabel">Test Workflow</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <form id="test-workflow-form">
                    <div class="mb-3">
                      <label for="test-subscriber" class="form-label">Select Subscriber</label>
                      <select class="form-select" id="test-subscriber" required>
                        <option value="">Select a subscriber</option>
                      </select>
                    </div>
                    
                    <div class="alert alert-info">
                      <i class="bi bi-info-circle me-2"></i>
                      This will run the workflow for the selected subscriber.
                    </div>
                  </form>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                  <button type="button" class="btn btn-primary" id="run-test-btn">Run Test</button>
                </div>
              </div>
            </div>
          </div>
        `;
  
        // Add event listeners
        document.getElementById('create-workflow-btn').addEventListener('click', () => this.showWorkflowModal());
        document.getElementById('save-workflow-btn').addEventListener('click', () => this.saveWorkflow());
        document.getElementById('run-test-btn').addEventListener('click', () => this.runWorkflowTest());
        
        // Add step type dropdown listeners
        document.querySelectorAll('.dropdown-item[data-step-type]').forEach(item => {
          item.addEventListener('click', (e) => {
            e.preventDefault();
            const stepType = e.target.dataset.stepType;
            this.addWorkflowStep(stepType);
          });
        });
        
        // Add trigger change listener
        document.getElementById('workflow-trigger').addEventListener('change', () => this.updateTriggerOptions());
        
        // Load data
        await Promise.all([
          this.loadTemplates(),
          this.loadLists(),
          this.loadSubscribers(),
          this.loadWorkflows()
        ]);
        
      } catch (error) {
        console.error('Error rendering workflows:', error);
        this.container.innerHTML = `
          <div class="alert alert-danger">
            Error loading workflows: ${error.message}
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
        
      } catch (error) {
        console.error('Error loading lists:', error);
      }
    }
    
    async loadSubscribers() {
      try {
        const db = firebase.firestore();
        // Only load a few subscribers for testing
        const subscribersSnapshot = await db.collection('subscribers')
          .where('status', '==', 'active')
          .limit(20)
          .get();
        
        this.subscribers = [];
        subscribersSnapshot.forEach(doc => {
          this.subscribers.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        // Populate test subscriber dropdown
        const subscriberSelect = document.getElementById('test-subscriber');
        subscriberSelect.innerHTML = '<option value="">Select a subscriber</option>';
        
        this.subscribers.forEach(subscriber => {
          const option = document.createElement('option');
          option.value = subscriber.id;
          option.textContent = subscriber.email;
          subscriberSelect.appendChild(option);
        });
        
      } catch (error) {
        console.error('Error loading subscribers:', error);
      }
    }
    
    async loadWorkflows() {
      try {
        const db = firebase.firestore();
        const workflowsSnapshot = await db.collection('workflows').get();
        
        const tableContainer = document.getElementById('workflows-table-container');
        
        if (workflowsSnapshot.empty) {
          tableContainer.innerHTML = `
            <div class="text-center py-5">
              <p class="text-muted mb-0">No workflows yet</p>
              <p class="text-muted">Click "Create Workflow" to get started</p>
            </div>
          `;
          return;
        }
        
        // Create workflows table
        tableContainer.innerHTML = `
          <div class="table-responsive">
            <table class="table table-bordered" id="workflows-table" width="100%" cellspacing="0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Steps</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        `;
        
        const tableBody = document.querySelector('#workflows-table tbody');
        
        workflowsSnapshot.forEach(doc => {
          const workflow = doc.data();
          const row = document.createElement('tr');
          
          // Name
          const nameCell = document.createElement('td');
          nameCell.textContent = workflow.name;
          row.appendChild(nameCell);
          
          // Trigger
          const triggerCell = document.createElement('td');
          triggerCell.textContent = this.getTriggerName(workflow.trigger);
          row.appendChild(triggerCell);
          
          // Status
          const statusCell = document.createElement('td');
          const statusBadge = document.createElement('span');
          statusBadge.className = `badge ${workflow.status === 'active' ? 'bg-success' : 'bg-secondary'}`;
          statusBadge.textContent = workflow.status || 'draft';
          statusCell.appendChild(statusBadge);
          row.appendChild(statusCell);
          
          // Steps
          const stepsCell = document.createElement('td');
          stepsCell.textContent = workflow.steps ? workflow.steps.length : 0;
          row.appendChild(stepsCell);
          
          // Created
          const createdCell = document.createElement('td');
          if (workflow.createdAt) {
            const date = new Date(workflow.createdAt.seconds * 1000);
            createdCell.textContent = date.toLocaleDateString();
          } else {
            createdCell.textContent = '-';
          }
          row.appendChild(createdCell);
          
          // Actions
          const actionsCell = document.createElement('td');
          
          // Edit button
          const editBtn = document.createElement('button');
          editBtn.className = 'btn btn-sm btn-outline-primary me-1';
          editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
          editBtn.addEventListener('click', () => this.editWorkflow(doc.id));
          actionsCell.appendChild(editBtn);
          
          // Toggle status button
          const toggleBtn = document.createElement('button');
          toggleBtn.className = `btn btn-sm btn-outline-${workflow.status === 'active' ? 'warning' : 'success'} me-1`;
          toggleBtn.innerHTML = workflow.status === 'active' ? '<i class="bi bi-pause-fill"></i>' : '<i class="bi bi-play-fill"></i>';
          toggleBtn.addEventListener('click', () => this.toggleWorkflowStatus(doc.id, workflow.status));
          actionsCell.appendChild(toggleBtn);
          
          // Executions button
          const executionsBtn = document.createElement('button');
          executionsBtn.className = 'btn btn-sm btn-outline-info me-1';
          executionsBtn.innerHTML = '<i class="bi bi-list-check"></i>';
          executionsBtn.addEventListener('click', () => this.viewWorkflowExecutions(doc.id));
          actionsCell.appendChild(executionsBtn);
          
          // Test button
          const testBtn = document.createElement('button');
          testBtn.className = 'btn btn-sm btn-outline-secondary me-1';
          testBtn.innerHTML = '<i class="bi bi-lightning"></i>';
          testBtn.addEventListener('click', () => this.showTestWorkflowModal(doc.id));
          actionsCell.appendChild(testBtn);
          
          // Delete button
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'btn btn-sm btn-outline-danger';
          deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
          deleteBtn.addEventListener('click', () => this.deleteWorkflow(doc.id));
          actionsCell.appendChild(deleteBtn);
          
          row.appendChild(actionsCell);
          
          tableBody.appendChild(row);
        });
        
      } catch (error) {
        console.error('Error loading workflows:', error);
        document.getElementById('workflows-table-container').innerHTML = `
          <div class="alert alert-danger">
            Error loading workflows: ${error.message}
          </div>
        `;
      }
    }
    
    showWorkflowModal(workflowId = null) {
      this.editingWorkflow = workflowId;
      
      // Reset form
      document.getElementById('workflow-form').reset();
      
      // Clear steps
      document.getElementById('workflow-steps-container').innerHTML = `
        <div class="text-center py-3 border rounded mb-3">
          <p class="text-muted mb-0">No steps added yet</p>
          <p class="text-muted">Add a step below to get started</p>
        </div>
      `;
      
      // Hide trigger options
      document.getElementById('trigger-options-container').style.display = 'none';
      
      // Update modal title
      const modalTitle = document.getElementById('workflowModalLabel');
      modalTitle.textContent = workflowId ? 'Edit Workflow' : 'Create Workflow';
      
      if (workflowId) {
        // Load workflow data for editing
        this.loadWorkflowData(workflowId);
      }
      
      // Show modal
      const modal = new bootstrap.Modal(document.getElementById('workflowModal'));
      modal.show();
    }
    
    async loadWorkflowData(workflowId) {
      try {
        const db = firebase.firestore();
        const workflowDoc = await db.collection('workflows').doc(workflowId).get();
        
        if (!workflowDoc.exists) {
          console.error('Workflow not found');
          return;
        }
        
        const workflow = workflowDoc.data();
        
        // Fill form fields
        document.getElementById('workflow-name').value = workflow.name || '';
        document.getElementById('workflow-trigger').value = workflow.trigger || '';
        
        // Update trigger options
        this.updateTriggerOptions(workflow);
        
        // Load steps
        if (workflow.steps && workflow.steps.length > 0) {
          const stepsContainer = document.getElementById('workflow-steps-container');
          stepsContainer.innerHTML = '';
          
          workflow.steps.forEach((step, index) => {
            this.renderWorkflowStep(step, index);
          });
        }
        
      } catch (error) {
        console.error('Error loading workflow data:', error);
      }
    }
    
    updateTriggerOptions(workflow = null) {
      const triggerType = document.getElementById('workflow-trigger').value;
      const optionsContainer = document.getElementById('trigger-options-container');
      
      if (!triggerType) {
        optionsContainer.style.display = 'none';
        return;
      }
      
      optionsContainer.style.display = 'block';
      
      switch (triggerType) {
        case 'list_subscription':
          optionsContainer.innerHTML = `
            <div class="row">
              <div class="col-md-6">
                <label for="trigger-list" class="form-label">List</label>
                <select class="form-select" id="trigger-list" required>
                  <option value="">Select a list</option>
                  ${this.lists.map(list => `
                    <option value="${list.id}">${list.name}</option>
                  `).join('')}
                </select>
                <div class="form-text">Workflow will be triggered when a subscriber is added to this list</div>
              </div>
            </div>
          `;
          
          // Set selected list if editing
          if (workflow && workflow.listId) {
            document.getElementById('trigger-list').value = workflow.listId;
          }
          break;
          
        case 'specific_date':
          optionsContainer.innerHTML = `
            <div class="row">
              <div class="col-md-6">
                <label for="trigger-date" class="form-label">Date</label>
                <input type="date" class="form-control" id="trigger-date" required>
              </div>
              <div class="col-md-6">
                <label for="trigger-list-date" class="form-label">Target List</label>
                <select class="form-select" id="trigger-list-date" required>
                  <option value="">Select a list</option>
                  ${this.lists.map(list => `
                    <option value="${list.id}">${list.name}</option>
                  `).join('')}
                </select>
              </div>
            </div>
            <div class="form-text">Workflow will be triggered on the specified date for all subscribers in the list</div>
          `;
          
          // Set selected date and list if editing
          if (workflow) {
            if (workflow.triggerDate) {
              const date = new Date(workflow.triggerDate.seconds * 1000);
              const dateStr = date.toISOString().split('T')[0];
              document.getElementById('trigger-date').value = dateStr;
            }
            
            if (workflow.listId) {
              document.getElementById('trigger-list-date').value = workflow.listId;
            }
          }
          break;
          
        default:
          optionsContainer.innerHTML = `
            <div class="alert alert-info">
              <i class="bi bi-info-circle me-2"></i>
              This workflow will be triggered automatically when a new subscriber registers.
            </div>
          `;
          break;
      }
    }
    
    addWorkflowStep(stepType) {
      const stepsContainer = document.getElementById('workflow-steps-container');
      
      // Remove placeholder if it exists
      const placeholder = stepsContainer.querySelector('.text-center.py-3.border');
      if (placeholder) {
        placeholder.remove();
      }
      
      // Generate unique step ID
      const stepId = `step_${Date.now()}`;
      const stepIndex = stepsContainer.childElementCount;
      
      // Create step object
      const step = {
        id: stepId,
        type: stepType,
        delay: 0
      };
      
      // Add additional properties based on step type
      switch (stepType) {
        case 'send_email':
          step.templateId = '';
          break;
        case 'add_tag':
        case 'remove_tag':
          step.tag = '';
          break;
        case 'add_to_list':
        case 'remove_from_list':
          step.listId = '';
          break;
        case 'update_custom_field':
          step.fieldName = '';
          step.fieldValue = '';
          break;
      }
      
      // Render the step
      this.renderWorkflowStep(step, stepIndex);
    }
    
    renderWorkflowStep(step, index) {
      const stepsContainer = document.getElementById('workflow-steps-container');
      
      const stepCard = document.createElement('div');
      stepCard.className = 'card mb-3';
      stepCard.dataset.stepId = step.id;
      stepCard.dataset.stepType = step.type;
      
      let stepTitle = '';
      let stepContent = '';
      
      // Build step header and content based on type
      switch (step.type) {
        case 'send_email':
          stepTitle = 'Send Email';
          stepContent = `
            <div class="mb-3">
              <label for="step-${step.id}-template" class="form-label">Email Template</label>
              <select class="form-control step-template" id="step-${step.id}-template" data-step-id="${step.id}" required>
                <option value="">Select a template</option>
                ${this.templates.map(template => `
                  <option value="${template.id}" ${step.templateId === template.id ? 'selected' : ''}>${template.name}</option>
                `).join('')}
              </select>
            </div>
          `;
          break;
          
        case 'add_tag':
        case 'remove_tag':
          stepTitle = step.type === 'add_tag' ? 'Add Tag' : 'Remove Tag';
          stepContent = `
            <div class="mb-3">
              <label for="step-${step.id}-tag" class="form-label">Tag</label>
              <input type="text" class="form-control step-tag" id="step-${step.id}-tag" data-step-id="${step.id}" value="${step.tag || ''}" required>
            </div>
          `;
          break;
          
        case 'add_to_list':
        case 'remove_from_list':
          stepTitle = step.type === 'add_to_list' ? 'Add to List' : 'Remove from List';
          stepContent = `
            <div class="mb-3">
              <label for="step-${step.id}-list" class="form-label">List</label>
              <select class="form-control step-list" id="step-${step.id}-list" data-step-id="${step.id}" required>
                <option value="">Select a list</option>
                ${this.lists.map(list => `
                  <option value="${list.id}" ${step.listId === list.id ? 'selected' : ''}>${list.name}</option>
                `).join('')}
              </select>
            </div>
          `;
          break;
          
        case 'update_custom_field':
          stepTitle = 'Update Custom Field';
          stepContent = `
            <div class="mb-3">
              <div class="row">
                <div class="col">
                  <label for="step-${step.id}-field-name" class="form-label">Field Name</label>
                  <input type="text" class="form-control step-field-name" id="step-${step.id}-field-name" data-step-id="${step.id}" value="${step.fieldName || ''}" required>
                </div>
                <div class="col">
                  <label for="step-${step.id}-field-value" class="form-label">Field Value</label>
                  <input type="text" class="form-control step-field-value" id="step-${step.id}-field-value" data-step-id="${step.id}" value="${step.fieldValue || ''}" required>
                </div>
              </div>
            </div>
          `;
          break;
      }
      
      // Add common options (delay and conditions)
      stepContent += `
        <div class="row">
          <div class="col-md-6">
            <label for="step-${step.id}-delay" class="form-label">Delay</label>
            <div class="input-group">
              <input type="number" class="form-control step-delay" id="step-${step.id}-delay" data-step-id="${step.id}" value="${step.delay || 0}" min="0">
              <span class="input-group-text">seconds</span>
            </div>
            <div class="form-text">Optional delay before executing this step</div>
          </div>
          <div class="col-md-6">
            <label for="step-${step.id}-condition" class="form-label">Condition</label>
            <select class="form-control step-condition" id="step-${step.id}-condition" data-step-id="${step.id}">
              <option value="">No condition</option>
              <option value="previous_email_opened" ${step.condition === 'previous_email_opened' ? 'selected' : ''}>Previous Email Opened</option>
              <option value="previous_email_clicked" ${step.condition === 'previous_email_clicked' ? 'selected' : ''}>Previous Email Clicked</option>
              <option value="has_tag" ${step.condition === 'has_tag' ? 'selected' : ''}>Has Tag</option>
              <option value="in_list" ${step.condition === 'in_list' ? 'selected' : ''}>In List</option>
            </select>
            <div class="form-text">Optional condition for executing this step</div>
          </div>
        </div>
      `;
      
      // Create the step HTML
      stepCard.innerHTML = `
        <div class="card-header d-flex justify-content-between align-items-center">
          <h6 class="mb-0">Step ${index + 1}: ${stepTitle}</h6>
          <div>
            <button type="button" class="btn btn-sm btn-outline-danger step-delete-btn" data-step-id="${step.id}">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
        <div class="card-body">
          ${stepContent}
        </div>
      `;
      
      stepsContainer.appendChild(stepCard);
      
      // Add delete button event listener
      stepCard.querySelector('.step-delete-btn').addEventListener('click', () => {
        stepCard.remove();
        this.renumberSteps();
        
        // Show placeholder if no steps
        if (stepsContainer.childElementCount === 0) {
          stepsContainer.innerHTML = `
            <div class="text-center py-3 border rounded mb-3">
              <p class="text-muted mb-0">No steps added yet</p>
              <p class="text-muted">Add a step below to get started</p>
            </div>
          `;
        }
      });
    }
    
    renumberSteps() {
      const stepCards = document.querySelectorAll('#workflow-steps-container .card');
      stepCards.forEach((card, index) => {
        const header = card.querySelector('.card-header h6');
        const stepTitle = header.textContent.split(':')[1].trim();
        header.textContent = `Step ${index + 1}: ${stepTitle}`;
      });
    }
    
    async saveWorkflow() {
      try {
        // Validate form
        const form = document.getElementById('workflow-form');
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        
        // Get form values
        const name = document.getElementById('workflow-name').value;
        const trigger = document.getElementById('workflow-trigger').value;
        
        // Get trigger options
        let triggerOptions = {};
        
        if (trigger === 'list_subscription') {
          const listId = document.getElementById('trigger-list').value;
          if (!listId) {
            alert('Please select a list for the trigger');
            return;
          }
          triggerOptions.listId = listId;
        } else if (trigger === 'specific_date') {
          const dateInput = document.getElementById('trigger-date').value;
          const listId = document.getElementById('trigger-list-date').value;
          
          if (!dateInput) {
            alert('Please specify a trigger date');
            return;
          }
          
          if (!listId) {
            alert('Please select a target list');
            return;
          }
          
          triggerOptions.triggerDate = firebase.firestore.Timestamp.fromDate(new Date(dateInput));
          triggerOptions.listId = listId;
        }
        
        // Get workflow steps
        const steps = [];
        const stepCards = document.querySelectorAll('#workflow-steps-container .card');
        
        if (stepCards.length === 0) {
          alert('Please add at least one step to the workflow');
          return;
        }
        
        for (const card of stepCards) {
            const stepId = card.dataset.stepId;
            const stepType = card.dataset.stepType;
            
            // Create step object
            const step = {
              id: stepId,
              type: stepType,
              delay: parseInt(card.querySelector(`.step-delay`).value) || 0
            };
            
            // Get condition if any
            const conditionSelect = card.querySelector(`.step-condition`);
            if (conditionSelect && conditionSelect.value) {
              step.condition = conditionSelect.value;
            }
            
            // Add type-specific properties
            switch (stepType) {
              case 'send_email':
                const templateId = card.querySelector(`.step-template`).value;
                if (!templateId) {
                  alert(`Please select a template for step ${steps.length + 1}`);
                  return;
                }
                step.templateId = templateId;
                break;
                
              case 'add_tag':
              case 'remove_tag':
                const tag = card.querySelector(`.step-tag`).value;
                if (!tag) {
                  alert(`Please enter a tag for step ${steps.length + 1}`);
                  return;
                }
                step.tag = tag;
                break;
                
              case 'add_to_list':
              case 'remove_from_list':
                const listId = card.querySelector(`.step-list`).value;
                if (!listId) {
                  alert(`Please select a list for step ${steps.length + 1}`);
                  return;
                }
                step.listId = listId;
                break;
                
              case 'update_custom_field':
                const fieldName = card.querySelector(`.step-field-name`).value;
                const fieldValue = card.querySelector(`.step-field-value`).value;
                if (!fieldName) {
                  alert(`Please enter a field name for step ${steps.length + 1}`);
                  return;
                }
                step.fieldName = fieldName;
                step.fieldValue = fieldValue;
                break;
            }
            
            steps.push(step);
          }
          
          // Prepare workflow data
          const workflowData = {
            name,
            trigger,
            steps,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            ...triggerOptions
          };
          
          const db = firebase.firestore();
          
          if (this.editingWorkflow) {
            // Update existing workflow
            await db.collection('workflows').doc(this.editingWorkflow).update(workflowData);
          } else {
            // Create new workflow
            workflowData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            workflowData.status = 'draft';
            
            await db.collection('workflows').add(workflowData);
          }
          
          // Close modal
          bootstrap.Modal.getInstance(document.getElementById('workflowModal')).hide();
          
          // Reload workflows
          this.loadWorkflows();
          
          // Show success message
          alert(this.editingWorkflow ? 'Workflow updated successfully' : 'Workflow created successfully');
          
        } catch (error) {
          console.error('Error saving workflow:', error);
          alert(`Error: ${error.message}`);
        }
      }
      
      async toggleWorkflowStatus(workflowId, currentStatus) {
        try {
          const newStatus = currentStatus === 'active' ? 'paused' : 'active';
          
          const db = firebase.firestore();
          await db.collection('workflows').doc(workflowId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          
          // Reload workflows
          this.loadWorkflows();
          
          // Show success message
          alert(`Workflow ${newStatus === 'active' ? 'activated' : 'paused'} successfully`);
          
        } catch (error) {
          console.error('Error updating workflow status:', error);
          alert(`Error: ${error.message}`);
        }
      }
      
      async deleteWorkflow(workflowId) {
        try {
          // Get workflow data
          const db = firebase.firestore();
          const workflowDoc = await db.collection('workflows').doc(workflowId).get();
          
          if (!workflowDoc.exists) {
            console.error('Workflow not found');
            return;
          }
          
          const workflow = workflowDoc.data();
          
          // Confirm deletion
          const confirmDelete = window.confirm(`Delete workflow "${workflow.name}"? This action cannot be undone.`);
          
          if (!confirmDelete) {
            return;
          }
          
          // Check for active executions
          const executionsSnapshot = await db.collection('workflows')
            .doc(workflowId)
            .collection('executions')
            .where('status', '==', 'processing')
            .limit(1)
            .get();
          
          if (!executionsSnapshot.empty) {
            alert('This workflow has active executions and cannot be deleted. Please pause the workflow and try again later.');
            return;
          }
          
          // Delete the workflow
          await db.collection('workflows').doc(workflowId).delete();
          
          // Reload workflows
          this.loadWorkflows();
          
          // Show success message
          alert('Workflow deleted successfully');
          
        } catch (error) {
          console.error('Error deleting workflow:', error);
          alert(`Error: ${error.message}`);
        }
      }
      
      async editWorkflow(workflowId) {
        this.showWorkflowModal(workflowId);
      }
      
      async viewWorkflowExecutions(workflowId) {
        try {
          // Set loading state
          document.getElementById('executions-container').innerHTML = `
            <div class="d-flex justify-content-center">
              <div class="spinner-border" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
            </div>
          `;
          
          // Show modal
          const modal = new bootstrap.Modal(document.getElementById('executionModal'));
          modal.show();
          
          // Get workflow data
          const db = firebase.firestore();
          const workflowDoc = await db.collection('workflows').doc(workflowId).get();
          
          if (!workflowDoc.exists) {
            console.error('Workflow not found');
            return;
          }
          
          const workflow = workflowDoc.data();
          
          // Update modal title
          document.getElementById('executionModalLabel').textContent = `Executions for "${workflow.name}"`;
          
          // Get executions
          const executionsSnapshot = await db.collection('workflows')
            .doc(workflowId)
            .collection('executions')
            .orderBy('startedAt', 'desc')
            .limit(50)
            .get();
          
          if (executionsSnapshot.empty) {
            document.getElementById('executions-container').innerHTML = `
              <div class="text-center py-3">
                <p class="text-muted mb-0">No executions found for this workflow</p>
              </div>
            `;
            return;
          }
          
          // Format executions table
          let html = `
            <div class="table-responsive">
              <table class="table table-bordered table-sm">
                <thead>
                  <tr>
                    <th>Subscriber</th>
                    <th>Started</th>
                    <th>Current Step</th>
                    <th>Status</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
          `;
          
          for (const doc of executionsSnapshot.docs) {
            const execution = doc.data();
            
            // Get subscriber data
            let subscriberEmail = execution.subscriberId;
            
            if (execution.subscriberId) {
              const subscriberDoc = await db.collection('subscribers').doc(execution.subscriberId).get();
              if (subscriberDoc.exists) {
                subscriberEmail = subscriberDoc.data().email;
              }
            }
            
            // Format dates
            const startedDate = execution.startedAt 
              ? new Date(execution.startedAt.seconds * 1000).toLocaleString() 
              : 'N/A';
            
            const completedDate = execution.completedAt 
              ? new Date(execution.completedAt.seconds * 1000).toLocaleString() 
              : 'N/A';
            
            // Format status
            let statusBadge = '';
            switch (execution.status) {
              case 'processing':
                statusBadge = '<span class="badge bg-primary">Processing</span>';
                break;
              case 'completed':
                statusBadge = '<span class="badge bg-success">Completed</span>';
                break;
              case 'error':
                statusBadge = '<span class="badge bg-danger">Error</span>';
                break;
              default:
                statusBadge = `<span class="badge bg-secondary">${execution.status || 'Unknown'}</span>`;
            }
            
            html += `
              <tr>
                <td>${subscriberEmail}</td>
                <td>${startedDate}</td>
                <td>${(execution.currentStep || 0) + 1} of ${workflow.steps.length}</td>
                <td>${statusBadge}</td>
                <td>${execution.status === 'completed' ? completedDate : '-'}</td>
              </tr>
            `;
          }
          
          html += `
                </tbody>
              </table>
            </div>
          `;
          
          document.getElementById('executions-container').innerHTML = html;
          
        } catch (error) {
          console.error('Error loading workflow executions:', error);
          document.getElementById('executions-container').innerHTML = `
            <div class="alert alert-danger">
              Error loading executions: ${error.message}
            </div>
          `;
        }
      }
      
      showTestWorkflowModal(workflowId) {
        // Store workflow ID for test
        this.testWorkflowId = workflowId;
        
        // Reset form
        document.getElementById('test-workflow-form').reset();
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('testWorkflowModal'));
        modal.show();
      }
      
      async runWorkflowTest() {
        try {
          // Validate form
          const form = document.getElementById('test-workflow-form');
          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }
          
          const subscriberId = document.getElementById('test-subscriber').value;
          
          if (!subscriberId) {
            alert('Please select a subscriber');
            return;
          }
          
          if (!this.testWorkflowId) {
            alert('No workflow selected for testing');
            return;
          }
          
          // Trigger the workflow for the selected subscriber
          const db = firebase.firestore();
          
          // Create execution
          await db.collection('workflows')
            .doc(this.testWorkflowId)
            .collection('executions')
            .add({
              workflowId: this.testWorkflowId,
              subscriberId: subscriberId,
              status: 'processing',
              currentStep: 0,
              startedAt: firebase.firestore.FieldValue.serverTimestamp(),
              lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
          
          // Close modal
          bootstrap.Modal.getInstance(document.getElementById('testWorkflowModal')).hide();
          
          // Show success message
          alert('Test workflow execution started successfully. Check the executions tab to monitor progress.');
          
        } catch (error) {
          console.error('Error running test workflow:', error);
          alert(`Error: ${error.message}`);
        }
      }
      
      getTriggerName(trigger) {
        switch (trigger) {
          case 'new_registration':
            return 'New Registration';
          case 'list_subscription':
            return 'List Subscription';
          case 'specific_date':
            return 'Specific Date';
          default:
            return trigger;
        }
      }
    }
    window.EmailWorkflows = EmailWorkflows;