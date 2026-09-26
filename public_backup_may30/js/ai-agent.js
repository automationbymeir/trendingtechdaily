// public/js/ai-agent.js

class AITechAgent {
    constructor() {
      this.isOpen = false;
      this.isTyping = false;
      this.latestArticles = []; // Will be populated by loadGeneralSiteContext
      this.conversationHistory = [];
      this.maxHistoryLength = 10; // Store last 5 pairs of user/assistant messages
      this.functions = null; // For Firebase callable functions (tools)
      this.db = null; // For Firestore
      // This is your main AI endpoint (likely an HTTP v2 function via Express)
      this.generativeApiEndpoint = 'https://us-central1-trendingtech-daily.cloudfunctions.net/api/generateAIAgentResponse';

      // DOM Elements - will be assigned in init()
      this.button = null;
      this.chat = null;
      this.closeBtn = null;
      this.messagesContainer = null;
      this.inputForm = null;
      this.inputField = null;
      this.sendButton = null;
    }

    init() {
      this.button = document.getElementById('aiAgentButton');
      this.chat = document.getElementById('aiAgentChat');
      this.closeBtn = document.getElementById('aiChatClose');
      this.messagesContainer = document.getElementById('aiChatMessages');
      this.inputForm = document.getElementById('aiInputForm');
      this.inputField = document.getElementById('aiInputField');
      this.sendButton = document.getElementById('aiSendButton');

      if (!this.button || !this.chat || !this.closeBtn || !this.messagesContainer || !this.inputForm || !this.inputField || !this.sendButton) {
        console.error("AI Agent: One or more required DOM elements are missing. Agent cannot initialize.");
        return;
      }

      this.button.addEventListener('click', () => this.toggle());
      this.closeBtn.addEventListener('click', () => this.close());
      this.inputForm.addEventListener('submit', (e) => this.handleSubmit(e));
      this.inputField.addEventListener('input', () => this.handleInputTyping());

      document.querySelectorAll('.ai-quick-action').forEach(btn => {
        btn.addEventListener('click', (e) => this.handleQuickAction(e.target.dataset.action));
      });

      this.initializeFirebaseServices(); // Initialize Firebase services
      this.loadGeneralSiteContext();   // Load general context like articles

      // Add initial welcome message if messages container is empty
      if (this.messagesContainer.children.length <= 1) { // Check if only the default message is there or it's empty
          // The initial message is already in your HTML, so we might not need to add it here
          // unless your HTML structure is different.
      }
      console.log("AI Tech Agent initialized and UI listeners attached.");
    }

    initializeFirebaseServices() {
      // Assuming Firebase is initialized globally (e.g., in app-base.js using compat libraries)
      if (typeof firebase !== 'undefined') {
        if (firebase.app && firebase.app()) { // Check if Firebase app is initialized
          if (typeof firebase.functions === 'function') {
            this.functions = firebase.functions(); // For tool calls
            console.log("AI Agent: Firebase Functions service initialized.");
          } else {
            console.warn("AI Agent: Firebase Functions service not available.");
          }
          if (typeof firebase.firestore === 'function') {
            this.db = firebase.firestore(); // For Firestore
            console.log("AI Agent: Firestore service initialized.");
          } else {
            console.warn("AI Agent: Firestore service not available.");
          }
        } else {
           console.error('AI Agent: Firebase app not initialized. Ensure app-base.js loads and initializes Firebase first.');
        }
      } else {
        console.error('AI Agent: Firebase core not available. Ensure Firebase SDKs are loaded.');
      }
    }

    toggle() {
      this.isOpen ? this.close() : this.open();
    }

    open() {
      if (!this.chat || !this.button) return;
      this.isOpen = true;
      this.chat.classList.add('open');
      this.button.classList.add('active');
      this.inputField.focus();
      // Stop pulse on open if your CSS does this, or manage class here
      // this.button.classList.remove('ai-agent-pulse');
      console.log("AI Agent: Chat opened.");
    }

    close() {
      if (!this.chat || !this.button) return;
      this.isOpen = false;
      this.chat.classList.remove('open');
      this.button.classList.remove('active');
      // Start pulse on close if desired
      // this.button.classList.add('ai-agent-pulse');
      console.log("AI Agent: Chat closed.");
    }

    handleInputTyping() {
      if (!this.inputField || !this.sendButton) return;
      this.sendButton.disabled = this.inputField.value.trim().length === 0;
    }

