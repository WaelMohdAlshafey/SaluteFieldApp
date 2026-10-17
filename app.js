// Global variables
let currentLines = [];

// Load saved invoices from phone memory
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('saleDate').valueAsDate = new Date();
    renderSavedInvoices();
});

// Add a product line to the current invoice
function addLine() {
    const invoiceNo = document.getElementById('invoiceNo').value;
    const saleDate = document.getElementById('saleDate').value;
    const clientName = document.getElementById('clientName').value;
    const productCode = document.getElementById('productCode').value;
    const productName = document.getElementById('productName').value;
    const qty = parseFloat(document.getElementById('qty').value);
    const price = parseFloat(document.getElementById('price').value);
    const discount = parseFloat(document.getElementById('discount').value) || 0;

    if (!invoiceNo || !clientName || !productCode || !qty || !price) {
        alert("Please fill all required fields.");
        return;
    }

    const line = { invoiceNo, saleDate, clientName, productCode, productName, qty, price, discount };
    currentLines.push(line);
    renderCurrentLines();

    // Clear product inputs
    document.getElementById('productCode').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('qty').value = '';
    document.getElementById('price').value = '';
}

// Render current lines
function renderCurrentLines() {
    const div = document.getElementById('currentLines');
    div.innerHTML = currentLines.map((l, index) => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
            <div>
                <strong>${l.productName}</strong> (${l.qty} x ${l.price})<br>
                <small class="text-muted">${l.clientName} - Inv #${l.invoiceNo}</small>
            </div>
            <button class="btn btn-sm btn-danger" onclick="removeLine(${index})">X</button>
        </div>
    `).join('');
}

function removeLine(index) {
    currentLines.splice(index, 1);
    renderCurrentLines();
}

// Save invoice to localStorage
function saveInvoice() {
    if (currentLines.length === 0) {
        alert("No lines to save.");
        return;
    }

    let saved = JSON.parse(localStorage.getItem('salute_invoices') || '[]');
    saved = saved.concat(currentLines);
    localStorage.setItem('salute_invoices', JSON.stringify(saved));

    currentLines = [];
    renderCurrentLines();
    renderSavedInvoices();
    
    // Clear header inputs
    document.getElementById('invoiceNo').value = '';
    document.getElementById('clientName').value = '';
    
    alert("Invoice saved offline successfully!");
}

// Render saved invoices
function renderSavedInvoices() {
    let saved = JSON.parse(localStorage.getItem('salute_invoices') || '[]');
    const div = document.getElementById('savedInvoices');
    
    if(saved.length === 0) {
        div.innerHTML = '<div class="list-group-item text-muted">No saved invoices yet.</div>';
        return;
    }

    div.innerHTML = `<div class="list-group-item bg-light">
        <strong>Total pending lines: ${saved.length}</strong>
        <button class="btn btn-sm btn-outline-danger float-end" onclick="clearAll()">Clear All</button>
    </div>`;
}

function clearAll() {
    if(confirm("Are you sure you want to delete all saved invoices without exporting?")) {
        localStorage.removeItem('salute_invoices');
        renderSavedInvoices();
    }
}

// Generate Excel File
function exportToExcel() {
    let saved = JSON.parse(localStorage.getItem('salute_invoices') || '[]');
    if (saved.length === 0) {
        alert("No data to export.");
        return;
    }

    // Format data to match your SalesImportService exactly
    const excelData = saved.map(row => ({
        "qurter": "Q" + Math.ceil((new Date(row.saleDate).getMonth() + 1) / 3),
        "code": row.productCode,
        "movement": -row.qty, 
        "Date": row.saleDate,
        "Transaction": "Sales",
        "product": row.productName,
        "quntity": row.qty,
        "Price": row.price,
        "Discount": row.discount + "%",
        "netPrice": row.price * (1 - (row.discount / 100)),
        "Arabic_Name": "",
        "Invoice#": row.invoiceNo,
        "Client": row.clientName,
        "discription": "Field Sale",
        "super visor": "",
        "sales rep": "Mobile Rep",
        "cost": 0,
        "doc#": row.invoiceNo,
        "PaymentMethod": "Credit",
        "returns": 0,
        "Collected": 0,
        "requested_amount": row.price * row.qty,
        "totalof return": 0,
        "returns_price": 0,
        "Return": 0,
        "price_code": row.productCode,
        "Sales": row.price * row.qty,
        "Governorate": "",
        "Region": "",
        "sales_net": (row.price * (1 - (row.discount / 100))) * row.qty,
        "Cost_net": 0,
        "Month": new Date(row.saleDate).toLocaleString('default', { month: 'long' }),
        "AgingLimit": 30,
        "Initiated Date": row.saleDate,
        "Quarter": "Q" + Math.ceil((new Date(row.saleDate).getMonth() + 1) / 3)
    }));

    // Generate Excel using SheetJS
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales");
    
    // Download the file
    const dateStr = new Date().toISOString().slice(0,10);
    XLSX.writeFile(workbook, `FieldSales_${dateStr}.xlsx`);
    
    alert("Excel file generated! Send it to the Admin to import.");
}