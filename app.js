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
let currentSale = { lines: [], gross: 0, discount: 0, total: 0 };
let currentRet = { lines: [], total: 0 };
let currentRep = null;
let allInvoices = []; 
let historicalInvoices = []; 
let currentStatementData = { invoices: [], payments: [], returns: [] };

let currentReportMode = 'sales'; 
let rawServerSales = []; 
let rawServerPayments = [];
let rawServerReturns = [];

let repScopeClients = new Set();
let lastSyncTime = 0;
let syncIntervalMs = 15 * 60 * 1000;
let syncIntervalTimer = null;

const VALID_SYNC_INTERVALS = [0, 900000, 1800000, 2700000, 3600000, 86400000];
const DEFAULT_SYNC_INTERVAL_MS = 900000;

// ============================================================
// STARTUP
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(el => el.value = today);

    const firstDay = new Date();
    firstDay.setDate(1);
    if (document.getElementById('repFromDate')) document.getElementById('repFromDate').value = firstDay.toISOString().split('T')[0];
    if (document.getElementById('repToDate')) document.getElementById('repToDate').value = today;

    const saved = localStorage.getItem('salute_data_v2');
    if (saved) { try { loadData(JSON.parse(saved)); } catch (e) {} }
    
    savedTx = JSON.parse(localStorage.getItem('salute_saved_v2') || '[]');
    historicalInvoices = JSON.parse(localStorage.getItem('salute_historical_invoices') || '[]');
    
    lastSyncTime = parseInt(localStorage.getItem('salute_last_sync') || '0');
    updateSyncBadge();
    loadSyncInterval();
    switchReportMode('sales'); 

    await syncNow();

    const savedRep = localStorage.getItem('salute_rep');
    if (savedRep) {
        try {
            currentRep = JSON.parse(savedRep);
            await showApp();
        } catch (e) { localStorage.removeItem('salute_rep'); }
    }
});

// ============================================================
// SYNC LOGIC
// ============================================================
function loadSyncInterval() {
    const stored = parseInt(localStorage.getItem('salute_sync_interval') || '');
    syncIntervalMs = VALID_SYNC_INTERVALS.includes(stored) ? stored : DEFAULT_SYNC_INTERVAL_MS;
    const sel = document.getElementById('syncIntervalSelect');
    if (sel) sel.value = String(syncIntervalMs);
    scheduleSync();
}

function scheduleSync() {
    if (syncIntervalTimer) clearInterval(syncIntervalTimer);
    if (syncIntervalMs <= 0) return;
    syncIntervalTimer = setInterval(() => {
        if (document.visibilityState === 'visible' && navigator.onLine) syncNow();
    }, syncIntervalMs);
}

function changeSyncInterval(value) {
    const parsed = parseInt(value);
    if (!VALID_SYNC_INTERVALS.includes(parsed)) return;
    syncIntervalMs = parsed;
    localStorage.setItem('salute_sync_interval', String(syncIntervalMs));
    scheduleSync();
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine || syncIntervalMs <= 0) return;
    if (!lastSyncTime || Date.now() - lastSyncTime >= syncIntervalMs) syncNow();
});

