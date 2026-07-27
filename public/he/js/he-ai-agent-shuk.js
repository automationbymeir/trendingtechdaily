// he-ai-agent-shuk.js — Hebrew Stock Market AI Agent for TrendingTech Daily
// Positioned bottom-left (green), distinct from the general he-ai-agent (bottom-right, purple)

(function () {
  'use strict';

  var HE_AI_SHUK_ENDPOINT = 'https://us-central1-trendingtech-daily.cloudfunctions.net/api/generateAIAgentResponse';
  var MAX_HISTORY = 10;

  var state = {
    isOpen:   false,
    isTyping: false,
    history:  [],
    db:       null,
    articles: []
  };

  // ── Build HTML ────────────────────────────────────────────────────────────────

  function injectHTML() {
    var container = document.createElement('div');
    container.id        = 'heAiShukAgent';
    container.className = 'he-ai-shuk-container';
    container.innerHTML =
      // Floating button
      '<button id="heAiShukBtn" class="he-ai-shuk-button" aria-label="עוזר שוק ההון" title="שאלו את עוזר שוק ההון">' +
        '<svg class="he-ai-shuk-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>' +
          '<polyline points="16 7 22 7 22 13"/>' +
        '</svg>' +
        '<span class="he-ai-shuk-pulse"></span>' +
      '</button>' +

      // Chat window
      '<div id="heAiShukChat" class="he-ai-shuk-chat" role="dialog" aria-label="עוזר שוק ההון" dir="rtl">' +
        // Header
        '<div class="he-ai-shuk-header">' +
          '<div class="d-flex align-items-center gap-2">' +
            '<div class="he-ai-shuk-header-icon">📈</div>' +
            '<div>' +
              '<div class="he-ai-shuk-header-title">עוזר שוק ההון</div>' +
              '<div class="he-ai-shuk-header-sub">מופעל על ידי Gemini AI</div>' +
            '</div>' +
          '</div>' +
          '<button id="heAiShukClose" class="he-ai-shuk-close" aria-label="סגור">✕</button>' +
        '</div>' +

        // Messages
        '<div id="heAiShukMessages" class="he-ai-shuk-messages">' +
          '<div class="he-ai-shuk-msg bot">' +
            '<div class="he-ai-shuk-bubble">' +
              'שלום! אני העוזר החכם לשוק ההון של <strong>TrendingTech Daily</strong>. 📈<br>' +
              'אוכל לעזור לך להבין נתוני שוק, לנתח מניות ולענות על שאלות פיננסיות בעברית.' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Quick actions
        '<div class="he-ai-shuk-quick-actions">' +
          '<button class="he-ai-shuk-quick" data-q="תן לי ניתוח קצר של מצב השוק האמריקאי כרגע">📈 ניתוח שוק</button>' +
          '<button class="he-ai-shuk-quick" data-q="מה זה מניה ואיך עובד שוק ההון?">🔍 מה זה מניה?</button>' +
          '<button class="he-ai-shuk-quick" data-q="תן לי 3 טיפים חשובים למשקיע מתחיל">💡 טיפים למשקיע</button>' +
          '<button class="he-ai-shuk-quick" data-q="מה זה מדד ת\"א 35 ואיך הוא מחושב?">📊 מה ת"א 35?</button>' +
        '</div>' +

        // Input
        '<form id="heAiShukForm" class="he-ai-shuk-input-area">' +
          '<input id="heAiShukInput" type="text" class="he-ai-shuk-input" placeholder="שאלו על שוק ההון..." autocomplete="off" maxlength="500" />' +
          '<button id="heAiShukSend" type="submit" class="he-ai-shuk-send" disabled aria-label="שלח">' +
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
    style.textContent = [
      '.he-ai-shuk-container {',
        'position:fixed; bottom:24px; left:24px; z-index:9990;',
        'font-family:\'Heebo\',\'IBM Plex Sans\',sans-serif;',
      '}',

      '.he-ai-shuk-button {',
        'width:60px; height:60px; border-radius:50%;',
        'background:linear-gradient(135deg,#16a34a,#15803d);',
        'border:none; cursor:pointer; display:flex; align-items:center; justify-content:center;',
        'box-shadow:0 4px 20px rgba(22,163,74,0.45); transition:all 0.3s; position:relative; overflow:hidden; color:#fff;',
      '}',
      '.he-ai-shuk-button:hover { transform:scale(1.1); box-shadow:0 6px 30px rgba(22,163,74,0.6); }',
      '.he-ai-shuk-button.open { background:linear-gradient(135deg,#15803d,#166534); }',

      '.he-ai-shuk-icon { width:26px; height:26px; color:#fff; z-index:1; pointer-events:none; }',

      '.he-ai-shuk-pulse {',
        'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);',
        'width:100%; height:100%; border-radius:50%;',
        'background:rgba(22,163,74,0.35); animation:he-shuk-pulse 2.2s ease-out infinite;',
      '}',
      '@keyframes he-shuk-pulse { 0%{transform:translate(-50%,-50%) scale(1);opacity:0.7} 100%{transform:translate(-50%,-50%) scale(1.8);opacity:0} }',
      '.he-ai-shuk-button.open .he-ai-shuk-pulse { animation:none; opacity:0; }',

      '.he-ai-shuk-chat {',
        'position:absolute; bottom:72px; left:0;',
        'width:360px; max-width:90vw; max-height:520px;',
        'background:#fff; border-radius:18px;',
        'box-shadow:0 8px 40px rgba(0,0,0,0.18);',
        'display:flex; flex-direction:column; overflow:hidden;',
        'transform:scale(0.85) translateY(20px); opacity:0;',
        'pointer-events:none; transition:transform 0.25s cubic-bezier(.34,1.56,.64,1), opacity 0.2s;',
        'transform-origin:bottom left;',
      '}',
      '.he-ai-shuk-chat.open { transform:scale(1) translateY(0); opacity:1; pointer-events:auto; }',

      '.he-ai-shuk-header {',
        'padding:12px 14px; display:flex; align-items:center; justify-content:space-between;',
        'background:linear-gradient(135deg,#16a34a,#15803d); color:#fff;',
      '}',
      '.he-ai-shuk-header-icon { font-size:1.3rem; line-height:1; }',
      '.he-ai-shuk-header-title { font-weight:700; font-size:0.9rem; line-height:1.2; }',
      '.he-ai-shuk-header-sub { font-size:0.72rem; opacity:0.8; }',
      '.he-ai-shuk-close { background:none; border:none; color:#fff; font-size:1rem; cursor:pointer; padding:2px 6px; border-radius:6px; opacity:0.8; transition:opacity 0.15s; }',
      '.he-ai-shuk-close:hover { opacity:1; }',

      '.he-ai-shuk-messages { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:10px; }',
      '.he-ai-shuk-msg { display:flex; }',
      '.he-ai-shuk-msg.bot { justify-content:flex-start; }',
      '.he-ai-shuk-msg.user { justify-content:flex-end; }',
      '.he-ai-shuk-bubble {',
        'max-width:82%; padding:9px 13px; border-radius:14px; font-size:0.85rem; line-height:1.55; word-wrap:break-word;',
      '}',
      '.he-ai-shuk-msg.bot  .he-ai-shuk-bubble { background:#f0fdf4; color:#1a1a2e; border-radius:4px 14px 14px 14px; border:1px solid #bbf7d0; }',
      '.he-ai-shuk-msg.user .he-ai-shuk-bubble { background:linear-gradient(135deg,#16a34a,#15803d); color:#fff; border-radius:14px 4px 14px 14px; }',
      '.he-ai-shuk-msg.info .he-ai-shuk-bubble { background:#fef3c7; color:#92400e; font-size:0.78rem; border-radius:10px; }',

      '.he-ai-shuk-typing { display:flex; gap:4px; align-items:center; padding:8px 13px; background:#f0fdf4; border-radius:14px; width:fit-content; border:1px solid #bbf7d0; }',
      '.he-ai-shuk-typing span { width:6px; height:6px; border-radius:50%; background:#16a34a; animation:he-shuk-typing 1.2s infinite; display:inline-block; }',
      '.he-ai-shuk-typing span:nth-child(2) { animation-delay:0.2s; }',
      '.he-ai-shuk-typing span:nth-child(3) { animation-delay:0.4s; }',
      '@keyframes he-shuk-typing { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }',

      '.he-ai-shuk-quick-actions { padding:8px 12px; display:flex; gap:6px; flex-wrap:wrap; border-top:1px solid #f0fdf4; }',
      '.he-ai-shuk-quick {',
        'background:#f0fdf4; border:1px solid #bbf7d0; border-radius:20px;',
        'padding:4px 10px; font-size:0.75rem; cursor:pointer; color:#166534;',
        'transition:background 0.15s; font-family:inherit; white-space:nowrap;',
      '}',
      '.he-ai-shuk-quick:hover { background:#dcfce7; }',

      '.he-ai-shuk-input-area { display:flex; gap:8px; padding:10px 12px; border-top:1px solid #e5e7eb; align-items:center; }',
      '.he-ai-shuk-input {',
        'flex:1; border:1.5px solid #bbf7d0; border-radius:22px;',
        'padding:7px 14px; font-size:0.85rem; outline:none; font-family:inherit; direction:rtl;',
        'transition:border-color 0.15s;',
      '}',
      '.he-ai-shuk-input:focus { border-color:#16a34a; }',
      '.he-ai-shuk-send {',
        'width:36px; height:36px; border-radius:50%;',
        'background:linear-gradient(135deg,#16a34a,#15803d); border:none; cursor:pointer;',
        'display:flex; align-items:center; justify-content:center; color:#fff;',
        'transition:opacity 0.15s, transform 0.15s; flex-shrink:0;',
      '}',
      '.he-ai-shuk-send:disabled { opacity:0.4; cursor:not-allowed; }',
      '.he-ai-shuk-send:not(:disabled):hover { transform:scale(1.1); }',

      '@media (max-width:480px) {',
        '.he-ai-shuk-container { bottom:12px; left:12px; }',
        '.he-ai-shuk-chat { width:calc(100vw - 24px); bottom:68px; left:0; max-height:60vh; }',
      '}'
    ].join('');
    document.head.appendChild(style);
  }

  // ── Logic ─────────────────────────────────────────────────────────────────────

  var btn, chat, closeBtn, messages, form, input, sendBtn;

  function setup() {
    btn      = document.getElementById('heAiShukBtn');
    chat     = document.getElementById('heAiShukChat');
    closeBtn = document.getElementById('heAiShukClose');
    messages = document.getElementById('heAiShukMessages');
    form     = document.getElementById('heAiShukForm');
    input    = document.getElementById('heAiShukInput');
    sendBtn  = document.getElementById('heAiShukSend');

    if (!btn || !chat) return;

    btn.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', closeChat);
    form.addEventListener('submit', handleSubmit);
    input.addEventListener('input', function () { sendBtn.disabled = !input.value.trim(); });

    document.querySelectorAll('.he-ai-shuk-quick').forEach(function (qBtn) {
      qBtn.addEventListener('click', function () {
        input.value = qBtn.dataset.q;
        sendBtn.disabled = false;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    });

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

      state.db.collection('he_sections').get()
        .then(function (sectSnap) {
          var sectMap = {};
          sectSnap.forEach(function (doc) { sectMap[doc.id] = doc.data().slug || ''; });

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
    } else {
      // Retry after Firebase loads
      setTimeout(loadContext, 500);
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
    var currentUrl = window.location.href;

    var context = {
      language: 'he',
      latestArticles: state.articles.slice(),
      trendingTopics: ['שוק ההון', 'מניות ישראליות', 'TEVA', 'NICE', 'CHKP', 'בורסת תל אביב', 'ת"א 35', 'נאסד"ק', 'מדד S&P 500', 'קריפטו'],
      pageSpecificContext: {
        type: 'stock-market',
        name: 'שוק ההון | TrendingTech Daily',
        url: currentUrl
      },
      systemNote: 'אתה עוזר AI מומחה לשוק ההון בעברית לאתר TrendingTech Daily. ענה תמיד בעברית. תוכל לעזור בהסברת מושגים פיננסיים, ניתוח שוק כללי ומידע על מניות. חשוב: תמיד הוסף בסוף כל תשובה את הכיתוב: "המידע הוא לצורכי לימוד בלבד ואינו ייעוץ השקעות."'
    };

    fetch(HE_AI_SHUK_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
    wrapper.className = 'he-ai-shuk-msg ' + type;
    var bubble = document.createElement('div');
    bubble.className = 'he-ai-shuk-bubble';
    bubble.innerHTML = formatText(text);
    wrapper.appendChild(bubble);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    var wrapper = document.createElement('div');
    wrapper.className = 'he-ai-shuk-msg bot';
    wrapper.id = 'heAiShukTyping';
    var typing = document.createElement('div');
    typing.className = 'he-ai-shuk-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    wrapper.appendChild(typing);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    var t = document.getElementById('heAiShukTyping');
    if (t) t.remove();
  }

  function formatText(text) {
    var s = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Markdown links
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, function (_, title, url) {
      var isInternal = url.indexOf('trendingtechdaily.com') !== -1 ||
                       url.indexOf(window.location.hostname) !== -1;
      var target = isInternal ? '_self' : '_blank';
      var rel    = isInternal ? '' : ' rel="noopener noreferrer"';
      return '<a href="' + url + '" target="' + target + '"' + rel + ' style="color:#16a34a;text-decoration:underline;">' + title + '</a>';
    });

    // Bold, italic, line-breaks
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
