/* sidebar.js – Robust admin sidebar navigation with direct hash routing */

function navigateSection(sectionName) {
  if (!sectionName) sectionName = 'articles';
  
  // Highlight active link in sidebar
  document.querySelectorAll("#admin-sidebar .nav-link").forEach((l) => {
    if (l.dataset.section === sectionName) {
      l.classList.add("active");
    } else {
      l.classList.remove("active");
    }
  });

  // Update hash without triggering redundant hashchange loops
  if (window.location.hash.replace('#', '') !== sectionName) {
    window.history.pushState(null, '', `#${sectionName}`);
  }

  // Close mobile drawer if open
  if (typeof window.closeSidebar === 'function') {
    window.closeSidebar();
  }

  console.log("Navigating to admin section:", sectionName);

  switch (sectionName) {
    case "articles":
      if (typeof window.loadArticlesSection === 'function') window.loadArticlesSection();
      break;
    case "sections":
      if (typeof window.loadSectionsManager === 'function') window.loadSectionsManager();
      break;
    case "media":
      if (typeof window.loadMediaUploader === 'function') window.loadMediaUploader();
      break;
    case "hebrew-site":
      if (typeof window.loadHebrewSitePanel === 'function') window.loadHebrewSitePanel();
      break;
    case "hebrew-articles":
      if (typeof window.loadHebrewArticlesSection === 'function') window.loadHebrewArticlesSection();
      break;
    case "hebrew-sections":
      if (typeof window.loadHebrewSectionsManager === 'function') window.loadHebrewSectionsManager();
      break;
    case "automation":
      if (typeof window.loadAutomationPanel === 'function') {
        window.loadAutomationPanel();
      } else {
        loadScriptIfNotLoaded('/admin/components/automation.js', function() {
          if (typeof window.loadAutomationPanel === 'function') window.loadAutomationPanel();
        });
      }
      break;
    case "video-logs":
      if (typeof window.loadVideoLogs === 'function') {
        window.loadVideoLogs();
      }
      break;
    case "ai-tools":
      if (typeof window.loadAiToolsPanel === 'function') {
        window.loadAiToolsPanel();
      } else {
        loadScriptIfNotLoaded('/admin/components/ai-tools.js', function() {
          if (typeof window.loadAiToolsPanel === 'function') window.loadAiToolsPanel();
        });
      }
      break;
    case "design-systems":
      if (typeof window.loadDesignSystemsPanel === 'function') {
        window.loadDesignSystemsPanel();
      } else {
        loadScriptIfNotLoaded('/admin/components/design-systems.js', function() {
          if (typeof window.loadDesignSystemsPanel === 'function') window.loadDesignSystemsPanel();
        });
      }
      break;
    case "comparisons":
      if (typeof window.loadComparisonsSection === 'function') {
        window.loadComparisonsSection();
      } else {
        loadScriptIfNotLoaded('/admin/components/comparisons.js', function() {
          if (typeof window.loadComparisonsSection === 'function') window.loadComparisonsSection();
        });
      }
      break;
    case "top10":
      if (typeof window.loadTop10Generator === 'function') window.loadTop10Generator();
      break;
    case "howto":
      if (typeof window.loadHowToGenerator === 'function') window.loadHowToGenerator();
      break;
    case "bulk":
      if (typeof window.loadBulkGenerator === 'function') window.loadBulkGenerator();
      break;
    case "subscribers":
      if (typeof window.loadSubscribersSection === 'function') {
        window.loadSubscribersSection();
      } else {
        loadScriptIfNotLoaded('/admin/components/subscribers.js', function() {
          if (typeof window.loadSubscribersSection === 'function') window.loadSubscribersSection();
        });
      }
      break;
    case "settings":
      if (typeof window.loadSettingsPanel === 'function') window.loadSettingsPanel();
      break;
    case "email-campaigns":
      if (typeof window.loadEmailCampaigns === 'function') window.loadEmailCampaigns();
      break;
    case "email-templates":
      if (typeof window.loadEmailTemplates === 'function') window.loadEmailTemplates();
      break;
    case "email-subscribers":
      if (typeof window.loadEmailSubscribers === 'function') window.loadEmailSubscribers();
      break;
    case "email-workflows":
      if (typeof window.loadEmailWorkflows === 'function') window.loadEmailWorkflows();
      break;
    case "email-analytics":
      if (typeof window.loadEmailAnalytics === 'function') window.loadEmailAnalytics();
      break;
    case "email-lists":
      if (typeof window.loadEmailLists === 'function') window.loadEmailLists();
      break;
    default:
      if (typeof window.loadArticlesSection === 'function') window.loadArticlesSection();
  }
}

