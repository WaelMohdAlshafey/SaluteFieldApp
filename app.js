let allClients = [];
let allProducts = [];
let allEmployees = [];
let transactions = []; 
let currentRep = null;

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

    // Check if Rep is already logged in
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

    // Populate Rep Dropdown
    const repSelect = document.getElementById('repSelect');
    repSelect.innerHTML = '<option value="">-- Select Your Name --</option>';
    allEmployees.forEach(e => {
        repSelect.innerHTML += `<option value="${e.name}" data-sup="${e.supervisor}">${e.name}</option>`;
    });

    // Populate Clients
    const clientHtml = '<option value="">-- Select Client --</option>' + allClients.map(c => `<option value="${c.name}" data-code="${c.code}" data-ar="${c.arabicName||''}">${c.name}</option>`).join('');
    ['saleClient', 'retClient', 'payClient'].forEach(id => document.getElementById(id).innerHTML = clientHtml);

    // Populate Products
    const prodHtml = '<option value="">-- Select Product --</option>' + allProducts.map(p => `<option value="${p.name}" data-code="${p.code}" data-price="${p.price}">${p.name}</option>`).join('');
    ['saleProduct', 'retProduct'].forEach(id => document.getElementById(id).innerHTML = prodHtml);
}

function loginRep() {
    const select = document.getElementById('repSelect');
    if (!select.value) return alert("Please select your name.");
    const opt = select.options[select.selectedIndex];
    currentRep = { name: select.value, supervisor: opt.getAttribute('data-sup') };
    localStorage.setItem('salute_rep', JSON.stringify(currentRep));
    showApp();
}

function logoutRep() {
    localStorage.removeItem('salute_rep');
    location.reload();
}

function showApp() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('appSection').style.display = 'block';
    document.getElementById('bottomBar').style.display = 'flex';
    document.getElementById('lblRepName').innerText = currentRep.name;
    // Load existing offline transactions
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
    const disc = parseFloat(document.getElementById('saleDisc').value) || 0;
    const netPrice = price * (1 - (disc / 100));
    
    transactions.push({
        type: 'Sale', invoiceNo: inv, date: document.getElementById('saleDate').value,
        client: clientSel.value, clientCode: cOpt.getAttribute('data-code'), clientAr: cOpt.getAttribute('data-ar'),
        product: prodSel.value, productCode: pOpt.getAttribute('data-code'),
        qty, price, disc, netPrice, total: qty * netPrice,
        payType: document.getElementById('salePayType').value,
        paid: parseFloat(document.getElementById('salePaid').value) || 0
    });
    saveAndRender();
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
        product: prodSel.value, productCode: pOpt.getAttribute('data-code'),
        qty, price, total: qty * price, paid: 0
    });
    saveAndRender();
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
        product: '', productCode: '', qty: 0, price: 0, total: amount, paid: amount
    });
    saveAndRender();
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
    document.getElementById('totalAmount').innerText = "Total: " + total.toFixed(2);
}

function removeTx(i) { transactions.splice(i, 1); saveAndRender(); }
function clearAll() { if(confirm("Clear all?")) { transactions = []; saveAndRender(); } }

// ---------------- EXPORT EXCEL ----------------
function exportExcel() {
    if (transactions.length === 0) return alert("No data.");
    
    const excelData = transactions.map(t => {
        const isSale = t.type === 'Sale';
        const isRet = t.type === 'Return';
        const isPay = t.type === 'Payment';
        
        // Default Q1 based on current month
        const month = new Date(t.date).getMonth();
        const quarter = "Q" + Math.ceil((month + 1) / 3);

        return {
            "qurter": quarter,
            "code": t.productCode,
            "movement": isSale ? -t.qty : (isRet ? t.qty : 0),
            "date": t.date,
            "transaction": t.type,
            "product": t.product,
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
            "cost": 0, 
            "docno": t.invoiceNo,
            "paymentmethod": isSale ? t.payType : (isPay ? "Cash" : ""),
            "returns": isRet ? t.qty : 0,
            "collected": isSale ? t.paid : (isPay ? t.total : 0),
            "requestedamount": t.total,
            "totalofreturn": isRet ? t.total : 0,
            "returnsprice": isRet ? t.price : 0,
            "return": isRet ? t.total : 0,
            "pricecode": t.productCode,
            "sales": isSale ? t.total : 0,
            "governorate": "", 
            "region": "",
            "salesnet": isSale ? t.total : 0,
            "costnet": 0,
            "month": new Date(t.date).toLocaleString('default', { month: 'long' }),
            "aginglimit": 30,
            "initiateddate": t.date,
            "quarter": quarter
        };
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `FieldData_${currentRep.name}_${new Date().getTime()}.xlsx`);
}
