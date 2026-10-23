/* ============================================
   StockBill – Inventory & Invoicing App
   Custom built for micro sellers
   ============================================ */

(function () {
  'use strict';

  // ---------- Storage ----------
  const STORAGE_KEYS = {
    products: 'stockbill_products',
    invoices: 'stockbill_invoices',
    settings: 'stockbill_settings',
    counter: 'stockbill_invoice_counter'
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ---------- State ----------
  let products = load(STORAGE_KEYS.products, []);
  let invoices = load(STORAGE_KEYS.invoices, []);
  let settings = load(STORAGE_KEYS.settings, {
    businessName: 'My Business',
    currency: 'PKR',
    phone: ''
  });
  let invoiceCounter = load(STORAGE_KEYS.counter, 1001);

  let currentView = 'dashboard';
  let editingProductId = null;

  // ---------- Helpers ----------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatMoney(amount) {
    const n = Number(amount) || 0;
    return n.toLocaleString('en-PK', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function toast(msg, duration = 2400) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => (el.hidden = true), 250);
    }, duration);
  }

  function getInitials(name) {
    return (name || '?')
      .split(' ')
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  // ---------- Persistence ----------
  function persist() {
    save(STORAGE_KEYS.products, products);
    save(STORAGE_KEYS.invoices, invoices);
    save(STORAGE_KEYS.settings, settings);
    save(STORAGE_KEYS.counter, invoiceCounter);
  }

  // ---------- Navigation ----------
  function setView(view) {
    currentView = view;
    $$('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    render();
    window.scrollTo(0, 0);
  }

  // ---------- Render ----------
  function render() {
    const content = $('#appContent');
    const headerTitle = $('#headerTitle');
    const headerRight = $('#headerRight');

    headerRight.innerHTML = '';

    switch (currentView) {
      case 'dashboard':
        headerTitle.textContent = 'Dashboard';
        content.innerHTML = renderDashboard();
        break;
      case 'products':
        headerTitle.textContent = 'Products';
        headerRight.innerHTML = `
          <button class="icon-btn" id="btnAddProduct" aria-label="Add product">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>`;
        content.innerHTML = renderProducts();
        bindProductEvents();
        break;
      case 'invoices':
        headerTitle.textContent = 'Invoices';
        content.innerHTML = renderInvoices();
        bindInvoiceListEvents();
        break;
      case 'create-invoice':
        headerTitle.textContent = 'New Invoice';
        content.innerHTML = renderCreateInvoice();
        bindCreateInvoiceEvents();
        break;
      case 'more':
        headerTitle.textContent = 'More';
        content.innerHTML = renderMore();
        bindMoreEvents();
        break;
      default:
        content.innerHTML = '';
    }
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const totalProducts = products.length;
    const lowStock = products.filter(p => p.stock > 0 && p.stock <= (p.lowStock || 5)).length;
    const outOfStock = products.filter(p => p.stock <= 0).length;
    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const recentInvoices = [...invoices].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

    return `
      <div class="fade-in">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Products</div>
            <div class="stat-value primary">${totalProducts}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Revenue</div>
            <div class="stat-value success">${settings.currency} ${formatMoney(totalRevenue)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Low Stock</div>
            <div class="stat-value warning">${lowStock}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Out of Stock</div>
            <div class="stat-value" style="color:var(--danger)">${outOfStock}</div>
          </div>
        </div>

        <div class="section-header">
          <h2 class="section-title">Recent Invoices</h2>
          ${invoices.length > 5 ? `<button class="section-link" data-goto="invoices">See all</button>` : ''}
        </div>

        ${recentInvoices.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div class="empty-title">No invoices yet</div>
            <div class="empty-text">Create your first invoice using the + button below.</div>
            <button class="btn btn-primary" data-goto="create-invoice">Create Invoice</button>
          </div>
        ` : `
          <div class="list">
            ${recentInvoices.map(inv => `
              <div class="list-item" data-invoice-id="${inv.id}">
                <div class="list-item-icon">${getInitials(inv.customerName || 'C')}</div>
                <div class="list-item-body">
                  <div class="list-item-title">${inv.customerName || 'Walk-in Customer'}</div>
                  <div class="list-item-sub">#${inv.number} · ${formatDate(inv.date)}</div>
                </div>
                <div class="list-item-right">
                  <div class="list-item-price">${settings.currency} ${formatMoney(inv.total)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  // ---------- Products ----------
  function renderProducts() {
    if (products.length === 0) {
      return `
        <div class="empty-state fade-in">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          </div>
          <div class="empty-title">No products yet</div>
          <div class="empty-text">Add your first product to start tracking stock and creating invoices.</div>
          <button class="btn btn-primary" id="emptyAddProduct">Add Product</button>
        </div>
      `;
    }

    const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name));

    return `
      <div class="fade-in">
        <div class="search-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="search" class="search-input" id="productSearch" placeholder="Search products..." />
        </div>
        <div class="list" id="productList">
          ${sorted.map(p => renderProductItem(p)).join('')}
        </div>
      </div>
    `;
  }

  function renderProductItem(p) {
    let badge = '';
    if (p.stock <= 0) {
      badge = `<span class="list-item-badge badge-out">Out of stock</span>`;
    } else if (p.stock <= (p.lowStock || 5)) {
      badge = `<span class="list-item-badge badge-low">Low stock</span>`;
    } else {
      badge = `<span class="list-item-badge badge-ok">${p.stock} in stock</span>`;
    }

    return `
      <div class="list-item" data-product-id="${p.id}">
        <div class="list-item-icon">${getInitials(p.name)}</div>
        <div class="list-item-body">
          <div class="list-item-title">${escapeHtml(p.name)}</div>
          <div class="list-item-sub">${settings.currency} ${formatMoney(p.price)} · ${p.unit || 'pcs'}</div>
        </div>
        <div class="list-item-right">
          ${badge}
        </div>
      </div>
    `;
  }

  function bindProductEvents() {
    const addBtn = $('#btnAddProduct') || $('#emptyAddProduct');
    if (addBtn) addBtn.addEventListener('click', () => openProductModal());

    $$('[data-product-id]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.productId;
        const product = products.find(p => p.id === id);
        if (product) openProductModal(product);
      });
    });

    const search = $('#productSearch');
    if (search) {
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        const filtered = products
          .filter(p => p.name.toLowerCase().includes(q))
          .sort((a, b) => a.name.localeCompare(b.name));
        $('#productList').innerHTML = filtered.map(p => renderProductItem(p)).join('') || `
          <div class="text-center text-secondary" style="padding:32px 0">No products found</div>`;
        $$('[data-product-id]').forEach(el => {
          el.addEventListener('click', () => {
            const product = products.find(p => p.id === el.dataset.productId);
            if (product) openProductModal(product);
          });
        });
      });
    }
  }

  function openProductModal(product = null) {
    editingProductId = product ? product.id : null;
    const isEdit = !!product;

    const html = `
      <div class="modal-overlay" id="productModal">
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <h3 class="modal-title">${isEdit ? 'Edit Product' : 'Add Product'}</h3>
            <button class="modal-close" id="closeProductModal">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <form id="productForm">
            <div class="form-group">
              <label class="form-label">Product Name *</label>
              <input type="text" class="form-input" name="name" required
                value="${product ? escapeHtml(product.name) : ''}"
                placeholder="e.g. Chocolate Cake" />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Price (${settings.currency}) *</label>
                <div class="input-with-prefix">
                  <span class="input-prefix">${settings.currency === 'PKR' ? 'Rs' : settings.currency}</span>
                  <input type="number" class="form-input" name="price" required min="0" step="0.01"
                    value="${product ? product.price : ''}" placeholder="0" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Stock Qty *</label>
                <input type="number" class="form-input" name="stock" required min="0" step="1"
                  value="${product ? product.stock : ''}" placeholder="0" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Unit</label>
                <input type="text" class="form-input" name="unit"
                  value="${product ? escapeHtml(product.unit || 'pcs') : 'pcs'}"
                  placeholder="pcs, kg, box..." />
              </div>
              <div class="form-group">
                <label class="form-label">Low Stock Alert</label>
                <input type="number" class="form-input" name="lowStock" min="0" step="1"
                  value="${product ? (product.lowStock || 5) : 5}" placeholder="5" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Notes (optional)</label>
              <textarea class="form-textarea" name="notes" placeholder="Any extra info...">${product ? escapeHtml(product.notes || '') : ''}</textarea>
            </div>
            <div class="flex gap-12 mt-20">
              ${isEdit ? `<button type="button" class="btn btn-danger" id="deleteProductBtn" style="flex:0 0 auto">Delete</button>` : ''}
              <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Save Changes' : 'Add Product'}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    $('#modalRoot').innerHTML = html;

    $('#closeProductModal').addEventListener('click', closeModal);
    $('#productModal').addEventListener('click', e => {
      if (e.target.id === 'productModal') closeModal();
    });

    $('#productForm').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        name: fd.get('name').trim(),
        price: parseFloat(fd.get('price')) || 0,
        stock: parseInt(fd.get('stock'), 10) || 0,
        unit: (fd.get('unit') || 'pcs').trim(),
        lowStock: parseInt(fd.get('lowStock'), 10) || 5,
        notes: (fd.get('notes') || '').trim()
      };

      if (!data.name) {
        toast('Product name is required');
        return;
      }

      if (isEdit) {
        const idx = products.findIndex(p => p.id === editingProductId);
        if (idx !== -1) {
          products[idx] = { ...products[idx], ...data };
          toast('Product updated');
        }
      } else {
        products.push({
          id: uid(),
          ...data,
          createdAt: new Date().toISOString()
        });
        toast('Product added');
      }
      persist();
      closeModal();
      if (currentView === 'products') render();
      else setView('products');
    });

    if (isEdit) {
      $('#deleteProductBtn').addEventListener('click', () => {
        if (confirm('Delete this product? This cannot be undone.')) {
          products = products.filter(p => p.id !== editingProductId);
          persist();
          toast('Product deleted');
          closeModal();
          render();
        }
      });
    }
  }

  // ---------- Invoices List ----------
  function renderInvoices() {
    if (invoices.length === 0) {
      return `
        <div class="empty-state fade-in">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div class="empty-title">No invoices yet</div>
          <div class="empty-text">Create invoices for your customers and keep track of sales.</div>
          <button class="btn btn-primary" data-goto="create-invoice">Create Invoice</button>
        </div>
      `;
    }

    const sorted = [...invoices].sort((a, b) => new Date(b.date) - new Date(a.date));

    return `
      <div class="fade-in">
        <div class="list">
          ${sorted.map(inv => `
            <div class="list-item" data-invoice-id="${inv.id}">
              <div class="list-item-icon">${getInitials(inv.customerName || 'C')}</div>
              <div class="list-item-body">
                <div class="list-item-title">${escapeHtml(inv.customerName || 'Walk-in Customer')}</div>
                <div class="list-item-sub">#${inv.number} · ${formatDate(inv.date)} · ${inv.items.length} item${inv.items.length !== 1 ? 's' : ''}</div>
              </div>
              <div class="list-item-right">
                <div class="list-item-price">${settings.currency} ${formatMoney(inv.total)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function bindInvoiceListEvents() {
    $$('[data-invoice-id]').forEach(el => {
      el.addEventListener('click', () => {
        const inv = invoices.find(i => i.id === el.dataset.invoiceId);
        if (inv) openInvoiceDetail(inv);
      });
    });
  }

  function openInvoiceDetail(inv) {
    const itemsHtml = inv.items.map(item => `
      <div class="summary-row">
        <span>${escapeHtml(item.name)} × ${item.qty}</span>
        <span>${settings.currency} ${formatMoney(item.price * item.qty)}</span>
      </div>
    `).join('');

    const html = `
      <div class="modal-overlay" id="invoiceDetailModal">
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <h3 class="modal-title">Invoice #${inv.number}</h3>
            <button class="modal-close" id="closeInvoiceDetail">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="mb-16">
            <div class="text-sm text-secondary">Customer</div>
            <div class="font-semibold">${escapeHtml(inv.customerName || 'Walk-in Customer')}</div>
            ${inv.customerPhone ? `<div class="text-sm text-secondary mt-8">${escapeHtml(inv.customerPhone)}</div>` : ''}
            <div class="text-sm text-secondary mt-8">${formatDate(inv.date)}</div>
          </div>
          <div class="invoice-summary">
            ${itemsHtml}
            <div class="summary-row total">
              <span>Total</span>
              <span>${settings.currency} ${formatMoney(inv.total)}</span>
            </div>
          </div>
          <div class="flex gap-12 mt-20">
            <button class="btn btn-secondary btn-block" id="shareInvoiceBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              WhatsApp
            </button>
            <button class="btn btn-primary btn-block" id="pdfInvoiceBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              PDF
            </button>
          </div>
        </div>
      </div>
    `;

    $('#modalRoot').innerHTML = html;
    $('#closeInvoiceDetail').addEventListener('click', closeModal);
    $('#invoiceDetailModal').addEventListener('click', e => {
      if (e.target.id === 'invoiceDetailModal') closeModal();
    });

    $('#shareInvoiceBtn').addEventListener('click', () => shareInvoiceWhatsApp(inv));
    $('#pdfInvoiceBtn').addEventListener('click', () => generatePDF(inv));
  }

  // ---------- Create Invoice ----------
  function renderCreateInvoice() {
    if (products.length === 0) {
      return `
        <div class="empty-state fade-in">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          </div>
          <div class="empty-title">Add products first</div>
          <div class="empty-text">You need at least one product before creating an invoice.</div>
          <button class="btn btn-primary" data-goto="products">Go to Products</button>
        </div>
      `;
    }

    const available = products.filter(p => p.stock > 0);

    return `
      <div class="fade-in">
        <form id="invoiceForm">
          <div class="form-group">
            <label class="form-label">Customer Name</label>
            <input type="text" class="form-input" name="customerName" placeholder="Walk-in Customer" />
          </div>
          <div class="form-group">
            <label class="form-label">Customer Phone (optional)</label>
            <input type="tel" class="form-input" name="customerPhone" placeholder="03XX XXXXXXX" />
          </div>

          <div class="section-header mt-16">
            <h2 class="section-title">Select Products</h2>
          </div>

          <div id="invoiceProducts">
            ${available.length === 0 ? `
              <div class="card text-center text-secondary" style="padding:24px">
                All products are out of stock
              </div>
            ` : available.map(p => `
              <div class="invoice-product-row" data-id="${p.id}">
                <div style="flex:1;min-width:0">
                  <div class="font-semibold">${escapeHtml(p.name)}</div>
                  <div class="text-sm text-secondary">${settings.currency} ${formatMoney(p.price)} · Stock: ${p.stock}</div>
                </div>
                <div class="qty-control">
                  <button type="button" class="qty-btn qty-minus" data-id="${p.id}">−</button>
                  <span class="qty-value" id="qty-${p.id}">0</span>
                  <button type="button" class="qty-btn qty-plus" data-id="${p.id}">+</button>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="invoice-summary" id="invoiceSummary" style="display:none">
            <div class="summary-row total">
              <span>Total</span>
              <span id="invoiceTotal">${settings.currency} 0</span>
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-block mt-20" id="createInvoiceBtn" disabled>
            Create Invoice
          </button>
        </form>
      </div>
    `;
  }

  function bindCreateInvoiceEvents() {
    const qtyMap = {};

    function updateSummary() {
      let total = 0;
      let hasItems = false;
      Object.entries(qtyMap).forEach(([id, qty]) => {
        if (qty > 0) {
          hasItems = true;
          const p = products.find(x => x.id === id);
          if (p) total += p.price * qty;
        }
      });
      const summary = $('#invoiceSummary');
      const totalEl = $('#invoiceTotal');
      const btn = $('#createInvoiceBtn');
      if (summary && totalEl && btn) {
        summary.style.display = hasItems ? 'block' : 'none';
        totalEl.textContent = `${settings.currency} ${formatMoney(total)}`;
        btn.disabled = !hasItems;
      }
    }

    $$('.qty-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const p = products.find(x => x.id === id);
        if (!p) return;
        const current = qtyMap[id] || 0;
        if (current >= p.stock) {
          toast('Not enough stock');
          return;
        }
        qtyMap[id] = current + 1;
        $(`#qty-${id}`).textContent = qtyMap[id];
        updateSummary();
      });
    });

    $$('.qty-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const current = qtyMap[id] || 0;
        if (current <= 0) return;
        qtyMap[id] = current - 1;
        $(`#qty-${id}`).textContent = qtyMap[id];
        updateSummary();
      });
    });

    $('#invoiceForm').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const items = [];
      let total = 0;

      Object.entries(qtyMap).forEach(([id, qty]) => {
        if (qty > 0) {
          const p = products.find(x => x.id === id);
          if (p && p.stock >= qty) {
            items.push({
              productId: p.id,
              name: p.name,
              price: p.price,
              qty
            });
            total += p.price * qty;
            // decrease stock
            p.stock -= qty;
          }
        }
      });

      if (items.length === 0) {
        toast('Select at least one product');
        return;
      }

      const invoice = {
        id: uid(),
        number: invoiceCounter++,
        customerName: (fd.get('customerName') || '').trim() || 'Walk-in Customer',
        customerPhone: (fd.get('customerPhone') || '').trim(),
        items,
        total,
        date: new Date().toISOString()
      };

      invoices.unshift(invoice);
      persist();
      toast('Invoice created');
      openInvoiceDetail(invoice);
      // re-render create view in background so stock is updated
      setTimeout(() => {
        if (currentView === 'create-invoice') render();
      }, 100);
    });
  }

  // ---------- More / Settings ----------
  function renderMore() {
    return `
      <div class="fade-in">
        <div class="card mb-16">
          <div class="text-sm text-secondary">Business Name</div>
          <div class="font-semibold" style="font-size:1.0625rem">${escapeHtml(settings.businessName)}</div>
        </div>

        <div class="menu-list mb-16">
          <button class="menu-item" id="editSettingsBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Business Settings
            <svg class="menu-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
          <button class="menu-item" id="exportDataBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export Data (Backup)
            <svg class="menu-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
          <button class="menu-item" id="clearDataBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Clear All Data
            <svg class="menu-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        <div class="text-center text-secondary text-sm mt-20">
          StockBill · Free for micro sellers<br>
          Data stored only on this device
        </div>
      </div>
    `;
  }

  function bindMoreEvents() {
    $('#editSettingsBtn').addEventListener('click', openSettingsModal);
    $('#exportDataBtn').addEventListener('click', exportData);
    $('#clearDataBtn').addEventListener('click', () => {
      if (confirm('Delete ALL products and invoices? This cannot be undone.')) {
        products = [];
        invoices = [];
        invoiceCounter = 1001;
        persist();
        toast('All data cleared');
        setView('dashboard');
      }
    });
  }

  function openSettingsModal() {
    const html = `
      <div class="modal-overlay" id="settingsModal">
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <h3 class="modal-title">Business Settings</h3>
            <button class="modal-close" id="closeSettings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <form id="settingsForm">
            <div class="form-group">
              <label class="form-label">Business Name</label>
              <input type="text" class="form-input" name="businessName"
                value="${escapeHtml(settings.businessName)}" placeholder="My Business" />
            </div>
            <div class="form-group">
              <label class="form-label">Currency</label>
              <select class="form-select" name="currency">
                <option value="PKR" ${settings.currency === 'PKR' ? 'selected' : ''}>PKR – Pakistani Rupee</option>
                <option value="INR" ${settings.currency === 'INR' ? 'selected' : ''}>INR – Indian Rupee</option>
                <option value="BDT" ${settings.currency === 'BDT' ? 'selected' : ''}>BDT – Bangladeshi Taka</option>
                <option value="USD" ${settings.currency === 'USD' ? 'selected' : ''}>USD – US Dollar</option>
                <option value="EUR" ${settings.currency === 'EUR' ? 'selected' : ''}>EUR – Euro</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Your Phone (for invoices)</label>
              <input type="tel" class="form-input" name="phone"
                value="${escapeHtml(settings.phone || '')}" placeholder="03XX XXXXXXX" />
            </div>
            <button type="submit" class="btn btn-primary btn-block mt-16">Save Settings</button>
          </form>
        </div>
      </div>
    `;
    $('#modalRoot').innerHTML = html;
    $('#closeSettings').addEventListener('click', closeModal);
    $('#settingsModal').addEventListener('click', e => {
      if (e.target.id === 'settingsModal') closeModal();
    });
    $('#settingsForm').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      settings.businessName = (fd.get('businessName') || 'My Business').trim();
      settings.currency = fd.get('currency') || 'PKR';
      settings.phone = (fd.get('phone') || '').trim();
      persist();
      toast('Settings saved');
      closeModal();
      render();
    });
  }

  // ---------- PDF & Share ----------
  function generatePDF(inv) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 18;
    let y = 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(settings.businessName || 'Invoice', margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    if (settings.phone) {
      doc.text(settings.phone, margin, y);
      y += 5;
    }
    y += 4;

    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Invoice #${inv.number}`, margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Date: ${formatDate(inv.date)}`, margin, y);
    y += 5;
    doc.text(`Customer: ${inv.customerName || 'Walk-in Customer'}`, margin, y);
    y += 5;
    if (inv.customerPhone) {
      doc.text(`Phone: ${inv.customerPhone}`, margin, y);
      y += 5;
    }
    y += 6;

    // Table header
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y - 4, 174, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Item', margin + 2, y);
    doc.text('Qty', margin + 95, y);
    doc.text('Price', margin + 120, y);
    doc.text('Amount', margin + 150, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    inv.items.forEach(item => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(item.name.substring(0, 40), margin + 2, y);
      doc.text(String(item.qty), margin + 95, y);
      doc.text(formatMoney(item.price), margin + 120, y);
      doc.text(formatMoney(item.price * item.qty), margin + 150, y);
      y += 6;
    });

    y += 6;
    doc.setDrawColor(200);
    doc.line(margin, y, margin + 174, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Total: ${settings.currency} ${formatMoney(inv.total)}`, margin + 110, y);

    doc.save(`Invoice-${inv.number}.pdf`);
    toast('PDF downloaded');
  }

  function shareInvoiceWhatsApp(inv) {
    let text = `*${settings.businessName || 'Invoice'}*\n`;
    text += `Invoice #${inv.number}\n`;
    text += `Date: ${formatDate(inv.date)}\n`;
    text += `Customer: ${inv.customerName || 'Walk-in'}\n\n`;
    inv.items.forEach(item => {
      text += `• ${item.name} × ${item.qty} = ${settings.currency} ${formatMoney(item.price * item.qty)}\n`;
    });
    text += `\n*Total: ${settings.currency} ${formatMoney(inv.total)}*`;
    if (settings.phone) text += `\n\nContact: ${settings.phone}`;

    const url = `https://wa.me/${inv.customerPhone ? inv.customerPhone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  function exportData() {
    const data = {
      products,
      invoices,
      settings,
      invoiceCounter,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stockbill-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded');
  }

  // ---------- Utils ----------
  function closeModal() {
    $('#modalRoot').innerHTML = '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- Global click delegation for data-goto ----------
  document.addEventListener('click', e => {
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      e.preventDefault();
      setView(goto.dataset.goto);
    }
  });

  // ---------- Bottom nav ----------
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) setView(view);
    });
  });

  // ---------- Init ----------
  function init() {
    // Register simple service worker for offline feel (optional)
    if ('serviceWorker' in navigator) {
      // We skip actual SW registration for simplicity in this MVP
    }
    setView('dashboard');
  }

  init();
})();
