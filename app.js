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
        repSelect.innerHTML += `<option value="${e.name}" data-sup="${e.supervisor}" data-area="${e.areaId}">${e.name}</option>`;
    });

    const prodHtml = '<option value="">-- Select Product --</option>' + allProducts.map(p => 
        `<option value="${p.name}" data-code="${p.code}" data-price="${p.price}" data-cost="${p.cost}">${p.name}</option>`
    ).join('');
    ['saleProduct', 'retProduct'].forEach(id => document.getElementById(id).innerHTML = prodHtml);
}

function loginRep() {
    const select = document.getElementById('repSelect');
    if (!select.value) return alert("Please select your name.");
    const opt = select.options[select.selectedIndex];
    currentRep = { name: select.value, supervisor: opt.getAttribute('data-sup'), areaId: parseInt(opt.getAttribute('data-area')) || 0 };
    localStorage.setItem('salute_rep', JSON.stringify(currentRep));
    showApp();
}

function showApp() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('appSection').style.display = 'block';
    document.getElementById('bottomBar').style.display = 'flex';
    document.getElementById('lblRepName').innerText = currentRep.name;
    
    let filteredClients = allClients;
    if (currentRep.areaId > 0) {
        filteredClients = allClients.filter(c => c.areaName && c.areaName.trim().toLowerCase() === allEmployees.find(e => e.name === currentRep.name)?.areaName?.toLowerCase());
        // Fallback: if no area match, show all clients (just in case area names are different)
        if (filteredClients.length === 0) filteredClients = allClients;
    }

    const clientHtml = '<option value="">-- Select Client --</option>' + filteredClients.map(c => 
        `<option value="${c.name}" data-code="${c.code}" data-ar="${c.arabicName||''}" data-area="${c.areaName||''}" data-city="${c.cityName||''}">${c.name}</option>`
    ).join('');
    ['saleClient', 'retClient', 'payClient'].forEach(id => document.getElementById(id).innerHTML = clientHtml);
    
    savedTx = JSON.parse(localStorage.getItem('salute_saved_v2') || '[]');
    renderSavedTable();
}

// Automatically select the store based on the client's area or city
function autoSelectStore() {
    const clientSel = document.getElementById('saleClient');
    const cOpt = clientSel.options[clientSel.selectedIndex];
    const areaName = cOpt.getAttribute('data-area');
    const cityName = cOpt.getAttribute('data-city');
    const storeSel = document.getElementById('saleStore');

    // Priority 1: Find a SUB store that matches the city
    let store = allStores.find(s => s.type === "SUB" && s.city === cityName);
    // Priority 2: Find a PARENT store that matches the area
    if (!store) store = allStores.find(s => s.type === "PARENT" && s.area === areaName);
    // Priority 3: Default to MAIN store
    if (!store) store = allStores.find(s => s.type === "MAIN");

    if (store) {
        storeSel.innerHTML = `<option value="${store.id}">${store.name}</option>`;
    } else {
        storeSel.innerHTML = `<option value="0">-- No store found --</option>`;
    }
}

function updatePrice(prefix) {
    const select = document.getElementById(prefix + 'Product');
    const opt = select.options[select.selectedIndex];
    if (!opt.value) return;

    const prodName = opt.value;
    const saleDateStr = document.getElementById(prefix + 'Date').value;
    const saleDate = new Date(saleDateStr);

    // Find historical price for this date
    let validPrice = parseFloat(opt.getAttribute('data-price')) || 0;
    
    const histories = priceHistory.filter(h => h.productName === prodName && h.salesPrice > 0);
    const validHist = histories
        .filter(h => new Date(h.startDate) <= saleDate)
        .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

    if (validHist.length > 0) {
        validPrice = validHist[0].salesPrice;
    }

    document.getElementById(prefix + 'Price').value = validPrice;
}

// ---------------- SALES ----------------
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
        netPrice = gross * (1 - reg/100) * (1 - cash/100) * (1 - add/100);
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
    if(confirm("Clear this entire current invoice?")) {
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
    if (!inv || !clientSel.value || !storeSel.value || currentSale.lines.length === 0) return alert("Fill header and add lines.");

    const cOpt = clientSel.options[clientSel.selectedIndex];
    
    savedTx.push({
        type: 'Sale', invoiceNo: inv, date: document.getElementById('saleDate').value,
        client: clientSel.value, clientCode: cOpt.getAttribute('data-code'), clientAr: cOpt.getAttribute('data-ar'),
        governorate: cOpt.getAttribute('data-area'), region: cOpt.getAttribute('data-city'),
        storeId: storeSel.value,
        payType: document.getElementById('salePayType').value, paid: parseFloat(document.getElementById('salePaid').value) || 0,
        total: currentSale.total, lines: [...currentSale.lines]
    });

    clearCurrentSale();
    saveAndRender();
}

