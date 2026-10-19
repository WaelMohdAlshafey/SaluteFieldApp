// ============================================================
// GLOBAL STATE
// ============================================================
let allClients = [];
let allProducts = [];
let allEmployees = [];
let allStores = [];
let priceHistory = [];
let discountMethod = "Sequential";
let savedTx = [];
let currentSale = { lines: [], total: 0 };
let currentRet = { lines: [], total: 0 };
let currentRep = null;

// Rep's confirmed clients (from GetRepData) — for scope enforcement
let repScopeClients = new Set();
let repScopeLoaded = false;
let lastSyncTime = 0;

// ============================================================
// STARTUP — cache-first, then live sync in background
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(el => el.value = today);

    // 1. Load cached data INSTANTLY (offline-safe, <100ms)
    const saved = localStorage.getItem('salute_data_v2');
    if (saved) {
        try { loadData(JSON.parse(saved)); } catch (e) { console.warn('cache parse error', e); }
    }
    savedTx = JSON.parse(localStorage.getItem('salute_saved_v2') || '[]');
    lastSyncTime = parseInt(localStorage.getItem('salute_last_sync') || '0');
    updateSyncBadge();

    // 2. Try live sync in the background
    await syncNow();

    // 3. Restore logged-in rep
    const savedRep = localStorage.getItem('salute_rep');
    if (savedRep) {
        try {
            currentRep = JSON.parse(savedRep);
            await showApp();
        } catch (e) {
            localStorage.removeItem('salute_rep');
        }
    }

    // 4. Auto-sync every 15 min while app is in foreground and online
    setInterval(() => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
            syncNow();
        }
    }, 15 * 60 * 1000);
});

// ============================================================
// MANUAL SYNC — pull master data + rep scope from server
// ============================================================
async function syncNow() {
    const statusEl = document.getElementById('syncStatus');
    const connEl   = document.getElementById('connectionStatus');
    if (!statusEl || !connEl) return;

    statusEl.innerHTML = '⏳ Syncing...';
    statusEl.className = 'badge bg-info';

    try {
        // ---- 1. Master data ----
        const resp = await fetch(
            'https://saluteonline.runasp.net/api/MobileData',
            { cache: 'no-store' }
        );
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();

        localStorage.setItem('salute_data_v2', JSON.stringify(data));
        loadData(data);

        // ---- 2. Rep scope (rep's own clients) — only if logged in ----
        if (currentRep) {
            await refreshRepScope();
            refreshClientDropdowns();
        }

        // ---- 3. Update timestamps ----
        lastSyncTime = Date.now();
        localStorage.setItem('salute_last_sync', lastSyncTime.toString());

        statusEl.innerHTML = '✅ Synced ' + relativeTime(lastSyncTime);
        statusEl.className = 'badge bg-success';
        connEl.className   = 'badge bg-success';
        connEl.innerText   = 'Online';
    } catch (err) {
        statusEl.innerHTML = '⚠️ Sync failed — tap to retry';
        statusEl.className = 'badge bg-warning text-dark';
        connEl.className   = 'badge bg-warning text-dark';
        connEl.innerText   = 'Offline (cached)';
    }
}

// ============================================================
// SCOPE REFRESH — pull rep's confirmed clients from GetRepData
// ============================================================
async function refreshRepScope() {
    if (!currentRep) return;
    try {
        const resp = await fetch(
            `https://saluteonline.runasp.net/api/MobileData/RepData?repName=${encodeURIComponent(currentRep.name)}`,
            { cache: 'no-store' }
        );
        if (resp.ok) {
            const data = await resp.json();
            repScopeClients.clear();
            (data.sales || []).forEach(s => { if (s.client) repScopeClients.add(s.client); });
            repScopeLoaded = true;
        }
    } catch (e) {
        // Offline — keep whatever was in memory
    }
    // Always include clients this rep has already transacted with on this device
    savedTx.forEach(t => { if (t.client) repScopeClients.add(t.client); });
}

// ============================================================
// UI HELPERS
// ============================================================
function relativeTime(ts) {
    if (!ts) return '--';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60)    return diff + 's ago';
    if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

function updateSyncBadge() {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    if (lastSyncTime) {
        el.innerHTML = '🔄 Synced ' + relativeTime(lastSyncTime);
        el.className = 'badge bg-success';
    } else {
        el.innerHTML = '🔄 Never synced';
        el.className = 'badge bg-secondary';
    }
}

