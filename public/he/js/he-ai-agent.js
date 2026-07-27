// he-ai-agent.js — Hebrew AI Tech News Agent (RTL)

(function () {
  'use strict';

  var HE_AI_ENDPOINT = 'https://us-central1-trendingtech-daily.cloudfunctions.net/api/generateAIAgentResponse';
  var MAX_HISTORY    = 10;

  var state = {
    isOpen:    false,
    isTyping:  false,
    history:   [],
    db:        null,
    articles:  []
  };

  // ── Build HTML ────────────────────────────────────────────────────────────────

  function injectHTML() {
    // Agent container
    var container = document.createElement('div');
    container.id        = 'heAiAgent';
    container.className = 'he-ai-container';
    container.innerHTML =
      // Floating button
      '<button id="heAiBtn" class="he-ai-button" aria-label="עוזר AI" title="שאלו את העוזר החכם">' +
        '<svg class="he-ai-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>' +
          '<circle cx="9" cy="14" r="1" fill="currentColor" stroke="none"/>' +
          '<circle cx="15" cy="14" r="1" fill="currentColor" stroke="none"/>' +
        '</svg>' +
        '<span class="he-ai-pulse"></span>' +
      '</button>' +

      // Chat window
      '<div id="heAiChat" class="he-ai-chat" role="dialog" aria-label="עוזר AI" dir="rtl">' +
        // Header
        '<div class="he-ai-header">' +
          '<div class="d-flex align-items-center gap-2">' +
            '<div class="he-ai-header-icon">🤖</div>' +
            '<div>' +
              '<div class="he-ai-header-title">עוזר חדשות טכנולוגיה</div>' +
              '<div class="he-ai-header-sub">מופעל על ידי Gemini AI</div>' +
            '</div>' +
          '</div>' +
          '<button id="heAiClose" class="he-ai-close" aria-label="סגור">✕</button>' +
        '</div>' +

        // Messages
        '<div id="heAiMessages" class="he-ai-messages">' +
          '<div class="he-ai-msg bot">' +
            '<div class="he-ai-bubble">שלום! אני העוזר החכם של <strong>TrendingTech Daily</strong>. 👋<br>' +
            'אשמח לענות על שאלות על חדשות טכנולוגיה, לסכם כתבות ולהסביר נושאים.</div>' +
          '</div>' +
        '</div>' +

        // Quick actions
        '<div class="he-ai-quick-actions">' +
          '<button class="he-ai-quick" data-q="מה הטרנדים הכי חמים בטכנולוגיה עכשיו?">🔥 מה הטרנדים?</button>' +
          '<button class="he-ai-quick" data-q="תסכם לי את הכתבה הנוכחית בקצרה">📄 סכם כתבה</button>' +
          '<button class="he-ai-quick" data-q="מה חדש בעולם הבינה המלאכותית?">🤖 חדשות AI</button>' +
          '<button class="he-ai-quick" data-q="מהם הסטארטאפים הישראלים המעניינים ביותר כרגע?">🚀 סטארטאפים</button>' +
        '</div>' +

        // Input
        '<form id="heAiForm" class="he-ai-input-area">' +
          '<input id="heAiInput" type="text" class="he-ai-input" placeholder="שאלו שאלה..." autocomplete="off" maxlength="500" />' +
          '<button id="heAiSend" type="submit" class="he-ai-send" disabled aria-label="שלח">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">' +
              '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
            '</svg>' +
          '</button>' +
        '</form>' +
      '</div>';

    document.body.appendChild(container);
  }

  // ── Styles ────────────────────────────────────────────────────────────────────

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent = `
      .he-ai-container { position:fixed; bottom:20px; left:20px; z-index:9999; font-family:'Heebo','IBM Plex Sans',sans-serif; }
      .he-ai-button {
        width:60px; height:60px; border-radius:50%;
        background:linear-gradient(135deg,#6366f1,#8b5cf6);
        border:none; cursor:pointer; display:flex; align-items:center; justify-content:center;
        box-shadow:0 4px 20px rgba(99,102,241,0.45); transition:all 0.3s; position:relative; overflow:hidden; color:#fff;
      }
      .he-ai-button:hover { transform:scale(1.1); box-shadow:0 6px 30px rgba(99,102,241,0.6); }
      .he-ai-button.open { background:linear-gradient(135deg,#4f52d6,#7c3aed); }
      .he-ai-icon { width:28px; height:28px; color:#fff; z-index:1; pointer-events:none; }
      .he-ai-pulse {
        position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
        width:100%; height:100%; border-radius:50%;
        background:rgba(99,102,241,0.35); animation:he-pulse 2s ease-out infinite;
      }
      @keyframes he-pulse { 0%{transform:translate(-50%,-50%) scale(1);opacity:0.7} 100%{transform:translate(-50%,-50%) scale(1.8);opacity:0} }
      .he-ai-button.open .he-ai-pulse { animation:none; opacity:0; }

      .he-ai-chat {
        position:absolute; bottom:72px; left:0;
        width:360px; max-width:90vw; max-height:520px;
        background:#fff; border-radius:18px;
        box-shadow:0 8px 40px rgba(0,0,0,0.18);
        display:flex; flex-direction:column; overflow:hidden;
        transform:scale(0.85) translateY(20px); opacity:0;
        pointer-events:none; transition:transform 0.25s cubic-bezier(.34,1.56,.64,1), opacity 0.2s;
        transform-origin:bottom left;
      }
      .he-ai-chat.open { transform:scale(1) translateY(0); opacity:1; pointer-events:auto; }

      .he-ai-header {
        padding:12px 14px; display:flex; align-items:center; justify-content:space-between;
        background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff;
      }
      .he-ai-header-icon { font-size:1.3rem; line-height:1; }
      .he-ai-header-title { font-weight:700; font-size:0.9rem; line-height:1.2; }
      .he-ai-header-sub { font-size:0.72rem; opacity:0.8; }
      .he-ai-close { background:none; border:none; color:#fff; font-size:1rem; cursor:pointer; padding:2px 6px; border-radius:6px; opacity:0.8; transition:opacity 0.15s; }
      .he-ai-close:hover { opacity:1; }

      .he-ai-messages { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:10px; }
      .he-ai-msg { display:flex; }
      .he-ai-msg.bot { justify-content:flex-start; }
      .he-ai-msg.user { justify-content:flex-end; }
      .he-ai-bubble {
        max-width:82%; padding:9px 13px; border-radius:14px; font-size:0.85rem; line-height:1.55;
        word-wrap:break-word;
      }
      .he-ai-msg.bot  .he-ai-bubble { background:#f3f4f6; color:#1a1a2e; border-radius:4px 14px 14px 14px; }
      .he-ai-msg.user .he-ai-bubble { background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; border-radius:14px 4px 14px 14px; }
      .he-ai-msg.info .he-ai-bubble { background:#fef3c7; color:#92400e; font-size:0.78rem; border-radius:10px; }

      .he-ai-typing { display:flex; gap:4px; align-items:center; padding:8px 13px; background:#f3f4f6; border-radius:14px; width:fit-content; }
      .he-ai-typing span { width:6px; height:6px; border-radius:50%; background:#9ca3af; animation:he-typing 1.2s infinite; display:inline-block; }
      .he-ai-typing span:nth-child(2) { animation-delay:0.2s; }
      .he-ai-typing span:nth-child(3) { animation-delay:0.4s; }
      @keyframes he-typing { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }

      .he-ai-quick-actions { padding:8px 12px; display:flex; gap:6px; flex-wrap:wrap; border-top:1px solid #f3f4f6; }
      .he-ai-quick {
        background:#f3f4f6; border:none; border-radius:20px;
        padding:4px 10px; font-size:0.75rem; cursor:pointer; color:#374151;
        transition:background 0.15s; font-family:inherit; white-space:nowrap;
      }
      .he-ai-quick:hover { background:#e5e7eb; }

      .he-ai-input-area { display:flex; gap:8px; padding:10px 12px; border-top:1px solid #e5e7eb; align-items:center; }
      .he-ai-input {
        flex:1; border:1.5px solid #e5e7eb; border-radius:22px;
        padding:7px 14px; font-size:0.85rem; outline:none; font-family:inherit; direction:rtl;
        transition:border-color 0.15s;
      }
      .he-ai-input:focus { border-color:#6366f1; }
      .he-ai-send {
        width:36px; height:36px; border-radius:50%;
        background:linear-gradient(135deg,#6366f1,#8b5cf6); border:none; cursor:pointer;
        display:flex; align-items:center; justify-content:center; color:#fff;
        transition:opacity 0.15s, transform 0.15s; flex-shrink:0;
      }
      .he-ai-send:disabled { opacity:0.4; cursor:not-allowed; }
      .he-ai-send:not(:disabled):hover { transform:scale(1.1); }

      @media (max-width:480px) {
        .he-ai-container { bottom:12px; left:12px; }
        .he-ai-chat { width:calc(100vw - 24px); bottom:68px; left:0; max-height:60vh; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Logic ─────────────────────────────────────────────────────────────────────

  var btn, chat, closeBtn, messages, form, input, sendBtn;

  function setup() {
    btn     = document.getElementById('heAiBtn');
    chat    = document.getElementById('heAiChat');
    closeBtn= document.getElementById('heAiClose');
    messages= document.getElementById('heAiMessages');
    form    = document.getElementById('heAiForm');
    input   = document.getElementById('heAiInput');
    sendBtn = document.getElementById('heAiSend');

    if (!btn || !chat) return;

    btn.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', closeChat);
    form.addEventListener('submit', handleSubmit);
    input.addEventListener('input', function () { sendBtn.disabled = !input.value.trim(); });

    document.querySelectorAll('.he-ai-quick').forEach(function (qBtn) {
      qBtn.addEventListener('click', function () {
        input.value = qBtn.dataset.q;
        sendBtn.disabled = false;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    });

    // Load Hebrew articles context
    loadContext();
  }

  function toggleChat() { state.isOpen ? closeChat() : openChat(); }

  function openChat() {
    state.isOpen = true;
    chat.classList.add('open');
    btn.classList.add('open');
    input.focus();
  }

  function closeChat() {
    state.isOpen = false;
    chat.classList.remove('open');
    btn.classList.remove('open');
  }

  function loadContext() {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      state.db = firebase.firestore();

      // Load sections map first so we can build full Hebrew URLs
      state.db.collection('he_sections').get()
        .then(function (sectSnap) {
          var sectMap = {}; // id -> slug
          sectSnap.forEach(function (doc) {
            sectMap[doc.id] = doc.data().slug || '';
          });

          return state.db.collection('he_articles')
            .where('published', '==', true)
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get()
            .then(function (snap) {
              state.articles = [];
              snap.forEach(function (doc) {
                var d = doc.data();
                var catSlug = sectMap[d.category] || '';
                var artSlug = d.slug || '';
                // Only include articles with a valid full URL
                if (catSlug && artSlug) {
                  state.articles.push({
                    title: d.title || '',
                    excerpt: (d.excerpt || '').slice(0, 100),
                    url: 'https://www.trendingtechdaily.com/he/' + catSlug + '/' + artSlug
                  });
                }
              });
            });
        })
        .catch(function () {});
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    var msg = input.value.trim();
    if (!msg || state.isTyping) return;

    addMessage(msg, 'user');
    input.value = '';
    sendBtn.disabled = true;

    state.history.push({ role: 'user', content: msg });
    if (state.history.length > MAX_HISTORY * 2) state.history.splice(0, 2);

    state.isTyping = true;
    showTyping();
    sendToAPI(msg);
  }

  function sendToAPI(msg) {
    // Build context with Hebrew articles and language hint
    var pageTitle   = document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : '';
    var pageContent = (document.getElementById('he-article-body') || {}).innerText || '';
    var currentUrl  = window.location.href;

    // If on an article page, add current article to the known articles list
    // so the AI can link back to it correctly
    var articlesWithCurrent = state.articles.slice();
    if (pageTitle && currentUrl.indexOf('/he/') !== -1 && currentUrl.indexOf('/he/') !== currentUrl.lastIndexOf('/')) {
      var alreadyIncluded = articlesWithCurrent.some(function(a) { return a.url === currentUrl; });
      if (!alreadyIncluded) {
        articlesWithCurrent.unshift({ title: pageTitle, url: currentUrl, excerpt: '' });
      }
    }

    var context = {
      language:         'he',
      latestArticles:   articlesWithCurrent,
      trendingTopics:   ['בינה מלאכותית', 'טכנולוגיה', 'סטארטאפים ישראלים', 'קריפטו', 'אבטחה'],
      pageSpecificContext: pageTitle
        ? { type: 'article', title: pageTitle, content: pageContent.substring(0, 800) }
        : { type: 'site', name: 'TrendingTech Daily' },
      systemNote: 'You are a Hebrew-language AI assistant for an Israeli tech news site. Always respond in Hebrew (עברית). Be concise and informative.'
    };

    fetch(HE_AI_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        prompt:              msg,
        conversationHistory: state.history,
        context:             context,
        available_tools:     ['searchWeb']
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (result) {
      hideTyping();
      state.isTyping = false;
      if (result.success && result.message) {
        addMessage(result.message, 'bot');
        state.history.push({ role: 'assistant', content: result.message });
      } else {
        addMessage('מצטער, נתקלתי בשגיאה. נסו שוב עוד רגע.', 'bot');
      }
    })
    .catch(function () {
      hideTyping();
      state.isTyping = false;
      addMessage('שגיאת חיבור. בדקו את החיבור לאינטרנט ונסו שוב.', 'bot');
    });
  }

  function addMessage(text, type) {
    var wrapper = document.createElement('div');
    wrapper.className = 'he-ai-msg ' + type;
    var bubble = document.createElement('div');
    bubble.className = 'he-ai-bubble';
    bubble.innerHTML = formatText(text);
    wrapper.appendChild(bubble);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    var wrapper = document.createElement('div');
    wrapper.className = 'he-ai-msg bot';
    wrapper.id = 'heAiTyping';
    var typing = document.createElement('div');
    typing.className = 'he-ai-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    wrapper.appendChild(typing);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    var t = document.getElementById('heAiTyping');
    if (t) t.remove();
  }

  function formatText(text) {
    // 1. Escape HTML entities first (except we'll re-inject links later)
    var s = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. Markdown links: [title](url)  →  clickable <a> tags
    //    Must run BEFORE bold/italic so brackets aren't eaten
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, function(_, title, url) {
      // For internal site links, navigate in the same tab; external → new tab
      var isInternal = url.indexOf('trendingtechdaily.com') !== -1 ||
                       url.indexOf(window.location.hostname) !== -1;
      var target = isInternal ? '_self' : '_blank';
      var rel    = isInternal ? '' : ' rel="noopener noreferrer"';
      return '<a href="' + url + '" target="' + target + '"' + rel + ' style="color:#6366f1;text-decoration:underline;">' + title + '</a>';
    });

    // 3. Bold, italic, line-breaks
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/\n/g, '<br>');

    return s;
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init() {
    injectStyles();
    injectHTML();
    setup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