// ---------------- RETURNS ----------------
function addReturnLine() {
    const prodSel = document.getElementById('retProduct');
    if (!prodSel.value) return alert("Select product");

    const pOpt = prodSel.options[prodSel.selectedIndex];
    const qty = parseFloat(document.getElementById('retQty').value);
    const price = parseFloat(document.getElementById('retPrice').value);

    currentRet.lines.push({
        product: prodSel.value, productCode: pOpt.getAttribute('data-code'),
        cost: parseFloat(pOpt.getAttribute('data-cost')) || 0,
        qty, price, total: qty * price
    });
    
    currentRet.total += (qty * price);
    renderCurrentRet();

    document.getElementById('retProduct').value = '';
    document.getElementById('retQty').value = 1;
    document.getElementById('retPrice').value = 0;
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
    currentRet.total -= removedLine.total;
    renderCurrentRet();
}

function clearCurrentRet() {
    if(confirm("Clear this entire current return?")) {
        currentRet = { lines: [], total: 0 };
        renderCurrentRet();
        document.getElementById('retInvoice').value = '';
        document.getElementById('retClient').value = '';
    }
}

function saveReturn() {
    const inv = document.getElementById('retInvoice').value;
    const clientSel = document.getElementById('retClient');
    if (!inv || !clientSel.value || currentRet.lines.length === 0) return alert("Fill header and add lines.");

    const cOpt = clientSel.options[clientSel.selectedIndex];
    
    savedTx.push({
        type: 'Return', invoiceNo: inv, date: document.getElementById('retDate').value,
        client: clientSel.value, clientCode: cOpt.getAttribute('data-code'), clientAr: cOpt.getAttribute('data-ar'),
        governorate: cOpt.getAttribute('data-area'), region: cOpt.getAttribute('data-city'),
        total: currentRet.total, lines: [...currentRet.lines]
    });

    clearCurrentRet();
    saveAndRender();
}

// ---------------- PAYMENTS ----------------
function savePayment() {
    const inv = document.getElementById('payInvoice').value;
    const clientSel = document.getElementById('payClient');
    const amount = parseFloat(document.getElementById('payAmount').value);
    if (!inv || !clientSel.value || amount <= 0) return alert("Fill all fields");

    const cOpt = clientSel.options[clientSel.selectedIndex];
    
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
}

// ---------------- MY REPORTS (ONLINE) ----------------
async function loadMyReports() {
    const tbody = document.getElementById('reportLines');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div> Loading...</td></tr>';
    
    try {
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

// ---------------- SHARED ----------------
function saveAndRender() {
    localStorage.setItem('salute_saved_v2', JSON.stringify(savedTx));
    renderSavedTable();
    document.getElementById('savedCount').innerText = savedTx.length + " Saved";
}

function renderSavedTable() {
    const tbody = document.getElementById('savedLines');
    tbody.innerHTML = '';
    savedTx.forEach((t, i) => {
        tbody.innerHTML += `<tr>
            <td><span class="badge ${t.type==='Sale'?'bg-success':(t.type==='Return'?'bg-warning text-dark':'bg-info')}">${t.type}</span></td>
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
                    "qurter": quarter, "code": line.productCode, "movement": isSale ? -line.qty : line.qty,
                    "date": t.date, "transaction": t.type, "product": line.product, "quntity": line.qty,
                    "price": line.price, "discount": isSale ? (line.disc + "%") : "0%",
                    "netprice": isSale ? line.netPrice : line.price, "arabicname": t.clientAr,
                    "invoiceno": t.invoiceNo, "client": t.client, "discription": "Mobile App",
                    "super visor": currentRep.supervisor, "sales rep": currentRep.name, "cost": line.cost,
                    "docno": t.invoiceNo, "paymentmethod": isSale ? t.payType : "Credit", "returns": isRet ? line.qty : 0,
                    "collected": isSale ? t.paid : 0, "requestedamount": isSale ? (line.price * line.qty) : 0,
                    "totalofreturn": isRet ? line.total : 0, "returnsprice": isRet ? line.price : 0,
                    "return": isRet ? line.total : 0, "pricecode": line.productCode,
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
