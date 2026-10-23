/* ============================================
   StockBill v2 – Full Inventory + Invoicing
   ============================================ */

(function () {
  'use strict';

  const STORAGE = {
    products: 'sb_products_v2',
    invoices: 'sb_invoices_v2',
    customers: 'sb_customers_v2',
    suppliers: 'sb_suppliers_v2',
    expenses: 'sb_expenses_v2',
    stockMovements: 'sb_stock_v2',
    settings: 'sb_settings_v2',
    counter: 'sb_counter_v2'
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  function save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  let products = load(STORAGE.products, []);
  let invoices = load(STORAGE.invoices, []);
  let customers = load(STORAGE.customers, []);
  let suppliers = load(STORAGE.suppliers, []);
  let expenses = load(STORAGE.expenses, []);
  let stockMovements = load(STORAGE.stockMovements, []);
  let settings = load(STORAGE.settings, {
    businessName: 'My Business',
    ownerName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    taxId: '',
    currency: 'PKR',
    invoicePrefix: 'INV',
    lowStockDefault: 5,
    logo: ''
  });
  let invoiceCounter = load(STORAGE.counter, 1001);

  let currentView = 'dashboard';
  let previousView = null;
  let editingId = null;
  let scanner = null;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function money(n) {
    return (Number(n) || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function initials(name) {
    return (name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Custom dropdown helper (searchable, matches app design)
  function customSelect(name, options, selectedValue, placeholder, searchable) {
    const selected = options.find(o => o.value === selectedValue) || options[0];
    const label = selected ? selected.label : (placeholder || 'Select...');
    const searchHtml = searchable ? `
      <div class="custom-select-search">
        <input type="search" class="custom-select-search-input" placeholder="Search..." data-action="filter-select" autocomplete="off" />
      </div>` : '';
    return `
      <div class="custom-select${searchable ? ' searchable' : ''}" data-name="${name}">
        <input type="hidden" name="${name}" value="${escapeHtml(selectedValue || '')}" class="custom-select-hidden" />
        <button type="button" class="custom-select-trigger" data-action="toggle-select">${escapeHtml(label)}</button>
        <div class="custom-select-options">
          ${searchHtml}
          <div class="custom-select-options-list">
            ${options.map(o => `
              <div class="custom-select-option ${o.value === selectedValue ? 'selected' : ''}"
                   data-action="select-option" data-value="${escapeHtml(o.value)}" data-label="${escapeHtml(o.label)}" data-search="${escapeHtml((o.label || '').toLowerCase())}">
                ${escapeHtml(o.label)}
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }
  function toast(msg, ms = 2500) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.hidden = true, 250);
    }, ms);
  }
  function persist() {
    save(STORAGE.products, products);
    save(STORAGE.invoices, invoices);
    save(STORAGE.customers, customers);
    save(STORAGE.suppliers, suppliers);
    save(STORAGE.expenses, expenses);
    save(STORAGE.stockMovements, stockMovements);
    save(STORAGE.settings, settings);
    save(STORAGE.counter, invoiceCounter);
  }

  // ---------- Navigation ----------
  function setView(view, options = {}) {
    if (!options.keepHistory) previousView = currentView;
    currentView = view;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const showBack = ['customers','suppliers','reports','expenses','stock-history'].includes(view);
    $('#backBtn').hidden = !showBack;
    render();
    window.scrollTo(0, 0);
  }

  // ---------- Render Router ----------
  function render() {
    const content = $('#appContent');
    const title = $('#headerTitle');
    const right = $('#headerRight');
    right.innerHTML = '';

    const map = {
      dashboard: () => { title.textContent = 'Dashboard'; content.innerHTML = viewDashboard(); },
      products: () => {
        title.textContent = 'Products';
        right.innerHTML = `<button class="icon-btn" data-action="add-product" aria-label="Add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`;
        content.innerHTML = viewProducts();
      },
      invoices: () => { title.textContent = 'Invoices'; content.innerHTML = viewInvoices(); },
      'create-invoice': () => { title.textContent = 'New Invoice'; content.innerHTML = viewCreateInvoice(); bindCreateInvoice(); },
      more: () => { title.textContent = 'More'; content.innerHTML = viewMore(); },
      customers: () => {
        title.textContent = 'Customers';
        right.innerHTML = `<button class="icon-btn" data-action="add-customer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`;
        content.innerHTML = viewCustomers();
      },
      suppliers: () => {
        title.textContent = 'Suppliers';
        right.innerHTML = `<button class="icon-btn" data-action="add-supplier"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`;
        content.innerHTML = viewSuppliers();
      },
      reports: () => { title.textContent = 'Reports'; content.innerHTML = viewReports(); },
      expenses: () => {
        title.textContent = 'Expenses';
        right.innerHTML = `<button class="icon-btn" data-action="add-expense"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`;
        content.innerHTML = viewExpenses();
      },
      'stock-history': () => {
        title.textContent = 'Stock History';
        content.innerHTML = viewStockHistory();
      }
    };

    (map[currentView] || map.dashboard)();
  }

  // ---------- Dashboard ----------
  function viewDashboard() {
    const totalProducts = products.length;
    const low = products.filter(p => p.stock > 0 && p.stock <= (p.lowStock || settings.lowStockDefault)).length;
    const out = products.filter(p => p.stock <= 0).length;
    const revenue = invoices.reduce((s, i) => s + (i.total || 0), 0);
    const cogs = invoices.reduce((s, inv) => s + inv.items.reduce((a, it) => a + ((it.cost || 0) * it.qty), 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const profit = revenue - cogs - totalExpenses;
    const recent = [...invoices].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

    return `<div class="fade-in">
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Products</div><div class="stat-value primary">${totalProducts}</div></div>
        <div class="stat-card"><div class="stat-label">Revenue</div><div class="stat-value success">${settings.currency} ${money(revenue)}</div></div>
        <div class="stat-card"><div class="stat-label">Expenses</div><div class="stat-value danger">${settings.currency} ${money(totalExpenses)}</div></div>
        <div class="stat-card"><div class="stat-label">Net Profit</div><div class="stat-value ${profit >= 0 ? 'success' : 'danger'}">${settings.currency} ${money(profit)}</div></div>
      </div>
      <div class="stats-grid" style="margin-top:-8px;margin-bottom:20px">
        <div class="stat-card"><div class="stat-label">Low Stock</div><div class="stat-value warning">${low}</div></div>
        <div class="stat-card"><div class="stat-label">Out of Stock</div><div class="stat-value danger">${out}</div></div>
      </div>
      <div class="section-header">
        <h2 class="section-title">Recent Invoices</h2>
        ${invoices.length > 5 ? `<button class="section-link" data-view="invoices">See all</button>` : ''}
      </div>
      ${recent.length === 0 ? emptyState('invoice', 'No invoices yet', 'Create your first invoice with the + button.', 'Create Invoice', 'create-invoice') :
        `<div class="list">${recent.map(inv => listInvoice(inv)).join('')}</div>`}
    </div>`;
  }

  // ---------- Products ----------
  function viewProducts() {
    if (products.length === 0) {
      return emptyState('box', 'No products yet', 'Add your first product to start tracking stock and creating invoices.', 'Add Product', null, 'add-product');
    }
    const sorted = [...products].sort((a,b) => a.name.localeCompare(b.name));
    return `<div class="fade-in">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" class="search-input" id="productSearch" placeholder="Search name or barcode..." />
      </div>
      <div class="list" id="productList">${sorted.map(p => listProduct(p)).join('')}</div>
    </div>`;
  }

  function listProduct(p) {
    let badge = p.stock <= 0 ? '<span class="list-item-badge badge-out">Out of stock</span>' :
                p.stock <= (p.lowStock || settings.lowStockDefault) ? `<span class="list-item-badge badge-low">Low · ${p.stock}</span>` :
                `<span class="list-item-badge badge-ok">${p.stock} in stock</span>`;
    return `<div class="list-item" data-action="edit-product" data-id="${p.id}">
      <div class="list-item-icon">${initials(p.name)}</div>
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(p.name)}</div>
        <div class="list-item-sub">${settings.currency} ${money(p.price)} · ${p.unit || 'pcs'}${p.barcode ? ' · ' + escapeHtml(p.barcode) : ''}</div>
      </div>
      <div class="list-item-right">${badge}</div>
    </div>`;
  }

  // ---------- Invoices ----------
  function viewInvoices() {
    if (invoices.length === 0) {
      return emptyState('invoice', 'No invoices yet', 'Create invoices for customers and track sales.', 'Create Invoice', 'create-invoice');
    }
    const sorted = [...invoices].sort((a,b) => new Date(b.date) - new Date(a.date));
    return `<div class="fade-in"><div class="list">${sorted.map(inv => listInvoice(inv)).join('')}</div></div>`;
  }

  function listInvoice(inv) {
    const status = inv.paymentStatus || 'unpaid';
    const paid = inv.paidAmount || 0;
    let badge = '';
    if (status === 'paid' || paid >= inv.total) {
      badge = '<span class="list-item-badge badge-ok">Paid</span>';
    } else if (status === 'partial' || paid > 0) {
      badge = `<span class="list-item-badge badge-low">Partial · ${settings.currency} ${money(paid)}</span>`;
    } else {
      badge = '<span class="list-item-badge badge-out">Unpaid</span>';
    }
    return `<div class="list-item" data-action="view-invoice" data-id="${inv.id}">
      <div class="list-item-icon">${initials(inv.customerName || 'C')}</div>
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(inv.customerName || 'Walk-in Customer')}</div>
        <div class="list-item-sub">#${inv.number} · ${formatDate(inv.date)} · ${inv.items.length} item${inv.items.length !== 1 ? 's' : ''}</div>
        ${badge}
      </div>
      <div class="list-item-right"><div class="list-item-price">${settings.currency} ${money(inv.total)}</div></div>
    </div>`;
  }

  // ---------- Create Invoice ----------
  function viewCreateInvoice() {
    if (products.length === 0) {
      return emptyState('box', 'Add products first', 'You need at least one product before creating an invoice.', 'Go to Products', 'products');
    }
    const available = products.filter(p => p.stock > 0);
    const customerOptions = [
      { value: '', label: 'Walk-in Customer' },
      ...customers.map(c => ({
        value: c.id,
        label: c.name + (c.phone ? ' · ' + c.phone : '')
      }))
    ];
    return `<div class="fade-in">
      <form id="invoiceForm">
        <div class="form-group">
          <label class="form-label">Customer</label>
          ${customSelect('customerId', customerOptions, '', 'Walk-in Customer', true)}
        </div>
        <div class="form-group">
          <label class="form-label">Or type name / phone</label>
          <input type="text" class="form-input" name="customerName" id="customerNameInput" placeholder="Customer name" />
        </div>
        <div class="form-group">
          <input type="tel" class="form-input" name="customerPhone" id="customerPhoneInput" placeholder="Phone (optional)" />
        </div>
        <div class="section-header mt-16"><h2 class="section-title">Products</h2></div>
        <div id="invoiceProducts">
          ${available.length === 0 ? '<div class="card text-center text-secondary" style="padding:24px">All products are out of stock</div>' :
            available.map(p => `
              <div class="invoice-product-row" data-id="${p.id}">
                <div style="flex:1;min-width:0">
                  <div class="font-semibold">${escapeHtml(p.name)}</div>
                  <div class="text-sm text-secondary">${settings.currency} ${money(p.price)} · Stock: ${p.stock}</div>
                </div>
                <div class="qty-control">
                  <button type="button" class="qty-btn" data-qty="-1" data-id="${p.id}">−</button>
                  <span class="qty-value" id="qty-${p.id}">0</span>
                  <button type="button" class="qty-btn" data-qty="1" data-id="${p.id}">+</button>
                </div>
              </div>`).join('')}
        </div>
        <div class="invoice-summary" id="invoiceSummary" style="display:none">
          <div class="summary-row total"><span>Total</span><span id="invoiceTotal">${settings.currency} 0</span></div>
        </div>

        <div class="section-header mt-20"><h2 class="section-title">Payment</h2></div>
        <div class="form-group">
          <label class="form-label">Status</label>
          ${customSelect('paymentStatus', [
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'partial', label: 'Advance / Partial' },
            { value: 'paid', label: 'Fully Paid' }
          ], 'unpaid')}
        </div>
        <div class="form-group" id="paidAmountGroup" style="display:none">
          <label class="form-label">Amount Paid (${settings.currency})</label>
          <input type="number" class="form-input" name="paidAmount" id="paidAmountInput" min="0" step="0.01" placeholder="0" />
        </div>

        <button type="submit" class="btn btn-primary btn-block mt-20" id="createInvoiceBtn" disabled>Create Invoice</button>
      </form>
    </div>`;
  }

  function bindCreateInvoice() {
    const qtyMap = {};
    function update() {
      let total = 0, has = false;
      Object.entries(qtyMap).forEach(([id, qty]) => {
        if (qty > 0) {
          has = true;
          const p = products.find(x => x.id === id);
          if (p) total += p.price * qty;
        }
      });
      const sum = $('#invoiceSummary'), tot = $('#invoiceTotal'), btn = $('#createInvoiceBtn');
      if (sum) sum.style.display = has ? 'block' : 'none';
      if (tot) tot.textContent = `${settings.currency} ${money(total)}`;
      if (btn) btn.disabled = !has;
    }

    $$('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const delta = parseInt(btn.dataset.qty, 10);
        const p = products.find(x => x.id === id);
        if (!p) return;
        let q = (qtyMap[id] || 0) + delta;
        if (q < 0) q = 0;
        if (q > p.stock) { toast('Not enough stock'); return; }
        qtyMap[id] = q;
        const el = $(`#qty-${id}`);
        if (el) el.textContent = q;
        update();
      });
    });

    // Customer custom-select change is handled via global click delegation

    $('#invoiceForm').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const items = [];
      let total = 0;
      Object.entries(qtyMap).forEach(([id, qty]) => {
        if (qty > 0) {
          const p = products.find(x => x.id === id);
          if (p && p.stock >= qty) {
            items.push({ productId: p.id, name: p.name, price: p.price, cost: p.cost || 0, qty });
            total += p.price * qty;
            p.stock -= qty;
          }
        }
      });
      if (!items.length) { toast('Select at least one product'); return; }

      const paymentStatus = fd.get('paymentStatus') || 'unpaid';
      let paidAmount = parseFloat(fd.get('paidAmount')) || 0;
      if (paymentStatus === 'paid') paidAmount = total;
      if (paymentStatus === 'unpaid') paidAmount = 0;
      if (paidAmount > total) paidAmount = total;

      // Log stock out movements
      items.forEach(it => {
        stockMovements.unshift({
          id: uid(),
          productId: it.productId,
          productName: it.name,
          type: 'out',
          qty: it.qty,
          date: new Date().toISOString(),
          note: `Invoice ${settings.invoicePrefix || 'INV'}-${invoiceCounter}`
        });
      });

      const inv = {
        id: uid(),
        number: `${settings.invoicePrefix || 'INV'}-${invoiceCounter++}`,
        customerId: fd.get('customerId') || null,
        customerName: (fd.get('customerName') || '').trim() || 'Walk-in Customer',
        customerPhone: (fd.get('customerPhone') || '').trim(),
        items, total,
        paymentStatus,
        paidAmount,
        date: new Date().toISOString()
      };
      invoices.unshift(inv);
      persist();
      toast('Invoice created');
      openInvoiceDetail(inv);
    });
  }

  // ---------- Customers ----------
  function viewCustomers() {
    if (customers.length === 0) {
      return emptyState('user', 'No customers yet', 'Save customer details for faster invoicing.', 'Add Customer', null, 'add-customer');
    }
    const sorted = [...customers].sort((a,b) => a.name.localeCompare(b.name));
    return `<div class="fade-in">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" class="search-input" id="customerSearch" placeholder="Search customers..." />
      </div>
      <div class="list" id="customerList">${sorted.map(c => `
        <div class="list-item" data-action="edit-customer" data-id="${c.id}">
          <div class="list-item-icon">${initials(c.name)}</div>
          <div class="list-item-body">
            <div class="list-item-title">${escapeHtml(c.name)}</div>
            <div class="list-item-sub">${escapeHtml(c.phone || 'No phone')}${c.address ? ' · ' + escapeHtml(c.address) : ''}</div>
          </div>
        </div>`).join('')}</div>
    </div>`;
  }

  // ---------- Suppliers ----------
  function viewSuppliers() {
    if (suppliers.length === 0) {
      return emptyState('truck', 'No suppliers yet', 'Track who you buy stock from.', 'Add Supplier', null, 'add-supplier');
    }
    const sorted = [...suppliers].sort((a,b) => a.name.localeCompare(b.name));
    return `<div class="fade-in"><div class="list">${sorted.map(s => `
      <div class="list-item" data-action="edit-supplier" data-id="${s.id}">
        <div class="list-item-icon">${initials(s.name)}</div>
        <div class="list-item-body">
          <div class="list-item-title">${escapeHtml(s.name)}</div>
          <div class="list-item-sub">${escapeHtml(s.phone || 'No phone')}</div>
        </div>
      </div>`).join('')}</div></div>`;
  }

  // ---------- Reports ----------
  function viewReports() {
    const revenue = invoices.reduce((s, i) => s + (i.total || 0), 0);
    const cogs = invoices.reduce((s, inv) => s + inv.items.reduce((a, it) => a + ((it.cost || 0) * it.qty), 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const profit = revenue - cogs - totalExpenses;
    const totalInvoices = invoices.length;
    const avgTicket = totalInvoices ? revenue / totalInvoices : 0;

    const sold = {};
    invoices.forEach(inv => inv.items.forEach(it => {
      sold[it.name] = (sold[it.name] || 0) + it.qty;
    }));
    const top = Object.entries(sold).sort((a,b) => b[1] - a[1]).slice(0, 5);

    // Expense by category
    const byCat = {};
    expenses.forEach(e => {
      const cat = e.category || 'Other';
      byCat[cat] = (byCat[cat] || 0) + (e.amount || 0);
    });
    const topExp = Object.entries(byCat).sort((a,b) => b[1] - a[1]).slice(0, 5);

    return `<div class="fade-in">
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Total Sales</div><div class="stat-value success">${settings.currency} ${money(revenue)}</div></div>
        <div class="stat-card"><div class="stat-label">Cost of Goods</div><div class="stat-value">${settings.currency} ${money(cogs)}</div></div>
        <div class="stat-card"><div class="stat-label">Expenses</div><div class="stat-value danger">${settings.currency} ${money(totalExpenses)}</div></div>
        <div class="stat-card"><div class="stat-label">Net Profit</div><div class="stat-value ${profit >= 0 ? 'success' : 'danger'}">${settings.currency} ${money(profit)}</div></div>
      </div>
      <div class="section-header"><h2 class="section-title">Top Selling Products</h2></div>
      ${top.length === 0 ? '<div class="card text-center text-secondary" style="padding:24px">No sales data yet</div>' :
        `<div class="list mb-16">${top.map(([name, qty], i) => `
          <div class="list-item" style="cursor:default">
            <div class="list-item-icon">${i + 1}</div>
            <div class="list-item-body"><div class="list-item-title">${escapeHtml(name)}</div></div>
            <div class="list-item-right"><div class="list-item-price">${qty} sold</div></div>
          </div>`).join('')}</div>`}
      <div class="section-header"><h2 class="section-title">Expenses by Category</h2></div>
      ${topExp.length === 0 ? '<div class="card text-center text-secondary" style="padding:24px">No expenses yet</div>' :
        `<div class="list">${topExp.map(([cat, amt]) => `
          <div class="list-item" style="cursor:default">
            <div class="list-item-icon">${escapeHtml(cat[0] || '?')}</div>
            <div class="list-item-body"><div class="list-item-title">${escapeHtml(cat)}</div></div>
            <div class="list-item-right"><div class="list-item-price">${settings.currency} ${money(amt)}</div></div>
          </div>`).join('')}</div>`}
      <p class="text-sm text-secondary text-center mt-20">Net Profit = Sales − Cost of Goods − Expenses. Set product cost prices for accurate COGS.</p>
    </div>`;
  }

  function viewExpenses() {
    if (expenses.length === 0) {
      return emptyState('invoice', 'No expenses yet', 'Track rent, fuel, packaging, salaries and other costs.', 'Add Expense', null, 'add-expense');
    }
    const sorted = [...expenses].sort((a,b) => new Date(b.date) - new Date(a.date));
    return `<div class="fade-in">
      <div class="list">${sorted.map(e => `
        <div class="list-item" data-action="edit-expense" data-id="${e.id}">
          <div class="list-item-icon">${escapeHtml((e.category || 'E')[0])}</div>
          <div class="list-item-body">
            <div class="list-item-title">${escapeHtml(e.title || e.category || 'Expense')}</div>
            <div class="list-item-sub">${escapeHtml(e.category || 'Other')} · ${formatDate(e.date)}</div>
          </div>
          <div class="list-item-right">
            <div class="list-item-price" style="color:var(--danger)">${settings.currency} ${money(e.amount)}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  }

  // ---------- More ----------
  function viewStockHistory() {
    if (stockMovements.length === 0) {
      return emptyState('box', 'No stock movements yet', 'Stock in and sales will appear here.', 'Go to Products', 'products');
    }
    const sorted = [...stockMovements].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 100);
    return `<div class="fade-in">
      <div class="list">${sorted.map(m => `
        <div class="list-item" style="cursor:default">
          <div class="list-item-icon" style="background:${m.type === 'in' ? '#D1FAE5' : '#FEE2E2'};color:${m.type === 'in' ? '#065F46' : '#991B1B'}">${m.type === 'in' ? '+' : '−'}</div>
          <div class="list-item-body">
            <div class="list-item-title">${escapeHtml(m.productName)}</div>
            <div class="list-item-sub">${formatDate(m.date)}${m.note ? ' · ' + escapeHtml(m.note) : ''}</div>
          </div>
          <div class="list-item-right">
            <div class="list-item-price" style="color:${m.type === 'in' ? 'var(--success)' : 'var(--danger)'}">${m.type === 'in' ? '+' : '−'}${m.qty}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  }

  function viewMore() {
    return `<div class="fade-in">
      <div class="card mb-16">
        <div class="text-sm text-secondary">Business</div>
        <div class="font-semibold" style="font-size:1.0625rem">${escapeHtml(settings.businessName)}</div>
        ${settings.phone ? `<div class="text-sm text-secondary mt-8">${escapeHtml(settings.phone)}</div>` : ''}
      </div>
      <div class="menu-list mb-16">
        <button class="menu-item" data-view="customers">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Customers
          <svg class="menu-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button class="menu-item" data-view="suppliers">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          Suppliers
          <svg class="menu-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button class="menu-item" data-view="expenses">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          Expenses
          <svg class="menu-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button class="menu-item" data-view="stock-history">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Stock History
          <svg class="menu-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button class="menu-item" data-view="reports">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Profit & Reports
          <svg class="menu-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button class="menu-item" data-action="open-settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Business Settings
          <svg class="menu-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button class="menu-item" data-action="export-data">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export / Backup
          <svg class="menu-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button class="menu-item" data-action="clear-data">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Clear All Data
          <svg class="menu-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="text-center text-secondary text-sm mt-20">StockBill · Data stays on this device</div>
    </div>`;
  }

  // ---------- Empty state helper ----------
  function emptyState(icon, title, text, btnText, view, action) {
    const icons = {
      box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
      invoice: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
      user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'
    };
    const attr = view ? `data-view="${view}"` : `data-action="${action}"`;
    return `<div class="empty-state fade-in">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${icons[icon] || icons.box}</svg></div>
      <div class="empty-title">${title}</div>
      <div class="empty-text">${text}</div>
      <button class="btn btn-primary" ${attr}>${btnText}</button>
    </div>`;
  }

  // ---------- Modals ----------
  function closeModal() { $('#modalRoot').innerHTML = ''; }

  function openProductModal(product = null) {
    editingId = product ? product.id : null;
    const isEdit = !!product;
    $('#modalRoot').innerHTML = `
      <div class="modal-overlay" id="productModal">
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <h3 class="modal-title">${isEdit ? 'Edit Product' : 'Add Product'}</h3>
            <button class="modal-close" data-action="close-modal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <form id="productForm">
            <div class="form-group">
              <label class="form-label">Product Name *</label>
              <input type="text" class="form-input" name="name" required value="${product ? escapeHtml(product.name) : ''}" placeholder="e.g. Chocolate Cake" />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Selling Price (${settings.currency}) *</label>
                <input type="number" class="form-input" name="price" required min="0" step="0.01" value="${product ? product.price : ''}" placeholder="0" />
              </div>
              <div class="form-group">
                <label class="form-label">Cost Price (${settings.currency})</label>
                <input type="number" class="form-input" name="cost" min="0" step="0.01" value="${product ? (product.cost || '') : ''}" placeholder="0" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Stock Qty *</label>
                <input type="number" class="form-input" name="stock" required min="0" step="1" value="${product ? product.stock : ''}" placeholder="0" />
              </div>
              <div class="form-group">
                <label class="form-label">Unit</label>
                <input type="text" class="form-input" name="unit" value="${product ? escapeHtml(product.unit || 'pcs') : 'pcs'}" placeholder="pcs, kg..." />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Low Stock Alert</label>
                <input type="number" class="form-input" name="lowStock" min="0" value="${product ? (product.lowStock || settings.lowStockDefault) : settings.lowStockDefault}" />
              </div>
              <div class="form-group">
                <label class="form-label">Barcode / QR</label>
                <div class="input-with-btn">
                  <input type="text" class="form-input" name="barcode" id="barcodeInput" value="${product ? escapeHtml(product.barcode || '') : ''}" placeholder="Scan or type" />
                  <button type="button" class="btn btn-secondary btn-sm" data-action="scan-barcode" style="height:48px;padding:0 12px">Scan</button>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Notes</label>
              <textarea class="form-textarea" name="notes" placeholder="Optional notes...">${product ? escapeHtml(product.notes || '') : ''}</textarea>
            </div>
            ${isEdit ? `
            <div class="form-group mt-8">
              <label class="form-label">Stock In (add quantity)</label>
              <div class="input-with-btn">
                <input type="number" class="form-input" id="stockInQty" min="1" step="1" placeholder="Qty to add" />
                <button type="button" class="btn btn-secondary btn-sm" style="height:48px" data-action="stock-in" data-id="${product.id}">Add</button>
              </div>
            </div>` : ''}
            <div class="flex gap-12 mt-20">
              ${isEdit ? `<button type="button" class="btn btn-danger" data-action="delete-product" style="flex:0 0 auto">Delete</button>` : ''}
              <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Save Changes' : 'Add Product'}</button>
            </div>
          </form>
        </div>
      </div>`;

    $('#productForm').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        name: fd.get('name').trim(),
        price: parseFloat(fd.get('price')) || 0,
        cost: parseFloat(fd.get('cost')) || 0,
        stock: parseInt(fd.get('stock'), 10) || 0,
        unit: (fd.get('unit') || 'pcs').trim(),
        lowStock: parseInt(fd.get('lowStock'), 10) || settings.lowStockDefault,
        barcode: (fd.get('barcode') || '').trim(),
        notes: (fd.get('notes') || '').trim()
      };
      if (!data.name) { toast('Name required'); return; }
      if (isEdit) {
        const idx = products.findIndex(p => p.id === editingId);
        if (idx > -1) products[idx] = { ...products[idx], ...data };
        toast('Product updated');
      } else {
        products.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
        toast('Product added');
      }
      persist();
      closeModal();
      if (currentView === 'products') render();
      else setView('products');
    });
  }

  function openCustomerModal(cust = null) {
    editingId = cust ? cust.id : null;
    const isEdit = !!cust;
    $('#modalRoot').innerHTML = `
      <div class="modal-overlay">
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <h3 class="modal-title">${isEdit ? 'Edit Customer' : 'Add Customer'}</h3>
            <button class="modal-close" data-action="close-modal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <form id="customerForm">
            <div class="form-group"><label class="form-label">Name *</label><input class="form-input" name="name" required value="${cust ? escapeHtml(cust.name) : ''}" /></div>
            <div class="form-group"><label class="form-label">Phone</label><input class="form-input" name="phone" type="tel" value="${cust ? escapeHtml(cust.phone || '') : ''}" /></div>
            <div class="form-group"><label class="form-label">Address</label><input class="form-input" name="address" value="${cust ? escapeHtml(cust.address || '') : ''}" /></div>
            <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" name="notes">${cust ? escapeHtml(cust.notes || '') : ''}</textarea></div>
            <div class="flex gap-12 mt-20">
              ${isEdit ? `<button type="button" class="btn btn-danger" data-action="delete-customer" style="flex:0 0 auto">Delete</button>` : ''}
              <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Save' : 'Add Customer'}</button>
            </div>
          </form>
        </div>
      </div>`;
    $('#customerForm').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = { name: fd.get('name').trim(), phone: fd.get('phone').trim(), address: fd.get('address').trim(), notes: fd.get('notes').trim() };
      if (!data.name) return;
      if (isEdit) {
        const i = customers.findIndex(c => c.id === editingId);
        if (i > -1) customers[i] = { ...customers[i], ...data };
        toast('Customer updated');
      } else {
        customers.push({ id: uid(), ...data });
        toast('Customer added');
      }
      persist();
      closeModal();
      setView('customers');
    });
  }

  function openSupplierModal(sup = null) {
    editingId = sup ? sup.id : null;
    const isEdit = !!sup;
    $('#modalRoot').innerHTML = `
      <div class="modal-overlay">
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <h3 class="modal-title">${isEdit ? 'Edit Supplier' : 'Add Supplier'}</h3>
            <button class="modal-close" data-action="close-modal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <form id="supplierForm">
            <div class="form-group"><label class="form-label">Name *</label><input class="form-input" name="name" required value="${sup ? escapeHtml(sup.name) : ''}" /></div>
            <div class="form-group"><label class="form-label">Phone</label><input class="form-input" name="phone" type="tel" value="${sup ? escapeHtml(sup.phone || '') : ''}" /></div>
            <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" name="notes">${sup ? escapeHtml(sup.notes || '') : ''}</textarea></div>
            <div class="flex gap-12 mt-20">
              ${isEdit ? `<button type="button" class="btn btn-danger" data-action="delete-supplier" style="flex:0 0 auto">Delete</button>` : ''}
              <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Save' : 'Add Supplier'}</button>
            </div>
          </form>
        </div>
      </div>`;
    $('#supplierForm').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = { name: fd.get('name').trim(), phone: fd.get('phone').trim(), notes: fd.get('notes').trim() };
      if (!data.name) return;
      if (isEdit) {
        const i = suppliers.findIndex(s => s.id === editingId);
        if (i > -1) suppliers[i] = { ...suppliers[i], ...data };
        toast('Supplier updated');
      } else {
        suppliers.push({ id: uid(), ...data });
        toast('Supplier added');
      }
      persist();
      closeModal();
      setView('suppliers');
    });
  }

  function openExpenseModal(exp = null) {
    editingId = exp ? exp.id : null;
    const isEdit = !!exp;
    const cats = ['Rent', 'Fuel', 'Packaging', 'Salaries', 'Utilities', 'Marketing', 'Transport', 'Supplies', 'Other'];
    $('#modalRoot').innerHTML = `
      <div class="modal-overlay">
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <h3 class="modal-title">${isEdit ? 'Edit Expense' : 'Add Expense'}</h3>
            <button class="modal-close" data-action="close-modal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <form id="expenseForm">
            <div class="form-group"><label class="form-label">Title *</label><input class="form-input" name="title" required value="${exp ? escapeHtml(exp.title || '') : ''}" placeholder="e.g. Shop rent" /></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Amount (${settings.currency}) *</label><input class="form-input" name="amount" type="number" required min="0" step="0.01" value="${exp ? exp.amount : ''}" /></div>
              <div class="form-group"><label class="form-label">Date</label><input class="form-input" name="date" type="date" value="${exp ? (exp.date || '').slice(0,10) : new Date().toISOString().slice(0,10)}" /></div>
            </div>
            <div class="form-group">
              <label class="form-label">Category</label>
              ${customSelect('category', cats.map(c => ({value: c, label: c})), exp ? (exp.category || 'Other') : 'Other')}
            </div>
            <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" name="notes">${exp ? escapeHtml(exp.notes || '') : ''}</textarea></div>
            <div class="flex gap-12 mt-20">
              ${isEdit ? `<button type="button" class="btn btn-danger" data-action="delete-expense" style="flex:0 0 auto">Delete</button>` : ''}
              <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Save' : 'Add Expense'}</button>
            </div>
          </form>
        </div>
      </div>`;
    $('#expenseForm').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        title: fd.get('title').trim(),
        amount: parseFloat(fd.get('amount')) || 0,
        date: fd.get('date') || new Date().toISOString().slice(0,10),
        category: fd.get('category') || 'Other',
        notes: (fd.get('notes') || '').trim()
      };
      if (!data.title) return;
      if (isEdit) {
        const i = expenses.findIndex(x => x.id === editingId);
        if (i > -1) expenses[i] = { ...expenses[i], ...data };
        toast('Expense updated');
      } else {
        expenses.push({ id: uid(), ...data });
        toast('Expense added');
      }
      persist();
      closeModal();
      setView('expenses');
    });
  }

  function openSettingsModal() {
    $('#modalRoot').innerHTML = `
      <div class="modal-overlay">
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <h3 class="modal-title">Business Settings</h3>
            <button class="modal-close" data-action="close-modal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <form id="settingsForm">
            <div class="form-group"><label class="form-label">Business Name *</label><input class="form-input" name="businessName" required value="${escapeHtml(settings.businessName)}" /></div>
            <div class="form-group">
              <label class="form-label">Logo</label>
              <div class="logo-upload-row">
                <div class="logo-preview" id="logoPreview">${settings.logo ? `<img src="${settings.logo}" alt="Logo" />` : '<span>No logo</span>'}</div>
                <div style="flex:1">
                  <input type="file" id="logoFile" accept="image/*" style="display:none" />
                  <button type="button" class="btn btn-secondary btn-sm" data-action="pick-logo">Upload Logo</button>
                  ${settings.logo ? `<button type="button" class="btn btn-ghost btn-sm" data-action="remove-logo" style="margin-left:8px">Remove</button>` : ''}
                </div>
              </div>
              <input type="hidden" name="logo" id="logoValue" value="" />
            </div>
            <div class="form-group"><label class="form-label">Owner Name</label><input class="form-input" name="ownerName" value="${escapeHtml(settings.ownerName || '')}" /></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Phone</label><input class="form-input" name="phone" type="tel" value="${escapeHtml(settings.phone || '')}" /></div>
              <div class="form-group"><label class="form-label">Email</label><input class="form-input" name="email" type="email" value="${escapeHtml(settings.email || '')}" /></div>
            </div>
            <div class="form-group"><label class="form-label">Address</label><input class="form-input" name="address" value="${escapeHtml(settings.address || '')}" /></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">City</label><input class="form-input" name="city" value="${escapeHtml(settings.city || '')}" /></div>
              <div class="form-group"><label class="form-label">Tax / NTN / GST</label><input class="form-input" name="taxId" value="${escapeHtml(settings.taxId || '')}" /></div>
            </div>
            <div class="form-group">
              <label class="form-label">Currency</label>
              ${customSelect('currency', [
                { value: 'PKR', label: 'PKR – Pakistani Rupee' },
                { value: 'INR', label: 'INR – Indian Rupee' },
                { value: 'BDT', label: 'BDT – Bangladeshi Taka' },
                { value: 'USD', label: 'USD – US Dollar' },
                { value: 'EUR', label: 'EUR – Euro' }
              ], settings.currency || 'PKR')}
            </div>
            <div class="form-group">
              <label class="form-label">Invoice Prefix</label>
              <input class="form-input" name="invoicePrefix" value="${escapeHtml(settings.invoicePrefix || 'INV')}" />
            </div>
            <button type="submit" class="btn btn-primary btn-block mt-16">Save Settings</button>
          </form>
        </div>
      </div>`;
    $('#settingsForm').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      settings.businessName = fd.get('businessName').trim() || 'My Business';
      settings.ownerName = fd.get('ownerName').trim();
      settings.phone = fd.get('phone').trim();
      settings.email = fd.get('email').trim();
      settings.address = fd.get('address').trim();
      settings.city = fd.get('city').trim();
      settings.taxId = fd.get('taxId').trim();
      settings.currency = fd.get('currency');
      settings.invoicePrefix = fd.get('invoicePrefix').trim() || 'INV';
      // logo is updated live via pick/remove actions
      persist();
      toast('Settings saved');
      closeModal();
      render();
    });
  }

  // ---------- Invoice Detail + PDF + Image Share + Print ----------
  function openInvoiceDetail(inv) {
    const itemsHtml = inv.items.map(it => `
      <div class="summary-row"><span>${escapeHtml(it.name)} × ${it.qty}</span><span>${settings.currency} ${money(it.price * it.qty)}</span></div>`).join('');
    const paid = inv.paidAmount || 0;
    const due = Math.max(0, (inv.total || 0) - paid);
    let statusLabel = 'Unpaid';
    if (paid >= inv.total) statusLabel = 'Fully Paid';
    else if (paid > 0) statusLabel = 'Partial / Advance';

    $('#modalRoot').innerHTML = `
      <div class="modal-overlay" id="invDetail">
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <h3 class="modal-title">Invoice ${inv.number}</h3>
            <button class="modal-close" data-action="close-modal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div class="mb-16">
            <div class="text-sm text-secondary">Customer</div>
            <div class="font-semibold">${escapeHtml(inv.customerName || 'Walk-in')}</div>
            ${inv.customerPhone ? `<div class="text-sm text-secondary mt-8">${escapeHtml(inv.customerPhone)}</div>` : ''}
            <div class="text-sm text-secondary mt-8">${formatDate(inv.date)}</div>
          </div>
          <div class="invoice-summary">${itemsHtml}
            <div class="summary-row total"><span>Total</span><span>${settings.currency} ${money(inv.total)}</span></div>
            <div class="summary-row"><span>Paid</span><span style="color:var(--success)">${settings.currency} ${money(paid)}</span></div>
            <div class="summary-row"><span>Due</span><span style="color:${due > 0 ? 'var(--danger)' : 'var(--success)'}">${settings.currency} ${money(due)}</span></div>
            <div class="summary-row"><span>Status</span><span class="font-semibold">${statusLabel}</span></div>
          </div>
          ${due > 0 ? `
          <div class="form-group mt-16">
            <label class="form-label">Record payment</label>
            <div class="input-with-btn">
              <input type="number" class="form-input" id="recordPayInput" min="0" step="0.01" placeholder="Amount" />
              <button type="button" class="btn btn-primary btn-sm" style="height:48px" data-action="record-payment" data-id="${inv.id}">Add</button>
            </div>
          </div>
          <button class="btn btn-secondary btn-block mt-8" data-action="mark-paid" data-id="${inv.id}">Mark as Fully Paid</button>
          ` : ''}
          <div class="flex gap-8 mt-20" style="flex-wrap:wrap">
            <button class="btn btn-secondary" style="flex:1" data-action="share-image" data-id="${inv.id}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Image
            </button>
            <button class="btn btn-secondary" style="flex:1" data-action="pdf-invoice" data-id="${inv.id}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              PDF
            </button>
            <button class="btn btn-primary" style="flex:1" data-action="print-invoice" data-id="${inv.id}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print
            </button>
          </div>
          <button class="btn btn-ghost btn-block mt-12" data-action="share-whatsapp-text" data-id="${inv.id}">Share as WhatsApp text</button>
        </div>
      </div>`;
  }

  function generatePDF(inv) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const m = 16;
    let y = 18;

    // Header bar
    doc.setFillColor(13, 148, 136);
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255, 255, 255);
    let textX = m;
    if (settings.logo) {
      try {
        doc.addImage(settings.logo, 'PNG', m, 6, 18, 18);
        textX = m + 22;
      } catch (e) {}
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(settings.businessName || 'Invoice', textX, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    let headerRight = [];
    if (settings.phone) headerRight.push(settings.phone);
    if (settings.email) headerRight.push(settings.email);
    doc.text(headerRight.join('  |  '), 210 - m, 14, { align: 'right' });
    y = 40;

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`Invoice ${inv.number}`, m, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Date: ${formatDate(inv.date)}`, m, y);
    y += 8;

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To', m, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(inv.customerName || 'Walk-in Customer', m, y);
    y += 5;
    if (inv.customerPhone) { doc.text(inv.customerPhone, m, y); y += 5; }
    if (settings.address) {
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(settings.address + (settings.city ? ', ' + settings.city : ''), m, y);
      y += 5;
    }
    y += 6;

    // Table header
    doc.setFillColor(241, 245, 249);
    doc.rect(m, y - 4, 178, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('Item', m + 2, y);
    doc.text('Qty', m + 100, y);
    doc.text('Price', m + 125, y);
    doc.text('Amount', m + 155, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    inv.items.forEach(it => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(String(it.name).substring(0, 42), m + 2, y);
      doc.text(String(it.qty), m + 100, y);
      doc.text(money(it.price), m + 125, y);
      doc.text(money(it.price * it.qty), m + 155, y);
      y += 6;
    });

    y += 4;
    doc.setDrawColor(200);
    doc.line(m, y, m + 178, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Total: ${settings.currency} ${money(inv.total)}`, m + 110, y);

    if (settings.taxId) {
      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Tax / NTN: ${settings.taxId}`, m, y);
    }

    y += 12;
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Thank you for your business!', m, y);

    doc.save(`Invoice-${inv.number}.pdf`);
    toast('PDF downloaded');
  }

  async function shareInvoiceImage(inv) {
    // Build a clean invoice card in a hidden div, capture with html2canvas
    const card = document.createElement('div');
    card.className = 'invoice-card-preview';
    card.style.cssText = 'position:fixed;left:-9999px;top:0;width:360px;background:#fff;padding:24px;font-family:Inter,system-ui,sans-serif;color:#0F172A;';
    card.innerHTML = `
      <div style="background:#0D9488;color:#fff;padding:16px 20px;margin:-24px -24px 20px;border-radius:0;display:flex;align-items:center;gap:12px;">
        ${settings.logo ? `<img src="${settings.logo}" style="width:40px;height:40px;border-radius:8px;object-fit:contain;background:#fff;" />` : ''}
        <div>
          <div style="font-size:18px;font-weight:700;">${escapeHtml(settings.businessName)}</div>
          <div style="font-size:12px;opacity:0.9;margin-top:4px;">${escapeHtml([settings.phone, settings.city].filter(Boolean).join(' · '))}</div>
        </div>
      </div>
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;">Invoice ${escapeHtml(inv.number)}</div>
      <div style="font-size:12px;color:#64748B;margin-bottom:16px;">${formatDate(inv.date)}</div>
      <div style="font-size:13px;margin-bottom:4px;"><strong>Bill To:</strong> ${escapeHtml(inv.customerName || 'Walk-in')}</div>
      ${inv.customerPhone ? `<div style="font-size:12px;color:#64748B;margin-bottom:16px;">${escapeHtml(inv.customerPhone)}</div>` : '<div style="margin-bottom:16px;"></div>'}
      <div style="border-top:1px solid #E2E8F0;padding-top:12px;">
        ${inv.items.map(it => `
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px;">
            <span>${escapeHtml(it.name)} × ${it.qty}</span>
            <span style="font-weight:600;">${settings.currency} ${money(it.price * it.qty)}</span>
          </div>`).join('')}
      </div>
      <div style="border-top:2px solid #0D9488;margin-top:12px;padding-top:12px;display:flex;justify-content:space-between;font-size:16px;font-weight:700;">
        <span>Total</span><span>${settings.currency} ${money(inv.total)}</span>
      </div>
      ${settings.taxId ? `<div style="font-size:11px;color:#94A3B8;margin-top:16px;">Tax/NTN: ${escapeHtml(settings.taxId)}</div>` : ''}
      <div style="font-size:11px;color:#94A3B8;margin-top:8px;text-align:center;">Thank you!</div>
    `;
    document.body.appendChild(card);

    try {
      const canvas = await html2canvas(card, { scale: 2, backgroundColor: '#ffffff', logging: false });
      document.body.removeChild(card);
      canvas.toBlob(async (blob) => {
        if (!blob) { toast('Could not create image'); return; }
        const file = new File([blob], `Invoice-${inv.number}.png`, { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `Invoice ${inv.number}`,
              text: `Invoice from ${settings.businessName}`
            });
            toast('Shared');
            return;
          } catch (err) {
            if (err.name === 'AbortError') return;
          }
        }
        // Fallback: download image
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Invoice-${inv.number}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast('Image saved – share it on WhatsApp');
      }, 'image/png');
    } catch (err) {
      document.body.removeChild(card);
      console.error(err);
      toast('Image generation failed');
    }
  }

  function shareWhatsAppText(inv) {
    let text = `*${settings.businessName}*\nInvoice ${inv.number}\nDate: ${formatDate(inv.date)}\nCustomer: ${inv.customerName || 'Walk-in'}\n\n`;
    inv.items.forEach(it => {
      text += `• ${it.name} × ${it.qty} = ${settings.currency} ${money(it.price * it.qty)}\n`;
    });
    text += `\n*Total: ${settings.currency} ${money(inv.total)}*`;
    if (settings.phone) text += `\n\nContact: ${settings.phone}`;
    const phone = (inv.customerPhone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  }

  function printInvoice(inv) {
    const w = window.open('', '_blank', 'width=400,height=600');
    w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${inv.number}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:16px;max-width:320px;margin:0 auto;color:#111;font-size:13px;}
        .head{text-align:center;border-bottom:2px solid #0D9488;padding-bottom:10px;margin-bottom:12px;}
        .head h1{font-size:16px;margin:0 0 4px;}
        .meta{margin-bottom:12px;font-size:12px;color:#444;}
        table{width:100%;border-collapse:collapse;margin:10px 0;}
        th,td{text-align:left;padding:4px 0;border-bottom:1px solid #eee;}
        th{font-size:11px;color:#666;}
        .total{font-weight:700;font-size:15px;margin-top:10px;text-align:right;}
        .foot{text-align:center;margin-top:20px;font-size:11px;color:#888;}
        @media print{body{padding:0;}}
      </style></head><body>
      <div class="head"><h1>${escapeHtml(settings.businessName)}</h1>
        <div>${escapeHtml([settings.phone, settings.address, settings.city].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="meta">
        <div><strong>Invoice:</strong> ${escapeHtml(inv.number)}</div>
        <div><strong>Date:</strong> ${formatDate(inv.date)}</div>
        <div><strong>Customer:</strong> ${escapeHtml(inv.customerName || 'Walk-in')}</div>
        ${inv.customerPhone ? `<div>${escapeHtml(inv.customerPhone)}</div>` : ''}
      </div>
      <table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
      <tbody>${inv.items.map(it => `<tr><td>${escapeHtml(it.name)}</td><td>${it.qty}</td><td>${settings.currency} ${money(it.price*it.qty)}</td></tr>`).join('')}</tbody></table>
      <div class="total">Total: ${settings.currency} ${money(inv.total)}</div>
      ${settings.taxId ? `<div class="foot">Tax/NTN: ${escapeHtml(settings.taxId)}</div>` : ''}
      <div class="foot">Thank you for your business!</div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    w.document.close();
  }

  // ---------- Barcode Scanner ----------
  function startScanner(onResult) {
    const root = $('#scannerRoot');
    root.innerHTML = `
      <div class="scanner-header">
        <span style="font-weight:600">Scan Barcode / QR</span>
        <button class="scanner-close" data-action="stop-scanner">✕</button>
      </div>
      <div id="qr-reader" style="width:100%;height:100%;"></div>`;
    root.classList.add('active');

    scanner = new Html5Qrcode('qr-reader');
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decoded) => {
        stopScanner();
        onResult(decoded);
      },
      () => {}
    ).catch(err => {
      toast('Camera not available or permission denied');
      stopScanner();
    });
  }

  function stopScanner() {
    if (scanner) {
      scanner.stop().catch(() => {});
      scanner = null;
    }
    const root = $('#scannerRoot');
    root.classList.remove('active');
    root.innerHTML = '';
  }

  // ---------- Global Event Delegation ----------
  document.addEventListener('click', e => {
    // Close open custom dropdowns when clicking outside
    if (!e.target.closest('.custom-select')) {
      $$('.custom-select.open').forEach(el => el.classList.remove('open'));
    }

    const t = e.target.closest('[data-action], [data-view], .nav-item, .list-item, .modal-overlay');
    if (!t) return;

    // Close modal on overlay click
    if (t.classList.contains('modal-overlay') && t.id !== 'qr-reader') {
      if (e.target === t) closeModal();
      return;
    }

    const action = t.dataset.action;
    const view = t.dataset.view || (t.classList.contains('nav-item') ? t.dataset.view : null);
    const id = t.dataset.id;

    if (view) {
      setView(view);
      return;
    }

    switch (action) {
      case 'add-product': openProductModal(); break;
      case 'edit-product': {
        const p = products.find(x => x.id === id);
        if (p) openProductModal(p);
        break;
      }
      case 'delete-product':
        if (confirm('Delete this product?')) {
          products = products.filter(p => p.id !== editingId);
          persist();
          toast('Deleted');
          closeModal();
          render();
        }
        break;
      case 'add-customer': openCustomerModal(); break;
      case 'edit-customer': {
        const c = customers.find(x => x.id === id);
        if (c) openCustomerModal(c);
        break;
      }
      case 'delete-customer':
        if (confirm('Delete this customer?')) {
          customers = customers.filter(c => c.id !== editingId);
          persist();
          toast('Deleted');
          closeModal();
          setView('customers');
        }
        break;
      case 'add-supplier': openSupplierModal(); break;
      case 'edit-supplier': {
        const s = suppliers.find(x => x.id === id);
        if (s) openSupplierModal(s);
        break;
      }
      case 'delete-supplier':
        if (confirm('Delete this supplier?')) {
          suppliers = suppliers.filter(s => s.id !== editingId);
          persist();
          toast('Deleted');
          closeModal();
          setView('suppliers');
        }
        break;
      case 'view-invoice': {
        const inv = invoices.find(x => x.id === id);
        if (inv) openInvoiceDetail(inv);
        break;
      }
      case 'pdf-invoice': {
        const inv = invoices.find(x => x.id === id);
        if (inv) generatePDF(inv);
        break;
      }
      case 'share-image': {
        const inv = invoices.find(x => x.id === id);
        if (inv) shareInvoiceImage(inv);
        break;
      }
      case 'share-whatsapp-text': {
        const inv = invoices.find(x => x.id === id);
        if (inv) shareWhatsAppText(inv);
        break;
      }
      case 'print-invoice': {
        const inv = invoices.find(x => x.id === id);
        if (inv) printInvoice(inv);
        break;
      }
      case 'open-settings': openSettingsModal(); break;
      case 'close-modal': closeModal(); break;
      case 'toggle-select': {
        const wrap = t.closest('.custom-select');
        if (!wrap) break;
        $$('.custom-select.open').forEach(el => {
          if (el !== wrap) el.classList.remove('open');
        });
        wrap.classList.toggle('open');
        if (wrap.classList.contains('open') && wrap.classList.contains('searchable')) {
          const searchInput = wrap.querySelector('.custom-select-search-input');
          if (searchInput) {
            searchInput.value = '';
            wrap.querySelectorAll('.custom-select-option').forEach(o => o.style.display = '');
            setTimeout(() => searchInput.focus(), 50);
          }
        }
        break;
      }
      case 'select-option': {
        const wrap = t.closest('.custom-select');
        if (!wrap) break;
        const value = t.dataset.value || '';
        const label = t.dataset.label || '';
        const hidden = wrap.querySelector('input[type="hidden"]');
        const trigger = wrap.querySelector('.custom-select-trigger');
        if (hidden) hidden.value = value;
        if (trigger) trigger.textContent = label;
        wrap.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
        t.classList.add('selected');
        wrap.classList.remove('open');

        // Auto-fill customer name/phone when selecting a customer
        if (wrap.dataset.name === 'customerId' && value) {
          const c = customers.find(x => x.id === value);
          if (c) {
            const nameInput = $('#customerNameInput');
            const phoneInput = $('#customerPhoneInput');
            if (nameInput) nameInput.value = c.name;
            if (phoneInput) phoneInput.value = c.phone || '';
          }
        }
        // Show amount paid field for partial payments
        if (wrap.dataset.name === 'paymentStatus') {
          const grp = $('#paidAmountGroup');
          if (grp) grp.style.display = value === 'partial' ? 'block' : 'none';
        }
        break;
      }
      case 'record-payment': {
        const inv = invoices.find(x => x.id === id);
        if (!inv) break;
        const input = $('#recordPayInput');
        const amt = parseFloat(input && input.value) || 0;
        if (amt <= 0) { toast('Enter a valid amount'); break; }
        inv.paidAmount = (inv.paidAmount || 0) + amt;
        if (inv.paidAmount >= inv.total) {
          inv.paidAmount = inv.total;
          inv.paymentStatus = 'paid';
        } else {
          inv.paymentStatus = 'partial';
        }
        persist();
        toast('Payment recorded');
        openInvoiceDetail(inv);
        break;
      }
      case 'mark-paid': {
        const inv = invoices.find(x => x.id === id);
        if (!inv) break;
        inv.paidAmount = inv.total;
        inv.paymentStatus = 'paid';
        persist();
        toast('Marked as paid');
        openInvoiceDetail(inv);
        if (currentView === 'invoices' || currentView === 'dashboard') render();
        break;
      }
      case 'stock-in': {
        const p = products.find(x => x.id === id);
        if (!p) break;
        const qtyInput = $('#stockInQty');
        const qty = parseInt(qtyInput && qtyInput.value, 10) || 0;
        if (qty <= 0) { toast('Enter quantity to add'); break; }
        p.stock = (p.stock || 0) + qty;
        stockMovements.unshift({
          id: uid(),
          productId: p.id,
          productName: p.name,
          type: 'in',
          qty,
          date: new Date().toISOString(),
          note: 'Stock in'
        });
        persist();
        toast(`+${qty} added to stock`);
        if (qtyInput) qtyInput.value = '';
        // refresh modal product stock field if present
        const stockField = document.querySelector('#productForm input[name="stock"]');
        if (stockField) stockField.value = p.stock;
        break;
      }
      case 'add-expense': openExpenseModal(); break;
      case 'edit-expense': {
        const exp = expenses.find(x => x.id === id);
        if (exp) openExpenseModal(exp);
        break;
      }
      case 'delete-expense':
        if (confirm('Delete this expense?')) {
          expenses = expenses.filter(x => x.id !== editingId);
          persist();
          toast('Deleted');
          closeModal();
          setView('expenses');
        }
        break;
      case 'pick-logo': {
        const fileInput = $('#logoFile');
        if (!fileInput) break;
        fileInput.onchange = () => {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          if (file.size > 500 * 1024) { toast('Logo must be under 500KB'); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result;
            // Resize roughly via canvas if large
            const img = new Image();
            img.onload = () => {
              const max = 200;
              let w = img.width, h = img.height;
              if (w > max || h > max) {
                if (w > h) { h = Math.round(h * max / w); w = max; }
                else { w = Math.round(w * max / h); h = max; }
              }
              const canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              canvas.getContext('2d').drawImage(img, 0, 0, w, h);
              const resized = canvas.toDataURL('image/png');
              settings.logo = resized;
              const prev = $('#logoPreview');
              if (prev) prev.innerHTML = `<img src="${resized}" alt="Logo" />`;
              toast('Logo ready – tap Save Settings');
            };
            img.src = dataUrl;
          };
          reader.readAsDataURL(file);
        };
        fileInput.click();
        break;
      }
      case 'remove-logo':
        settings.logo = '';
        const prev = $('#logoPreview');
        if (prev) prev.innerHTML = '<span>No logo</span>';
        toast('Logo removed – tap Save Settings');
        break;
      case 'filter-select':
        // handled by input listener
        break;
      case 'scan-barcode':
        startScanner(code => {
          const input = $('#barcodeInput');
          if (input) input.value = code;
          toast('Barcode scanned');
        });
        break;
      case 'stop-scanner': stopScanner(); break;
      case 'export-data': {
        const data = { products, invoices, customers, suppliers, settings, invoiceCounter, exportedAt: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `stockbill-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        toast('Backup downloaded');
        break;
      }
      case 'clear-data':
        if (confirm('Delete ALL data? This cannot be undone.')) {
          products = []; invoices = []; customers = []; suppliers = []; expenses = []; stockMovements = [];
          invoiceCounter = 1001;
          persist();
          toast('All data cleared');
          setView('dashboard');
        }
        break;
    }
  });

  // Search handlers (delegated via input event)
  document.addEventListener('input', e => {
    if (e.target.classList.contains('custom-select-search-input')) {
      const q = e.target.value.trim().toLowerCase();
      const list = e.target.closest('.custom-select-options');
      if (!list) return;
      list.querySelectorAll('.custom-select-option').forEach(opt => {
        const text = opt.dataset.search || opt.textContent.toLowerCase();
        opt.style.display = text.includes(q) ? '' : 'none';
      });
      return;
    }
    if (e.target.id === 'productSearch') {
      const q = e.target.value.trim().toLowerCase();
      const filtered = products.filter(p =>
        p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q)
      ).sort((a,b) => a.name.localeCompare(b.name));
      const list = $('#productList');
      if (list) list.innerHTML = filtered.length ? filtered.map(p => listProduct(p)).join('') :
        '<div class="text-center text-secondary" style="padding:32px 0">No products found</div>';
    }
    if (e.target.id === 'customerSearch') {
      const q = e.target.value.trim().toLowerCase();
      const filtered = customers.filter(c =>
        c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)
      ).sort((a,b) => a.name.localeCompare(b.name));
      const list = $('#customerList');
      if (list) list.innerHTML = filtered.map(c => `
        <div class="list-item" data-action="edit-customer" data-id="${c.id}">
          <div class="list-item-icon">${initials(c.name)}</div>
          <div class="list-item-body">
            <div class="list-item-title">${escapeHtml(c.name)}</div>
            <div class="list-item-sub">${escapeHtml(c.phone || 'No phone')}</div>
          </div>
        </div>`).join('') || '<div class="text-center text-secondary" style="padding:32px 0">No customers found</div>';
    }
  });

  $('#backBtn').addEventListener('click', () => {
    if (previousView && previousView !== currentView) setView(previousView);
    else setView('more');
  });

  // Init
  setView('dashboard');
})();
