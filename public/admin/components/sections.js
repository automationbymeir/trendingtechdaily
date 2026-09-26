// sections.js - Handles the sections/categories management

// --- Initialization Check ---
// Prevents running the script's core logic multiple times if loaded accidentally
if (typeof window.sectionsManagerInitialized === 'undefined') {
    window.sectionsManagerInitialized = true;
    console.log("Initializing Sections Manager script...");

    // Use the global 'db' instance defined in dashboard.html
    // Ensure db is available globally before this script runs.
    if (typeof db === 'undefined') {
        console.error("Firestore 'db' instance is not available globally in sections.js!");
        // Optionally, provide a fallback or throw an error
        // For now, we log error and attempt to proceed, which might fail later.
    }

    const sectionsCollection = db.collection('sections');
    const articlesCollection = db.collection('articles'); // Assumes db is defined

    // Load the sections manager UI
    function loadSectionsManager() {
        console.log("Loading Sections Manager UI...");
        const contentArea = document.getElementById('content-area');
        if (!contentArea) {
            console.error("Content area not found for sections manager!");
            return;
        }

        // Create the sections management HTML
        const sectionsHTML = `
            <div class="section-container">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h3>Manage Sections</h3>
                    <button id="create-section-btn" class="btn btn-primary">
                        <i class="bi bi-plus-circle me-2"></i>New Section
                    </button>
                </div>

                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Slug</th>
                                <th>Display Order</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="sections-table-body">
                            <tr>
                                <td colspan="5" class="text-center">Loading sections...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Add the sections HTML to the content area
        contentArea.innerHTML = sectionsHTML;

        // Add event listener to the create section button
        const createBtn = document.getElementById('create-section-btn');
        if (createBtn) {
            createBtn.addEventListener('click', function() {
                loadSectionEditor();
            });
        } else {
            console.error("Create section button not found after render!");
        }

        // Load sections data
        loadSections();
    }

    // Function to load sections from Firestore
    function loadSections() {
        const tableBody = document.getElementById('sections-table-body');
        if (!tableBody) {
            console.error("Sections table body not found!");
            return; // Safety check
        }

        tableBody.innerHTML = `<tr><td colspan="5" class="text-center">Loading sections...</td></tr>`;

        // Get sections from Firestore
        sectionsCollection.orderBy('order', 'asc').get()
            .then((querySnapshot) => {
                if (querySnapshot.empty) {
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="5" class="text-center">No sections found. Create your first section!</td>
                        </tr>
                    `;
                    return;
                }

                let sectionsHTML = '';

                querySnapshot.forEach((doc) => {
                    const section = doc.data();
                    const statusBadge = section.active !== false
                        ? '<span class="badge bg-success">Active</span>'
                        : '<span class="badge bg-secondary">Inactive</span>';

                    sectionsHTML += `
                        <tr data-id="${doc.id}">
                            <td>${section.name || 'Unnamed Section'}</td>
                            <td>${section.slug || 'N/A'}</td>
                            <td>${section.order !== undefined ? section.order : 'N/A'}</td>
                            <td>${statusBadge}</td>
                            <td>
                                <button class="btn btn-sm btn-outline-primary edit-section-btn" data-id="${doc.id}">
                                    <i class="bi bi-pencil-square"></i> Edit
                                </button>
                                <button class="btn btn-sm btn-outline-danger delete-section-btn" data-id="${doc.id}">
                                    <i class="bi bi-trash"></i> Delete
                                </button>
                            </td>
                        </tr>
                    `;
                });

                tableBody.innerHTML = sectionsHTML;

                // Add event listeners AFTER table body is populated
                addSectionActionListeners();

            })
            .catch((error) => {
                console.error('Error loading sections:', error);
                if (tableBody) {
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="5" class="text-center text-danger">
                                Error loading sections: ${error.message}. Please try again.
                            </td>
                        </tr>
                    `;
                }
            });
    }

    // Helper to add listeners for edit/delete buttons
    function addSectionActionListeners() {
        document.querySelectorAll('.edit-section-btn').forEach(button => {
            button.addEventListener('click', function() {
                const sectionId = this.getAttribute('data-id');
                loadSectionEditor(sectionId);
            });
        });

        document.querySelectorAll('.delete-section-btn').forEach(button => {
            button.addEventListener('click', function() {
                const sectionId = this.getAttribute('data-id');
                confirmDeleteSection(sectionId);
            });
        });
    }


    // Function to load the section editor
    function loadSectionEditor(sectionId = null) {
        const contentArea = document.getElementById('content-area');
         if (!contentArea) {
            console.error("Content area not found for section editor!");
            return;
        }
        const isEditMode = !!sectionId;

        // Show loading state
        contentArea.innerHTML = `
            <div class="section-container">
                <div class="text-center p-5">Loading ${isEditMode ? 'editor' : 'new section form'}... <span class="spinner-border spinner-border-sm"></span></div>
            </div>
        `;

        // If editing, fetch the section data
        const fetchSection = isEditMode
            ? sectionsCollection.doc(sectionId).get()
                .then(doc => {
                    if (!doc.exists) {
                        throw new Error(`Section with ID ${sectionId} not found`);
                    }
                    return {
                        id: doc.id,
                        ...doc.data()
                    };
                })
            : Promise.resolve({ // Default values for new section
                name: '',
                slug: '',
                description: '',
                order: 0,
                active: true // Default to active
            });

        fetchSection
            .then(section => {
                // Generate HTML for the editor
                const editorHTML = `
                    <div class="section-container">
                        <div class="d-flex justify-content-between align-items-center mb-4">
                            <h3>${isEditMode ? 'Edit Section' : 'Create New Section'}</h3>
                            <button class="btn btn-outline-secondary" id="back-to-sections-list">
                                <i class="bi bi-arrow-left me-2"></i>Back to Sections List
                            </button>
                        </div>

                        <div class="card">
                            <div class="card-body">
                                <form id="section-form" novalidate>
                                    <div class="mb-3">
                                        <label for="name" class="form-label">Name <span class="text-danger">*</span></label>
                                        <input type="text" class="form-control" id="name" name="name" value="${section.name || ''}" required>
                                        <div class="invalid-feedback">Please provide a section name.</div>
                                    </div>

                                    <div class="mb-3">
                                        <label for="slug" class="form-label">Slug (URL path)</label>
                                        <input type="text" class="form-control" id="slug" name="slug" value="${section.slug || ''}" aria-describedby="slugHelp">
                                        <div id="slugHelp" class="form-text">Unique identifier for URLs. Leave blank to auto-generate from name. Use lowercase letters, numbers, and hyphens.</div>
                                    </div>

                                    <div class="mb-3">
                                        <label for="description" class="form-label">Description</label>
                                        <textarea class="form-control" id="description" name="description" rows="3">${section.description || ''}</textarea>
                                    </div>

                                    <div class="mb-3">
                                        <label for="order" class="form-label">Display Order</label>
                                        <input type="number" class="form-control" id="order" name="order" value="${section.order !== undefined ? section.order : 0}" min="0" step="1">
                                        <div class="form-text">Lower numbers appear first in lists.</div>
                                    </div>

                                    <div class="mb-3 form-check form-switch">
                                        <input type="checkbox" class="form-check-input" id="active" name="active" role="switch" ${section.active !== false ? 'checked' : ''}>
                                        <label class="form-check-label" for="active">Active (Visible to users)</label>
                                    </div>

                                    <input type="hidden" id="section-id" value="${section.id || ''}">

                                    <div class="d-flex justify-content-between align-items-center mt-4 border-top pt-3">
                                        <button type="button" class="btn btn-outline-secondary" id="cancel-edit-btn">Cancel</button>
                                        <button type="submit" class="btn btn-primary" id="save-section-btn">
                                            <span class="spinner-border spinner-border-sm d-none me-1" role="status" aria-hidden="true"></span>
                                            ${isEditMode ? 'Update Section' : 'Create Section'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                `;

                // Update content
                contentArea.innerHTML = editorHTML;

                // Add event listeners AFTER editor HTML is rendered
                addEditorEventListeners(isEditMode);

            })
            .catch(error => {
                console.error('Error loading section editor:', error);
                contentArea.innerHTML = `
                    <div class="section-container">
                        <div class="d-flex justify-content-between align-items-center mb-4">
                            <h3>Error</h3>
                            <button class="btn btn-outline-secondary" id="back-to-sections-list">
                                <i class="bi bi-arrow-left me-2"></i>Back to Sections List
                            </button>
                        </div>
                        <div class="alert alert-danger">
                            <p>Failed to load the section editor: ${error.message}</p>
                            <p>Please try again later.</p>
                        </div>
                    </div>
                `;
                const backBtn = document.getElementById('back-to-sections-list');
                if (backBtn) {
                    backBtn.addEventListener('click', () => loadSectionsManager());
                }
            });
    }

    // Helper function to add listeners for the editor form
    function addEditorEventListeners(isEditMode) {
        const backToListBtn = document.getElementById('back-to-sections-list');
        if (backToListBtn) {
            backToListBtn.addEventListener('click', () => {
                 // Check for unsaved changes if needed
                loadSectionsManager();
            });
        }

        const cancelBtn = document.getElementById('cancel-edit-btn');
         if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                // Check for unsaved changes if needed
                loadSectionsManager();
            });
        }


        // Auto-generate slug from name
        const nameField = document.getElementById('name');
        const slugField = document.getElementById('slug');
        if (nameField && slugField) {
            nameField.addEventListener('blur', (e) => {
                if (!slugField.value.trim()) { // Only generate if slug is empty
                    const name = e.target.value;
                    slugField.value = createSlug(name);
                }
            });
        }

        // Handle form submission
        const sectionForm = document.getElementById('section-form');
        if (sectionForm) {
            sectionForm.addEventListener('submit', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent default browser validation UI

                if (!sectionForm.checkValidity()) {
                     sectionForm.classList.add('was-validated'); // Show Bootstrap validation feedback
                     return;
                }

                // Get form values
                const id = document.getElementById('section-id').value;
                const name = document.getElementById('name').value.trim();
                let slug = document.getElementById('slug').value.trim();
                 if (!slug) { // Generate slug if still empty after trim
                    slug = createSlug(name);
                 } else {
                    slug = createSlug(slug); // Ensure slug is always formatted correctly
                 }

                const description = document.getElementById('description').value.trim();
                const orderInput = document.getElementById('order').value;
                const order = orderInput === '' ? 0 : parseInt(orderInput, 10) || 0; // Default to 0 if empty or invalid number
                const active = document.getElementById('active').checked;

                // Disable button and show spinner
                const saveBtn = document.getElementById('save-section-btn');
                const spinner = saveBtn.querySelector('.spinner-border');
                saveBtn.disabled = true;
                if(spinner) spinner.classList.remove('d-none');


                // Save section
                saveSection({
                    id,
                    name,
                    slug,
                    description,
                    order,
                    active
                }, saveBtn); // Pass button to re-enable later
            });
        } else {
            console.error("Section form not found!");
        }
    }


    // Function to save a section
    function saveSection(section, saveBtn) {
        const isNewSection = !section.id;
        let savePromise;

        // Prepare section data
        const sectionData = {
            name: section.name,
            slug: section.slug, // Ensure slug is properly formatted
            description: section.description,
            order: section.order,
            active: section.active,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Add createdAt for new sections
        if (isNewSection) {
            sectionData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        }

        // --- Slug uniqueness check (Optional but Recommended) ---
        // Before saving, check if the slug already exists for a *different* section
        sectionsCollection.where('slug', '==', sectionData.slug).get()
            .then(snapshot => {
                let slugExists = false;
                snapshot.forEach(doc => {
                    if (doc.id !== section.id) { // Check if it's a different section
                        slugExists = true;
                    }
                });

                if (slugExists) {
                    throw new Error(`Slug "${sectionData.slug}" is already in use. Please choose a unique slug.`);
                }

                // --- Save to Firestore ---
                if (isNewSection) {
                    console.log("Adding new section:", sectionData);
                    return sectionsCollection.add(sectionData);
                } else {
                    console.log("Updating section:", section.id, sectionData);
                    return sectionsCollection.doc(section.id).update(sectionData);
                }
            })
            .then(() => {
                alert(`Section ${isNewSection ? 'created' : 'updated'} successfully!`);
                loadSectionsManager(); // Reload the list view
            })
            .catch(error => {
                console.error('Error saving section:', error);
                alert(`Error saving section: ${error.message}`);
            })
            .finally(() => {
                 // Re-enable button and hide spinner regardless of outcome
                 if (saveBtn) {
                    const spinner = saveBtn.querySelector('.spinner-border');
                    saveBtn.disabled = false;
                    if (spinner) spinner.classList.add('d-none');
                 }
            });
    }

    // Function to confirm section deletion
    function confirmDeleteSection(sectionId) {
        const sectionRow = document.querySelector(`tr[data-id="${sectionId}"]`);
        const sectionName = sectionRow ? sectionRow.cells[0].textContent : 'this section';

        if (!confirm(`Are you sure you want to delete "${sectionName}"?\nThis action cannot be undone.`)) {
            return;
        }

         // Disable delete button temporarily
        const deleteBtn = sectionRow ? sectionRow.querySelector('.delete-section-btn') : null;
        if(deleteBtn) deleteBtn.disabled = true;


        // Check if section has articles before deleting
        articlesCollection.where('category', '==', sectionId).limit(1).get()
            .then(snapshot => {
                if (!snapshot.empty) {
                    // Re-enable button
                    if(deleteBtn) deleteBtn.disabled = false;
                    alert(`Cannot delete section "${sectionName}" because it still has articles associated with it. Please reassign or delete the articles first.`);
                    return Promise.reject(new Error('Section has associated articles.')); // Stop the process
                }

                // Proceed with deletion
                console.log("Deleting section:", sectionId);
                return sectionsCollection.doc(sectionId).delete();
            })
            .then(() => {
                alert(`Section "${sectionName}" deleted successfully!`);
                // Remove row directly instead of full reload for smoother UX
                if (sectionRow) {
                    sectionRow.remove();
                     // Check if table is now empty
                     const tableBody = document.getElementById('sections-table-body');
                     if (tableBody && !tableBody.hasChildNodes()) {
                         loadSections(); // Reload to show "No sections found" message
                     }
                } else {
                    loadSections(); // Fallback to full reload if row not found
                }
            })
            .catch(error => {
                 // Only show error if it's not the "has articles" error we handled
                 if (error.message !== 'Section has associated articles.') {
                    console.error('Error deleting section:', error);
                    alert(`Error deleting section: ${error.message}`);
                 }
                 // Re-enable button on error
                 if(deleteBtn) deleteBtn.disabled = false;
            });
    }

    // Utility function to create a URL-friendly slug
    function createSlug(text) {
        if (!text) return '';
        return text.toString().toLowerCase()
            .normalize('NFD') // split an accented letter in the base letter and the acent
            .replace(/[\u0300-\u036f]/g, '') // remove all previously split accents
            .replace(/\s+/g, '-')           // Replace spaces with -
            .replace(/[^\w\-]+/g, '')       // Remove all non-word chars except -
            .replace(/\-\-+/g, '-')         // Replace multiple - with single -
            .replace(/^-+/, '')             // Trim - from start of text
            .replace(/-+$/, '');            // Trim - from end of text
    }

    // Make the primary function globally accessible IF this script initialized correctly
    window.loadSectionsManager = loadSectionsManager;

} else {
    console.warn("Sections Manager script already initialized. Skipping re-initialization.");
} // End of initialization check