function initSidebar() {
  const sidebarContainer = document.getElementById("admin-sidebar");
  if (!sidebarContainer) return;

  sidebarContainer.innerHTML = `
    <nav class="nav flex-column">
      <div class="sidebar-category-header text-uppercase text-muted px-3 py-1" style="font-size:0.68rem; letter-spacing:0.08em; font-weight:700;">Content Management</div>
      <a href="#articles" class="nav-link active" data-section="articles">
        <i class="bi bi-file-text me-2"></i>Articles
      </a>
      <a href="#sections" class="nav-link" data-section="sections">
        <i class="bi bi-grid me-2"></i>Sections
      </a>
      <a href="#media" class="nav-link" data-section="media">
        <i class="bi bi-images me-2"></i>Media Library
      </a>

      <div class="sidebar-category-header text-uppercase text-muted px-3 py-1 mt-3" style="font-size:0.68rem; letter-spacing:0.08em; font-weight:700;">Hebrew Edition</div>
      <a href="#hebrew-site" class="nav-link" data-section="hebrew-site">
        <i class="bi bi-translate me-2"></i>Hebrew Site
      </a>
      <div class="submenu ps-4" id="hebrew-submenu" style="display: none;">
        <a href="#hebrew-articles" class="nav-link" data-section="hebrew-articles">
          <i class="bi bi-file-earmark-text me-2"></i>Hebrew Articles
        </a>
        <a href="#hebrew-sections" class="nav-link" data-section="hebrew-sections">
          <i class="bi bi-diagram-2 me-2"></i>Hebrew Sections
        </a>
      </div>

      <div class="sidebar-category-header text-uppercase text-muted px-3 py-1 mt-3" style="font-size:0.68rem; letter-spacing:0.08em; font-weight:700;">Automation &amp; Video</div>
      <a href="#automation" class="nav-link" data-section="automation">
        <i class="bi bi-cpu me-2 text-danger"></i>Automation &amp; Schedulers
      </a>
      <a href="#video-logs" class="nav-link" data-section="video-logs">
        <i class="bi bi-camera-reels me-2 text-danger"></i>Automatic Video Logs
      </a>

      <div class="sidebar-category-header text-uppercase text-muted px-3 py-1 mt-3" style="font-size:0.68rem; letter-spacing:0.08em; font-weight:700;">AI &amp; Tech Catalogs</div>
      <a href="#ai-tools" class="nav-link" data-section="ai-tools">
        <i class="bi bi-robot me-2"></i>AI Tools
      </a>
      <a href="#design-systems" class="nav-link" data-section="design-systems">
        <i class="bi bi-palette me-2"></i>Design Systems
      </a>
      <a href="#comparisons" class="nav-link" data-section="comparisons">
        <i class="bi bi-columns-gap me-2"></i>Comparisons
      </a>

      <div class="sidebar-category-header text-uppercase text-muted px-3 py-1 mt-3" style="font-size:0.68rem; letter-spacing:0.08em; font-weight:700;">AI Generators</div>
      <a href="#top10" class="nav-link" data-section="top10">
        <i class="bi bi-list-ol me-2"></i>Top 10 Generator
      </a>
      <a href="#howto" class="nav-link" data-section="howto">
        <i class="bi bi-tools me-2"></i>How-To Generator
      </a>
      <a href="#bulk" class="nav-link" data-section="bulk">
        <i class="bi bi-stack me-2"></i>Bulk Generator
      </a>

      <div class="sidebar-category-header text-uppercase text-muted px-3 py-1 mt-3" style="font-size:0.68rem; letter-spacing:0.08em; font-weight:700;">Growth &amp; Audience</div>
      <a href="#subscribers" class="nav-link" data-section="subscribers">
        <i class="bi bi-people me-2"></i>Subscribers
      </a>
      <a href="#email" class="nav-link" data-section="email">
        <i class="bi bi-envelope me-2"></i>Email Marketing
      </a>
      <div class="submenu ps-4" id="email-submenu" style="display: none;">
        <a href="#email/campaigns" class="nav-link" data-section="email-campaigns">
          <i class="bi bi-send me-2"></i>Campaigns
        </a>
        <a href="#email/templates" class="nav-link" data-section="email-templates">
          <i class="bi bi-file-earmark-richtext me-2"></i>Templates
        </a>
        <a href="#email/subscribers" class="nav-link" data-section="email-subscribers">
          <i class="bi bi-person-lines-fill me-2"></i>Email Subscribers
        </a>
        <a href="#email/workflows" class="nav-link" data-section="email-workflows">
          <i class="bi bi-diagram-3 me-2"></i>Workflows
        </a>
        <a href="#email/analytics" class="nav-link" data-section="email-analytics">
          <i class="bi bi-bar-chart me-2"></i>Analytics
        </a>
        <a href="#email/lists" class="nav-link" data-section="email-lists">
          <i class="bi bi-card-list me-2"></i>Lists
        </a>
      </div>

      <div class="sidebar-category-header text-uppercase text-muted px-3 py-1 mt-3" style="font-size:0.68rem; letter-spacing:0.08em; font-weight:700;">System</div>
      <a href="#settings" class="nav-link" data-section="settings">
        <i class="bi bi-gear me-2"></i>Settings
      </a>
    </nav>
  `;

  // Attach click events to nav links
  document.querySelectorAll("#admin-sidebar .nav-link").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      
      const section = this.dataset.section;

      // Handle submenu toggling for email section
      if (section === "email") {
        const submenu = document.getElementById("email-submenu");
        if (submenu) {
          submenu.style.display = submenu.style.display === "none" ? "block" : "none";
        }
        return;
      }

      // Handle submenu toggling for Hebrew site
      if (section === "hebrew-site") {
        const heSubmenu = document.getElementById("hebrew-submenu");
        if (heSubmenu) {
          heSubmenu.style.display = heSubmenu.style.display === "none" ? "block" : "none";
        }
      }

      navigateSection(section);
    });
  });

  // Listen to hashchange in browser address bar
  window.addEventListener('hashchange', () => {
    const rawHash = window.location.hash.replace('#', '');
    if (rawHash) {
      navigateSection(rawHash);
    }
  });

  // Route initial hash if present
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash) {
    navigateSection(initialHash);
  }
}

