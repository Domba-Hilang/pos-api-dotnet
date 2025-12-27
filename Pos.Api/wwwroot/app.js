const el = (id) => document.getElementById(id);
let cart = [];
let currentPage = 1;

let currentRole = "Cashier";
let currentUser = "Jaya";

let currentReceiptTx = null;

let txPage = 1;
const txPageSize = 1; // history 1 item/page

const pageSize = 5;   // products 5 item/page

const CART_KEY = "pos_cart_v1";


/* ---------- helpers ---------- */
function getToken() {
  return localStorage.getItem("pos_token");
}
function setToken(token) {
  localStorage.setItem("pos_token", token);
}
function clearToken() {
  localStorage.removeItem("pos_token");
  localStorage.removeItem("pos_user");
  localStorage.removeItem("pos_role");
}
function getAuth() {
  return {
    token: getToken(),
    username: localStorage.getItem("pos_user"),
    role: localStorage.getItem("pos_role"),
  };
}

function showLoginError(msg) {
  const box = el("loginError");
  if (!box) return;
  if (!msg) {
    box.classList.add("d-none");
    box.textContent = "";
    return;
  }
  box.classList.remove("d-none");
  box.textContent = msg;
}

function applyAuthUI() {
  const { token, username, role } = getAuth();

  const badge = el("authBadge");
  const info = el("authInfo");
  const btnLogout = el("btnLogout");
  const loginCard = el("loginCard");
  const posApp = el("posApp");

  if (token) {
    badge.className = "badge text-bg-success";
    badge.textContent = "Logged in";
    if (info) info.textContent = `${username ?? ""} • ${role ?? ""}`.trim();

    btnLogout?.classList.remove("d-none");
    loginCard?.classList.add("d-none");
    posApp?.classList.remove("d-none");
  } else {
    badge.className = "badge text-bg-secondary";
    badge.textContent = "Not logged in";
    if (info) info.textContent = "";

    btnLogout?.classList.add("d-none");
    loginCard?.classList.remove("d-none");
    posApp?.classList.add("d-none");
  }
}

async function doLogin(e) {
  e.preventDefault();
  showLoginError("");

  const username = (el("loginUser")?.value ?? "").trim();
  const password = (el("loginPass")?.value ?? "").trim();
  if (!username || !password) return showLoginError("Username & password required.");

  try {
    const res = await apiJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    setToken(res.accessToken);
    localStorage.setItem("pos_user", res.username);
    localStorage.setItem("pos_role", res.role);

    applyAuthUI();

    // refresh data setelah login
    await loadCategoryFilter(); // ✅ tambahin
    await loadProducts();
    renderCart();
    await loadDailyReport(el("rDate")?.value ?? todayISO());
    await loadTxHistory();

    toast("Login success ✅");
  } catch (err) {
    showLoginError(err.message || "Login failed.");
  }
}

function doLogout() {
  clearToken();
  applyAuthUI();
  toast("Logged out 👋");
}

function showError(id, message) {
  const box = el(id);
  if (!box) return;
  if (!message) {
    box.classList.add("d-none");
    box.textContent = "";
    return;
  }
  box.classList.remove("d-none");
  box.textContent = message;
}

