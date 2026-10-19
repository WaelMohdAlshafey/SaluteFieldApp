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

document.addEventListener('DOMContentLoaded', async () => {
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(el => el.value = today);

    try {
        const response = await fetch('https://saluteonline.runasp.net/api/MobileData');
        const data = await response.json();
        localStorage.setItem('salute_data_v2', JSON.stringify(data));
        loadData(data);
        document.getElementById('connectionStatus').className = "badge bg-success";
        document.getElementById('connectionStatus').innerText = "Online";
    } catch (err) {
        const saved = localStorage.getItem('salute_data_v2');
        if (saved) { loadData(JSON.parse(saved)); }
        document.getElementById('connectionStatus').className = "badge bg-warning text-dark";
        document.getElementById('connectionStatus').innerText = "Offline";
    }

    const savedRep = localStorage.getItem('salute_rep');
    if (savedRep) {
        currentRep = JSON.parse(savedRep);
        await showApp();
    }
});

function loadData(data) {
    allClients = data.clients || [];
    allProducts = data.products || [];
    allEmployees = data.employees || [];
    allStores = data.stores || [];
    priceHistory = data.priceHistory || [];
    discountMethod = data.discountMethod || "Sequential";

    const repSelect = document.getElementById('repSelect');
    repSelect.innerHTML = '<option value="">-- Select Your Name --</option>';
    allEmployees.forEach(e => {
        repSelect.innerHTML += `<option value="${e.name}" data-sup="${e.supervisor}" data-area="${e.areaId}">${e.name}</option>`;
    });

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
        supervisor: opt.getAttribute('data-sup'),
        areaId: parseInt(opt.getAttribute('data-area')) || 0
    };
    localStorage.setItem('salute_rep', JSON.stringify(currentRep));
    showApp();
}

// ------------------------------------------------------------------
// SCOPE: load confirmed clients from GetRepData, filter dropdowns
// ------------------------------------------------------------------
async function showApp() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('appSection').style.display = 'block';
    document.getElementById('bottomBar').style.display = 'flex';
    document.getElementById('lblRepName').innerText = currentRep.name;

    savedTx = JSON.parse(localStorage.getItem('salute_saved_v2') || '[]');
    renderSavedTable();

    // Try to load rep's confirmed clients (server-side area filter)
    repScopeLoaded = false;
    repScopeClients.clear();
    try {
        const resp = await fetch(`https://saluteonline.runasp.net/api/MobileData/RepData?repName=${encodeURIComponent(currentRep.name)}`);
        if (resp.ok) {
            const data = await resp.json();
            (data.sales || []).forEach(s => { if (s.client) repScopeClients.add(s.client); });
            repScopeLoaded = true;
        }
    } catch (e) {
        // Offline — keep savedTx-based scope only
    }

    // Always include clients this rep has already transacted with on this device
    savedTx.forEach(t => { if (t.client) repScopeClients.add(t.client); });

    // Bootstrap mode: if the rep has no confirmed clients, default to "show all"
    const toggle = document.getElementById('showAllClients');
    if (repScopeClients.size === 0) {
        toggle.checked = true;
    }

    refreshClientDropdowns();
}

function refreshClientDropdowns() {
    const showAll = document.getElementById('showAllClients').checked;
    let list = allClients;
    if (!showAll && repScopeClients.size > 0) {
        list = allClients.filter(c => repScopeClients.has(c.name));
        if (list.length === 0) list = allClients; // fallback
    }

    const clientHtml = '<option value="">-- Select Client --</option>' + list.map(c =>
        `<option value="${c.name}" data-code="${c.code}" data-ar="${c.arabicName || ''}" data-area="${c.areaName || ''}" data-city="${c.cityName || ''}">${c.name}</option>`
    ).join('');

    ['saleClient', 'retClient', 'payClient'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = clientHtml;
    });
}

// ------------------------------------------------------------------
// STORE HELPERS — write the STORE's own area/city to Excel so imports match
// ------------------------------------------------------------------
function getStoreAreaCity(storeId) {
    if (storeId === null || storeId === undefined || storeId === '') return { area: '', city: '' };
    const store = allStores.find(s => String(s.id) === String(storeId));
    if (!store) return { area: '', city: '' };
    return { area: store.area || '', city: store.city || '' };
}