// ── Fallback Helpers ─────────────────────────────────────────────────────────────

if (!window.loadVideoLogs) {
  window.loadVideoLogs = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="video-logs-container" class="section-container"></div>';

    if (window.VideoLogs) {
      const comp = new window.VideoLogs();
      comp.render('video-logs-container');
    } else {
      loadScriptIfNotLoaded('/admin/components/videoLogs.js', function() {
        if (window.VideoLogs) {
          const comp = new window.VideoLogs();
          comp.render('video-logs-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load video logs.</div>';
        }
      });
    }
  };
}

if (!window.loadHebrewSitePanel) {
  window.loadHebrewSitePanel = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="hebrew-site-container" class="section-container"></div>';

    if (window.HebrewSitePanel) {
      window.HebrewSitePanel.render('hebrew-site-container');
    } else {
      loadScriptIfNotLoaded('/admin/components/hebrew-site.js', function() {
        if (window.HebrewSitePanel) {
          window.HebrewSitePanel.render('hebrew-site-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load Hebrew Site panel.</div>';
        }
      });
    }
  };
}

if (!window.loadHebrewArticlesSection) {
  window.loadHebrewArticlesSection = function() {
    window.loadHebrewSitePanel();
    setTimeout(() => {
      const tab = document.querySelector('#hebrew-site-container a[data-tab="articles"]');
      if (tab) tab.click();
    }, 100);
  };
}

if (!window.loadHebrewSectionsManager) {
  window.loadHebrewSectionsManager = function() {
    window.loadHebrewSitePanel();
    setTimeout(() => {
      const tab = document.querySelector('#hebrew-site-container a[data-tab="sections"]');
      if (tab) tab.click();
    }, 100);
  };
}

if (!window.loadTop10Generator) {
  window.loadTop10Generator = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="top10-generator-container" class="section-container text-center p-5">Loading... <span class="spinner-border"></span></div>';

    if (window.Top10Generator) {
      const comp = new window.Top10Generator();
      comp.render('top10-generator-container');
    } else {
      loadScriptIfNotLoaded('/admin/components/top10.js', function() {
        if (window.Top10Generator) {
          const comp = new window.Top10Generator();
          comp.render('top10-generator-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load generator.</div>';
        }
      });
    }
  };
}

if (!window.loadHowToGenerator) {
  window.loadHowToGenerator = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="howto-generator-container" class="section-container text-center p-5">Loading... <span class="spinner-border"></span></div>';

    if (window.HowToGenerator) {
      const comp = new window.HowToGenerator();
      comp.render('howto-generator-container');
    } else {
      loadScriptIfNotLoaded('/admin/components/howto.js', function() {
        if (window.HowToGenerator) {
          const comp = new window.HowToGenerator();
          comp.render('howto-generator-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load generator.</div>';
        }
      });
    }
  };
}