async function syncNow() {
    const statusEl = document.getElementById('syncStatus');
    const connEl   = document.getElementById('connectionStatus');
    if (!statusEl || !connEl) return;

    statusEl.innerHTML = '⏳ Syncing...';
    statusEl.className = 'badge bg-info';

    try {
        const resp = await fetch('https://saluteonline.runasp.net/api/MobileData', { cache: 'no-store' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();

        localStorage.setItem('salute_data_v2', JSON.stringify(data));
        loadData(data); 

        if (currentRep) {
            await refreshRepScope();
            refreshClientDropdowns();
        }

        lastSyncTime = Date.now();
        localStorage.setItem('salute_last_sync', lastSyncTime.toString());

        statusEl.innerHTML = '✅ Synced ' + relativeTime(lastSyncTime);
        statusEl.className = 'badge bg-success';
        connEl.className   = 'badge bg-success';
        connEl.innerText   = 'Online';
    } catch (err) {
        statusEl.innerHTML = '⚠️ Sync failed';
        statusEl.className = 'badge bg-warning text-dark';
        connEl.className   = 'badge bg-warning text-dark';
        connEl.innerText   = 'Offline (cached)';
    }
}

async function refreshRepScope() {
    if (!currentRep) return;
    try {
        const resp = await fetch(`https://saluteonline.runasp.net/api/MobileData/RepData?repName=${encodeURIComponent(currentRep.name)}`, { cache: 'no-store' });
        if (resp.ok) {
            const data = await resp.json();
            repScopeClients.clear();
            (data.sales || []).forEach(s => { if (s.client) repScopeClients.add(s.client); });
        }
    } catch (e) {}
    savedTx.forEach(t => { if (t.client) repScopeClients.add(t.client); });
}

function relativeTime(ts) {
    if (!ts) return '--';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
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

setInterval(() => {
    if (lastSyncTime && !document.hidden) {
        const el = document.getElementById('syncStatus');
        if (el && el.classList.contains('bg-success')) el.innerHTML = '🔄 Synced ' + relativeTime(lastSyncTime);
    }
}, 30000);

window.addEventListener('online', () => {
    const connEl = document.getElementById('connectionStatus');
    if (connEl) { connEl.className = 'badge bg-success'; connEl.innerText = 'Online'; }
    syncNow();
});
window.addEventListener('offline', () => {
    const connEl = document.getElementById('connectionStatus');
    if (connEl) { connEl.className = 'badge bg-warning text-dark'; connEl.innerText = 'Offline (cached)'; }
});

// ============================================================
// DATA & LOGIN
// ============================================================
function updateDiscountUI() {
    const methodStr = discountMethod || "Sequential";
    
    const topBadge = document.getElementById('topDiscountBadge');
    if (topBadge) {
        topBadge.innerText = "Method: " + methodStr;
        topBadge.className = methodStr === "Additive" 
            ? "badge bg-warning text-dark" 
            : "badge bg-info text-dark";
    }

    const bannerSpan = document.getElementById('bannerDiscountMethod');
    const bannerDiv = document.getElementById('divDiscountMethod');
    if (bannerSpan) {
        if (methodStr === "Additive") {
            bannerSpan.innerText = "Additive (Sum)";
            if (bannerDiv) bannerDiv.className = "alert alert-warning py-2 mb-2 text-center text-dark fw-bold";
        } else {
            bannerSpan.innerText = "Sequential (Compound)";
            if (bannerDiv) bannerDiv.className = "alert alert-primary py-2 mb-2 text-center fw-bold";
        }
    }
}

function loadData(data) {
    if (!data) data = {};
    allClients    = Array.isArray(data.clients) ? data.clients : [];
    allProducts   = Array.isArray(data.products) ? data.products : [];
    allEmployees  = Array.isArray(data.employees) ? data.employees : [];
    allStores     = Array.isArray(data.stores) ? data.stores : [];
    priceHistory  = Array.isArray(data.priceHistory) ? data.priceHistory : [];
    
    discountMethod = data.discountMethod || "Sequential";
    updateDiscountUI();

    const repSelect = document.getElementById('repSelect');
    if (repSelect) {
        repSelect.innerHTML = '<option value="">-- Select Your Name --</option>';
        allEmployees.forEach(e => {
            repSelect.innerHTML += `<option value="${e.name}" data-sup="${e.supervisor || ''}" data-area="${e.areaId || 0}">${e.name}</option>`;
        });
    }

    const prodHtml = '<option value="">-- Select Product --</option>' + allProducts.map(p =>
        `<option value="${p.name}" data-code="${p.code}" data-price="${p.price}" data-cost="${p.cost}">${p.name}</option>`
    ).join('');
    ['saleProduct', 'retProduct'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = prodHtml;
    });
}

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
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('appSection').style.display = 'none';
    document.getElementById('bottomBar').style.display = 'none';
}

async function showApp() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('appSection').style.display = 'block';
    document.getElementById('bottomBar').style.display = 'flex';
    document.getElementById('lblRepName').innerText = currentRep.name;
    
    updateDiscountUI(); 

    savedTx = JSON.parse(localStorage.getItem('salute_saved_v2') || '[]');
    renderSavedTable();

    await refreshRepScope();
    if (repScopeClients.size === 0) document.getElementById('showAllClients').checked = true;
    refreshClientDropdowns();
}

function refreshClientDropdowns() {
    const showAllEl = document.getElementById('showAllClients');
    const showAll = showAllEl ? showAllEl.checked : true;

    let list = allClients;
    if (!showAll && repScopeClients.size > 0) {
        list = allClients.filter(c => repScopeClients.has(c.name));
        if (list.length === 0) list = allClients;
    }

    const clientHtml = '<option value="">-- Select Client --</option>' + list.map(c =>
        `<option value="${c.name}" data-id="${c.id || ''}" data-code="${c.code}" data-ar="${c.arabicName || ''}" data-area="${c.areaName || ''}" data-city="${c.cityName || ''}">${c.name}</option>`
    ).join('');

    ['saleClient', 'retClient', 'payClient', 'stmtClient'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = clientHtml;
    });
}

function getStoreAreaCity(storeId) {
    if (!storeId) return { area: '', city: '' };
    const store = allStores.find(s => String(s.id) === String(storeId));
    return store ? { area: store.area || '', city: store.city || '' } : { area: '', city: '' };
}

function autoSelectStore() {
    const clientSel = document.getElementById('saleClient');
    const cOpt = clientSel.options[clientSel.selectedIndex];
    const areaName = (cOpt.getAttribute('data-area') || '').trim().toLowerCase();
    const cityName = (cOpt.getAttribute('data-city') || '').trim().toLowerCase();
    const storeSel = document.getElementById('saleStore');

    if (!clientSel.value) {
        storeSel.innerHTML = '<option value="">-- Select Client first --</option>';
        return;
    }

    let matchedStores = allStores.filter(s => s.type === 'SUB' && (s.city || '').trim().toLowerCase() === cityName && cityName !== '');
    if (matchedStores.length === 0) matchedStores = allStores.filter(s => s.type === 'PARENT' && (s.area || '').trim().toLowerCase() === areaName && areaName !== '');
    if (matchedStores.length === 0) matchedStores = allStores.filter(s => s.type === 'MAIN');
    if (matchedStores.length === 0) matchedStores = allStores;

    if (matchedStores.length > 0) {
        storeSel.innerHTML = matchedStores.map(store => 
            `<option value="${store.id}" data-area="${store.area || ''}" data-city="${store.city || ''}">${store.name}</option>`
        ).join('');
    } else {
        storeSel.innerHTML = `<option value="">-- No stores available --</option>`;
    }
}

