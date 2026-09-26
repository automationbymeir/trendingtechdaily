// editor.js - Handles the article editor functionality and rich text editing utilities

// Function to initialize the editor for the dashboard
function initEditor(articleId = null) {
    // This function is called from articles.js when the Edit or New Article button is clicked
    // Implementation is in the articles.js file as it requires article data and categories
    
    if (typeof openArticleEditor === 'function') {
        openArticleEditor(articleId);
    } else {
        console.error('The openArticleEditor function is not defined in articles.js');
        alert('Editor component error: Could not initialize the article editor.');
    }
}

// Initialize Quill editor with specified options
function initializeEditor(elementId, content = '') {
    // Load Quill CSS dynamically if not already present
    if (!document.querySelector('link[href*="quill"]')) {
        const quillCSS = document.createElement('link');
        quillCSS.rel = 'stylesheet';
        quillCSS.href = 'https://cdn.quilljs.com/1.3.6/quill.snow.css';
        document.head.appendChild(quillCSS);
    }
    
    // Check if Quill is loaded
    if (typeof Quill === 'undefined') {
        // Load Quill script dynamically
        return new Promise((resolve) => {
            const quillScript = document.createElement('script');
            quillScript.src = 'https://cdn.quilljs.com/1.3.6/quill.min.js';
            quillScript.onload = function() {
                const quill = createQuillInstance(elementId, content);
                resolve(quill);
            };
            document.head.appendChild(quillScript);
        });
    } else {
        // Quill is already loaded
        const quill = createQuillInstance(elementId, content);
        return Promise.resolve(quill);
    }
}

// Helper function to create the Quill instance
function createQuillInstance(elementId, content) {
    const quill = new Quill(elementId, {
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                ['blockquote', 'code-block'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['link', 'image'],
                ['clean']
            ]
        },
        theme: 'snow'
    });
    
    // Set initial content if provided
    if (content) {
        quill.root.innerHTML = content;
    }
    
    // Set up image upload handler
    handleEditorImageUpload(quill);
    
    return quill;
}

// Handle image uploads in the editor
function handleEditorImageUpload(quill) {
    // Get the toolbar and add a custom button
    const toolbar = quill.getModule('toolbar');
    toolbar.addHandler('image', () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();
        
        input.onchange = () => {
            if (input.files.length > 0) {
                const file = input.files[0];
                uploadImageForEditor(file, quill);
            }
        };
    });
}

// Upload image for the editor
function uploadImageForEditor(file, quill) {
    // Create a storage reference
    const storageRef = storage.ref();
    const fileRef = storageRef.child(`article-images/${Date.now()}_${file.name}`);
    
    // Show loading indicator
    const range = quill.getSelection(true);
    quill.insertText(range.index, 'Uploading image... ', 'italic', true);
    
    // Upload file
    fileRef.put(file)
        .then(snapshot => {
            return snapshot.ref.getDownloadURL();
        })
        .then(url => {
            // Delete the placeholder text
            quill.deleteText(range.index, 'Uploading image... '.length);
            
            // Insert the image
            quill.insertEmbed(range.index, 'image', url);
            
            // Move cursor past the image
            quill.setSelection(range.index + 1);
        })
        .catch(error => {
            console.error('Error uploading image:', error);
            
            // Delete the placeholder text
            quill.deleteText(range.index, 'Uploading image... '.length);
            
            // Insert error message
            quill.insertText(range.index, 'Error uploading image. Try again.', 'bold', 'red');
        });
}

// Function to get the content from a Quill editor
function getEditorContent(quill) {
    return quill.root.innerHTML;
}

// Function to check if the editor has content
function hasEditorContent(quill) {
    const text = quill.getText().trim();
    return text.length > 0;
}

// Function to destroy a Quill editor instance (cleanup)
function destroyEditor(quill) {
    if (quill) {
        const container = quill.container;
        if (container && container.parentNode) {
            container.innerHTML = '';
        }
    }
}