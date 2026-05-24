(function(){
  const articlesCollection = db.collection('articles');
  class BulkGenerator {
    constructor(){
      this.maxPrompts = 10;
    }
    render(containerId){
      const container = document.getElementById(containerId);
      if(!container) return;
      container.innerHTML = `
        <div class="section-container">
          <h3>Bulk Article Generator</h3>
          <p>Enter up to 10 prompts. Each will generate a draft article with three AI images.</p>
          <div id="bulk-prompts"></div>
          <button type="button" class="btn btn-secondary mb-3" id="bulk-add-prompt-btn">Add Prompt</button>
          <button type="button" class="btn btn-primary mb-3" id="bulk-generate-btn">Generate Articles</button>
          <div id="bulk-results"></div>
        </div>`;
      this.promptsContainer = container.querySelector('#bulk-prompts');
      this.resultsEl = container.querySelector('#bulk-results');
      container.querySelector('#bulk-add-prompt-btn').addEventListener('click', () => this.addPromptField());
      container.querySelector('#bulk-generate-btn').addEventListener('click', () => this.handleGenerate());
      this.addPromptField();
    }
    addPromptField(){
      if(this.promptsContainer.children.length >= this.maxPrompts) return;
      const idx = this.promptsContainer.children.length + 1;
      const wrapper = document.createElement('div');
      wrapper.className = 'mb-2';
      wrapper.innerHTML = `
        <label class="form-label">Prompt ${idx}</label>
        <textarea class="form-control prompt-input" rows="2" placeholder="Enter prompt for article ${idx}"></textarea>`;
      this.promptsContainer.appendChild(wrapper);
    }
    estimateReadingTime(html){
      if(!html) return 0;
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const text = temp.textContent || temp.innerText || '';
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      return Math.max(1, Math.ceil(words / 225));
    }
    createSlug(text){
      if(!text) return '';
      return text.toString().toLowerCase()
        .replace(/\s+/g,'-')
        .replace(/[^\w\-]+/g,'')
        .replace(/\-\-+/g,'-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
    }
    async handleGenerate(){
      const prompts = Array.from(this.promptsContainer.querySelectorAll('.prompt-input'))
        .map(t => t.value.trim()).filter(Boolean).slice(0,this.maxPrompts);
      if(!prompts.length){
        this.resultsEl.innerHTML = '<div class="text-danger">Please enter at least one prompt.</div>';
        return;
      }
      this.resultsEl.innerHTML = '';
      for(const [i,prompt] of prompts.entries()){
        const status = document.createElement('div');
        status.textContent = `Generating article ${i+1}...`;
        this.resultsEl.appendChild(status);
        try{
          const generateContent = functions.httpsCallable('generateArticleContent');
          const contentRes = await generateContent({prompt});
          const articleData = contentRes.data || {};
          const images = [];
          for(let imgIdx=0; imgIdx<3; imgIdx++){
            try{
              const generateImage = functions.httpsCallable('generateArticleImage');
              const imgRes = await generateImage({prompt: articleData.title, articleTitle: articleData.title});
              if(imgRes.data && imgRes.data.imageUrl) images.push(imgRes.data.imageUrl);
            } catch(imgErr){
              console.error('Image generation error', imgErr);
            }
          }
          const slug = articleData.slug || this.createSlug(articleData.title);
          const readingTime = this.estimateReadingTime(articleData.content);
          await articlesCollection.add({
            title: articleData.title,
            slug,
            content: articleData.content,
            excerpt: articleData.excerpt || '',
            tags: articleData.tags || [],
            category: articleData.category || '',
            featuredImage: images[0] || '',
            images,
            imageAltText: articleData.imageAltText || '',
            published: false,
            readingTimeMinutes: readingTime,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          status.textContent = `Article ${i+1} generated and saved.`;
        } catch(err){
          console.error('Generation error', err);
          status.textContent = `Article ${i+1} failed: ${err.message}`;
        }
      }
    }
  }
  window.BulkGenerator = BulkGenerator;
})();
