// Dashboard.js - Main entry point for the Email Marketing section

class EmailDashboard {
    constructor() {
      this.container = null;
    }
  

    render(containerId) {
      this.container = document.getElementById(containerId);
      
      if (!this.container) {
        console.error(`Container with ID ${containerId} not found`);
        return;
      }
  
      this.container.innerHTML = `
        <div class="email-dashboard">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h1 class="h3 mb-0">Email Marketing Dashboard</h1>
          </div>
          
          <div class="row mb-4">
            <div class="col-md-3">
              <div class="card border-left-primary shadow h-100 py-2">
                <div class="card-body">
                  <div class="row no-gutters align-items-center">
                    <div class="col mr-2">
                      <div class="text-xs font-weight-bold text-primary text-uppercase mb-1">
                        Total Subscribers
                      </div>
                      <div class="h5 mb-0 font-weight-bold text-gray-800" id="total-subscribers">
                        <div class="spinner-border spinner-border-sm" role="status">
                          <span class="visually-hidden">Loading...</span>
                        </div>
                      </div>
                    </div>
                    <div class="col-auto">
                      <i class="bi bi-people fa-2x text-gray-300"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="col-md-3">
              <div class="card border-left-success shadow h-100 py-2">
                <div class="card-body">
                  <div class="row no-gutters align-items-center">
                    <div class="col mr-2">
                      <div class="text-xs font-weight-bold text-success text-uppercase mb-1">
                        Campaigns
                      </div>
                      <div class="h5 mb-0 font-weight-bold text-gray-800" id="total-campaigns">
                        <div class="spinner-border spinner-border-sm" role="status">
                          <span class="visually-hidden">Loading...</span>
                        </div>
                      </div>
                    </div>
                    <div class="col-auto">
                      <i class="bi bi-send fa-2x text-gray-300"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="col-md-3">
              <div class="card border-left-info shadow h-100 py-2">
                <div class="card-body">
                  <div class="row no-gutters align-items-center">
                    <div class="col mr-2">
                      <div class="text-xs font-weight-bold text-info text-uppercase mb-1">
                        Open Rate
                      </div>
                      <div class="h5 mb-0 font-weight-bold text-gray-800" id="open-rate">
                        <div class="spinner-border spinner-border-sm" role="status">
                          <span class="visually-hidden">Loading...</span>
                        </div>
                      </div>
                    </div>
                    <div class="col-auto">
                      <i class="bi bi-envelope-open fa-2x text-gray-300"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="col-md-3">
              <div class="card border-left-warning shadow h-100 py-2">
                <div class="card-body">
                  <div class="row no-gutters align-items-center">
                    <div class="col mr-2">
                      <div class="text-xs font-weight-bold text-warning text-uppercase mb-1">
                        Click Rate
                      </div>
                      <div class="h5 mb-0 font-weight-bold text-gray-800" id="click-rate">
                        <div class="spinner-border spinner-border-sm" role="status">
                          <span class="visually-hidden">Loading...</span>
                        </div>
                      </div>
                    </div>
                    <div class="col-auto">
                      <i class="bi bi-cursor fa-2x text-gray-300"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="row">
            <div class="col-md-6">
              <div class="card shadow mb-4">
                <div class="card-header py-3 d-flex justify-content-between align-items-center">
                  <h6 class="m-0 font-weight-bold text-primary">Recent Campaigns</h6>
                  <a href="#email/campaigns" class="btn btn-sm btn-primary" onclick="loadEmailCampaigns()">
                    View All
                  </a>
                </div>
                <div class="card-body">
                  <div id="recent-campaigns-container">
                    <div class="d-flex justify-content-center">
                      <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="col-md-6">
              <div class="card shadow mb-4">
                <div class="card-header py-3 d-flex justify-content-between align-items-center">
                  <h6 class="m-0 font-weight-bold text-primary">Email Performance</h6>
                  <a href="#email/analytics" class="btn btn-sm btn-primary" onclick="loadEmailAnalytics()">
                    View Analytics
                  </a>
                </div>
                <div class="card-body">
                  <div id="performance-chart-container" style="height: 300px;">
                    <div class="d-flex justify-content-center h-100 align-items-center">
                      <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
  
      this.loadDashboardData();
    }
  
    async loadDashboardData() {
      try {
        // Load Firebase if it's not already loaded
        if (!window.firebase) {
          console.error('Firebase not loaded');
          return;
        }
  
        const db = firebase.firestore();
        
        // Get total subscribers
        const subscribersSnapshot = await db.collection('subscribers').get();
        document.getElementById('total-subscribers').textContent = subscribersSnapshot.size;
        
        // Get total campaigns
        const campaignsSnapshot = await db.collection('campaigns').get();
        document.getElementById('total-campaigns').textContent = campaignsSnapshot.size;
        
        // Calculate open and click rates
        let totalSent = 0;
        let totalOpened = 0;
        let totalClicked = 0;
        
        campaignsSnapshot.forEach(doc => {
          const campaign = doc.data();
          if (campaign.stats) {
            totalSent += campaign.stats.sent || 0;
            totalOpened += campaign.stats.opened || 0;
            totalClicked += campaign.stats.clicked || 0;
          }
        });
        
        const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0.0';
        const clickRate = totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : '0.0';
        
        document.getElementById('open-rate').textContent = `${openRate}%`;
        document.getElementById('click-rate').textContent = `${clickRate}%`;
        
        // Get recent campaigns
        const recentCampaignsSnapshot = await db.collection('campaigns')
          .orderBy('createdAt', 'desc')
          .limit(5)
          .get();
        
        const recentCampaignsContainer = document.getElementById('recent-campaigns-container');
        
        if (recentCampaignsSnapshot.empty) {
          recentCampaignsContainer.innerHTML = `
            <div class="text-center py-3">
              <p class="mb-0 text-muted">No campaigns yet</p>
              <a href="#email/campaigns" class="btn btn-sm btn-primary mt-2" onclick="loadEmailCampaigns()">
                Create Campaign
              </a>
            </div>
          `;
        } else {
          let campaignsHtml = `
            <div class="list-group">
          `;
          
          recentCampaignsSnapshot.forEach(doc => {
            const campaign = doc.data();
            const date = campaign.createdAt ? new Date(campaign.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
            const statusClass = this.getStatusClass(campaign.status);
            
            campaignsHtml += `
              <a href="#email/campaigns?id=${doc.id}" class="list-group-item list-group-item-action">
                <div class="d-flex w-100 justify-content-between">
                  <h6 class="mb-1">${campaign.name}</h6>
                  <small class="text-muted">${date}</small>
                </div>
                <div class="d-flex w-100 justify-content-between">
                  <small>${campaign.subject}</small>
                  <span class="badge ${statusClass}">${campaign.status}</span>
                </div>
              </a>
            `;
          });
          
          campaignsHtml += `
            </div>
          `;
          
          recentCampaignsContainer.innerHTML = campaignsHtml;
        }
        
        // Load performance chart data
        this.loadPerformanceChart();
        
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        this.container.innerHTML = `
          <div class="alert alert-danger">
            Error loading dashboard data: ${error.message}
          </div>
        `;
      }
    }
    
    async loadPerformanceChart() {
      try {
        // Get tracking data for the last 30 days
        const db = firebase.firestore();
        
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        
        const trackingSnapshot = await db.collection('tracking')
          .where('sentAt', '>=', firebase.firestore.Timestamp.fromDate(thirtyDaysAgo))
          .get();
        
        // Prepare data by day
        const dailyData = {};
        
        // Initialize the last 30 days
        for (let i = 0; i < 30; i++) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          
          dailyData[dateStr] = {
            date: dateStr,
            sent: 0,
            opened: 0,
            clicked: 0
          };
        }
        
        // Fill with actual data
        trackingSnapshot.forEach(doc => {
          const tracking = doc.data();
          
          if (tracking.sentAt) {
            const date = new Date(tracking.sentAt.seconds * 1000);
            const dateStr = date.toISOString().split('T')[0];
            
            if (dailyData[dateStr]) {
              dailyData[dateStr].sent++;
              
              if (tracking.openedAt) {
                dailyData[dateStr].opened++;
              }
              
              if (tracking.clickedAt) {
                dailyData[dateStr].clicked++;
              }
            }
          }
        });
        
        // Convert to array and sort by date
        const chartData = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
        
        // Draw chart
        const chartContainer = document.getElementById('performance-chart-container');
        
        // Load Chart.js if not already loaded
        if (!window.Chart) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
          document.head.appendChild(script);
          
          script.onload = () => {
            this.drawChart(chartContainer, chartData);
          };
        } else {
          this.drawChart(chartContainer, chartData);
        }
        
      } catch (error) {
        console.error('Error loading performance chart:', error);
        document.getElementById('performance-chart-container').innerHTML = `
          <div class="alert alert-danger">
            Error loading performance chart: ${error.message}
          </div>
        `;
      }
    }
    
    drawChart(container, data) {
      container.innerHTML = '<canvas id="performanceChart"></canvas>';
      
      const ctx = document.getElementById('performanceChart').getContext('2d');
      
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => d.date),
          datasets: [
            {
              label: 'Sent',
              data: data.map(d => d.sent),
              backgroundColor: 'rgba(78, 115, 223, 0.05)',
              borderColor: 'rgba(78, 115, 223, 1)',
              pointBackgroundColor: 'rgba(78, 115, 223, 1)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgba(78, 115, 223, 1)',
              borderWidth: 2
            },
            {
              label: 'Opened',
              data: data.map(d => d.opened),
              backgroundColor: 'rgba(28, 200, 138, 0.05)',
              borderColor: 'rgba(28, 200, 138, 1)',
              pointBackgroundColor: 'rgba(28, 200, 138, 1)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgba(28, 200, 138, 1)',
              borderWidth: 2
            },
            {
              label: 'Clicked',
              data: data.map(d => d.clicked),
              backgroundColor: 'rgba(246, 194, 62, 0.05)',
              borderColor: 'rgba(246, 194, 62, 1)',
              pointBackgroundColor: 'rgba(246, 194, 62, 1)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgba(246, 194, 62, 1)',
              borderWidth: 2
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: {
                display: false
              }
            },
            y: {
              beginAtZero: true,
              precision: 0
            }
          },
          plugins: {
            tooltip: {
              backgroundColor: "rgb(255, 255, 255)",
              bodyColor: "#858796",
              titleMarginBottom: 10,
              titleColor: '#6e707e',
              titleFontSize: 14,
              borderColor: '#dddfeb',
              borderWidth: 1,
              caretPadding: 10,
              displayColors: false
            },
            legend: {
              display: true,
              position: 'bottom'
            }
          }
        }
      });
    }
    
    getStatusClass(status) {
      switch (status) {
        case 'draft':
          return 'bg-secondary';
        case 'scheduled':
          return 'bg-info';
        case 'sending':
          return 'bg-warning';
        case 'sent':
          return 'bg-success';
        case 'error':
          return 'bg-danger';
        default:
          return 'bg-secondary';
      }
    }
  }
  window.EmailDashboard = EmailDashboard;