// ... (Keep all your existing code above this line) ...

// ---------------- MY REPORTS (ONLINE) ----------------
async function loadMyReports() {
    const tbody = document.getElementById('reportLines');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div> Loading...</td></tr>';
    
    try {
        // Fetch only THIS rep's data
        const response = await fetch(`https://saluteonline.runasp.net/api/MobileData/RepData?repName=${encodeURIComponent(currentRep.name)}`);
        
        if (!response.ok) throw new Error("Failed to fetch");
        
        const data = await response.json();
        tbody.innerHTML = '';
        
        if (data.sales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No invoices found for your account.</td></tr>';
            return;
        }
        
        data.sales.forEach(s => {
            tbody.innerHTML += `<tr>
                <td>${s.date}</td>
                <td><strong>${s.invoiceNo}</strong><br><small class="text-muted">${s.client}</small></td>
                <td class="text-end fw-bold">${s.total.toFixed(2)}</td>
                <td class="text-end text-success">${s.paid.toFixed(2)}</td>
            </tr>`;
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Offline. Connect to internet to view live reports.</td></tr>';
    }
}