// ============================================================
// AUTO-SYNC on network reconnect
// ============================================================
window.addEventListener('online', () => {
    const connEl = document.getElementById('connectionStatus');
    if (connEl) {
        connEl.className = 'badge bg-success';
        connEl.innerText = 'Online';
    }
    syncNow();
});

window.addEventListener('offline', () => {
    const connEl = document.getElementById('connectionStatus');
    if (connEl) {
        connEl.className = 'badge bg-warning text-dark';
        connEl.innerText = 'Offline (cached)';
    }
});

// ============================================================
// DATA LOADING
// ============================================================
function loadData(data) {
    allClients    = data.clients    || [];
    allProducts   = data.products   || [];
    allEmployees  = data.employees  || [];
    allStores     = data.stores     || [];
    priceHistory  = data.priceHistory || [];
    discountMethod = data.discountMethod || "Sequential";

    // Rep dropdown
    const repSelect = document.getElementById('repSelect');
    if (repSelect) {
        repSelect.innerHTML = '<option value="">-- Select Your Name --</option>';
        allEmployees.forEach(e => {
            repSelect.innerHTML += `<option value="${e.name}" data-sup="${e.supervisor || ''}" data-area="${e.areaId || 0}">${e.name}</option>`;
        });
    }

    // Product dropdowns
    const prodHtml = '<option value="">-- Select Product --</option>' + allProducts.map(p =>
        `<option value="${p.name}" data-code="${p.code}" data-price="${p.price}" data-cost="${p.cost}">${p.name}</option>`
    ).join('');
    ['saleProduct', 'retProduct'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = prodHtml;
    });
}

// ============================================================
// LOGIN / LOGOUT
// ============================================================
function loginRep() {
    const select = document.getElementById('repSelect');
    if (!select.value) return alert("Please select your name.");
    const opt = select.options[select.selectedIndex];
    currentRep = {
        name: select.value,
        supervisor: opt.getAttribute('data-sup') || '',
        areaId: parseInt(opt.getAttribute('data-area')) || 0
    };
    localStorage.setItem('salute_rep', JSON.stringify(currentRep));
    showApp();
}

function logoutRep() {
    if (!confirm("Logout? Your saved transactions will remain on this device.")) return;
    localStorage.removeItem('salute_rep');
    currentRep = null;
    repScopeClients.clear();
    repScopeLoaded = false;
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('appSection').style.display = 'none';
    document.getElementById('bottomBar').style.display = 'none';
}

// ============================================================
// SHOW APP + SCOPE
// ============================================================
async function showApp() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('appSection').style.display = 'block';
    document.getElementById('bottomBar').style.display = 'flex';
    document.getElementById('lblRepName').innerText = currentRep.name;

    savedTx = JSON.parse(localStorage.getItem('salute_saved_v2') || '[]');
    renderSavedTable();

    // Pull rep's confirmed clients (offline-safe)
    await refreshRepScope();

    // Bootstrap: if no confirmed clients yet, default to "Show all clients"
    if (repScopeClients.size === 0) {
        document.getElementById('showAllClients').checked = true;
    }

    refreshClientDropdowns();
}

function refreshClientDropdowns() {
    const showAllEl = document.getElementById('showAllClients');
    const showAll = showAllEl ? showAllEl.checked : true;

    let list = allClients;
    if (!showAll && repScopeClients.size > 0) {
        list = allClients.filter(c => repScopeClients.has(c.name));
        if (list.length === 0) list = allClients; // fallback so dropdown is never empty
    }

    const clientHtml = '<option value="">-- Select Client --</option>' + list.map(c =>
        `<option value="${c.name}" data-code="${c.code}" data-ar="${c.arabicName || ''}" data-area="${c.areaName || ''}" data-city="${c.cityName || ''}">${c.name}</option>`
    ).join('');

    ['saleClient', 'retClient', 'payClient'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = clientHtml;
    });
}

// ============================================================
// STORE HELPERS — write the STORE's own area/city to Excel
// ============================================================
function getStoreAreaCity(storeId) {
    if (storeId === null || storeId === undefined || storeId === '') return { area: '', city: '' };
    const store = allStores.find(s => String(s.id) === String(storeId));
    if (!store) return { area: '', city: '' };
    return { area: store.area || '', city: store.city || '' };
}