function updatePrice(prefix) {
    const select = document.getElementById(prefix + 'Product');
    if (!select || !select.value) return;
    const prodName = select.value;
    const saleDate = new Date(document.getElementById(prefix + 'Date').value);
    let validPrice = parseFloat(select.options[select.selectedIndex].getAttribute('data-price')) || 0;

    const histories = priceHistory.filter(h => h.productName === prodName && h.salesPrice > 0);
    const validHist = histories.filter(h => new Date(h.startDate) <= saleDate).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

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
    const qty = parseFloat(document.getElementById('saleQty').value) || 0;
    const price = parseFloat(document.getElementById('salePrice').value) || 0;
    const reg = parseFloat(document.getElementById('saleReg').value) || 0;
    const cash = parseFloat(document.getElementById('saleCash').value) || 0;
    const add = parseFloat(document.getElementById('saleAdd').value) || 0;

    if (qty <= 0) return alert("Quantity must be > 0");

    const gross = qty * price;
    let netPrice = gross;
    
    if (discountMethod === "Additive") {
        netPrice = gross * (1 - ((reg + cash + add) / 100));
    } else {
        netPrice = gross * (1 - reg / 100) * (1 - cash / 100) * (1 - add / 100);
    }
    
    netPrice = Math.round(netPrice * 100) / 100;
    const discountAmount = Math.round((gross - netPrice) * 100) / 100;

    currentSale.lines.push({
        product: prodSel.value, productCode: pOpt.getAttribute('data-code'),
        cost: parseFloat(pOpt.getAttribute('data-cost')) || 0,
        qty, price, disc: (reg + cash + add), netPrice, total: netPrice
    });
    
    currentSale.gross = Math.round((currentSale.gross + gross) * 100) / 100;
    currentSale.discount = Math.round((currentSale.discount + discountAmount) * 100) / 100;
    currentSale.total = Math.round((currentSale.total + netPrice) * 100) / 100;
    
    renderCurrentSale();
    
    document.getElementById('saleProduct').value = '';
    document.getElementById('saleQty').value = 1;
    document.getElementById('salePrice').value = 0;
    document.getElementById('saleReg').value = 0;
    document.getElementById('saleCash').value = 0;
    document.getElementById('saleAdd').value = 0;
    
    document.getElementById('saleProduct').focus();
}

function renderCurrentSale() {
    const tbody = document.getElementById('currentSaleLines');
    tbody.innerHTML = currentSale.lines.map((l, index) => `
        <tr>
            <td style="max-width: 80px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${l.product}</td>
            <td class="text-center">${l.qty}</td>
            <td class="text-end">${l.price.toFixed(2)}</td>
            <td class="text-center text-danger">${l.disc}%</td>
            <td class="text-end fw-bold">${l.netPrice.toFixed(2)}</td>
            <td class="text-end"><button class="btn btn-sm text-danger p-0" onclick="removeCurrentSaleLine(${index})">✖</button></td>
        </tr>
    `).join('');
    
    document.getElementById('currentSaleGross').innerText = currentSale.gross.toFixed(2);
    document.getElementById('currentSaleDiscount').innerText = currentSale.discount.toFixed(2);
    document.getElementById('currentSaleTotal').innerText = currentSale.total.toFixed(2);
}

function removeCurrentSaleLine(index) {
    const removed = currentSale.lines.splice(index, 1)[0];
    const gross = removed.qty * removed.price;
    const discount = Math.round((gross - removed.netPrice) * 100) / 100;
    
    currentSale.gross = Math.round((currentSale.gross - gross) * 100) / 100;
    currentSale.discount = Math.round((currentSale.discount - discount) * 100) / 100;
    currentSale.total = Math.round((currentSale.total - removed.netPrice) * 100) / 100;
    renderCurrentSale();
}

function clearCurrentSale() {
    if (confirm("Clear this entire current invoice?")) {
        currentSale = { lines: [], gross: 0, discount: 0, total: 0 };
        renderCurrentSale();
        document.getElementById('saleInvoice').value = '';
        document.getElementById('saleClient').value = '';
        document.getElementById('salePaid').value = 0;
    }
}

function saveSaleInvoice() {
    const inv = document.getElementById('saleInvoice').value.trim();
    const clientSel = document.getElementById('saleClient');
    const storeSel = document.getElementById('saleStore');
    if (!inv || !clientSel.value || !storeSel.value || currentSale.lines.length === 0) return alert("Fill header and add lines.");

    const cOpt = clientSel.options[clientSel.selectedIndex];
    const storeAreaCity = getStoreAreaCity(storeSel.value);
    
    savedTx.push({
        type: 'Sale', invoiceNo: inv, date: document.getElementById('saleDate').value,
        client: clientSel.value, clientCode: cOpt.getAttribute('data-code'), clientAr: cOpt.getAttribute('data-ar'),
        governorate: cOpt.getAttribute('data-area'), region: cOpt.getAttribute('data-city'),
        storeId: storeSel.value, storeArea: storeAreaCity.area, storeCity: storeAreaCity.city,
        payType: document.getElementById('salePayType').value, 
        paid: parseFloat(document.getElementById('salePaid').value) || 0,
        total: currentSale.total, lines: currentSale.lines.map(l => ({ ...l }))
    });

    clearCurrentSale();
    saveAndRender();
}