function fmtMoney(v) {
  const n = Number(v ?? 0);
  try {
    return "Rp " + new Intl.NumberFormat("id-ID").format(n);
  } catch {
    return "Rp " + String(n);
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function apiJson(url, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.headers || {}),
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();

  if (!res.ok) {
    // buat error message enak dibaca
    let msg = text || res.statusText;

    // kalau server balikin JSON error
    try {
      const j = text ? JSON.parse(text) : null;
      if (typeof j === "string") msg = j;
      else if (j?.message) msg = j.message;
      else if (j?.title) msg = j.title;
    } catch { }

    if (res.status === 401) msg = "Unauthorized. Please login.";
    if (res.status === 403) msg = "Forbidden (Admin only). Please login as Admin.";

    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return text ? JSON.parse(text) : null;
}

function toast(message) {
  try {
    const toastEl = el("liveToast");
    const bodyEl = el("toastBody");
    if (!toastEl || !bodyEl) return;

    bodyEl.textContent = message;
    if (typeof bootstrap === "undefined" || !bootstrap.Toast) return;

    bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 1500 }).show();
  } catch {
    // ignore
  }
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function renderCart() {
  const tbody = el("cartTbody");
  const totalEl = el("cartTotal");
  const countEl = el("cartCount");
  const btnCheckout = el("btnCheckout");

  if (!tbody) return;

  if (cart.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-secondary">Cart is empty.</td></tr>`;
    if (totalEl) totalEl.textContent = fmtMoney(0);
    if (countEl) countEl.textContent = "0 items";
    if (btnCheckout) btnCheckout.disabled = true;
    return;
  }

  const total = cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
  const count = cart.reduce((sum, it) => sum + it.quantity, 0);

  tbody.innerHTML = cart.map(it => `
  <tr>
    <td>${escapeHtml(it.name)}</td>

    <td class="text-end">
      <div class="btn-group btn-group-sm" role="group" aria-label="qty">
        <button class="btn btn-outline-secondary"
                onclick="changeCartQty(${it.productId}, -1)"
                title="Decrease">
          <i class="bi bi-dash-lg"></i>
        </button>

        <span class="btn btn-outline-secondary disabled">
          ${it.quantity}
        </span>

        <button class="btn btn-outline-secondary"
                onclick="changeCartQty(${it.productId}, 1)"
                title="Increase">
          <i class="bi bi-plus-lg"></i>
        </button>
      </div>
    </td>

    <td class="text-end">${fmtMoney(it.price * it.quantity)}</td>

    <td class="text-end">
      <button class="btn btn-sm btn-outline-danger" onclick="removeFromCart(${it.productId})" title="Remove">
        <i class="bi bi-x-lg"></i>
      </button>
    </td>
  </tr>
`).join("");


  if (totalEl) totalEl.textContent = fmtMoney(total);
  if (countEl) countEl.textContent = `${count} items`;
  if (btnCheckout) btnCheckout.disabled = false;
}

function addToCart() {
  showError("txError", "");

  const select = el("txProduct");
  if (!select || !select.value) {
    return showError("txError", "Select a product.");
  }

  const qty = Number(el("txQty")?.value ?? 1);
  if (!Number.isFinite(qty) || qty <= 0) {
    return showError("txError", "Quantity must be >= 1.");
  }

  const productId = Number(select.value);
  const opt = select.options[select.selectedIndex];

  const stock = Number(opt?.dataset?.stock ?? 0);
  if (qty > stock) {
    return showError("txError", `Insufficient stock. Only ${stock} items remaining.`);
  }

  // hitung qty di cart (kalau sudah ada)
  const existing = cart.find(x => x.productId === productId);
  const alreadyInCart = existing ? existing.quantity : 0;

  if (alreadyInCart + qty > stock) {
    return showError(
      "txError",
      `Total in cart (${alreadyInCart + qty}) exceeds stock (${stock}).`
    );
  }

  const raw = opt.textContent ?? `Product ${productId}`;
  const name = raw.split(" (stok:")[0].trim();
  const price = Number(opt?.dataset?.price ?? 0);

  if (existing) {
    existing.stock = stock;
    existing.quantity += qty;
  }
  else {
    cart.push({ productId, name, price, quantity: qty, stock });
  }

  el("txQty").value = 1;
  saveCart();
  renderCart();
  toast("Added to cart ✅");
}

function changeCartQty(productId, delta) {
  showError("txError", "");

  const item = cart.find(x => x.productId === productId);
  if (!item) return;

  const newQty = item.quantity + delta;

  // kalau qty <= 0 → hapus item
  if (newQty <= 0) {
    cart = cart.filter(x => x.productId !== productId);
    saveCart();
    renderCart();
    return;
  }

  // validasi stok (pakai snapshot)
  const stock = Number(item.stock ?? 0);
  if (newQty > stock) {
    showError("txError", `Insufficient stock. ${stock} items remaining.`);
    return;
  }

  item.quantity = newQty;
  saveCart();
  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter(x => x.productId !== productId);
  saveCart();
  renderCart();
}

function clearCart() {
  cart = [];
  saveCart();
  renderCart();
}

async function checkoutCart() {
  showError("txError", "");

  if (cart.length === 0) return;

  try {
    const paymentMethod = el("payMethod")?.value ?? "Cash";
    const cashReceivedRaw = el("cashReceived")?.value ?? "";
    const cashReceived = cashReceivedRaw === "" ? null : Number(cashReceivedRaw);
    const paymentRef = (el("payRef")?.value ?? "").trim();

    // validasi ringan di UI (backend tetap validasi juga)
    const total = cart.reduce((s, it) => s + it.price * it.quantity, 0);
    if (paymentMethod === "Cash") {
      const cash = Number(cashReceived ?? 0);
      if (!Number.isFinite(cash) || cash < total) {
        return showError("txError", `Cash kurang. Total ${fmtMoney(total)}.`);
      }
    }

    const payload = {
      paymentMethod,
      cashReceived: paymentMethod === "Cash" ? cashReceived : null,
      paymentRef: paymentRef || null,
      items: cart.map(it => ({ productId: it.productId, quantity: it.quantity }))
    };

    const result = await apiJson("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (el("txResult")) el("txResult").textContent = JSON.stringify(result, null, 2);

    // reset payment input
    if (el("cashReceived")) el("cashReceived").value = "";
    if (el("payRef")) el("payRef").value = "";

    cart = [];
    clearCartStorage();
    renderCart();

    await loadProducts(); // refresh stok + dropdown
    toast("Checkout success 🧾");
  } catch (err) {
    showError("txError", err.message);
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch (e) {
    console.warn("saveCart failed", e);
  }
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) cart = parsed;
  } catch (e) {
    console.warn("loadCart failed, clearing", e);
    localStorage.removeItem(CART_KEY);
  }
}

function clearCartStorage() {
  try {
    localStorage.removeItem(CART_KEY);
  } catch { }
}

function buildProductsQuery() {
  const search = (el("fSearch")?.value ?? "").trim();
  const status = el("fStatus")?.value ?? "all";
  const lowStockOnly = !!el("fLowStock")?.checked;
  const minStock = Number(el("fMinStock")?.value ?? 5);
  const sortBy = el("fSortBy")?.value ?? "id";
  const order = el("fOrder")?.value ?? "asc";
  const category = el("fCategory")?.value ?? "all";

  const params = new URLSearchParams();
  params.set("page", String(currentPage));
  params.set("pageSize", String(pageSize));

  if (search) params.set("search", search);
  params.set("status", status);

  if (category && category !== "all") params.set("category", category);

  if (lowStockOnly) {
    params.set("lowStockOnly", "true");
    params.set("minStock", String(isNaN(minStock) ? 5 : minStock));
  }

  params.set("sortBy", sortBy);
  params.set("order", order);

  return { params, status };
}

async function loadProducts() {
  showError("productError", "");

  const tbody = el("productsTbody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-secondary">Loading...</td></tr>`;

  // TABEL: semua produk
  const { params, status } = buildProductsQuery();
  const res = await apiJson(`/api/products?${params.toString()}`);

  let products = res.items ?? [];
  const total = res.total ?? products.length;
  const totalPages = res.totalPages ?? 1;

  el("pgInfo").textContent = `Page ${res.page} / ${totalPages} • Total ${total}`;
  el("btnPrev").disabled = res.page <= 1;
  el("btnNext").disabled = res.page >= totalPages;

  if (el("statProducts")) el("statProducts").textContent = products.length;

  if (tbody) {
    if (products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-secondary">Belum ada produk.</td></tr>`;
    } else {
      tbody.innerHTML = products.map(p => {
        const statusBadge = p.isActive
          ? `<span class="badge text-bg-success">Active</span>`
          : `<span class="badge text-bg-secondary">Inactive</span>`;

        const editBtn = `
  <button class="btn btn-sm btn-outline-primary" title="Edit"
          onclick="openEdit(${p.id}, '${escapeHtml(p.name)}', '${escapeHtml(p.category ?? "")}', ${p.price}, ${p.stock})">
    <i class="bi bi-pencil"></i>
  </button>`;

        const toggleBtn = p.isActive
          ? `<button class="btn btn-sm btn-outline-warning" title="Deactivate"
             onclick="setActive(${p.id}, false)">
        <i class="bi bi-pause-circle"></i>
     </button>`
          : `<button class="btn btn-sm btn-outline-success" title="Activate"
             onclick="setActive(${p.id}, true)">
        <i class="bi bi-play-circle"></i>
     </button>`;

        const deleteBtn = `
  <button class="btn btn-sm btn-outline-danger" title="Delete"
          onclick="deleteProduct(${p.id}, '${escapeHtml(p.name)}')">
    <i class="bi bi-trash"></i>
  </button>`;

        return `
<tr class="${p.isActive ? "" : "text-secondary"}">
  <td class="text-secondary">${p.id}</td>
  <td class="fw-semibold">${escapeHtml(p.name)}</td>
<td>${escapeHtml((p.category ?? "").trim() || "Uncategorized")}</td>
  <td class="text-end">${fmtMoney(p.price)}</td>
  <td class="text-end">${p.stock}</td>
  <td>${statusBadge}</td>
  <td class="text-end">
    <div class="btn-group btn-group-sm" role="group">
      ${editBtn}
      ${toggleBtn}
      ${deleteBtn}
    </div>
  </td>
</tr>`;

      }).join("");
    }
  }

  // DROPDOWN transaksi: hanya aktif
  const select = el("txProduct");
  if (select) {
    // Dropdown transaksi: ambil semua produk ACTIVE (pakai paging response)
    const res = await apiJson("/api/products?status=active&page=1&pageSize=200");
    const activeProducts = res.items ?? [];

    if (activeProducts.length === 0) {
      select.innerHTML = `<option value="">No active products</option>`;
    } else {
      select.innerHTML =
        `<option value="">Select product</option>` +
        activeProducts.map(p =>
          `<option value="${p.id}" data-price="${p.price}" data-stock="${p.stock}">
      ${escapeHtml(p.name)} (stok: ${p.stock})
    </option>`
        ).join("");
    }
  }
}