function autoSelectStore() {
    const clientSel = document.getElementById('saleClient');
    if (!clientSel) return;
    const cOpt = clientSel.options[clientSel.selectedIndex];
    const areaName = cOpt.getAttribute('data-area') || '';
    const cityName = cOpt.getAttribute('data-city') || '';
    const storeSel = document.getElementById('saleStore');
    if (!storeSel) return;

    // Priority 1: SUB store matching city
    let store = allStores.find(s => s.type === 'SUB' && s.city === cityName);
    // Priority 2: PARENT store matching area
    if (!store) store = allStores.find(s => s.type === 'PARENT' && s.area === areaName);
    // Priority 3: MAIN store
    if (!store) store = allStores.find(s => s.type === 'MAIN');

    if (store) {
        storeSel.innerHTML = `<option value="${store.id}" data-area="${store.area || ''}" data-city="${store.city || ''}">${store.name}</option>`;
    } else {
        storeSel.innerHTML = `<option value="0">-- No store found --</option>`;
    }
}

function updatePrice(prefix) {
    const select = document.getElementById(prefix + 'Product');
    if (!select) return;
    const opt = select.options[select.selectedIndex];
    if (!opt.value) return;

    const prodName = opt.value;
    const dateInput = document.getElementById(prefix + 'Date');
    if (!dateInput) return;
    const saleDate = new Date(dateInput.value);

    let validPrice = parseFloat(opt.getAttribute('data-price')) || 0;
    const histories = priceHistory.filter(h => h.productName === prodName && h.salesPrice > 0);
    const validHist = histories
        .filter(h => new Date(h.startDate) <= saleDate)
        .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

    if (validHist.length > 0) validPrice = validHist[0].salesPrice;
    document.getElementById(prefix + 'Price').value = validPrice;
}

// ============================================================
// SALES
// ============================================================
function addLineToInvoice() {
    const prodSel = document.getElementById('saleProduct');
    if (!prodSel.value) return alert("Select a product");

    const pOpt = prodSel.options[prodSel.selectedIndex];
    const qty   = parseFloat(document.getElementById('saleQty').value) || 0;
    const price = parseFloat(document.getElementById('salePrice').value) || 0;
    const reg   = parseFloat(document.getElementById('saleReg').value)  || 0;
    const cash  = parseFloat(document.getElementById('saleCash').value) || 0;
    const add   = parseFloat(document.getElementById('saleAdd').value)  || 0;

    if (qty <= 0) return alert("Quantity must be > 0");

    const gross = qty * price;
    let netPrice = gross;
    if (discountMethod === "Additive") {
        netPrice = gross * (1 - ((reg + cash + add) / 100));
    } else {
        netPrice = gross * (1 - reg / 100) * (1 - cash / 100) * (1 - add / 100);
    }
    netPrice = Math.round(netPrice * 100) / 100;
    const totalDiscPct = reg + cash + add;

    currentSale.lines.push({
        product: prodSel.value,
        productCode: pOpt.getAttribute('data-code') || '',
        cost: parseFloat(pOpt.getAttribute('data-cost')) || 0,
        qty, price, disc: totalDiscPct, netPrice,
        total: netPrice
    });

    currentSale.total = Math.round((currentSale.total + netPrice) * 100) / 100;
    renderCurrentSale();

    document.getElementById('saleProduct').value = '';
    document.getElementById('saleQty').value = 1;
    document.getElementById('salePrice').value = 0;
    document.getElementById('saleReg').value = 0;
    document.getElementById('saleCash').value = 0;
    document.getElementById('saleAdd').value = 0;
}

function renderCurrentSale() {
    const tbody = document.getElementById('currentSaleLines');
    tbody.innerHTML = currentSale.lines.map((l, index) => `
        <tr>
            <td>${l.product}</td><td>${l.qty}</td><td>${l.netPrice.toFixed(2)}</td>
            <td><button class="btn btn-sm text-danger p-0" onclick="removeCurrentSaleLine(${index})">✖</button></td>
        </tr>
    `).join('');
    document.getElementById('currentSaleTotal').innerText = currentSale.total.toFixed(2);
}

function removeCurrentSaleLine(index) {
    const removedLine = currentSale.lines.splice(index, 1)[0];
    currentSale.total = Math.round((currentSale.total - removedLine.netPrice) * 100) / 100;
    renderCurrentSale();
}

