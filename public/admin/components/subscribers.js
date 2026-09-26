// admin/components/subscribers.js

function loadSubscribers() {
    const contentArea = document.getElementById("content-area");
    
    let html = `
        <div class="section-container">
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h2>Newsletter Subscribers</h2>
                <button class="btn btn-primary" onclick="testSendNewsletter()">
                    <i class="bi bi-send me-2"></i>Send Test Newsletter
                </button>
            </div>
            
            <div class="card shadow-sm">
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-striped table-hover align-middle">
                            <thead class="table-dark">
                                <tr>
                                    <th>Email</th>
                                    <th>Name</th>
                                    <th>Subscribed (EN)</th>
                                    <th>Subscribed (HE)</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="subscribers-tbody">
                                <tr><td colspan="5" class="text-center">Loading subscribers...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    contentArea.innerHTML = html;
    fetchSubscribers();
}

async function fetchSubscribers() {
    const tbody = document.getElementById('subscribers-tbody');
    try {
        const snapshot = await db.collection('subscribers').get();
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No subscribers found.</td></tr>';
            return;
        }

        let rows = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const email = data.email || 'N/A';
            const name = data.name || 'User';
            const enSub = data.subscribedEn ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>';
            const heSub = data.subscribedHe ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>';
            
            rows += `
                <tr>
                    <td>${email}</td>
                    <td>${name}</td>
                    <td>${enSub}</td>
                    <td>${heSub}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="removeSubscriber('${doc.id}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = rows;
    } catch (error) {
        console.error("Error fetching subscribers:", error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading subscribers.</td></tr>';
    }
}

async function removeSubscriber(docId) {
    if (!confirm('Are you sure you want to remove this subscriber?')) return;
    try {
        await db.collection('subscribers').doc(docId).delete();
        // Also update users collection if possible, but for simplicity we just remove the subscriber record.
        alert('Subscriber removed successfully');
        fetchSubscribers();
    } catch (error) {
        console.error("Error removing subscriber:", error);
        alert('Error removing subscriber');
    }
}

async function testSendNewsletter() {
    if (!confirm('This will send a test newsletter to info@trendingtechdaily.com. Proceed?')) return;
    
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
    btn.disabled = true;
    
    try {
        const res = await fetch('https://testsendnewsletter-xa54maubsa-uc.a.run.app?email=info@trendingtechdaily.com');
        const data = await res.json();
        if (data.success) {
            alert('Test newsletter sent successfully!');
        } else {
            alert('Failed to send: ' + data.error);
        }
    } catch (error) {
        console.error("Error sending test newsletter:", error);
        alert('Error sending test newsletter');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
