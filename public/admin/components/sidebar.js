/* sidebar.js – Handles the admin sidebar navigation */
function initSidebar() {
  const sidebarContainer = document.getElementById("admin-sidebar");

  sidebarContainer.innerHTML = `
    <nav class="nav flex-column">
      <a href="#articles" class="nav-link active" data-section="articles">
        <i class="bi bi-file-text me-2"></i>Articles
      </a>
      <a href="#top10" class="nav-link" data-section="top10">
        <i class="bi bi-list-ol me-2"></i>Top 10 Generator
      </a>
      <a href="#howto" class="nav-link" data-section="howto">
        <i class="bi bi-tools me-2"></i>How-To Generator
      </a>
      <a href="#bulk" class="nav-link" data-section="bulk">
        <i class="bi bi-stack me-2"></i>Bulk Generator
      </a>
      <a href="#sections" class="nav-link" data-section="sections">
        <i class="bi bi-grid me-2"></i>Sections
      </a>
      <a href="#media" class="nav-link" data-section="media">
        <i class="bi bi-images me-2"></i>Media Library
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
          <i class="bi bi-people me-2"></i>Subscribers
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
      <a href="#settings" class="nav-link" data-section="settings">
        <i class="bi bi-gear me-2"></i>Settings
      </a>
    </nav>
  `;

  /* click handling */
  document.querySelectorAll("#admin-sidebar .nav-link").forEach((link) =>
    link.addEventListener("click", function (e) {
      e.preventDefault();
      
      // Handle submenu toggling for email section
      if (this.dataset.section === "email") {
        const submenu = document.getElementById("email-submenu");
        submenu.style.display = submenu.style.display === "none" ? "block" : "none";
        return;
      }
      
      document
        .querySelectorAll("#admin-sidebar .nav-link")
        .forEach((l) => l.classList.remove("active"));
      this.classList.add("active");

      switch (this.dataset.section) {
        case "articles":
          loadArticlesSection();
          break;
        case "top10":
          loadTop10Generator();
          break;
        case "howto":
          loadHowToGenerator();
          break;
        case "bulk":
          loadBulkGenerator();
          break;
        case "sections":
          loadSectionsManager();
          break;
        case "media":
          loadMediaUploader();
          break;
        case "settings":
          loadSettingsPanel();
          break;
        case "email-campaigns":
          loadEmailCampaigns();
          break;
        case "email-templates":
          loadEmailTemplates();
          break;
        case "email-subscribers":
          loadEmailSubscribers();
          break;
        case "email-workflows":
          loadEmailWorkflows();
          break;
        case "email-analytics":
          loadEmailAnalytics();
          break;
        case "email-lists":
          loadEmailLists();
          break;
        default:
          loadArticlesSection();
      }
    })
  );

  window.loadTop10Generator = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="top10-generator-container" class="section-container text-center p-5">Loading... <span class="spinner-border"></span></div>';

    if (window.Top10Generator) {
      const comp = new window.Top10Generator();
      comp.render('top10-generator-container');
    } else {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '/admin/components/top10.js';
      script.onload = function() {
        if (window.Top10Generator) {
          const comp = new window.Top10Generator();
          comp.render('top10-generator-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load generator.</div>';
        }
      };
      script.onerror = function() {
        contentArea.innerHTML = '<div class="alert alert-danger">Failed to load generator.</div>';
      };
      document.head.appendChild(script);
    }
  };

  window.loadHowToGenerator = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="howto-generator-container" class="section-container text-center p-5">Loading... <span class="spinner-border"></span></div>';

    if (window.HowToGenerator) {
      const comp = new window.HowToGenerator();
      comp.render('howto-generator-container');
    } else {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '/admin/components/howto.js';
      script.onload = function() {
        if (window.HowToGenerator) {
          const comp = new window.HowToGenerator();
          comp.render('howto-generator-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load generator.</div>';
        }
      };
      script.onerror = function() {
        contentArea.innerHTML = '<div class="alert alert-danger">Failed to load generator.</div>';
      };
      document.head.appendChild(script);
    }
  };

  window.loadBulkGenerator = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="bulk-generator-container" class="section-container text-center p-5">Loading... <span class="spinner-border"></span></div>';

    if (window.BulkGenerator) {
      const comp = new window.BulkGenerator();
      comp.render('bulk-generator-container');
    } else {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '/admin/components/bulk.js';
      script.onload = function() {
        if (window.BulkGenerator) {
          const comp = new window.BulkGenerator();
          comp.render('bulk-generator-container');
        } else {
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load generator.</div>';
        }
      };
      script.onerror = function() {
        contentArea.innerHTML = '<div class="alert alert-danger">Failed to load generator.</div>';
      };
      document.head.appendChild(script);
    }
  };

  // Add the email marketing functions
  window.loadEmailCampaigns = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="email-campaigns-container" class="loading"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';

    if (window.EmailCampaigns) {
      // Class already exists, just instantiate and render
      const campaignsComponent = new window.EmailCampaigns();
      campaignsComponent.render('email-campaigns-container');
    } else {
      // Load the email campaigns component script
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '/admin/components/email/Campaigns.js';
      script.onload = function() {
        if (window.EmailCampaigns) {
          const campaignsComponent = new window.EmailCampaigns();
          campaignsComponent.render('email-campaigns-container');
        } else {
          console.error("EmailCampaigns class not found after script load.");
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email campaigns component. Class not found.</div>';
        }
      };
      script.onerror = function() {
        console.error('Error loading email campaigns component: Failed to load script');
        contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email campaigns component</div>';
      };
      document.head.appendChild(script);
    }
  };
  
  window.loadEmailTemplates = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="email-templates-container" class="loading"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    if (window.EmailTemplates) {
      const templatesComponent = new window.EmailTemplates();
      templatesComponent.render('email-templates-container');
    } else {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '/admin/components/email/Templates.js';
      script.onload = function() {
        if (window.EmailTemplates) {
          const templatesComponent = new window.EmailTemplates();
          templatesComponent.render('email-templates-container');
        } else {
          console.error("EmailTemplates class not found after script load.");
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email templates component. Class not found.</div>';
        }
      };
      script.onerror = function() {
        console.error('Error loading email templates component: Failed to load script');
        contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email templates component</div>';
      };
      document.head.appendChild(script);
    }
  };
  
  window.loadEmailSubscribers = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="email-subscribers-container" class="loading"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    if (window.EmailSubscribers) {
      const subscribersComponent = new window.EmailSubscribers();
      subscribersComponent.render('email-subscribers-container');
    } else {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '/admin/components/email/Subscribers.js';
      script.onload = function() {
        if (window.EmailSubscribers) {
          const subscribersComponent = new window.EmailSubscribers();
          subscribersComponent.render('email-subscribers-container');
        } else {
          console.error("EmailSubscribers class not found after script load.");
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email subscribers component. Class not found.</div>';
        }
      };
      script.onerror = function() {
        console.error('Error loading email subscribers component: Failed to load script');
        contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email subscribers component</div>';
      };
      document.head.appendChild(script);
    }
  };
  
  window.loadEmailWorkflows = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="email-workflows-container" class="loading"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    if (window.EmailWorkflows) {
      const workflowsComponent = new window.EmailWorkflows();
      workflowsComponent.render('email-workflows-container');
    } else {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '/admin/components/email/Workflows.js';
      script.onload = function() {
        if (window.EmailWorkflows) {
          const workflowsComponent = new window.EmailWorkflows();
          workflowsComponent.render('email-workflows-container');
        } else {
          console.error("EmailWorkflows class not found after script load.");
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email workflows component. Class not found.</div>';
        }
      };
      script.onerror = function() {
        console.error('Error loading email workflows component: Failed to load script');
        contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email workflows component</div>';
      };
      document.head.appendChild(script);
    }
  };
  
  window.loadEmailAnalytics = function() {
    const contentArea = document.getElementById("content-area");
    contentArea.innerHTML = '<div id="email-analytics-container" class="loading"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    if (window.EmailAnalytics) {
      const analyticsComponent = new window.EmailAnalytics();
      analyticsComponent.render('email-analytics-container');
    } else {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '/admin/components/email/Analytics.js';
      script.onload = function() {
        if (window.EmailAnalytics) {
          const analyticsComponent = new window.EmailAnalytics();
          analyticsComponent.render('email-analytics-container');
        } else {
          console.error("EmailAnalytics class not found after script load.");
          contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email analytics component. Class not found.</div>';
        }
      };
      script.onerror = function() {
        console.error('Error loading email analytics component: Failed to load script');
        contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email analytics component</div>';
      };
      document.head.appendChild(script);
    }
  };
}
window.loadEmailLists = function() {
  const contentArea = document.getElementById("content-area");
  contentArea.innerHTML = '<div id="email-lists-container" class="loading"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
  
  if (window.EmailLists) {
    const listsComponent = new window.EmailLists();
    listsComponent.render('email-lists-container');
  } else {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = '/admin/components/email/Lists.js';
    script.onload = function() {
      if (window.EmailLists) {
        const listsComponent = new window.EmailLists();
        listsComponent.render('email-lists-container');
      } else {
        console.error("EmailLists class not found after script load.");
        contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email lists component. Class not found.</div>';
      }
    };
    script.onerror = function() {
      console.error('Error loading email lists component: Failed to load script');
      contentArea.innerHTML = '<div class="alert alert-danger">Failed to load email lists component</div>';
    };
    document.head.appendChild(script);
  }
};
/* make it global just in case */
window.initSidebar = initSidebar;