function clearCurrentSale() {
    if (confirm("Clear this entire current invoice?")) {
        currentSale = { lines: [], total: 0 };
        renderCurrentSale();
        document.getElementById('saleInvoice').value = '';
        document.getElementById('saleClient').value = '';
        document.getElementById('salePaid').value = 0;
    }
}

function saveSaleInvoice() {
    const inv = document.getElementById('saleInvoice').value.trim();
    const clientSel = document.getElementById('saleClient');
    const storeSel  = document.getElementById('saleStore');
    if (!inv || !clientSel.value || !storeSel.value || currentSale.lines.length === 0) {
        return alert("Fill header and add at least one line.");
    }

    const cOpt = clientSel.options[clientSel.selectedIndex];
    const sOpt = storeSel.options[storeSel.selectedIndex];
    const storeAreaCity = getStoreAreaCity(storeSel.value);

    savedTx.push({
        type: 'Sale',
        invoiceNo: inv,
        date: document.getElementById('saleDate').value,
        client: clientSel.value,
        clientCode: cOpt.getAttribute('data-code') || '',
        clientAr: cOpt.getAttribute('data-ar') || '',
        governorate: cOpt.getAttribute('data-area') || '',
        region: cOpt.getAttribute('data-city') || '',
        storeId: storeSel.value,
        storeName: sOpt ? sOpt.textContent.trim() : '',
        storeArea: storeAreaCity.area,
        storeCity: storeAreaCity.city,
        payType: document.getElementById('salePayType').value,
        paid: parseFloat(document.getElementById('salePaid').value) || 0,
        total: currentSale.total,
        lines: currentSale.lines.map(l => ({ ...l }))
    });

    clearCurrentSale();
    saveAndRender();
}

// ============================================================
// RETURNS — invoice-based selection
// ============================================================
function loadClientInvoices() {
    const clientName = document.getElementById('retClient').value;
    const invSelect = document.getElementById('retInvoiceSelect');
    invSelect.innerHTML = '<option value="">-- Select Invoice --</option>';

    if (!clientName) {
        document.getElementById('retInvoiceLines').innerHTML =
            '<p class="text-muted small mb-0">Select a client first.</p>';
        currentRet = { lines: [], total: 0 };
        renderCurrentRet();
        return;
    }

    const clientSales = savedTx.filter(t => t.type === 'Sale' && t.client === clientName);
    if (clientSales.length === 0) {
        invSelect.innerHTML = '<option value="">-- No invoices for this client --</option>';
        document.getElementById('retInvoiceLines').innerHTML =
            '<p class="text-danger small mb-0">⚠ This client has no saved invoices on this device. Make a sale first.</p>';
        currentRet = { lines: [], total: 0 };
        renderCurrentRet();
        return;
    }

    clientSales.forEach((s, idx) => {
        invSelect.innerHTML += `<option value="${idx}">${s.invoiceNo} · ${s.date} · ${s.total.toFixed(2)}</option>`;
    });

    document.getElementById('retInvoiceLines').innerHTML =
        '<p class="text-muted small mb-0">Select an invoice to see its lines.</p>';
    currentRet = { lines: [], total: 0 };
    renderCurrentRet();
}

