(function(){
  const articlesCollection = db.collection('articles');
  const sectionsCollection = db.collection('sections');

  class Top10Generator {
    async render(containerId){
      const container = document.getElementById(containerId);
      if(!container) return;
      container.innerHTML = this.getHTML();
      await this.loadCategories();
      document.getElementById('generate-top10-btn').addEventListener('click', () => this.handleGenerate());
    }

    getHTML(){
      return `
      <div class="section-container">
        <h3>Top 10 Article Generator</h3>
        <div class="mb-3">
          <label for="top10-topic" class="form-label">Topic</label>
          <input type="text" id="top10-topic" class="form-control" placeholder="AI Chrome extensions" />
        </div>
        <div class="mb-3">
          <label for="top10-category" class="form-label">Category</label>
          <select id="top10-category" class="form-select"></select>
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="top10-publish">
          <label class="form-check-label" for="top10-publish">Publish immediately</label>
        </div>
        <button type="button" class="btn btn-primary" id="generate-top10-btn">Generate Article</button>
        <div id="top10-status" class="mt-3"></div>
        <div id="top10-preview" class="mt-4"></div>
      </div>`;
    }

    async loadCategories(){
      const select = document.getElementById('top10-category');
      try {
        const snap = await sectionsCollection.where('active','==',true).orderBy('name').get();
        select.innerHTML = snap.docs.map(doc => `<option value="${doc.id}">${doc.data().name}</option>`).join('');
      } catch(err) {
        console.error('Error loading categories', err);
        select.innerHTML = '<option value="">Uncategorized</option>';
      }
    }

    estimateReadingTime(html){
      if(!html) return 0;
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const text = temp.textContent || temp.innerText || '';
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      return Math.max(1, Math.ceil(words / 225));
    }

    async handleGenerate(){
      const topicInput = document.getElementById('top10-topic');
      const category = document.getElementById('top10-category').value;
      const publish = document.getElementById('top10-publish').checked;
      const statusEl = document.getElementById('top10-status');
      const previewEl = document.getElementById('top10-preview');
      const topic = topicInput.value.trim();
      if(!topic){
        statusEl.innerHTML = '<div class="text-danger">Please enter a topic.</div>';
        return;
      }
      statusEl.innerHTML = 'Generating article... <span class="spinner-border spinner-border-sm"></span>';
      previewEl.innerHTML = '';
      try {
        const token = await firebase.auth().currentUser.getIdToken();
        const response = await fetch('https://us-central1-trendingtech-daily.cloudfunctions.net/generateTopTenArticle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ topic })
        });
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        const data = await response.json();
        const readingTime = this.estimateReadingTime(data.content);
        const articleData = {
          title: data.title,
          slug: data.slug,
          content: data.content,
          excerpt: data.excerpt,
          tags: data.tags || [],
          featuredImage: data.items && data.items[0] ? data.items[0].imageUrl : '',
          imageAltText: data.items && data.items[0] ? data.items[0].imageAltText : '',
          category,
          published: publish,
          readingTimeMinutes: readingTime,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (publish) {
          articleData.publishedAt = firebase.firestore.FieldValue.serverTimestamp();
        }
        await articlesCollection.add(articleData);
        if (publish) {
          const viewUrl = `/${category}/${data.slug}`;
          statusEl.innerHTML = `<div class="text-success">Article generated and published. <a href="${viewUrl}" target="_blank">View</a></div>`;
        } else {
          statusEl.innerHTML = '<div class="text-success">Article generated and saved.</div>';
        }
        previewEl.innerHTML = `
          <article>
            <header class="article-header mb-3">
              <h1 class="article-title">${data.title}</h1>
            </header>
            <div class="article-body-content">${data.content}</div>
          </article>`;
      } catch(err){
        console.error('Error generating top 10 article', err);
        statusEl.innerHTML = '<div class="text-danger">Failed to generate article.</div>';
      }
    }
  }

  window.Top10Generator = Top10Generator;
})();