if (!window.loadBulkGenerator) {
  window.loadBulkGenerator = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="bulk-generator-container" class="section-container text-center p-5">Loading... <span class="spinner-border"></span></div>';

    if (window.BulkGenerator) {
      const comp = new window.BulkGenerator();
      comp.render('bulk-generator-container');
    } else {
      loadScriptIfNotLoaded('/admin/components/bulk.js', function() {
        if (window.BulkGenerator) {
          const comp = new window.BulkGenerator();
          comp.render('bulk-generator-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load generator.</div>';
        }
      });
    }
  };
}

if (!window.loadEmailCampaigns) {
  window.loadEmailCampaigns = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="email-campaigns-container" class="loading"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';

    if (window.EmailCampaigns) {
      const campaignsComponent = new window.EmailCampaigns();
      campaignsComponent.render('email-campaigns-container');
    } else {
      loadScriptIfNotLoaded('/admin/components/email/Campaigns.js', function() {
        if (window.EmailCampaigns) {
          const campaignsComponent = new window.EmailCampaigns();
          campaignsComponent.render('email-campaigns-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email campaigns.</div>';
        }
      });
    }
  };
}

if (!window.loadEmailTemplates) {
  window.loadEmailTemplates = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="email-templates-container" class="loading"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    if (window.EmailTemplates) {
      const templatesComponent = new window.EmailTemplates();
      templatesComponent.render('email-templates-container');
    } else {
      loadScriptIfNotLoaded('/admin/components/email/Templates.js', function() {
        if (window.EmailTemplates) {
          const templatesComponent = new window.EmailTemplates();
          templatesComponent.render('email-templates-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email templates.</div>';
        }
      });
    }
  };
}

if (!window.loadEmailSubscribers) {
  window.loadEmailSubscribers = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="email-subscribers-container" class="loading"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    if (window.EmailSubscribers) {
      const subscribersComponent = new window.EmailSubscribers();
      subscribersComponent.render('email-subscribers-container');
    } else {
      loadScriptIfNotLoaded('/admin/components/email/Subscribers.js', function() {
        if (window.EmailSubscribers) {
          const subscribersComponent = new window.EmailSubscribers();
          subscribersComponent.render('email-subscribers-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email subscribers.</div>';
        }
      });
    }
  };
}

if (!window.loadEmailWorkflows) {
  window.loadEmailWorkflows = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="email-workflows-container" class="loading"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    if (window.EmailWorkflows) {
      const workflowsComponent = new window.EmailWorkflows();
      workflowsComponent.render('email-workflows-container');
    } else {
      loadScriptIfNotLoaded('/admin/components/email/Workflows.js', function() {
        if (window.EmailWorkflows) {
          const workflowsComponent = new window.EmailWorkflows();
          workflowsComponent.render('email-workflows-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email workflows.</div>';
        }
      });
    }
  };
}

if (!window.loadEmailAnalytics) {
  window.loadEmailAnalytics = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="email-analytics-container" class="loading"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    if (window.EmailAnalytics) {
      const analyticsComponent = new window.EmailAnalytics();
      analyticsComponent.render('email-analytics-container');
    } else {
      loadScriptIfNotLoaded('/admin/components/email/Analytics.js', function() {
        if (window.EmailAnalytics) {
          const analyticsComponent = new window.EmailAnalytics();
          analyticsComponent.render('email-analytics-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email analytics.</div>';
        }
      });
    }
  };
}

if (!window.loadEmailLists) {
  window.loadEmailLists = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="email-lists-container" class="loading"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    if (window.EmailLists) {
      const listsComponent = new window.EmailLists();
      listsComponent.render('email-lists-container');
    } else {
      loadScriptIfNotLoaded('/admin/components/email/Lists.js', function() {
        if (window.EmailLists) {
          const listsComponent = new window.EmailLists();
          listsComponent.render('email-lists-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email lists.</div>';
        }
      });
    }
  };
}

function loadScriptIfNotLoaded(src, callback) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    if (callback) callback();
    return;
  }
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = src;
  script.onload = callback;
  script.onerror = function() {
    console.error('Failed to load script:', src);
    if (callback) callback();
  };
  document.head.appendChild(script);
}

window.initSidebar = initSidebar;
window.navigateSection = navigateSection;