    async handleSubmit(e) {
      e.preventDefault();
      if (!this.inputField) return;
      const userMessage = this.inputField.value.trim();
      if (!userMessage) return;

      this.addMessage(userMessage, 'user');
      this.inputField.value = '';
      this.handleInputTyping(); // Disable send button

      this.conversationHistory.push({ role: 'user', content: userMessage });
      if (this.conversationHistory.length > this.maxHistoryLength * 2) { // *2 because of user/assistant pairs
        this.conversationHistory.splice(0, 2); // Remove the oldest pair
      }

      this.showTyping();
      try {
        await this.processMessageWithServer(userMessage);
      } catch (error) {
        console.error('Error processing message with server:', error);
        this.addMessage('Sorry, an unexpected error occurred. Please try again.', 'bot');
      } finally {
        this.hideTyping();
      }
    }

    handleQuickAction(actionText) {
      if (!actionText || !this.inputField || !this.inputForm) return;
      this.inputField.value = actionText;
      this.handleInputTyping(); // Enable send button
      this.inputForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      console.log("AI Agent: Quick action submitted -", actionText);
    }

    addMessage(content, sender) {
      if (!this.messagesContainer) return;

      const messageWrapper = document.createElement('div');
      messageWrapper.className = `ai-message ${sender}`;

      const bubbleDiv = document.createElement('div');
      bubbleDiv.className = 'ai-message-bubble';
      bubbleDiv.innerHTML = this.formatMessage(content); // Use formatMessage for potential Markdown

      messageWrapper.appendChild(bubbleDiv);
      this.messagesContainer.appendChild(messageWrapper);
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    // This is the method from your class structure.
    // It sends data to the main AI HTTP endpoint.
    async processMessageWithServer(userMessage) {
        const contextForBackend = await this.buildContextForBackend();
        let payload = {
            prompt: userMessage,
            conversationHistory: this.conversationHistory,
            context: contextForBackend,
            // Inform the backend about client-side tools it can request
            available_tools: ['searchWeb', 'getFinnhubStockData', 'analyzeStockTrends', 'generateArticleImage']
        };

        console.log("AI Agent: Sending payload to generative API:", payload);

        try {
            let response = await fetch(this.generativeApiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
                throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
            }
            let result = await response.json();
            console.log("AI Agent: Received response from generative API:", result);


            // Handle multiple tool calls
            if (result.success && result.tools_to_call && Array.isArray(result.tools_to_call)) {
                this.addMessage('🔍 Gathering information from multiple sources...', 'bot-info'); // Use bot-info class for styling
                const toolOutputs = [];
                for (const tool of result.tools_to_call) {
                    try {
                        let toolResultData = await this.executeSingleTool(tool.name, tool.parameters);
                        toolOutputs.push({ tool_name: tool.name, output: toolResultData });
                    } catch (toolError) {
                        console.error(`Error executing tool ${tool.name}:`, toolError);
                        toolOutputs.push({ tool_name: tool.name, output: { error: toolError.message } });
                    }
                }
                payload.tool_outputs = toolOutputs;

                // Call AI again with tool outputs
                response = await fetch(this.generativeApiEndpoint, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                if (!response.ok) {
                  const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
                  throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
                }
                result = await response.json();
                console.log("AI Agent: Received final response after multiple tools:", result);
            }
            // Handle single tool call
            else if (result.success && result.tool_to_call) {
                this.addMessage('📊 Fetching specific data...', 'bot-info');
                let toolOutputData;
                try {
                    toolOutputData = await this.executeSingleTool(result.tool_to_call, result.parameters);
                } catch (toolError) {
                    console.error(`Error executing tool ${result.tool_to_call}:`, toolError);
                    toolOutputData = { error: toolError.message };
                }

                payload.tool_outputs = [{ tool_name: result.tool_to_call, output: toolOutputData }];

                // Call AI again with tool output
                response = await fetch(this.generativeApiEndpoint, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                if (!response.ok) {
                  const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
                  throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
                }
                result = await response.json();
                console.log("AI Agent: Received final response after single tool:", result);
            }

            // Display final message
            this.removeInfoMessage(); // Remove any "Gathering data..." messages
            if (result.success && result.message) {
                this.addEnhancedMessage(result.message, 'bot'); // Use addEnhancedMessage from your class
                this.conversationHistory.push({ role: 'assistant', content: result.message });
            } else {
                throw new Error(result.error || result.message || 'Invalid response structure from server.');
            }

        } catch (error) {
            this.removeInfoMessage();
            console.error('Error in AI processing chain:', error);
            this.addMessage(`⚠️ An error occurred: ${error.message}. Please try again.`, 'bot');
        }
    }

    // This method is called by processMessageWithServer to execute Firebase Callable functions.
    async executeSingleTool(toolName, parameters) {
        if (!this.functions) {
            throw new Error("Firebase Functions service is not initialized. Cannot call tools.");
        }
        console.log(`AI Agent: Attempting to execute tool: ${toolName}`, parameters);
        const callableTool = this.functions.httpsCallable(toolName);
        try {
            const result = await callableTool(parameters);
            console.log(`AI Agent: Result from tool ${toolName}:`, result.data);
            return result.data; // Callable functions return data in result.data
        } catch (error) {
            console.error(`Error calling tool ${toolName} via Firebase Functions:`, error);
            // Firebase callable errors have a 'message' and sometimes 'details'
            throw new Error(error.message || `Failed to execute tool ${toolName}`);
        }
    }

    // --- The rest of your methods from the provided AITechAgent class ---
    // (runWebSearchTool, runStockAnalysisTool, runStockTrendAnalysis, runImageGenerationTool)
    // These should call executeSingleTool or be integrated into it if they are all callable functions.
    // For simplicity, if these are just different callable function names, executeSingleTool handles them.
    // If they had different logic (e.g. some direct fetch, some callable), you'd keep them separate.
    // Based on your structure, they seem to be wrappers for callable tools.

    /**
     * Web Search Tool (Example of calling executeSingleTool)
     */
    async runWebSearchTool(parameters) {
        console.log(`AI Agent: Running web search for: ${parameters.query}`);
        return this.executeSingleTool('searchWeb', parameters);
    }

    /**
     * Enhanced Stock Analysis Tool (Example of calling executeSingleTool)
     */
    async runStockAnalysisTool(symbols, includeAnalysis = false) {
        console.log(`AI Agent: Running enhanced stock analysis for: ${symbols.join(', ')}`);
        return this.executeSingleTool('getFinnhubStockData', { symbols, includeAnalysis });
    }

    /**
     * Stock Trend Analysis Tool (Example of calling executeSingleTool)
     */
    async runStockTrendAnalysis(parameters) {
        console.log(`AI Agent: Analyzing ${parameters.sector} trends`);
        return this.executeSingleTool('analyzeStockTrends', parameters);
    }

    /**
     * Image Generation Tool (Example of calling executeSingleTool)
     */
    async runImageGenerationTool(parameters) {
        console.log(`AI Agent: Generating image with prompt: ${parameters.prompt}`);
        return this.executeSingleTool('generateArticleImage', parameters);
    }

    addEnhancedMessage(content, sender) { // From your provided class
        if (!this.messagesContainer) return;
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `ai-message ${sender}`;
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'ai-message-bubble';
        if (content.includes('```json') || content.includes('```')) {
            bubbleDiv.innerHTML = this.formatStructuredContent(content);
        } else {
            bubbleDiv.innerHTML = this.formatMessage(content);
        }
        messageWrapper.appendChild(bubbleDiv);
        this.messagesContainer.appendChild(messageWrapper);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    formatStructuredContent(content) { // From your provided class
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let formatted = content;
        formatted = formatted.replace(codeBlockRegex, (match, lang, code) => {
            return `<pre class="ai-code-block"><code class="language-${lang || 'text'}">${this.escapeHtml(code.trim())}</code></pre>`;
        });
        return this.formatMessage(formatted);
    }

    escapeHtml(text) { // From your provided class
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatMessage(content) { // Standard message formatter
      let html = content;
      // Basic XSS protection by escaping HTML characters first
      // html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      // Markdown to HTML (simplified)
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold
      html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');       // Italics
      // Links: [text](url) - ensure it handles existing HTML links gracefully if AI generates them
      html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      html = html.replace(/\n/g, '<br>'); // Newlines
      return html;
    }

    showTyping() {
      if (this.isTyping || !this.messagesContainer) return;
      this.isTyping = true;
      const indicator = document.getElementById('aiTypingIndicator');
      if (indicator) indicator.remove(); // Remove if already exists

      const typingMessageDiv = document.createElement('div');
      typingMessageDiv.className = 'ai-message bot';
      typingMessageDiv.id = 'aiTypingIndicator';
      const bubbleDiv = document.createElement('div');
      bubbleDiv.className = 'ai-message-bubble ai-typing-indicator';
      bubbleDiv.innerHTML = `<span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span>`;
      typingMessageDiv.appendChild(bubbleDiv);
      this.messagesContainer.appendChild(typingMessageDiv);
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    hideTyping() {
      this.isTyping = false;
      const indicator = document.getElementById('aiTypingIndicator');
      if (indicator) indicator.remove();
    }

    addInfoMessage(text) {
        this.removeInfoMessage(); // Remove any existing info message
        const infoDiv = document.createElement('div');
        infoDiv.className = 'ai-message bot-info'; // Special class for info
        infoDiv.id = 'aiInfoMessage';
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'ai-message-bubble';
        bubbleDiv.textContent = text;
        infoDiv.appendChild(bubbleDiv);
        this.messagesContainer.appendChild(infoDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    removeInfoMessage() {
        const infoMsg = document.getElementById('aiInfoMessage');
        if (infoMsg) infoMsg.remove();
    }

    // --- Context Building Methods (from your class structure) ---
    async buildContextForBackend() {
        const pageInfo = this.getCurrentPageInfo();
        let currentStockData = null;
        if (pageInfo.url && pageInfo.url.includes('/stock-data')) { // Ensure pageInfo.url is defined
            currentStockData = this.extractStockDataFromPage();
        }
        return {
            latestArticles: this.latestArticles,
            trendingTopics: this.getTrendingTopicsFromPage(),
            stockData: currentStockData,
            timestamp: new Date().toISOString(),
            pageSpecificContext: pageInfo,
            userAgent: navigator.userAgent,
            screenSize: { width: window.innerWidth, height: window.innerHeight }
        };
    }

    getCurrentPageInfo() {
      const pageInfo = { type: 'general', url: window.location.href, title: document.title, articleTitle: null, articleContentSample: null };
      const pathname = window.location.pathname.toLowerCase();

      if (pathname.includes('/article.html') || pathname.startsWith('/article/')) {
          pageInfo.type = 'article';
          const titleElement = document.querySelector('h1.article-title, article h1, .td-post-title .entry-title');
          const contentElement = document.querySelector('.article-body-content, .td-post-content, article .entry-content');
          if (titleElement) pageInfo.articleTitle = titleElement.innerText.trim();
          if (contentElement) pageInfo.articleContentSample = (contentElement.innerText || "").replace(/\s\s+/g, ' ').trim().substring(0, 1000);
      } else if (pathname === '/' || pathname.includes('/index.html') || pathname.includes('/home')) {
          pageInfo.type = 'homepage';
      } else if (pathname.includes('/podcasts.html')) {
          pageInfo.type = 'podcasts_page';
      } else if (pathname.includes('/stock-data')) {
          pageInfo.type = 'stock_data_page';
      }
      return pageInfo;
    }

    async loadGeneralSiteContext() {
      if (!this.db) {
          console.warn("AI Agent: Firestore (db) not initialized. Cannot load site context.");
          return;
      }
      try {
        // Example: Fetch latest 5 published articles
        const snapshot = await this.db.collection('articles')
                                     .where('published', '==', true)
                                     .orderBy('createdAt', 'desc')
                                     .limit(5)
                                     .get();
        this.latestArticles = snapshot.docs.map(doc => ({ 
            title: doc.data().title, 
            slug: doc.data().slug,
            // id: doc.id // if needed
        }));
        console.log("AI Agent: Loaded latest articles for context:", this.latestArticles);
      } catch (error) {
        console.error('AI Agent: Error loading site context:', error);
      }
    }
    
    getTrendingTopicsFromPage() { // From your provided class
      return Array.from(document.querySelectorAll('#categories-list li a, .trending-topics-list li a'))
                  .map(el => el.innerText.trim())
                  .slice(0, 5); // Get top 5
    }

    extractStockDataFromPage() { // From your provided class
        const stockCards = document.querySelectorAll('.stock-card'); // Ensure your page has these
        const stockData = [];
        stockCards.forEach(card => {
            const symbol = card.querySelector('h3')?.textContent?.trim();
            const price = card.querySelector('.stock-price')?.textContent?.trim();
            const change = card.querySelector('.stock-change')?.textContent?.trim();
            if (symbol && price) {
                stockData.push({ symbol, price, change });
            }
        });
        return stockData.length > 0 ? stockData : null;
    }
    
    initializeQuickActions() { // From your provided class
        // This method populates quick actions, but the event listener for them is in init()
        const quickActionsData = [
            { action: "What's trending in tech today?", icon: "📈" },
            { action: "Analyze AAPL, MSFT, GOOGL stocks", icon: "📊" },
            { action: "Latest AI breakthroughs", icon: "🤖" },
            { action: "Tech market analysis", icon: "💹" }
        ];
        const quickActionsContainer = document.querySelector('.ai-quick-actions'); // From your HTML
        if (quickActionsContainer) {
            quickActionsContainer.innerHTML = quickActionsData.map(qa =>
                `<button class="ai-quick-action" data-action="${qa.action}">${qa.icon} ${qa.action}</button>`
            ).join('');
            // Re-attach listeners if dynamically generated or ensure they are caught by delegation
            document.querySelectorAll('.ai-quick-action').forEach(btn => {
              // Remove old listener before adding new one to prevent duplicates if this is called multiple times
              btn.removeEventListener('click', this.handleQuickActionBound); 
              this.handleQuickActionBound = (e) => this.handleQuickAction(e.target.dataset.action); // Bind 'this'
              btn.addEventListener('click', this.handleQuickActionBound);
            });
        }
    }
}

// --- AIAgentBanner Class (for the pointing banner) ---
// This class manages the banner that points to the AI agent button.
class AIAgentBanner {
    constructor() {
      this.bannerContainer = document.getElementById('aiAgentBannerPointer'); // From your HTML
      this.dismissBtn = document.getElementById('aiAgentBannerDismiss');    // From your HTML
      this.aiAgentBtn = document.getElementById('aiAgentButton');           // From your HTML
      this.isAnimating = false;
      this.init();
    }

    init() {
      if (!this.bannerContainer || !this.aiAgentBtn) {
          console.warn("AI Agent Banner or AI Agent Button not found. Banner cannot initialize.");
          return;
      }
      if (this.shouldShowBanner()) {
        setTimeout(() => this.positionAndShowBanner(), 2000); // Delay showing
      }
      if (this.dismissBtn) {
        this.dismissBtn.addEventListener('click', () => this.dismissBanner());
      }
      // CTA button (aiAgentBannerCTA) is not in your provided HTML for the pointer banner, but good to have
      const ctaBtn = this.bannerContainer.querySelector('#aiAgentBannerCTA'); // Hypothetical CTA
      if (ctaBtn) {
        ctaBtn.addEventListener('click', () => this.openAIAgent());
      }

      window.addEventListener('resize', () => {
          if (this.bannerContainer.classList.contains('show')) {
              this.positionAndShowBanner(false);
          }
      });
      console.log("AIAgentBanner initialized.");
    }

    positionAndShowBanner(withAnimation = true) {
      if (!this.bannerContainer || !this.aiAgentBtn) return;
      const agentButtonRect = this.aiAgentBtn.getBoundingClientRect();
      this.bannerContainer.style.transition = 'none';
      this.bannerContainer.style.visibility = 'hidden';
      this.bannerContainer.style.display = 'flex'; // Assuming banner is flex
      const bannerRect = this.bannerContainer.getBoundingClientRect();
      const gap = 12;
      const arrowWidth = 12; // Assuming arrow element exists if needed by your CSS

      // Position logic (this may need adjustment based on your exact CSS for the pointer banner)
      // Example: position to the left of the button
      let finalLeft = agentButtonRect.left - bannerRect.width - arrowWidth - gap;
      let finalTop = agentButtonRect.top + (agentButtonRect.height / 2) - (bannerRect.height / 2);

      // Ensure it doesn't go off-screen
      if (finalLeft < 10) finalLeft = 10;
      if (finalTop < 10) finalTop = 10;
      if (finalTop + bannerRect.height > window.innerHeight - 10) {
          finalTop = window.innerHeight - 10 - bannerRect.height;
      }


      this.bannerContainer.style.top = `${finalTop}px`;
      this.bannerContainer.style.left = `${finalLeft}px`;
      this.bannerContainer.style.visibility = 'visible';

      if (withAnimation) {
          this.bannerContainer.offsetHeight; // Reflow
          this.bannerContainer.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out';
          this.bannerContainer.classList.add('show'); // Your CSS should define .show
      } else {
          this.bannerContainer.classList.add('show'); // Show without animation
      }
    }

    shouldShowBanner() {
      const dismissed = localStorage.getItem('aiAgentBannerDismissed');
      const dismissedTime = localStorage.getItem('aiAgentBannerDismissedTime');
      if (dismissed && dismissedTime) {
        const daysSinceDismissed = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24);
        return daysSinceDismissed > 7; // Show again after 7 days
      }
      const hasVisitedBefore = localStorage.getItem('hasVisitedTTD'); // Example flag
      if (!hasVisitedBefore) {
        localStorage.setItem('hasVisitedTTD', 'true');
        return false; // Don't show on very first visit
      }
      return true;
    }

    dismissBanner(isAutoDismiss = false) {
      if (this.isAnimating || !this.bannerContainer) return;
      this.isAnimating = true;

      this.bannerContainer.classList.remove('show');

      setTimeout(() => {
        this.bannerContainer.style.display = 'none';
        this.isAnimating = false;
      }, 500); // Match transition duration

      if (!isAutoDismiss) {
        localStorage.setItem('aiAgentBannerDismissed', 'true');
        localStorage.setItem('aiAgentBannerDismissedTime', Date.now().toString());
      }
    }

    openAIAgent() {
      this.dismissBanner(true); // Auto-dismiss when CTA is clicked
      if (window.aiTechAgent && typeof window.aiTechAgent.open === 'function') {
        window.aiTechAgent.open();
      } else if (this.aiAgentBtn) {
        this.aiAgentBtn.click(); // Fallback if global agent not found
      }
    }
}


// --- Global Initializer for AI Agent and its Banner ---
document.addEventListener('DOMContentLoaded', () => {
  // Initialize AI Tech Agent
  if (document.getElementById('aiAgentContainer')) { // Check if agent HTML exists
    window.aiTechAgent = new AITechAgent();
    window.aiTechAgent.init(); // This was missing in your class structure
  } else {
    console.warn("AI Agent container not found. AI Tech Agent not initialized.");
  }

  // Initialize AI Agent Pointer Banner
  if (document.getElementById('aiAgentBannerPointer')) { // Check if banner HTML exists
    new AIAgentBanner();
  } else {
    console.warn("AI Agent Banner Pointer container not found. Banner not initialized.");
  }

  // Inject AI Agent styles (from your provided styles.css, slightly adapted)
  // This ensures core styles are present even if external CSS fails or is modified.
  if (!document.getElementById('aiAgentCoreStyles')) {
      const styleSheet = document.createElement("style");
      styleSheet.id = 'aiAgentCoreStyles';
      // Using the styles you provided for .ai-code-block, etc.
      styleSheet.innerHTML = `
          .ai-code-block {
              background-color: #1e1e1e; color: #d4d4d4; padding: 12px;
              border-radius: 6px; overflow-x: auto; margin: 8px 0;
              font-family: 'Fira Code', monospace; font-size: 13px; line-height: 1.5;
          }
          .ai-message-bubble table {
              width: 100%; border-collapse: collapse; margin: 8px 0;
          }
          .ai-message-bubble th, .ai-message-bubble td {
              padding: 8px; text-align: left; border: 1px solid #e0e0e0;
          }
          .ai-message-bubble th { background-color: #f5f5f5; font-weight: 600; }
          /* Styles for bot-info messages */
          .ai-message.bot-info .ai-message-bubble {
              background-color: #e0e7ff; /* Light blue */
              color: #374151; /* Darker text for readability */
              font-style: italic;
              font-size: 0.9em;
              padding: 8px 12px;
          }
      `;
      document.head.appendChild(styleSheet);
  }
});

// Ensure the enhancedStyles (from your previous context) are also included.
// If 'enhancedStyles' variable is from another script, ensure it's loaded.
// For self-containment, I've included some of it in aiAgentCoreStyles.
// The following is redundant if the styles are the same as those injected above.
/*
const enhancedStyles = \`
<style>
// ... your .ai-stock-card, .ai-stock-positive etc. styles ...
</style>
\`;
document.head.insertAdjacentHTML('beforeend', enhancedStyles);
*/