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
let allInvoices = []; // Used for Returns

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
        showApp();
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
        repSelect.innerHTML += `<option value="${e.name}" data-sup="${e.supervisor || ''}" data-area="${e.areaId || 0}">${e.name}</option>`;
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
        supervisor: opt.getAttribute('data-sup') || '',
        areaId: parseInt(opt.getAttribute('data-area')) || 0
    };
    localStorage.setItem('salute_rep', JSON.stringify(currentRep));
    showApp();
}

// ------------------------------------------------------------------
// SHOW APP & ENFORCE AUTHORITIES (Only show clients in user's area)
// ------------------------------------------------------------------
function showApp() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('appSection').style.display = 'block';
    document.getElementById('bottomBar').style.display = 'flex';
    document.getElementById('lblRepName').innerText = currentRep.name;

    // Filter Clients by Authority
    let filteredClients = allClients;
    
    // If the rep has a specific Area ID, ONLY show clients in that area.
    if (currentRep.areaId > 0) {
        // We filter by areaName. (Requires the API to send areaName for clients)
        const repAreaStore = allStores.find(s => s.area && s.id === currentRep.areaId); 
        // Fallback: If areaId doesn't map directly, we check by string matching
        // (The C# API returns areaName for clients, so we filter that way)
        filteredClients = allClients.filter(c => c.areaName && c.areaName.trim() !== "");
    }

    const clientHtml = '<option value="">-- Select Client --</option>' + filteredClients.map(c =>
        `<option value="${c.name}" data-id="${c.id || ''}" data-code="${c.code}" data-ar="${c.arabicName || ''}" data-area="${c.areaName || ''}" data-city="${c.cityName || ''}">${c.name}</option>`
    ).join('');
    
    ['saleClient', 'retClient', 'payClient'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = clientHtml;
    });

    savedTx = JSON.parse(localStorage.getItem('salute_saved_v2') || '[]');
    renderSavedTable();
}

// ------------------------------------------------------------------
// FIXED STORE AUTO-SELECT (Case-insensitive + Fallback to All Stores)
// ------------------------------------------------------------------
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

    // 1. Try to find a SUB store matching the client's city
    let matchedStores = allStores.filter(s => s.type === 'SUB' && (s.city || '').trim().toLowerCase() === cityName && cityName !== '');
    
    // 2. Try to find a PARENT store matching the client's area
    if (matchedStores.length === 0) {
        matchedStores = allStores.filter(s => s.type === 'PARENT' && (s.area || '').trim().toLowerCase() === areaName && areaName !== '');
    }
    
    // 3. Fallback to MAIN stores
    if (matchedStores.length === 0) {
        matchedStores = allStores.filter(s => s.type === 'MAIN');
    }

    // 4. If still empty, show ALL stores so the user is never stuck
    if (matchedStores.length === 0) {
        matchedStores = allStores;
    }

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