async function createProduct(e) {
  e.preventDefault();
  showError("productError", "");

  const name = el("pName").value.trim();
  const category = (el("pCategory")?.value ?? "").trim() || "Uncategorized";
  const price = Number(el("pPrice").value);
  const stock = Number(el("pStock").value);

  try {
    await apiJson("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, price, stock })
    });

    el("pName").value = "";
    el("pPrice").value = "";
    el("pStock").value = "";

    await loadCategoryFilter();
    currentPage = 1;
    await loadProducts();
    toast("Product added ✅");

  } catch (err) {
    showError("productError", err.message);
  }
}

async function deleteProduct(id, name) {
  const ok = confirm(`Delete product "${name}"?`);
  if (!ok) return;

  try {
    await apiJson(`/api/products/${id}`, { method: "DELETE" });
    await loadProducts();
    toast("Product deleted 🗑️");
  } catch (err) {
    if (err.status === 403) {
      toast("Admin only. Login as admin.");
      return;
    }
    showError("productError", err.message);
  }
}

async function loadCategoryFilter() {
  console.log("loadCategoryFilter CALLED");

  const sel = el("fCategory");
  console.log("fCategory element =", sel);

  if (!sel) return;

  try {
    const cats = await apiJson("/api/products/categories");
    console.log("CATEGORIES:", cats);

    const current = sel.value || "all";

    sel.innerHTML =
      `<option value="all">All categories</option>` +
      (cats || []).map(c =>
        `<option value="${String(c)}">${escapeHtml(c)}</option>`
      ).join("");

    // restore safely
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
    else sel.value = "all";

  } catch (err) {
    console.error("loadCategoryFilter failed:", err);
    showError("productError", `Load categories failed: ${err.message ?? err}`);
  }
  sel.dispatchEvent(new Event("change"));
}

