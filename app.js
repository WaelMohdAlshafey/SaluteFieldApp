let allClients = [];
let allProducts = [];
let allEmployees = [];
let transactions = []; 
let currentRep = null;
let discountMethod = "Sequential";

document.addEventListener('DOMContentLoaded', async () => {
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(el => el.value = today);

    try {
        const response = await fetch('https://saluteonline.runasp.net/api/MobileData');
        const data = await response.json();
        localStorage.setItem('salute_data', JSON.stringify(data));
        loadData(data);
        document.getElementById('connectionStatus').className = "badge bg-success";
        document.getElementById('connectionStatus').innerText = "Online";
    } catch (err) {
        const saved = localStorage.getItem('salute_data');
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
    currentRep = { 
        name: select.value, 
        supervisor: opt.getAttribute('data-sup'),
        areaId: parseInt(opt.getAttribute('data-area')) || 0
    };
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
        filteredClients = allClients.filter(c => c.areaId === currentRep.areaId);
    }

    const clientHtml = '<option value="">-- Select Client --</option>' + filteredClients.map(c => 
        `<option value="${c.name}" data-code="${c.code}" data-ar="${c.arabicName||''}" data-gov="${c.governorate||''}" data-reg="${c.region||''}">${c.name}</option>`
    ).join('');
    ['saleClient', 'retClient', 'payClient'].forEach(id => document.getElementById(id).innerHTML = clientHtml);
    
    transactions = JSON.parse(localStorage.getItem('salute_tx') || '[]');
    renderTable();
}

function updatePrice(prefix) {
    const select = document.getElementById(prefix + 'Product');
    const opt = select.options[select.selectedIndex];
    if (opt.value) document.getElementById(prefix + 'Price').value = opt.getAttribute('data-price');
}

// ---------------- ADD SALES ----------------
function addSale() {
    const inv = document.getElementById('saleInvoice').value;
    const clientSel = document.getElementById('saleClient');
    const prodSel = document.getElementById('saleProduct');
    if (!inv || !clientSel.value || !prodSel.value) return alert("Fill all fields");

    const cOpt = clientSel.options[clientSel.selectedIndex];
    const pOpt = prodSel.options[prodSel.selectedIndex];
    
    const qty = parseFloat(document.getElementById('saleQty').value);
    const price = parseFloat(document.getElementById('salePrice').value);
    const reg = parseFloat(document.getElementById('saleReg').value) || 0;
    const cash = parseFloat(document.getElementById('saleCash').value) || 0;
    const add = parseFloat(document.getElementById('saleAdd').value) || 0;
    
    const gross = qty * price;
    let netPrice = gross;

    if (discountMethod === "Additive") {
        const totalDisc = reg + cash + add;
        netPrice = gross * (1 - (totalDisc / 100));
    } else {
        netPrice = gross * (1 - reg/100) * (1 - cash/100) * (1 - add/100);
    }
    
    netPrice = Math.round(netPrice * 100) / 100;
    const totalDiscPct = reg + cash + add;

    transactions.push({
        type: 'Sale', invoiceNo: inv, date: document.getElementById('saleDate').value,
        client: clientSel.value, clientCode: cOpt.getAttribute('data-code'), clientAr: cOpt.getAttribute('data-ar'),
        governorate: cOpt.getAttribute('data-gov'), region: cOpt.getAttribute('data-reg'),
        product: prodSel.value, productCode: pOpt.getAttribute('data-code'),
        cost: parseFloat(pOpt.getAttribute('data-cost')) || 0,
        qty, price, disc: totalDiscPct, netPrice, total: netPrice, paid: 0
    });
    
    saveAndRender();

    // CLEAR THE PRODUCT FIELDS SO YOU CAN ADD THE NEXT ONE EASILY
    document.getElementById('saleProduct').value = '';
    document.getElementById('saleQty').value = 1;
    document.getElementById('salePrice').value = 0;
    document.getElementById('saleReg').value = 0;
    document.getElementById('saleCash').value = 0;
    document.getElementById('saleAdd').value = 0;
}

// ---------------- ADD RETURNS ----------------
function addReturn() {
    const inv = document.getElementById('retInvoice').value;
    const clientSel = document.getElementById('retClient');
    const prodSel = document.getElementById('retProduct');
    if (!inv || !clientSel.value || !prodSel.value) return alert("Fill all fields");

    const cOpt = clientSel.options[clientSel.selectedIndex];
    const pOpt = prodSel.options[prodSel.selectedIndex];
    
    const qty = parseFloat(document.getElementById('retQty').value);
    const price = parseFloat(document.getElementById('retPrice').value);

    transactions.push({
        type: 'Return', invoiceNo: inv, date: document.getElementById('retDate').value,
        client: clientSel.value, clientCode: cOpt.getAttribute('data-code'), clientAr: cOpt.getAttribute('data-ar'),
        governorate: cOpt.getAttribute('data-gov'), region: cOpt.getAttribute('data-reg'),
        product: prodSel.value, productCode: pOpt.getAttribute('data-code'),
        cost: parseFloat(pOpt.getAttribute('data-cost')) || 0,
        qty, price, total: qty * price, paid: 0
    });
    saveAndRender();
    
    // CLEAR FIELDS
    document.getElementById('retProduct').value = '';
    document.getElementById('retQty').value = 1;
    document.getElementById('retPrice').value = 0;
}

// ---------------- ADD PAYMENTS ----------------
function addPayment() {
    const inv = document.getElementById('payInvoice').value;
    const clientSel = document.getElementById('payClient');
    if (!inv || !clientSel.value) return alert("Fill all fields");

    const cOpt = clientSel.options[clientSel.selectedIndex];
    const amount = parseFloat(document.getElementById('payAmount').value);

    transactions.push({
        type: 'Payment', invoiceNo: inv, date: document.getElementById('payDate').value,
        client: clientSel.value, clientCode: cOpt.getAttribute('data-code'), clientAr: cOpt.getAttribute('data-ar'),
        governorate: cOpt.getAttribute('data-gov'), region: cOpt.getAttribute('data-reg'),
        product: '', productCode: '', cost: 0, qty: 0, price: 0, total: amount, paid: amount
    });
    saveAndRender();

    // CLEAR FIELDS
    document.getElementById('payAmount').value = 0;
    document.getElementById('payInvoice').value = '';
}

function saveAndRender() {
    localStorage.setItem('salute_tx', JSON.stringify(transactions));
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('dataLines');
    let total = 0;
    tbody.innerHTML = '';
    transactions.forEach((t, i) => {
        total += t.total;
        tbody.innerHTML += `<tr>
            <td><span class="badge ${t.type==='Sale'?'bg-success':(t.type==='Return'?'bg-warning text-dark':'bg-info')}">${t.type}</span></td>
            <td>${t.product || t.client}</td><td>${t.qty || '-'}</td><td>${t.total.toFixed(2)}</td>
            <td><button class="btn btn-sm text-danger p-0" onclick="removeTx(${i})">✖</button></td>
        </tr>`;
    });
    // SHOWS THE EXACT COUNT OF ITEMS THAT WILL BE EXPORTED
    document.getElementById('totalAmount').innerText = `Items: ${transactions.length} | Total: ${total.toFixed(2)}`;
}

function removeTx(i) { transactions.splice(i, 1); saveAndRender(); }
function clearAll() { if(confirm("Clear all?")) { transactions = []; saveAndRender(); } }

function exportExcel() {
    if (transactions.length === 0) return alert("No data.");
    
    // THIS MAPS ALL TRANSACTIONS (SALES, RETURNS, PAYMENTS) INTO THE EXCEL
    const excelData = transactions.map(t => {
        const isSale = t.type === 'Sale';
        const isRet = t.type === 'Return';
        const isPay = t.type === 'Payment';
        
        const month = new Date(t.date).getMonth();
        const quarter = "Q" + Math.ceil((month + 1) / 3);

        return {
            "qurter": quarter,
            "code": t.productCode,
            "movement": isSale ? -t.qty : (isRet ? t.qty : 0),
            "date": t.date,
            "transaction": t.type,
            "product": t.product || "MISC", // If payment, give it a default product name so server doesn't skip
            "quntity": t.qty,
            "price": t.price,
            "discount": isSale ? (t.disc + "%") : "0%",
            "netprice": isSale ? t.netPrice : (isRet ? t.price : 0),
            "arabicname": t.clientAr,
            "invoiceno": t.invoiceNo,
            "client": t.client,
            "discription": "Mobile App",
            "super visor": currentRep.supervisor,
            "sales rep": currentRep.name,
            "cost": t.cost,
            "docno": t.invoiceNo,
            "paymentmethod": isPay ? "Cash" : "Credit",
            "returns": isRet ? t.qty : 0,
            "collected": isPay ? t.total : 0,
            "requestedamount": isSale ? (t.price * t.qty) : 0,
            "totalofreturn": isRet ? t.total : 0,
            "returnsprice": isRet ? t.price : 0,
            "return": isRet ? t.total : 0,
            "pricecode": t.productCode || "MISC",
            "sales": isSale ? (t.price * t.qty) : 0,
            "governorate": t.governorate, 
            "region": t.region,
            "salesnet": isSale ? t.netPrice : 0,
            "costnet": isSale ? (t.cost * t.qty) : (isRet ? (t.cost * t.qty) : 0),
            "month": new Date(t.date).toLocaleString('default', { month: 'long' }),
            "aginglimit": 30,
            "initiateddate": t.date,
            "quarter": quarter
        };
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
    
    // Exports the file with ALL day's items
    XLSX.writeFile(wb, `FieldData_${currentRep.name}_${new Date().getTime()}.xlsx`);
}