function loadInvoiceLines() {
    const clientName = document.getElementById('retClient').value;
    const invIdx = document.getElementById('retInvoiceSelect').value;
    if (!clientName || invIdx === '') return;

    const clientSales = savedTx.filter(t => t.type === 'Sale' && t.client === clientName);
    const sale = clientSales[parseInt(invIdx)];
    if (!sale) return;

    let html = '<table class="table table-sm mb-0">' +
        '<thead><tr><th style="width:28px"></th><th>Product</th><th>Sold</th><th>Return</th><th>Price</th></tr></thead><tbody>';
    sale.lines.forEach((line, i) => {
        html += `<tr>
            <td><input type="checkbox" class="form-check-input ret-line-check" data-idx="${i}" onchange="updateRetLineTotal()"></td>
            <td style="font-size:11px">${line.product}</td>
            <td>${line.qty}</td>
            <td><input type="number" class="form-control form-control-sm ret-line-qty" data-idx="${i}"
                       value="${line.qty}" min="0" max="${line.qty}" style="width:60px" onchange="updateRetLineTotal()"></td>
            <td>${line.price.toFixed(2)}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    const wrap = document.getElementById('retInvoiceLines');
    wrap.innerHTML = html;
    wrap.dataset.clientName = clientName;
    wrap.dataset.saleIdx = invIdx;

    // Auto-fill header
    document.getElementById('retReturnNo').value = 'RET-' + sale.invoiceNo;
    document.getElementById('retDate').value = new Date().toISOString().split('T')[0];

    updateRetLineTotal();
}

function updateRetLineTotal() {
    const wrap = document.getElementById('retInvoiceLines');
    const clientName = wrap.dataset.clientName;
    const saleIdx = wrap.dataset.saleIdx;
    if (!clientName || saleIdx === undefined) return;

    const clientSales = savedTx.filter(t => t.type === 'Sale' && t.client === clientName);
    const sale = clientSales[parseInt(saleIdx)];
    if (!sale) return;

    currentRet = { lines: [], total: 0 };
    document.querySelectorAll('.ret-line-check').forEach(cb => {
        if (!cb.checked) return;
        const idx = parseInt(cb.dataset.idx);
        const line = sale.lines[idx];
        const qtyInput = document.querySelector(`.ret-line-qty[data-idx="${idx}"]`);
        let qty = parseFloat(qtyInput.value) || 0;
        if (qty <= 0) return;
        if (qty > line.qty) { qty = line.qty; qtyInput.value = line.qty; }

        const lineTotal = Math.round(qty * line.price * 100) / 100;
        currentRet.lines.push({
            product: line.product,
            productCode: line.productCode,
            cost: line.cost,
            qty: qty,
            price: line.price,
            total: lineTotal
        });
        currentRet.total = Math.round((currentRet.total + lineTotal) * 100) / 100;
    });

    renderCurrentRet();
}

function renderCurrentRet() {
    const tbody = document.getElementById('currentRetLines');
    tbody.innerHTML = currentRet.lines.map((l, index) => `
        <tr>
            <td>${l.product}</td><td>${l.qty}</td><td>${l.total.toFixed(2)}</td>
            <td><button class="btn btn-sm text-danger p-0" onclick="removeCurrentRetLine(${index})">✖</button></td>
        </tr>
    `).join('');
    document.getElementById('currentRetTotal').innerText = currentRet.total.toFixed(2);
}

function removeCurrentRetLine(index) {
    const removedLine = currentRet.lines.splice(index, 1)[0];
    currentRet.total = Math.round((currentRet.total - removedLine.total) * 100) / 100;
    renderCurrentRet();
}

function clearCurrentRet(silent) {
    if (!silent && !confirm("Clear this entire current return?")) return;
    currentRet = { lines: [], total: 0 };
    renderCurrentRet();
    const retNo = document.getElementById('retReturnNo');
    if (retNo) retNo.value = '';
    const invSel = document.getElementById('retInvoiceSelect');
    if (invSel) invSel.value = '';
    const wrap = document.getElementById('retInvoiceLines');
    if (wrap) {
        wrap.innerHTML = '<p class="text-muted small mb-0">Select a client and invoice to load lines.</p>';
        delete wrap.dataset.saleIdx;
        delete wrap.dataset.clientName;
    }
}

function saveReturn() {
    const returnNo = document.getElementById('retReturnNo').value.trim();
    const clientName = document.getElementById('retClient').value;

    if (!returnNo || !clientName || currentRet.lines.length === 0) {
        return alert("Fill return # and select at least one line to return.");
    }

    const wrap = document.getElementById('retInvoiceLines');
    const saleIdx = wrap.dataset.saleIdx;
    const clientSales = savedTx.filter(t => t.type === 'Sale' && t.client === clientName);
    const originalSale = clientSales[parseInt(saleIdx)];

    const clientSel = document.getElementById('retClient');
    const cOpt = clientSel.options[clientSel.selectedIndex];

    // Use ORIGINAL SALE's store area/city so the return posts to the same store on import
    let storeArea = cOpt.getAttribute('data-area') || '';
    let storeCity = cOpt.getAttribute('data-city') || '';
    if (originalSale && originalSale.storeId) {
        const sa = getStoreAreaCity(originalSale.storeId);
        storeArea = sa.area;
        storeCity = sa.city;
    }

    savedTx.push({
        type: 'Return',
        invoiceNo: returnNo,
        originalInvoiceNo: originalSale ? originalSale.invoiceNo : '',
        date: document.getElementById('retDate').value,
        client: clientName,
        clientCode: cOpt.getAttribute('data-code') || '',
        clientAr: cOpt.getAttribute('data-ar') || '',
        governorate: storeArea,
        region: storeCity,
        storeId: originalSale ? originalSale.storeId : null,
        total: currentRet.total,
        lines: currentRet.lines.map(l => ({ ...l }))
    });

    clearCurrentRet(true);
    saveAndRender();
    alert(`Return ${returnNo} saved.`);
}

// ============================================================
// PAYMENTS
// ============================================================
function savePayment() {
    const inv = document.getElementById('payInvoice').value.trim();
    const clientSel = document.getElementById('payClient');
    const amount = parseFloat(document.getElementById('payAmount').value);
    if (!inv || !clientSel.value || !amount || amount <= 0) return alert("Fill all fields with a positive amount.");

    const cOpt = clientSel.options[clientSel.selectedIndex];

    savedTx.push({
        type: 'Payment',
        invoiceNo: inv,
        date: document.getElementById('payDate').value,
        client: clientSel.value,
        clientCode: cOpt.getAttribute('data-code') || '',
        clientAr: cOpt.getAttribute('data-ar') || '',
        governorate: cOpt.getAttribute('data-area') || '',
        region: cOpt.getAttribute('data-city') || '',
        total: amount,
        lines: []
    });

    document.getElementById('payAmount').value = 0;
    document.getElementById('payInvoice').value = '';
    document.getElementById('payClient').value = '';

    saveAndRender();
}

// ============================================================
// MY REPORTS (online only — no offline cache)
// ============================================================
async function loadMyReports() {
    const tbody = document.getElementById('reportLines');
    if (!currentRep) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div> Loading...</td></tr>';

    try {
        const response = await fetch(
            `https://saluteonline.runasp.net/api/MobileData/RepData?repName=${encodeURIComponent(currentRep.name)}`,
            { cache: 'no-store' }
        );
        if (!response.ok) throw new Error("Failed to fetch");

        const data = await response.json();
        tbody.innerHTML = '';

        if (!data.sales || data.sales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No invoices found for your account.</td></tr>';
            return;
        }

        data.sales.forEach(s => {
            tbody.innerHTML += `<tr>
                <td>${s.date}</td>
                <td><strong>${s.invoiceNo}</strong><br><small class="text-muted">${s.client}</small></td>
                <td class="text-end fw-bold">${(s.total || 0).toFixed(2)}</td>
                <td class="text-end text-success">${(s.paid || 0).toFixed(2)}</td>
            </tr>`;
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Offline. Connect to internet to view live reports.</td></tr>';
    }
}

// ============================================================
// SAVED TRANSACTIONS — local persistence
// ============================================================
function saveAndRender() {
    localStorage.setItem('salute_saved_v2', JSON.stringify(savedTx));
    renderSavedTable();
}

function renderSavedTable() {
    const tbody = document.getElementById('savedLines');
    if (!tbody) return;
    tbody.innerHTML = '';
    savedTx.forEach((t, i) => {
        const cls = t.type === 'Sale' ? 'bg-success'
                  : t.type === 'Return' ? 'bg-warning text-dark'
                  : 'bg-info';
        tbody.innerHTML += `<tr>
            <td><span class="badge ${cls}">${t.type}</span></td>
            <td>${t.invoiceNo}</td>
            <td>${t.client}</td>
            <td>${(t.total || 0).toFixed(2)}</td>
            <td><button class="btn btn-sm text-danger p-0" onclick="removeTx(${i})">✖</button></td>
        </tr>`;
    });
    const cnt = document.getElementById('savedCount');
    if (cnt) cnt.innerText = savedTx.length + " Saved";
}

function removeTx(i) {
    if (confirm("Delete this saved transaction entirely?")) {
        savedTx.splice(i, 1);
        saveAndRender();
    }
}

function clearAll() {
    if (confirm("Clear ALL saved transactions? This cannot be undone.")) {
        savedTx = [];
        saveAndRender();
    }
}

// ============================================================
// EXPORT EXCEL — the format that matches the import service
//   Sale     : movement = -qty, quntity = qty
//   Return   : movement = +qty, quntity = 0 (import won't consume FIFO)
//   Payment  : transaction = "Payment", collected = amount
// governorate/region come from the STORE for sale/return rows
// so the import service finds the matching store row
// ============================================================
function exportExcel() {
    if (!currentRep) return alert("Login first.");
    if (savedTx.length === 0) return alert("No data.");

    let excelData = [];

    savedTx.forEach(t => {
        const isSale = t.type === 'Sale';
        const isRet  = t.type === 'Return';
        const isPay  = t.type === 'Payment';
        const month = new Date(t.date).getMonth();
        const quarter = "Q" + Math.ceil((month + 1) / 3);

        // Resolve target area/city: store's own for sale/return; client's for payment
        let targetArea = '', targetCity = '';
        if ((isSale || isRet) && t.storeId) {
            const sc = getStoreAreaCity(t.storeId);
            targetArea = sc.area || t.storeArea || '';
            targetCity = sc.city || t.storeCity || '';
        } else {
            targetArea = t.governorate || '';
            targetCity = t.region || '';
        }

        if (isPay) {
            excelData.push({
                "qurter": quarter,
                "code": "MISC",
                "movement": 0,
                "date": t.date,
                "transaction": "Payment",
                "product": "Payment on Account",
                "quntity": 0,
                "price": 0,
                "discount": "0%",
                "netprice": 0,
                "arabicname": t.clientAr,
                "invoiceno": t.invoiceNo,
                "client": t.client,
                "discription": "Mobile App Payment",
                "super visor": currentRep.supervisor || '',
                "sales rep": currentRep.name,
                "cost": 0,
                "docno": t.invoiceNo,
                "paymentmethod": "Cash",
                "returns": 0,
                "collected": t.total,
                "requestedamount": 0,
                "totalofreturn": 0,
                "returnsprice": 0,
                "return": 0,
                "pricecode": "MISC",
                "sales": 0,
                "governorate": targetArea,
                "region": targetCity,
                "salesnet": 0,
                "costnet": 0,
                "month": new Date(t.date).toLocaleString('default', { month: 'long' }),
                "aginglimit": 30,
                "initiateddate": t.date,
                "quarter": quarter
            });
        } else {
            t.lines.forEach(line => {
                const grossAmount = line.price * line.qty;
                excelData.push({
                    "qurter": quarter,
                    "code": line.productCode || '',
                    "movement": isSale ? -line.qty : line.qty,
                    "date": t.date,
                    "transaction": isSale ? "Sales" : "Return",
                    "product": line.product,
                    // Returns: quntity=0 so import does NOT consume FIFO
                    "quntity": isSale ? line.qty : 0,
                    "price": line.price,
                    "discount": isSale ? ((line.disc || 0) + "%") : "0%",
                    "netprice": isSale ? line.netPrice : line.price,
                    "arabicname": t.clientAr,
                    "invoiceno": t.invoiceNo,
                    "client": t.client,
                    "discription": isSale
                        ? "Mobile App Sale"
                        : ("Return against invoice " + (t.originalInvoiceNo || '?')),
                    "super visor": currentRep.supervisor || '',
                    "sales rep": currentRep.name,
                    "cost": line.cost,
                    "docno": t.invoiceNo,
                    "paymentmethod": isSale ? t.payType : "Credit",
                    "returns": isRet ? line.qty : 0,
                    "collected": isSale ? t.paid : 0,
                    "requestedamount": isSale ? grossAmount : 0,
                    "totalofreturn": isRet ? line.total : 0,
                    "returnsprice": isRet ? line.price : 0,
                    "return": isRet ? line.total : 0,
                    "pricecode": line.productCode || '',
                    "sales": isSale ? grossAmount : 0,
                    "governorate": targetArea,
                    "region": targetCity,
                    "salesnet": isSale ? line.netPrice : 0,
                    "costnet": line.cost * line.qty,
                    "month": new Date(t.date).toLocaleString('default', { month: 'long' }),
                    "aginglimit": 30,
                    "initiateddate": t.date,
                    "quarter": quarter
                });
            });
        }
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    ws['!cols'] = [];
    ws['!cols'][16] = { hidden: true };
    ws['!cols'][30] = { hidden: true };
    ws['!protect'] = {
        password: "SaluteAdmin2026",
        formatColumns: false,
        formatCells: false,
        selectLockedCells: false
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `FieldData_${currentRep.name}_${new Date().getTime()}.xlsx`);
}