function autoSelectStore() {
    const clientSel = document.getElementById('saleClient');
    const cOpt = clientSel.options[clientSel.selectedIndex];
    const areaName = cOpt.getAttribute('data-area');
    const cityName = cOpt.getAttribute('data-city');
    const storeSel = document.getElementById('saleStore');

    let store = allStores.find(s => s.type === "SUB" && s.city === cityName);
    if (!store) store = allStores.find(s => s.type === "PARENT" && s.area === areaName);
    if (!store) store = allStores.find(s => s.type === "MAIN");

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

// ------------------------------------------------------------------
// SALES
// ------------------------------------------------------------------
function addLineToInvoice() {
    const prodSel = document.getElementById('saleProduct');
    if (!prodSel.value) return alert("Select a product");

    const pOpt = prodSel.options[prodSel.selectedIndex];
    const qty = parseFloat(document.getElementById('saleQty').value);
    const price = parseFloat(document.getElementById('salePrice').value);
    const reg = parseFloat(document.getElementById('saleReg').value) || 0;
    const cash = parseFloat(document.getElementById('saleCash').value) || 0;
    const add = parseFloat(document.getElementById('saleAdd').value) || 0;

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
        product: prodSel.value, productCode: pOpt.getAttribute('data-code'),
        cost: parseFloat(pOpt.getAttribute('data-cost')) || 0,
        qty, price, disc: totalDiscPct, netPrice, total: netPrice
    });

    currentSale.total += netPrice;
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
    currentSale.total -= removedLine.netPrice;
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
    const inv = document.getElementById('saleInvoice').value;
    const clientSel = document.getElementById('saleClient');
    const storeSel = document.getElementById('saleStore');
    if (!inv || !clientSel.value || !storeSel.value || currentSale.lines.length === 0) {
        return alert("Fill header and add lines.");
    }

    const cOpt = clientSel.options[clientSel.selectedIndex];
    const sOpt = storeSel.options[storeSel.selectedIndex];
    const storeAreaCity = getStoreAreaCity(storeSel.value);

    savedTx.push({
        type: 'Sale',
        invoiceNo: inv,
        date: document.getElementById('saleDate').value,
        client: clientSel.value,
        clientCode: cOpt.getAttribute('data-code'),
        clientAr: cOpt.getAttribute('data-ar'),
        governorate: cOpt.getAttribute('data-area'),
        region: cOpt.getAttribute('data-city'),
        storeId: storeSel.value,
        storeName: sOpt ? sOpt.textContent : '',
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

// ------------------------------------------------------------------
// RETURNS — invoice-based selection
// ------------------------------------------------------------------
function loadClientInvoices() {
    const clientName = document.getElementById('retClient').value;
    const invSelect = document.getElementById('retInvoiceSelect');
    invSelect.innerHTML = '<option value="">-- Select Invoice --</option>';

    if (!clientName) {
        document.getElementById('retInvoiceLines').innerHTML = '<p class="text-muted small mb-0">Select a client first.</p>';
        return;
    }

    const clientSales = savedTx.filter(t => t.type === 'Sale' && t.client === clientName);
    if (clientSales.length === 0) {
        invSelect.innerHTML = '<option value="">-- No invoices for this client --</option>';
        document.getElementById('retInvoiceLines').innerHTML =
            '<p class="text-danger small mb-0">⚠ This client has no saved invoices on this device. Make a sale first.</p>';
        return;
    }

    clientSales.forEach((s, idx) => {
        invSelect.innerHTML += `<option value="${idx}">${s.invoiceNo} · ${s.date} · ${s.total.toFixed(2)}</option>`;
    });

    document.getElementById('retInvoiceLines').innerHTML = '<p class="text-muted small mb-0">Select an invoice to see lines.</p>';
    currentRet = { lines: [], total: 0 };
    renderCurrentRet();
}

function loadInvoiceLines() {
    const clientName = document.getElementById