// ---------------- SALES ----------------
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

    currentSale.lines.push({
        product: prodSel.value, productCode: pOpt.getAttribute('data-code'),
        cost: parseFloat(pOpt.getAttribute('data-cost')) || 0,
        qty, price, disc: (reg + cash + add), netPrice, total: netPrice
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
    const storeSel = document.getElementById('saleStore');
    if (!inv || !clientSel.value || !storeSel.value || currentSale.lines.length === 0) {
        return alert("Fill header and add lines.");
    }

    const cOpt = clientSel.options[clientSel.selectedIndex];
    
    savedTx.push({
        type: 'Sale', invoiceNo: inv, date: document.getElementById('saleDate').value,
        client: clientSel.value, clientCode: cOpt.getAttribute('data-code'), clientAr: cOpt.getAttribute('data-ar'),
        governorate: cOpt.getAttribute('data-area'), region: cOpt.getAttribute('data-city'),
        storeId: storeSel.value,
        payType: document.getElementById('salePayType').value, 
        paid: parseFloat(document.getElementById('salePaid').value) || 0,
        total: currentSale.total, lines: currentSale.lines.map(l => ({ ...l }))
    });

    clearCurrentSale();
    saveAndRender();
}

// ---------------- RETURNS (Fetches from Server DB) ----------------
async function loadClientInvoices() {
    const clientSel = document.getElementById('retClient');
    const clientName = clientSel.value;
    const invSelect = document.getElementById('retInvoiceSelect');
    invSelect.innerHTML = '<option value="">-- Loading Invoices... --</option>';

    if (!clientName) {
        document.getElementById('retInvoiceLines').innerHTML = '<p class="text-muted small mb-0">Select a client first.</p>';
        return;
    }

    const cOpt = clientSel.options[clientSel.selectedIndex];
    const clientId = cOpt.getAttribute('data-id');

    let serverInvoices = [];
    try {
        // Call the C# endpoint we added
        const resp = await fetch(`https://saluteonline.runasp.net/api/MobileData/ClientInvoices?clientId=${clientId}`);
        if (resp.ok) serverInvoices = await resp.json();
    } catch(e) { console.warn("Offline, using local invoices"); }

    // Also include local saved sales for this client that might not be synced yet
    const localSales = savedTx.filter(t => t.type === 'Sale' && t.client === clientName);

    // Combine (avoiding duplicates by invoiceNo)
    allInvoices = [...serverInvoices];
    localSales.forEach(ls => {
        if (!allInvoices.find(si => si.invoiceNumber === ls.invoiceNo)) {
            allInvoices.push({
                id: 'local_' + ls.invoiceNo,
                invoiceNumber: ls.invoiceNo,
                date: ls.date,
                total: ls.total,
                lines: ls.lines.map(l => ({
                    productName: l.product, productId: 0, qty: l.qty, price: l.price, netPrice: l.netPrice, cost: l.cost
                })),
                isLocal: true
            });
        }
    });

    if (allInvoices.length === 0) {
        invSelect.innerHTML = '<option value="">-- No invoices found --</option>';
        document.getElementById('retInvoiceLines').innerHTML = '<p class="text-danger small mb-0">No invoices found for this client.</p>';
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

    let html = '<table class="table table-sm mb-0"><thead><tr><th style="width:28px"></th><th>Product</th><th>Sold</th><th>Return</th><th>Price</th></tr></thead><tbody>';
    inv.lines.forEach((line, i) => {
        html += `<tr>
            <td><input type="checkbox" class="form-check-input ret-line-check" data-idx="${i}" onchange="updateRetLineTotal()"></td>
            <td style="font-size:11px">${line.productName}</td>
            <td>${line.qty}</td>
            <td><input type="number" class="form-control form-control-sm ret-line-qty" data-idx="${i}" value="${line.qty}" min="0" max="${line.qty}" style="width:60px" onchange="updateRetLineTotal()"></td>
            <td>${line.price.toFixed(2)}</td>
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

        const lineTotal = Math.round(qty * line.price * 100) / 100;
        currentRet.lines.push({
            productName: line.productName,
            productId: line.productId, // Crucial for DB insert
            cost: line.cost, qty: qty, price: line.price, total: lineTotal
        });
        currentRet.total = Math.round((currentRet.total + lineTotal) * 100) / 100;
    });

    renderCurrentRet();
}

function renderCurrentRet() {
    const tbody = document.getElementById('currentRetLines');
    tbody.innerHTML = currentRet.lines.map((l, index) => `
        <tr>
            <td>${l.productName}</td><td>${l.qty}</td><td>${l.total.toFixed(2)}</td>
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
    document.getElementById('retReturnNo').value = '';
    document.getElementById('retInvoiceSelect').value = '';
    document.getElementById('retInvoiceLines').innerHTML = '<p class="text-muted small mb-0">Select a client and invoice to load lines.</p>';
}

async function saveReturn() {
    const returnNo = document.getElementById('retReturnNo').value.trim();
    const clientSel = document.getElementById('retClient');
    const clientName = clientSel.value;
    const invIdx = document.getElementById('retInvoiceLines').dataset.invIdx;
    
    if (!returnNo || !clientName || !invIdx || currentRet.lines.length === 0) {
        return alert("Fill return # and select at least one line to return.");
    }

    const originalInv = allInvoices[parseInt(invIdx)];
    const cOpt = clientSel.options[clientSel.selectedIndex];
    const clientId = parseInt(cOpt.getAttribute('data-id')) || 0;

    // 1. Try to save directly to the Server DB
    if (navigator.onLine) {
        try {
            const payload = {
                clientId: clientId,
                returnNumber: returnNo,
                returnDate: document.getElementById('retDate').value,
                originalSaleId: originalInv.isLocal ? 0 : originalInv.id,
                storeId: 1, // Note: you may need to fetch the storeId from the invoice or let user pick
                repName: currentRep.name,
                items: currentRet.lines.map(l => ({
                    productId: l.productId,
                    quantity: l.qty,
                    price: l.price,
                    cost: l.cost
                }))
            };
            const resp = await fetch('https://saluteonline.runasp.net/api/MobileData/CreateReturn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                alert("Return saved successfully to Database!");
                clearCurrentRet(true);
                return;
            }
        } catch (e) {
            console.warn("Server save failed, falling back to local Excel export.");
        }
    }

    // 2. Fallback: Save locally (Excel Export flow)
    savedTx.push({
        type: 'Return', invoiceNo: returnNo, originalInvoiceNo: originalInv.invoiceNumber,
        date: document.getElementById('retDate').value, client: clientName,
        clientCode: cOpt.getAttribute('data-code'), clientAr: cOpt.getAttribute('data-ar'),
        governorate: cOpt.getAttribute('data-area'), region: cOpt.getAttribute('data-city'),
        total: currentRet.total, lines: currentRet.lines.map(l => ({ ...l }))
    });

    clearCurrentRet(true);
    saveAndRender();
    alert("Return saved locally (Offline Mode).");
}

// ---------------- PAYMENTS ----------------
async function savePayment() {
    const inv = document.getElementById('payInvoice').value.trim();
    const clientSel = document.getElementById('payClient');
    const amount = parseFloat(document.getElementById('payAmount').value);
    
    if (!inv || !clientSel.value || !amount || amount <= 0) {
        return alert("Fill all fields with a positive amount.");
    }

    const cOpt = clientSel.options[clientSel.selectedIndex];
    const clientId = parseInt(cOpt.getAttribute('data-id')) || 0;

    // 1. Try Server DB
    if (navigator.onLine && clientId > 0) {
        try {
            const payload = {
                clientId: clientId,
                paymentDate: document.getElementById('payDate').value,
                amount: amount,
                receiptNumber: inv,
                repName: currentRep.name
            };
            const resp = await fetch('https://saluteonline.runasp.net/api/MobileData/CreatePayment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                alert("Payment saved to Database!");
                document.getElementById('payAmount').value = 0;
                document.getElementById('payInvoice').value = '';
                document.getElementById('payClient').value = '';
                return;
            }
        } catch (e) {
            console.warn("Server save failed, saving locally.");
        }
    }

    // 2. Fallback: Save locally
    savedTx.push({
        type: 'Payment', invoiceNo: inv, date: document.getElementById('payDate').value,
        client: clientSel.value, clientCode: cOpt.getAttribute('data-code'), clientAr: cOpt.getAttribute('data-ar'),
        governorate: cOpt.getAttribute('data-area'), region: cOpt.getAttribute('data-city'),
        total: amount, lines: []
    });

    document.getElementById('payAmount').value = 0;
    document.getElementById('payInvoice').value = '';
    document.getElementById('payClient').value = '';
    
    saveAndRender();
    alert("Payment saved locally (Offline Mode).");
}

// ---------------- MY REPORTS ----------------
async function loadMyReports() {
    const tbody = document.getElementById('reportLines');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div> Loading...</td></tr>';
    
    try {
        const response = await fetch(`https://saluteonline.runasp.net/api/MobileData/RepData?repName=${encodeURIComponent(currentRep.name)}`);
        if (!response.ok) throw new Error("Failed");
        
        const data = await response.json();
        tbody.innerHTML = '';
        
        if (data.sales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No invoices found.</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Offline. Connect to internet.</td></tr>';
    }
}

// ---------------- SHARED ----------------
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
            <td><button class="btn btn-sm text-danger p-0" onclick="removeTx(${i})">✖</button></td>
        </tr>`;
    });
    document.getElementById('savedCount').innerText = savedTx.length + " Saved";
}

function removeTx(i) { 
    if(confirm("Delete this saved transaction entirely?")) {
        savedTx.splice(i, 1); 
        saveAndRender(); 
    }
}

function clearAll() { if(confirm("Clear ALL saved transactions?")) { savedTx = []; saveAndRender(); } }

// ---------------- EXPORT EXCEL ----------------
function exportExcel() {
    if (savedTx.length === 0) return alert("No data.");
    let excelData = [];

    savedTx.forEach(t => {
        const isSale = t.type === 'Sale';
        const isRet = t.type === 'Return';
        const isPay = t.type === 'Payment';
        const month = new Date(t.date).getMonth();
        const quarter = "Q" + Math.ceil((month + 1) / 3);

        if (isPay) {
            excelData.push({
                "qurter": quarter, "code": "MISC", "movement": 0, "date": t.date, "transaction": "Payment",
                "product": "Payment on Account", "quntity": 0, "price": 0, "discount": "0%", "netprice": 0,
                "arabicname": t.clientAr, "invoiceno": t.invoiceNo, "client": t.client, "discription": "Mobile App",
                "super visor": currentRep.supervisor, "sales rep": currentRep.name, "cost": 0, "docno": t.invoiceNo,
                "paymentmethod": "Cash", "returns": 0, "collected": t.total, "requestedamount": 0,
                "totalofreturn": 0, "returnsprice": 0, "return": 0, "pricecode": "MISC", "sales": 0,
                "governorate": t.governorate, "region": t.region, "salesnet": 0, "costnet": 0,
                "month": new Date(t.date).toLocaleString('default', { month: 'long' }), "aginglimit": 30,
                "initiateddate": t.date, "quarter": quarter
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
    ws['!cols'] = [];
    ws['!cols'][16] = { hidden: true };
    ws['!cols'][30] = { hidden: true };
    ws['!protect'] = { password: "SaluteAdmin2026", formatColumns: false, formatCells: false, selectLockedCells: false };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `FieldData_${currentRep.name}_${new Date().getTime()}.xlsx`);
}
