// Analytics.js - Email performance analytics component

class EmailAnalytics {
    constructor() {
      this.container = null;
      this.period = 'month'; // Default: Last 30 days
    }
    

    render(containerId) {
      this.container = document.getElementById(containerId);
      
      if (!this.container) {
        console.error(`Container with ID ${containerId} not found`);
        return;
      }
  
      this.renderAnalytics();
    }
  
    async renderAnalytics() {
      try {
        this.container.innerHTML = `
          <div class="analytics-container">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h1 class="h3 mb-0">Email Analytics</h1>
              <div>
                <select class="form-select" id="period-selector">
                  <option value="week" ${this.period === 'week' ? 'selected' : ''}>Last 7 Days</option>
                  <option value="month" ${this.period === 'month' ? 'selected' : ''}>Last 30 Days</option>
                  <option value="year" ${this.period === 'year' ? 'selected' : ''}>Last Year</option>
                </select>
              </div>
            </div>
            
            <div class="row mb-4">
              <div class="col-md-3">
                <div class="card border-left-primary shadow h-100 py-2">
                  <div class="card-body">
                    <div class="row no-gutters align-items-center">
                      <div class="col mr-2">
                        <div class="text-xs font-weight-bold text-primary text-uppercase mb-1">
                          Emails Sent
                        </div>
                        <div class="h5 mb-0 font-weight-bold text-gray-800" id="total-sent">
                          <div class="spinner-border spinner-border-sm" role="status">
                            <span class="visually-hidden">Loading...</span>
                          </div>
                        </div>
                      </div>
                      <div class="col-auto">
                        <i class="bi bi-envelope fa-2x text-gray-300"></i>
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
                <div class="card border-left-info shadow h-100 py-2">
                  <div class="card-body">
                    <div class="row no-gutters align-items-center">
                      <div class="col mr-2">
                        <div class="text-xs font-weight-bold text-info text-uppercase mb-1">
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
              
              <div class="col-md-3">
                <div class="card border-left-warning shadow h-100 py-2">
                  <div class="card-body">
                    <div class="row no-gutters align-items-center">
                      <div class="col mr-2">
                        <div class="text-xs font-weight-bold text-warning text-uppercase mb-1">
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
            </div>
            
            <div class="row">
              <div class="col-md-8">
                <div class="card shadow mb-4">
                  <div class="card-header py-3">
                    <h6 class="m-0 font-weight-bold text-primary">Email Performance Over Time</h6>
                  </div>
                  <div class="card-body">
                    <div id="performance-chart-container" style="height: 350px;">
                      <div class="d-flex justify-content-center h-100 align-items-center">
                        <div class="spinner-border" role="status">
                          <span class="visually-hidden">Loading...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="col-md-4">
                <div class="card shadow mb-4">
                  <div class="card-header py-3">
                    <h6 class="m-0 font-weight-bold text-primary">Top Performing Campaigns</h6>
                  </div>
                  <div class="card-body">
                    <div id="top-campaigns-container">
                      <div class="d-flex justify-content-center">
                        <div class="spinner-border" role="status">
                          <span class="visually-hidden">Loading...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="row">
              <div class="col-md-6">
                <div class="card shadow mb-4">
                  <div class="card-header py-3">
                    <h6 class="m-0 font-weight-bold text-primary">Most Clicked Links</h6>
                  </div>
                  <div class="card-body">
                    <div id="top-links-container">
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
                  <div class="card-header py-3">
                    <h6 class="m-0 font-weight-bold text-primary">Sends by Hour of Day</h6>
                  </div>
                  <div class="card-body">
                    <div id="hourly-chart-container" style="height: 250px;">
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
  
        // Add period selector event listener
        document.getElementById('period-selector').addEventListener('change', (e) => {
          this.period = e.target.value;
          this.loadAnalyticsData();
        });
        
        // Load analytics data
        this.loadAnalyticsData();
        
      } catch (error) {
        console.error('Error rendering analytics:', error);
        this.container.innerHTML = `
          <div class="alert alert-danger">
            Error loading analytics: ${error.message}
          </div>
        `;
      }
    }
    
    async loadAnalyticsData() {
      try {
        const db = firebase.firestore();
        
        // Calculate date range
        const now = new Date();
        const startDate = new Date();
        
        switch (this.period) {
          case 'week':
            startDate.setDate(now.getDate() - 7);
            break;
          case 'month':
            startDate.setDate(now.getDate() - 30);
            break;
          case 'year':
            startDate.setFullYear(now.getFullYear() - 1);
            break;
          default:
            startDate.setDate(now.getDate() - 30);
        }
        
        const startTimestamp = firebase.firestore.Timestamp.fromDate(startDate);
        
        // Get all campaigns in the period
        const campaignsSnapshot = await db.collection('campaigns')
          .where('createdAt', '>=', startTimestamp)
          .get();
        
        // Get tracking data
        const trackingSnapshot = await db.collection('tracking')
          .where('sentAt', '>=', startTimestamp)
          .get();
        
        // Calculate overall stats
        const totalCampaigns = campaignsSnapshot.size;
        const totalSent = trackingSnapshot.size;
        let totalOpened = 0;
        let totalClicked = 0;
        
        // Prepare daily stats for chart
        const dailyStats = {};
        
        // Prepare hourly stats
        const hourlyStats = Array(24).fill(0);
        
        // Prepare link clicks data
        const linkClicks = {};
        
        // Process tracking data
        trackingSnapshot.forEach(doc => {
          const tracking = doc.data();
          
          // Count opened and clicked
          if (tracking.openedAt) totalOpened++;
          if (tracking.clickedAt) totalClicked++;
          
          // Process by day
          if (tracking.sentAt) {
            const date = new Date(tracking.sentAt.seconds * 1000);
            const dateKey = date.toISOString().split('T')[0];
            
            if (!dailyStats[dateKey]) {
              dailyStats[dateKey] = {
                date: dateKey,
                sent: 0,
                opened: 0,
                clicked: 0
              };
            }
            
            dailyStats[dateKey].sent++;
            if (tracking.openedAt) dailyStats[dateKey].opened++;
            if (tracking.clickedAt) dailyStats[dateKey].clicked++;
            
            // Track hourly distribution
            const hour = date.getHours();
            hourlyStats[hour]++;
          }
          
          // Process link clicks
          if (tracking.clickedLinks && tracking.clickedLinks.length > 0) {
            tracking.clickedLinks.forEach(link => {
              if (!linkClicks[link.url]) {
                linkClicks[link.url] = 0;
              }
              linkClicks[link.url]++;
            });
          }
        });
        
        // Calculate rates
        const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
        const clickRate = totalSent > 0 ? (totalClicked / totalSent) * 100 : 0;
        
        // Update UI
        document.getElementById('total-sent').textContent = totalSent.toLocaleString();
        document.getElementById('open-rate').textContent = `${openRate.toFixed(1)}%`;
        document.getElementById('click-rate').textContent = `${clickRate.toFixed(1)}%`;
        document.getElementById('total-campaigns').textContent = totalCampaigns.toLocaleString();
        
        // Process campaign performance for top campaigns
        const campaignPerformance = [];
        
        for (const doc of campaignsSnapshot.docs) {
          const campaign = doc.data();
          
          if (campaign.stats) {
            const { sent, opened, clicked } = campaign.stats;
            
            if (sent > 0) {
              campaignPerformance.push({
                id: doc.id,
                name: campaign.name,
                subject: campaign.subject,
                sent,
                opened: opened || 0,
                clicked: clicked || 0,
                openRate: ((opened || 0) / sent) * 100,
                clickRate: ((clicked || 0) / sent) * 100
              });
            }
          }
        }
        
        // Sort by open rate
        campaignPerformance.sort((a, b) => b.openRate - a.openRate);
        
        // Display top campaigns
        this.displayTopCampaigns(campaignPerformance.slice(0, 5));
        
        // Display top links
        this.displayTopLinks(linkClicks);
        
        // Create performance chart
        this.createPerformanceChart(dailyStats);
        
        // Create hourly chart
        this.createHourlyChart(hourlyStats);
        
      } catch (error) {
        console.error('Error loading analytics data:', error);
        alert(`Error loading analytics data: ${error.message}`);
      }
    }
    
    displayTopCampaigns(campaigns) {
      const container = document.getElementById('top-campaigns-container');
      
      if (campaigns.length === 0) {
        container.innerHTML = `
          <div class="text-center py-3">
            <p class="text-muted mb-0">No campaign data available</p>
          </div>
        `;
        return;
      }
      
      let html = `
        <div class="table-responsive">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Sent</th>
                <th>Open Rate</th>
                <th>Click Rate</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      campaigns.forEach(campaign => {
        html += `
          <tr>
            <td>${campaign.name}</td>
            <td>${campaign.sent.toLocaleString()}</td>
            <td>${campaign.openRate.toFixed(1)}%</td>
            <td>${campaign.clickRate.toFixed(1)}%</td>
          </tr>
        `;
      });
      
      html += `
            </tbody>
          </table>
        </div>
      `;
      
      container.innerHTML = html;
    }
    
    displayTopLinks(linkClicks) {
      const container = document.getElementById('top-links-container');
      
      if (Object.keys(linkClicks).length === 0) {
        container.innerHTML = `
          <div class="text-center py-3">
            <p class="text-muted mb-0">No link click data available</p>
          </div>
        `;
        return;
      }
      
      // Convert to array and sort
      const links = Object.entries(linkClicks)
        .map(([url, count]) => ({ url, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10 links
      
      let html = `
        <div class="table-responsive">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Link</th>
                <th>Clicks</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      links.forEach(link => {
        // Truncate URL if too long
        const displayUrl = link.url.length > 50 
          ? link.url.substring(0, 47) + '...' 
          : link.url;
        
        html += `
          <tr>
            <td><a href="${link.url}" target="_blank" title="${link.url}">${displayUrl}</a></td>
            <td>${link.count}</td>
          </tr>
        `;
      });
      
      html += `
            </tbody>
          </table>
        </div>
      `;
      
      container.innerHTML = html;
    }
    
    createPerformanceChart(dailyStats) {
      // Convert dailyStats object to array and sort by date
      const chartData = Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date));
      
      const chartContainer = document.getElementById('performance-chart-container');
      
      if (chartData.length === 0) {
        chartContainer.innerHTML = `
          <div class="text-center py-3">
            <p class="text-muted mb-0">No data available for the selected period</p>
          </div>
        `;
        return;
      }
      
      // Calculate open and click rates
      chartData.forEach(day => {
        day.openRate = day.sent > 0 ? (day.opened / day.sent) * 100 : 0;
        day.clickRate = day.sent > 0 ? (day.clicked / day.sent) * 100 : 0;
      });
      
      // Load Chart.js if not already loaded
      if (!window.Chart) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        document.head.appendChild(script);
        
        script.onload = () => {
          this.drawPerformanceChart(chartContainer, chartData);
        };
      } else {
        this.drawPerformanceChart(chartContainer, chartData);
      }
    }
    
    drawPerformanceChart(container, data) {
      // Clear container
      container.innerHTML = '<canvas id="performanceChart"></canvas>';
      
      // Create chart
      const ctx = document.getElementById('performanceChart').getContext('2d');
      
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => {
            // Format date for display
            const date = new Date(d.date);
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          }),
          datasets: [
            {
              label: 'Emails Sent',
              data: data.map(d => d.sent),
              backgroundColor: 'rgba(78, 115, 223, 0.05)',
              borderColor: 'rgba(78, 115, 223, 1)',
              pointBackgroundColor: 'rgba(78, 115, 223, 1)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgba(78, 115, 223, 1)',
              borderWidth: 2,
              yAxisID: 'y'
            },
            {
              label: 'Open Rate',
              data: data.map(d => d.openRate),
              backgroundColor: 'rgba(28, 200, 138, 0.05)',
              borderColor: 'rgba(28, 200, 138, 1)',
              pointBackgroundColor: 'rgba(28, 200, 138, 1)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgba(28, 200, 138, 1)',
              borderWidth: 2,
              yAxisID: 'y1'
            },
            {
              label: 'Click Rate',
              data: data.map(d => d.clickRate),
              backgroundColor: 'rgba(246, 194, 62, 0.05)',
              borderColor: 'rgba(246, 194, 62, 1)',
              pointBackgroundColor: 'rgba(246, 194, 62, 1)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgba(246, 194, 62, 1)',
              borderWidth: 2,
              yAxisID: 'y1'
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
              position: 'left',
              title: {
                display: true,
                text: 'Emails Sent'
              }
            },
            y1: {
              beginAtZero: true,
              position: 'right',
              max: 100,
              title: {
                display: true,
                text: 'Rate (%)'
              },
              grid: {
                drawOnChartArea: false
              }
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
    
    createHourlyChart(hourlyData) {
      const chartContainer = document.getElementById('hourly-chart-container');
      
      // Load Chart.js if not already loaded
      if (!window.Chart) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        document.head.appendChild(script);
        
        script.onload = () => {
          this.drawHourlyChart(chartContainer, hourlyData);
        };
      } else {
        this.drawHourlyChart(chartContainer, hourlyData);
      }
    }
    
    drawHourlyChart(container, data) {
      // Clear container
      container.innerHTML = '<canvas id="hourlyChart"></canvas>';
      
      // Create chart
      const ctx = document.getElementById('hourlyChart').getContext('2d');
      
      // Create hour labels
      const hourLabels = Array.from({ length: 24 }, (_, i) => {
        const hour = i % 12 || 12;
        const ampm = i < 12 ? 'AM' : 'PM';
        return `${hour} ${ampm}`;
      });
      
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: hourLabels,
          datasets: [
            {
              label: 'Emails Sent',
              data: data,
              backgroundColor: 'rgba(78, 115, 223, 0.7)',
              borderColor: 'rgba(78, 115, 223, 1)',
              borderWidth: 1
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
              grid: {
                drawBorder: false
              }
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
              display: false
            }
          }
        }
      });
    }
  }
  window.EmailAnalytics = EmailAnalytics;