// ============================================================
// RETURNS (LOCAL ONLY)
// ============================================================
async function loadClientInvoices() {
    const clientSel = document.getElementById('retClient');
    const clientName = clientSel.value;
    const invSelect = document.getElementById('retInvoiceSelect');
    invSelect.innerHTML = '<option value="">-- Loading Invoices... --</option>';

    if (!clientName) {
        document.getElementById('retInvoiceLines').innerHTML = '<p class="text-muted small mb-0">Select a client first.</p>';
        return;
    }

    const clientId = clientSel.options[clientSel.selectedIndex].getAttribute('data-id');
    let serverInvoices = [];
    
    if (navigator.onLine) {
        try {
            const resp = await fetch(`https://saluteonline.runasp.net/api/MobileData/ClientInvoices?clientId=${clientId}`);
            if (resp.ok) serverInvoices = await resp.json();
        } catch(e) {}
    }

    allInvoices = [...serverInvoices];

    const localSales = savedTx.filter(t => t.type === 'Sale' && t.client === clientName);
    localSales.forEach(ls => {
        if (!allInvoices.find(si => si.invoiceNumber === ls.invoiceNo)) {
            allInvoices.push({
                id: 'local_' + ls.invoiceNo, invoiceNumber: ls.invoiceNo, date: ls.date, total: ls.total,
                lines: ls.lines.map(l => ({ 
                    productName: l.product, productId: 0, qty: l.qty, 
                    price: l.price, netPrice: l.netPrice, disc: l.disc, cost: l.cost 
                })),
                isLocal: true
            });
        }
    });

    const histSales = historicalInvoices.filter(h => h.clientName === clientName);
    histSales.forEach(hs => {
        if (!allInvoices.find(si => si.invoiceNumber === hs.invoiceNumber)) {
            allInvoices.push(hs);
        }
    });

    if (allInvoices.length === 0) {
        invSelect.innerHTML = '<option value="">-- No invoices found --</option>';
        document.getElementById('retInvoiceLines').innerHTML = '<p class="text-danger small mb-0">No invoices found.</p>';
        return;
    }

    invSelect.innerHTML = '<option value="">-- Select Invoice --</option>';
    allInvoices.forEach((inv, idx) => {
        invSelect.innerHTML += `<option value="${idx}">${inv.invoiceNumber} · ${inv.date} · ${inv.total.toFixed(2)}</option>`;
    });
    
    document.getElementById('retInvoiceLines').innerHTML = '<p class="text-muted small mb-0">Select an invoice to see lines.</p>';
    currentRet = { lines: [], total: 0 };
    renderCurrentRet();
}

