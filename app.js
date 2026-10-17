let allClients = [];
let allProducts = [];
let currentLines = [];

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('saleDate').valueAsDate = new Date();
    
    // 1. Load data from the server (Live)
    try {
        // Fetch from your live MonsterASP system
        const response = await fetch('https://saluteonline.runasp.net/api/MobileData');
        if (!response.ok) throw new Error("Network response was not ok");
        
        const data = await response.json();
        
        // Save to phone storage (for offline use)
        localStorage.setItem('salute_clients', JSON.stringify(data.clients));
        localStorage.setItem('salute_products', JSON.stringify(data.products));
        
        allClients = data.clients;
        allProducts = data.products;
        
        populateDropdowns();
    } catch (err) {
        console.log("Offline mode or server down. Loading from phone storage...");
        // Fallback to offline data saved previously
        allClients = JSON.parse(localStorage.getItem('salute_clients') || '[]');
        allProducts = JSON.parse(localStorage.getItem('salute_products') || '[]');
        
        populateDropdowns();
    }
});

function populateDropdowns() {
    const clientSelect = document.getElementById('clientSelect');
    const productSelect = document.getElementById('productSelect');
    
    clientSelect.innerHTML = '<option value="">-- Select Client --</option>';
    allClients.forEach(c => {
        let opt = document.createElement('option');
        opt.value = c.name;
        opt.text = c.name + " (" + c.code + ")";
        clientSelect.appendChild(opt);
    });

    productSelect.innerHTML = '<option value="">-- Select Product --</option>';
    allProducts.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p.name;
        opt.setAttribute('data-code', p.code);
        opt.setAttribute('data-price', p.price);
        opt.text = p.name + " (" + p.code + ")";
        productSelect.appendChild(opt);
    });
}

function updatePrice() {
    const select = document.getElementById('productSelect');
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption.value) {
        document.getElementById('price').value = selectedOption.getAttribute('data-price');
    } else {
        document.getElementById('price').value = 0;
    }
}

function addLine() {
    const invoiceNo = document.getElementById('invoiceNo').value;
    const client = document.getElementById('clientSelect').value;
    const productSelect = document.getElementById('productSelect');
    const product = productSelect.value;
    const productCode = productSelect.options[productSelect.selectedIndex].getAttribute('data-code');
    const qty = parseFloat(document.getElementById('qty').value);
    const price = parseFloat(document.getElementById('price').value);

    if (!invoiceNo || !client || !product || qty <= 0 || price < 0) {
        alert("Please fill Invoice #, Client, Product, and valid Qty/Price.");
        return;
    }

    currentLines.push({
        invoiceNo, client, product, productCode, qty, price, lineTotal: (qty * price)
    });

    renderLines();
    document.getElementById('productSelect').value = "";
    document.getElementById('price').value = 0;
    document.getElementById('qty').value = 1;
}

function renderLines() {
    const tbody = document.getElementById('invoiceLines');
    const totalSpan = document.getElementById('totalAmount');
    if (currentLines.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No products added yet</td></tr>';
        totalSpan.innerText = "Total: 0.00";
        return;
    }

    let html = ''; let grandTotal = 0;
    currentLines.forEach((line, index) => {
        grandTotal += line.lineTotal;
        html += `<tr>
            <td>${line.product}</td>
            <td class="text-center">${line.qty}</td>
            <td class="text-end">${line.price.toFixed(2)}</td>
            <td class="text-end fw-bold">${line.lineTotal.toFixed(2)}</td>
            <td class="text-center"><button class="btn btn-sm text-danger p-0" onclick="removeLine(${index})">✖</button></td>
        </tr>`;
    });
    tbody.innerHTML = html;
    totalSpan.innerText = "Total: " + grandTotal.toFixed(2);
}

function removeLine(index) {
    currentLines.splice(index, 1);
    renderLines();
}

function clearCurrent() {
    if(confirm("Clear all lines in this invoice?")) {
        currentLines = [];
        renderLines();
    }
}

function saveAndExport() {
    if (currentLines.length === 0) { alert("No lines to export."); return; }
    const saleDate = document.getElementById('saleDate').value;

    const excelData = currentLines.map(row => ({
        "qurter": "Q" + Math.ceil((new Date(saleDate).getMonth() + 1) / 3),
        "code": row.productCode, "movement": -row.qty, "Date": saleDate,
        "Transaction": "Sales", "product": row.product, "quntity": row.qty,
        "Price": row.price, "Discount": "0%", "netPrice": row.price,
        "Arabic_Name": "", "Invoice#": row.invoiceNo, "Client": row.client,
        "discription": "Field Sale", "super visor": "", "sales rep": "Mobile",
        "cost": 0, "doc#": row.invoiceNo, "PaymentMethod": "Credit",
        "returns": 0, "Collected": 0, "requested_amount": row.lineTotal,
        "totalof return": 0, "returns_price": 0, "Return": 0, "price_code": row.productCode,
        "Sales": row.lineTotal, "Governorate": "", "Region": "", "sales_net": row.lineTotal,
        "Cost_net": 0, "Month": new Date(saleDate).toLocaleString('default', { month: 'long' }),
        "AgingLimit": 30, "Initiated Date": saleDate,
        "Quarter": "Q" + Math.ceil((new Date(saleDate).getMonth() + 1) / 3)
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales");
    XLSX.writeFile(workbook, `FieldSales_${currentLines[0].invoiceNo}.xlsx`);
    
    alert("Excel exported! Send it to the Admin.");
}