async function setActive(id, isActive) {
  try {
    await apiJson(`/api/products/${id}/active`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isActive)
    });

    await loadProducts();
    toast(isActive ? "Product activated ✅" : "Product deactivated ⏸️");
  } catch (err) {
    if (err.status === 403) {
      toast("Admin only. Login as admin.");
      return;
    }
    showError("productError", err.message);
  }
}

let editModalInstance = null;

function openEdit(id, name, category, price, stock) {
  if (!el("editModal")) return;

  showError("editError", "");
  el("editId").value = id;
  el("editName").value = name;
  el("editCategory").value = (category ?? "").trim() || "Uncategorized";
  el("editPrice").value = price;
  el("editStock").value = stock;

  editModalInstance = bootstrap.Modal.getOrCreateInstance(el("editModal"));
  editModalInstance.show();
}

async function saveEdit(e) {
  e.preventDefault();
  showError("editError", "");

  const id = Number(el("editId").value);
  const name = el("editName").value.trim();
  const category = (el("editCategory")?.value ?? "").trim() || "Uncategorized";
  const price = Number(el("editPrice").value);
  const stock = Number(el("editStock").value);

  try {
    await apiJson(`/api/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, price, stock })
    });

    await loadCategoryFilter();
    await loadProducts();
    toast("Product updated ✅");
    if (editModalInstance) editModalInstance.hide();

  } catch (err) {
    if (err.status === 403) {
      toast("Admin only. Login as admin.");
      return;
    }
    showError("productError", err.message);
  }
}

async function loadDailyReport(date) {
  showError("reportError", "");
  try {
    const rep = await apiJson(`/api/transactions/reports/daily?date=${date}`);

    if (el("report")) el("report").textContent = JSON.stringify(rep, null, 2);

    // ASP.NET biasanya camelCase => totalRevenue
    const revenue = rep?.totalRevenue ?? rep?.TotalRevenue ?? 0;
    if (el("statRevenue")) el("statRevenue").textContent = fmtMoney(revenue);
  } catch (err) {
    showError("reportError", err.message);
  }
}

function updatePaymentUI() {
  const method = el("payMethod")?.value ?? "Cash";
  const cashBox = el("cashBox");
  if (!cashBox) return;

  cashBox.classList.toggle("d-none", method !== "Cash");
  if (method !== "Cash") {
    el("cashReceived").value = "";
    el("changePreview").textContent = fmtMoney(0);
  }
}

function updateChangePreview() {
  const total = cart.reduce((s, it) => s + it.price * it.quantity, 0);
  const cash = Number(el("cashReceived")?.value ?? 0);
  const change = Math.max(0, cash - total);
  el("changePreview").textContent = fmtMoney(change);
}

async function loadTxHistory() {

  const tbody = el("txHistTbody");
  if (!tbody) return;

  const params = new URLSearchParams();
  params.set("page", String(txPage));
  params.set("pageSize", String(txPageSize));

  tbody.innerHTML = `<tr>
    <td colspan="6" class="text-secondary">Loading...</td>
  </tr>`;

  try {
    const res = await apiJson(`/api/transactions/history?${params.toString()}`);
    const items = res.items ?? [];

    const totalPages = res.totalPages ?? 1;
    const page = res.page ?? txPage;

    // update UI info kalau ada
    if (el("txHistInfo")) el("txHistInfo").textContent = `Transaction ${page} / ${totalPages}`;

    // disable tombol
    if (el("btnTxPrev")) el("btnTxPrev").disabled = page <= 1;
    if (el("btnTxNext")) el("btnTxNext").disabled = page >= totalPages;

    // sinkronkan txPage biar konsisten
    txPage = page;


    if (items.length === 0) {
      tbody.innerHTML = `<tr>
        <td colspan="6" class="text-secondary">No transactions.</td>
      </tr>`;
      return;
    }

    tbody.innerHTML = items.map(tx => `
  <tr>
    <td class="text-secondary">${tx.id}</td>
    <td>${new Date(tx.createdAt).toLocaleString("id-ID")}</td>
    <td class="text-end">${fmtMoney(tx.totalPrice ?? 0)}</td>
    <td>${escapeHtml(tx.paymentMethod ?? "-")}</td>
    <td>${escapeHtml(`${tx.createdByUser ?? "-"}${tx.createdByRole ? ` (${tx.createdByRole})` : ""}`)}</td>
    <td class="text-end">
      <button class="btn btn-sm btn-outline-primary"
              onclick="openTxModal(${tx.id})"
              title="View receipt">
        <i class="bi bi-eye"></i>
      </button>
    </td>
  </tr>
`).join("");

  } catch (err) {
    tbody.innerHTML = `<tr>
      <td colspan="6" class="text-danger">${err.message}</td>
    </tr>`;
  }
}

function showTxModalError(msg) {
  const box = el("txModalError");
  if (!box) return;
  if (!msg) {
    box.classList.add("d-none");
    box.textContent = "";
    return;
  }
  box.classList.remove("d-none");
  box.textContent = msg;
}

async function openTxModal(id) {
  showTxModalError("");

  // buka modal dulu biar terasa responsif
  const modalEl = document.getElementById("txModal");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  // set loading state
  el("rxId").textContent = String(id);
  el("rxTime").textContent = "-";
  el("rxBy").textContent = "-";
  el("rxMethod").textContent = "-";
  el("rxRef").textContent = "-";
  el("rxTotal").textContent = "-";
  el("rxPaid").textContent = "-";
  el("rxChange").textContent = "-";
  el("txModalSub").textContent = "Loading...";
  el("rxItemsTbody").innerHTML = `<tr><td colspan="4" class="text-secondary">Loading...</td></tr>`;

  try {
    const tx = await apiJson(`/api/transactions/${id}`);
    currentReceiptTx = tx;

    el("txModalSub").textContent = `Transaction #${tx.id}`;
    el("rxId").textContent = String(tx.id);

    // waktu tampil (simple)
    el("rxTime").textContent = tx.createdAt ? new Date(tx.createdAt).toLocaleString("id-ID") : "-";

    const by = (tx.createdByUser ?? "Unknown") + (tx.createdByRole ? ` (${tx.createdByRole})` : "");
    el("rxBy").textContent = by;

    el("rxMethod").textContent = tx.paymentMethod ?? "-";
    el("rxRef").textContent = tx.paymentRef ?? "-";

    // items
    const items = tx.items ?? [];
    if (items.length === 0) {
      el("rxItemsTbody").innerHTML = `<tr><td colspan="4" class="text-secondary">No items.</td></tr>`;
    } else {
      el("rxItemsTbody").innerHTML = items.map(it => `
        <tr>
          <td>${escapeHtml(it.productName ?? `#${it.productId}`)}</td>
          <td class="text-end">${it.quantity}</td>
          <td class="text-end">${fmtMoney(it.unitPrice)}</td>
          <td class="text-end">${fmtMoney(it.subtotal ?? (it.unitPrice * it.quantity))}</td>
        </tr>
      `).join("");
    }

    el("rxTotal").textContent = fmtMoney(tx.totalPrice ?? 0);
    el("rxPaid").textContent = fmtMoney(tx.paidAmount ?? 0);
    el("rxChange").textContent = fmtMoney(tx.changeAmount ?? 0);
  } catch (err) {
    showTxModalError(err.message);
  }
}

function printReceipt() {
  if (!currentReceiptTx) return;

  const receiptHtml = document.getElementById("txReceipt").outerHTML;

  const w = window.open("", "_blank", "width=420,height=720");
  w.document.write(`
    <html>
      <head>
        <title>Receipt #${currentReceiptTx.id}</title>
        <meta charset="utf-8" />
        <style>
          body{font-family:Arial, sans-serif; padding:12px;}
          table{width:100%; border-collapse:collapse; font-size:12px;}
          th,td{padding:6px 4px; border-bottom:1px solid #ddd;}
          .text-end{text-align:right;}
          .table-light th{background:#f5f5f5;}
          hr{border:0; border-top:1px solid #ddd; margin:12px 0;}
        </style>
      </head>
      <body>
        ${receiptHtml}
        <script>
          window.onload = () => { window.print(); };
        <\/script>
      </body>
    </html>
  `);
  w.document.close();
}

/* ---------- init ---------- */
window.addEventListener("load", async () => {
  el("loginForm")?.addEventListener("submit", doLogin);
  el("btnLogout")?.addEventListener("click", doLogout);

  applyAuthUI();

  loadCart();

  el("btnAddToCart")?.addEventListener("click", addToCart);
  el("btnCheckout")?.addEventListener("click", checkoutCart);
  el("btnClearCart")?.addEventListener("click", clearCart);

  if (el("rDate")) el("rDate").value = todayISO();
  if (el("txDate")) el("txDate").value = todayISO();

  el("formProduct")?.addEventListener("submit", createProduct);
  el("editForm")?.addEventListener("submit", saveEdit);

  el("btnRefresh")?.addEventListener("click", async () => {
    await loadProducts();
    await loadDailyReport(el("rDate").value);
  });

  el("btnReport")?.addEventListener("click", async () => {
    await loadDailyReport(el("rDate").value);
  });

  // History bindings
  el("btnTxFilter")?.addEventListener("click", async () => {
    txPage = 1;
    await loadTxHistory();
  });
  el("btnTxPrev")?.addEventListener("click", async () => {
    if (txPage > 1) txPage--;
    await loadTxHistory();
  });
  el("btnTxNext")?.addEventListener("click", async () => {
    txPage++;
    await loadTxHistory();
  });

  // Filters
  el("btnApplyFilters")?.addEventListener("click", async () => {
    currentPage = 1;
    await loadProducts();
  });

  const onSearch = debounce(async () => {
    currentPage = 1;
    await loadProducts();
  }, 300);

  el("fSearch")?.addEventListener("input", onSearch);

  ["fStatus", "fCategory", "fLowStock", "fMinStock", "fSortBy", "fOrder"].forEach(id => {
    el(id)?.addEventListener("change", async () => {
      currentPage = 1;
      await loadProducts();
    });
  });

  el("btnPrev")?.addEventListener("click", async () => {
    if (currentPage > 1) currentPage--;
    await loadProducts();
  });

  el("btnNext")?.addEventListener("click", async () => {
    currentPage++;
    await loadProducts();
  });

  // Cart render once
  renderCart();

  // Payment handlers
  el("payMethod")?.addEventListener("change", () => {
    updatePaymentUI();
    updateChangePreview();
  });
  el("cashReceived")?.addEventListener("input", updateChangePreview);
  updatePaymentUI();
  updateChangePreview();

  el("btnPrintReceipt")?.addEventListener("click", printReceipt);

  // Load data only if logged in
  if (getToken()) {
    try {
      await loadCategoryFilter(); // ✅ penting
      await loadProducts();
      renderCart();
    } catch (err) {
      console.error("loadProducts failed:", err);
      showError("productError", err.message ?? String(err));
    }

    try {
      await loadDailyReport(el("rDate")?.value ?? todayISO());
    } catch (err) {
      console.error("loadDailyReport failed:", err);
      showError("reportError", err.message ?? String(err));
    }

    try {
      await loadTxHistory();
    } catch (err) {
      console.error("loadTxHistory failed:", err);
      showError("txHistError", err.message ?? String(err));
    }
  }
});