function loadInvoiceLines() {
    const invIdx = document.getElementById('retInvoiceSelect').value;
    if (invIdx === '') return;

    const inv = allInvoices[parseInt(invIdx)];
    if (!inv) return;

    let html = '<table class="table table-sm mb-0"><thead><tr><th style="width:28px"></th><th>Product</th><th class="text-center">Sold</th><th class="text-center">Ret</th><th class="text-end">Net Price</th></tr></thead><tbody>';
    inv.lines.forEach((line, i) => {
        const actualNetPrice = line.netPrice !== undefined && line.netPrice > 0 ? line.netPrice : line.price;
        
        html += `<tr>
            <td><input type="checkbox" class="form-check-input ret-line-check" data-idx="${i}" onchange="updateRetLineTotal()"></td>
            <td style="font-size:11px">${line.productName}</td>
            <td class="text-center">${line.qty}</td>
            <td class="text-center"><input type="number" class="form-control form-control-sm ret-line-qty text-center" data-idx="${i}" value="${line.qty}" min="0" max="${line.qty}" style="width:50px; padding:2px;" onchange="updateRetLineTotal()"></td>
            <td class="text-end fw-bold">${actualNetPrice.toFixed(2)}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    
    const wrap = document.getElementById('retInvoiceLines');
    wrap.innerHTML = html;
    wrap.dataset.invIdx = invIdx;

    document.getElementById('retReturnNo').value = 'RET-' + inv.invoiceNumber;
    document.getElementById('retDate').value = new Date().toISOString().split('T')[0];
    updateRetLineTotal();
}

function updateRetLineTotal() {
    const wrap = document.getElementById('retInvoiceLines');
    const invIdx = wrap.dataset.invIdx;
    if (invIdx === undefined) return;

    const inv = allInvoices[parseInt(invIdx)];
    if (!inv) return;

    currentRet = { lines: [], total: 0 };
    document.querySelectorAll('.ret-line-check').forEach(cb => {
        if (!cb.checked) return;
        const idx = parseInt(cb.dataset.idx);
        const line = inv.lines[idx];
        const qtyInput = document.querySelector(`.ret-line-qty[data-idx="${idx}"]`);
        let qty = parseFloat(qtyInput.value) || 0;
        if (qty <= 0) return;
        if (qty > line.qty) { qty = line.qty; qtyInput.value = line.qty; }

        const actualNetPrice = line.netPrice !== undefined && line.netPrice > 0 ? line.netPrice : line.price;
        const lineTotal = Math.round(qty * actualNetPrice * 100) / 100;
        
        currentRet.lines.push({
            productName: line.productName, productId: line.productId,
            cost: line.cost, qty: qty, price: actualNetPrice, total: lineTotal
        });
        currentRet.total = Math.round((currentRet.total + lineTotal) * 100) / 100;
    });

    renderCurrentRet();
}

function renderCurrentRet() {
    const tbody = document.getElementById('currentRetLines');
    tbody.innerHTML = currentRet.lines.map((l, index) => `
        <tr>
            <td style="max-width: 80px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${l.productName}</td>
            <td class="text-center">${l.qty}</td>
            <td class="text-end">${l.price.toFixed(2)}</td>
            <td class="text-end fw-bold text-danger">${l.total.toFixed(2)}</td>
            <td class="text-end"><button class="btn btn-sm text-danger p-0" onclick="removeCurrentRetLine(${index})">✖</button></td>
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
    document.getElementById('retReturnNo').value = '';
    document.getElementById('retInvoiceSelect').value = '';
    document.getElementById('retInvoiceLines').innerHTML = '<p class="text-muted small mb-0">Select a client and invoice to load lines.</p>';
}

function saveReturn() {
    const returnNo = document.getElementById('retReturnNo').value.trim();
    const clientSel = document.getElementById('retClient');
    const clientName = clientSel.value;
    const invIdx = document.getElementById('retInvoiceLines').dataset.invIdx;
    
    if (!returnNo || !clientName || !invIdx || currentRet.lines.length === 0) {
        return alert("Fill return # and select at least one line to return.");
    }

    const originalInv = allInvoices[parseInt(invIdx)];
    const cOpt = clientSel.options[clientSel.selectedIndex];

    savedTx.push({
        type: 'Return', invoiceNo: returnNo, originalInvoiceNo: originalInv.invoiceNumber,
        date: document.getElementById('retDate').value, client: clientName,
        clientCode: cOpt.getAttribute('data-code'), clientAr: cOpt.getAttribute('data-ar'),
        governorate: cOpt.getAttribute('data-area'), region: cOpt.getAttribute('data-city'),
        total: currentRet.total, lines: currentRet.lines.map(l => ({ ...l }))
    });

    clearCurrentRet(true);
    saveAndRender();
    alert("Return saved locally. It will be exported in the Excel file.");
}

// ============================================================
// PAYMENTS (LOCAL ONLY)
// ============================================================
async function loadPaymentInvoices() {
    const clientSel = document.getElementById('payClient');
    const clientName = clientSel.value;
    const invSelect = document.getElementById('payInvoiceSelect');
    
    invSelect.innerHTML = '<option value="">-- Loading Invoices... --</option>';
    document.getElementById('payAmount').value = 0;

    if (!clientName) {
        invSelect.innerHTML = '<option value="">-- Select Client first --</option>';
        return;
    }

    const clientId = clientSel.options[clientSel.selectedIndex].getAttribute('data-id');
    let serverInvoices = [];
    
    if (navigator.onLine) {
        try {
            const resp = await fetch(`https://saluteonline.runasp.net/api/MobileData/ClientInvoices?clientId=${clientId}`);
            if (resp.ok) serverInvoices = await resp.json();
        } catch(e) {}
    }

    let allClientInvoices = [...serverInvoices];

    const localSales = savedTx.filter(t => t.type === 'Sale' && t.client === clientName);
    localSales.forEach(ls => {
        if (!allClientInvoices.find(si => si.invoiceNumber === ls.invoiceNo)) {
            allClientInvoices.push({
                id: 'local_' + ls.invoiceNo, invoiceNumber: ls.invoiceNo, date: ls.date, total: ls.total, isLocal: true
            });
        }
    });

    const histSales = historicalInvoices.filter(h => h.clientName === clientName);
    histSales.forEach(hs => {
        if (!allClientInvoices.find(si => si.invoiceNumber === hs.invoiceNumber)) {
            allClientInvoices.push(hs);
        }
    });

    if (allClientInvoices.length === 0) {
        invSelect.innerHTML = '<option value="">-- No invoices found --</option>';
        return;
    }

    invSelect.innerHTML = '<option value="">-- Select Invoice --</option>';
    allClientInvoices.forEach((inv) => {
        invSelect.innerHTML += `<option value="${inv.invoiceNumber}" data-total="${inv.total}">${inv.invoiceNumber} · ${inv.date} · ${inv.total.toFixed(2)}</option>`;
    });
}

function calculateRemainingPayment() {
    const invSelect = document.getElementById('payInvoiceSelect');
    const invNo = invSelect.value;
    const amountInput = document.getElementById('payAmount');

    if (!invNo) {
        amountInput.value = 0;
        return;
    }

    const invTotal = parseFloat(invSelect.options[invSelect.selectedIndex].getAttribute('data-total')) || 0;
    
    let totalReturns = 0;
    savedTx.filter(t => t.type === 'Return' && t.originalInvoiceNo === invNo).forEach(r => {
        totalReturns += r.total;
    });

    let totalPaid = 0;
    savedTx.filter(t => t.type === 'Payment' && t.originalInvoiceNo === invNo).forEach(p => {
        totalPaid += p.total;
    });

    let remaining = invTotal - totalReturns - totalPaid;
    if (remaining < 0) remaining = 0;

    amountInput.value = remaining.toFixed(2);
}

function savePayment() {
    const invSelect = document.getElementById('payInvoiceSelect');
    const inv = invSelect.value; 
    const clientSel = document.getElementById('payClient');
    const amount = parseFloat(document.getElementById('payAmount').value);
    
    if (!inv || !clientSel.value || !amount || amount <= 0) {
        return alert("Select an invoice and enter a positive amount.");
    }

    const cOpt = clientSel.options[clientSel.selectedIndex];
    const invTotal = parseFloat(invSelect.options[invSelect.selectedIndex].getAttribute('data-total')) || 0;

    savedTx.push({
        type: 'Payment', 
        invoiceNo: document.getElementById('payInvoice').value.trim() || ('PAY-' + inv), 
        originalInvoiceNo: inv,
        invoiceTotal: invTotal,
        date: document.getElementById('payDate').value,
        client: clientSel.value, clientCode: cOpt.getAttribute('data-code'), clientAr: cOpt.getAttribute('data-ar'),
        governorate: cOpt.getAttribute('data-area'), region: cOpt.getAttribute('data-city'), 
        total: amount, lines: []
    });

    clearPaymentForm();
    saveAndRender();
    alert("Payment saved locally. It will be exported in the Excel file.");
}

function clearPaymentForm() {
    document.getElementById('payAmount').value = 0;
    document.getElementById('payInvoice').value = '';
    document.getElementById('payClient').value = '';
    document.getElementById('payInvoiceSelect').innerHTML = '<option value="">-- Select Client first --</option>';
}

// ============================================================
// STATEMENT (SERVER + LOCAL MERGED)
// ============================================================
async function loadStatementClient() {
    const clientSel = document.getElementById('stmtClient');
    if (!clientSel || !clientSel.value) return;
    
    const clientName = clientSel.value;
    const clientId = clientSel.options[clientSel.selectedIndex].getAttribute('data-id');
    
    const invSelect = document.getElementById('stmtInvoice');
    invSelect.innerHTML = '<option value="">-- Loading --</option>';
    document.getElementById('stmtDetails').style.display = 'none';

    let serverData = { invoices: [], payments: [], returns: [] };
    if (navigator.onLine && clientId) {
        try {
            const resp = await fetch(`https://saluteonline.runasp.net/api/MobileData/ClientStatement?clientId=${clientId}`);
            if (resp.ok) serverData = await resp.json();
        } catch(e) { console.warn("Failed to fetch server statement", e); }
    }

    const localInvoices = savedTx.filter(t => t.type === 'Sale' && t.client === clientName).map(s => ({
        id: 'local_' + s.invoiceNo,
        invoiceNumber: s.invoiceNo,
        date: s.date,
        total: s.total,
        amountPaid: s.paid || 0,
        lines: s.lines.map(l => ({ productName: l.product, qty: l.qty, price: l.netPrice, total: l.netPrice })),
        isLocal: true
    }));

    const localPayments = savedTx.filter(t => t.type === 'Payment' && t.client === clientName).map(p => ({
        id: 'local_' + p.invoiceNo,
        reference: p.originalInvoiceNo,
        date: p.date,
        amount: p.total,
        isLocal: true
    }));

    const localReturns = savedTx.filter(t => t.type === 'Return' && t.client === clientName).map(r => ({
        id: 'local_' + r.invoiceNo,
        originalInvoiceNo: r.originalInvoiceNo,
        returnNumber: r.invoiceNo,
        date: r.date,
        amount: r.total,
        isLocal: true
    }));

    currentStatementData = {
        invoices: [...(serverData.invoices || []), ...localInvoices],
        payments: [...(serverData.payments || []), ...localPayments],
        returns: [...(serverData.returns || []), ...localReturns]
    };

    currentStatementData.invoices.sort((a,b) => new Date(b.date) - new Date(a.date));

    if (currentStatementData.invoices.length === 0) {
        invSelect.innerHTML = '<option value="">-- No invoices found --</option>';
        return;
    }

    invSelect.innerHTML = '<option value="">-- Select Invoice --</option>';
    currentStatementData.invoices.forEach((inv, idx) => {
        const badge = inv.isLocal ? '📱' : '☁️';
        invSelect.innerHTML += `<option value="${idx}">${badge} ${inv.invoiceNumber} · ${inv.date} · ${inv.total.toFixed(2)}</option>`;
    });
}

function renderInvoiceStatement() {
    const invIdx = document.getElementById('stmtInvoice').value;
    if (invIdx === '') {
        document.getElementById('stmtDetails').style.display = 'none';
        return;
    }

    const inv = currentStatementData.invoices[parseInt(invIdx)];
    if (!inv) return;

    document.getElementById('stmtDetails').style.display = 'block';

    document.getElementById('stmtInvNo').innerText = inv.invoiceNumber;
    document.getElementById('stmtInvDate').innerText = inv.date;
    
    const sourceBadge = inv.isLocal 
        ? '<span class="badge bg-warning text-dark">📱 Local (Unsynced)</span>' 
        : '<span class="badge bg-success">☁️ Server</span>';
    document.getElementById('stmtInvSource').innerHTML = sourceBadge;

    const linesTbody = document.getElementById('stmtInvLines');
    linesTbody.innerHTML = '';
    inv.lines.forEach(l => {
        linesTbody.innerHTML += `<tr>
            <td>${l.productName}</td>
            <td class="text-end">${l.qty}</td>
            <td class="text-end">${l.price.toFixed(2)}</td>
            <td class="text-end">${l.total.toFixed(2)}</td>
            <td>${inv.isLocal ? '📱' : '☁️'}</td>
        </tr>`;
    });

    const invPayments = currentStatementData.payments.filter(p => 
        p.reference && p.reference.includes(inv.invoiceNumber)
    );
    const payTbody = document.getElementById('stmtInvPayments');
    payTbody.innerHTML = '';
    
    let totalPaid = inv.amountPaid || 0;
    let hasInitialPayment = totalPaid > 0;

    if (hasInitialPayment) {
        payTbody.innerHTML += `<tr>
            <td>${inv.date}</td>
            <td>Payment at Invoice</td>
            <td class="text-end text-success">${totalPaid.toFixed(2)}</td>
            <td>${inv.isLocal ? '📱' : '☁️'}</td>
        </tr>`;
    }

    invPayments.forEach(p => {
        payTbody.innerHTML += `<tr>
            <td>${p.date}</td>
            <td>${p.reference || 'N/A'}</td>
            <td class="text-end text-success">${p.amount.toFixed(2)}</td>
            <td>${p.isLocal ? '📱' : '☁️'}</td>
        </tr>`;
        totalPaid += p.amount;
    });

    if (!hasInitialPayment && invPayments.length === 0) {
        payTbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No Payments</td></tr>';
    }

    const invReturns = currentStatementData.returns.filter(r => 
        r.originalInvoiceNo === inv.invoiceNumber
    );
    const retTbody = document.getElementById('stmtInvReturns');
    retTbody.innerHTML = '';
    let totalReturns = 0;
    invReturns.forEach(r => {
        retTbody.innerHTML += `<tr>
            <td>${r.date}</td>
            <td>${r.returnNumber}</td>
            <td class="text-end text-danger">${r.amount.toFixed(2)}</td>
            <td>${r.isLocal ? '📱' : '☁️'}</td>
        </tr>`;
        totalReturns += r.amount;
    });
    if (invReturns.length === 0) {
        retTbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No Returns</td></tr>';
    }

    const balance = inv.total - totalPaid - totalReturns;
    
    document.getElementById('stmtInvTotal').innerText = inv.total.toFixed(2);
    
    const balEl = document.getElementById('stmtInvBalance');
    balEl.innerText = balance.toFixed(2);
    if (balance > 0) {
        balEl.className = 'fw-bold text-danger';
    } else {
        balEl.className = 'fw-bold text-success';
    }
}

// ============================================================
// REPORTS (SALES + BALANCES TOGGLE)
// ============================================================
function switchReportMode(mode) {
    currentReportMode = mode;
    const thead = document.getElementById('reportTableHead');
    
    if (mode === 'sales') {
        thead.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Client</th>
                <th class="text-end">Total</th>
                <th class="text-end">Paid</th>
                <th class="text-end">Returns</th>
                <th class="text-end" style="color: #dc3545;">Balance</th>
            </tr>`;
        document.getElementById('lblCard1').innerText = 'Total Sales';
        document.getElementById('lblCard2').innerText = 'Total Balance';
    } else {
        thead.innerHTML = `
            <tr>
                <th>Client</th>
                <th class="text-center">Invoices</th>
                <th class="text-end">Total Billed</th>
                <th class="text-end">Collected</th>
                <th class="text-end">Returns</th>
                <th class="text-end" style="color: #dc3545;">Balance</th>
            </tr>`;
        document.getElementById('lblCard1').innerText = 'Total Billed';
        document.getElementById('lblCard2').innerText = 'Outstanding';
    }
    
    renderReportTable();
}

async function loadMyReports() {
    const tbody = document.getElementById('reportLines');
    const fromDate = document.getElementById('repFromDate').value;
    const toDate = document.getElementById('repToDate').value;

    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div> Loading...</td></tr>';
    document.getElementById('reportSummary').style.display = 'none';

    if (!navigator.onLine) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">You must be online to view Server Reports.</td></tr>';
        return;
    }

    try {
        let url = `https://saluteonline.runasp.net/api/MobileData/RepData?repName=${encodeURIComponent(currentRep.name)}`;
        if (fromDate) url += `&from=${fromDate}`;
        if (toDate) url += `&to=${toDate}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch");

        const data = await response.json();
        rawServerSales = data.sales || [];
        rawServerPayments = data.payments || [];
        rawServerReturns = data.returns || [];

        if (rawServerSales.length === 0 && rawServerPayments.length === 0 && rawServerReturns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No data found on server for this period.</td></tr>';
            return;
        }

        // --- CALCULATE SUMMARY TOTALS & GROUPING ---
        let totalSales = 0;
        let totalPaid = 0;
        let totalReturns = 0;

        const grouped = {};
        function ensureClient(c) { if(!grouped[c]) grouped[c] = { invoices: 0, total: 0, paid: 0, returns: 0, balance: 0 }; }

        rawServerSales.forEach(s => {
            const c = s.client || 'Unknown';
            ensureClient(c);
            grouped[c].invoices += 1;
            grouped[c].total += (s.total || 0);
            grouped[c].paid += (s.paid || 0); 
            
            totalSales += (s.total || 0);
            totalPaid += (s.paid || 0);
        });

        rawServerPayments.forEach(p => {
            const c = p.client || 'Unknown';
            ensureClient(c);
            grouped[c].paid += p.amount;
            totalPaid += p.amount;
        });

        rawServerReturns.forEach(r => {
            const c = r.client || 'Unknown';
            ensureClient(c);
            grouped[c].returns += r.amount;
            totalReturns += r.amount;
        });

        let totalBalance = 0;
        Object.keys(grouped).forEach(c => {
            grouped[c].balance = grouped[c].total - grouped[c].paid - grouped[c].returns;
            totalBalance += grouped[c].balance;
        });

        document.getElementById('repTotalSales').innerText = totalSales.toFixed(2);
        document.getElementById('repTotalBalance').innerText = totalBalance.toFixed(2);
        document.getElementById('reportSummary').style.display = 'flex';

        window.currentGroupedData = grouped;
        renderReportTable();

    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading server data.</td></tr>';
    }
}

function renderReportTable() {
    const tbody = document.getElementById('reportLines');
    tbody.innerHTML = '';

    if (currentReportMode === 'sales') {
        // --- RENDER SALES (INDIVIDUAL INVOICES) ---
        rawServerSales.forEach(s => {
            const balColor = (s.total - s.paid) > 0.01 ? 'text-danger fw-bold' : 'text-success';
            tbody.innerHTML += `<tr>
                <td>${s.date}</td>
                <td><strong>☁️ ${s.invoiceNo}</strong></td>
                <td>${s.client}</td>
                <td class="text-end text-dark">${(s.total || 0).toFixed(2)}</td>
                <td class="text-end text-success">${(s.paid || 0).toFixed(2)}</td>
                <td class="text-end text-warning text-dark">0.00</td>
                <td class="text-end ${balColor}">${(s.total - s.paid).toFixed(2)}</td>
            </tr>`;
        });
    } else {
        // --- RENDER BALANCES (GROUPED BY CLIENT) ---
        const grouped = window.currentGroupedData || {};
        const sortedClients = Object.keys(grouped).sort((a, b) => grouped[b].balance - grouped[a].balance);

        sortedClients.forEach(client => {
            const g = grouped[client];
            const balColor = g.balance > 0.01 ? 'text-danger fw-bold' : 'text-success';
            
            tbody.innerHTML += `<tr>
                <td><strong>☁️ ${client}</strong></td>
                <td class="text-center">${g.invoices}</td>
                <td class="text-end text-dark">${g.total.toFixed(2)}</td>
                <td class="text-end text-success">${g.paid.toFixed(2)}</td>
                <td class="text-end text-warning text-dark">${g.returns.toFixed(2)}</td>
                <td class="text-end ${balColor}">${g.balance.toFixed(2)}</td>
            </tr>`;
        });
    }
}

// ============================================================
// SHARED & EXPORT
// ============================================================
function saveAndRender() {
    localStorage.setItem('salute_saved_v2', JSON.stringify(savedTx));
    renderSavedTable();
}

function renderSavedTable() {
    const tbody = document.getElementById('savedLines');
    tbody.innerHTML = '';
    savedTx.forEach((t, i) => {
        const cls = t.type === 'Sale' ? 'bg-success' : (t.type === 'Return' ? 'bg-warning text-dark' : 'bg-info');
        tbody.innerHTML += `<tr>
            <td><span class="badge ${cls}">${t.type}</span></td>
            <td>${t.invoiceNo}</td><td>${t.client}</td><td>${t.total.toFixed(2)}</td>
            <td><button class="btn btn-sm text-danger p-0" onclick="removeTx(${i})" title="Delete">✖</button></td>
        </tr>`;
    });
    document.getElementById('savedCount').innerText = savedTx.length + " Saved";
}

function removeTx(i) { 
    if(confirm("Delete this saved transaction? This cannot be undone.")) { 
        savedTx.splice(i, 1); 
        saveAndRender(); 
    } 
}

function clearAll() { 
    if(confirm("Clear ALL saved transactions? This cannot be undone.")) { 
        savedTx = []; 
        saveAndRender(); 
    } 
}

function exportExcel() {
    if (savedTx.length === 0) return alert("No data to export.");
    let excelData = [];

    savedTx.forEach(t => {
        const isSale = t.type === 'Sale';
        const isRet = t.type === 'Return';
        const isPay = t.type === 'Payment';
        const month = new Date(t.date).getMonth();
        const quarter = "Q" + Math.ceil((month + 1) / 3);

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
                "invoiceno": t.originalInvoiceNo, 
                "client": t.client, 
                "discription": `Payment against Invoice ${t.originalInvoiceNo}`,
                "super visor": currentRep.supervisor, 
                "sales rep": currentRep.name, 
                "cost": 0, 
                "docno": t.invoiceNo, 
                "paymentmethod": "Cash", 
                "returns": 0, 
                "collected": t.total, 
                "requestedamount": t.invoiceTotal || 0, 
                "totalofreturn": 0, 
                "returnsprice": 0, 
                "return": 0, 
                "pricecode": "MISC", 
                "sales": 0,
                "governorate": t.governorate, 
                "region": t.region, 
                "salesnet": 0, 
                "costnet": 0,
                "month": new Date(t.date).toLocaleString('default', { month: 'long' }), 
                "aginglimit": 30,
                "initiateddate": t.date, 
                "quarter": quarter
            });
        } else {
            t.lines.forEach(line => {
                excelData.push({
                    "qurter": quarter, "code": line.productCode || '', "movement": isSale ? -line.qty : line.qty,
                    "date": t.date, "transaction": t.type, "product": line.productName || line.product, "quntity": isSale ? line.qty : 0,
                    "price": line.price, "discount": isSale ? (line.disc + "%") : "0%",
                    "netprice": isSale ? line.netPrice : line.price, "arabicname": t.clientAr,
                    "invoiceno": t.invoiceNo, "client": t.client, "discription": isSale ? "Mobile App Sale" : "Return against " + t.originalInvoiceNo,
                    "super visor": currentRep.supervisor, "sales rep": currentRep.name, "cost": line.cost,
                    "docno": t.invoiceNo, "paymentmethod": isSale ? t.payType : "Credit", "returns": isRet ? line.qty : 0,
                    "collected": isSale ? t.paid : 0, "requestedamount": isSale ? (line.price * line.qty) : 0,
                    "totalofreturn": isRet ? line.total : 0, "returnsprice": isRet ? line.price : 0,
                    "return": isRet ? line.total : 0, "pricecode": line.productCode || '',
                    "sales": isSale ? (line.price * line.qty) : 0, "governorate": t.governorate, 
                    "region": t.region, "salesnet": isSale ? line.netPrice : 0, "costnet": line.cost * line.qty,
                    "month": new Date(t.date).toLocaleString('default', { month: 'long' }), "aginglimit": 30,
                    "initiateddate": t.date, "quarter": quarter
                });
            });
        }
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    ws['!cols'] = []; ws['!cols'][16] = { hidden: true }; ws['!cols'][30] = { hidden: true };
    ws['!protect'] = { password: "SaluteAdmin2026", formatColumns: false, formatCells: false, selectLockedCells: false };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `FieldData_${currentRep.name}_${new Date().getTime()}.xlsx`);
}
