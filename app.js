(function () {
  const cfg = window.CAMP_CONFIG || {};
  const isConfigured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("TU-PROYECTO") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("TU_ANON");

  let supabase = null;
  if (isConfigured && window.supabase) {
    supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  const state = {
    campers: [],
    payments: [],
    filtered: [],
    currentPrice: null,
    payView: "list",
    hasCategory: true,
    hasCustomPrice: true,
    colFilters: {},
    sort: { key: null, dir: "" },
  };

  // ---------- helpers ----------
  function money(n) {
    const v = Number(n || 0);
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v);
  }
  function ageAt(birthDate, campDate) {
    if (!birthDate) return "-";
    const b = new Date(birthDate + "T00:00:00");
    const c = new Date(campDate + "T00:00:00");
    let age = c.getFullYear() - b.getFullYear();
    const m = c.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && c.getDate() < b.getDate())) age--;
    return age >= 0 ? age : "-";
  }
  function todayISO() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function formatDate(iso) {
    if (!iso) return "-";
    const p = String(iso).split("-");
    if (p.length !== 3) return iso;
    return p[2].padStart(2,"0") + "/" + p[1].padStart(2,"0") + "/" + p[0];
  }
  function toast(msg, kind) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    t.classList.add("show");
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.classList.add("hidden"), 200); }, 2800);
  }
  function currentTier() {
    const now = new Date();
    const tiers = cfg.PRICE_TIERS || [];
    for (const tier of tiers) {
      if (now <= new Date(tier.until + "T23:59:59")) return tier;
    }
    return tiers.length ? tiers[tiers.length - 1] : null;
  }
  function currentPrice() {
    const tier = currentTier();
    return tier ? tier.price : 0;
  }
  function lockedPrice(paid) {
    const tiers = [...(cfg.PRICE_TIERS || [])].sort((a,b)=>a.price-b.price);
    let locked = null;
    for (const t of tiers) {
      if (paid >= t.price) locked = t.price;
    }
    // pago completo del primer tramo o superior => saldado
    if (paid >= (cfg.FIRST_TIER_PRICE || 0)) {
      if (locked === null) locked = cfg.FIRST_TIER_PRICE;
    }
    return locked;
  }
  function requiredPrice(paid) {
    const lp = lockedPrice(paid);
    return lp !== null ? lp : currentPrice();
  }
  function customPriceOf(c) {
    if (!c) return null;
    const v = c.custom_price;
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  }
  function effectivePriceFor(c) {
    const cp = customPriceOf(c);
    if (cp !== null) return cp;
    return requiredPrice(paidFor(c && c.id));
  }
  function settledFor(c) {
    return paidFor(c && c.id) >= effectivePriceFor(c);
  }
  function saldoForCamper(c) {
    const paid = paidFor(c && c.id);
    return Math.max(0, effectivePriceFor(c) - paid);
  }
  function paymentsFor(camperId) { return state.payments.filter(p => p.camper_id === camperId); }
  function paidFor(camperId) { return paymentsFor(camperId).reduce((s, p) => s + Number(p.amount || 0), 0); }
  function nameOf(c) { return (c.last_name || "") + (c.first_name ? ", " + c.first_name : ""); }

  // ---------- modal helpers ----------
  function openModal(id) { document.getElementById(id).classList.add("open"); }
  function closeModal(id) { document.getElementById(id).classList.remove("open"); }
  document.addEventListener("click", e => {
    const c = e.target.getAttribute && e.target.getAttribute("data-close");
    if (c) closeModal(c);
  });

  // ---------- tabs ----------
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".tab").forEach(t => {
      t.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(x => x.classList.remove("active"));
        t.classList.add("active");
        document.getElementById("tab-" + t.dataset.tab).classList.add("active");
      });
    });

    // config warning
    if (!isConfigured) {
      document.getElementById("configWarning").classList.remove("hidden");
    }

    // tema claro/oscuro
    const themeToggle = document.getElementById("themeToggle");
    function applyTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      try { localStorage.setItem("jh-theme", theme); } catch(e){}
      themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    }
    let initialTheme = null;
    try { initialTheme = localStorage.getItem("jh-theme"); } catch(e){}
    if (!initialTheme) {
      initialTheme = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    }
    applyTheme(initialTheme);
    themeToggle.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      applyTheme(cur === "dark" ? "light" : "dark");
    });

    // price badge
    state.currentPrice = currentPrice();
    const tier = currentTier();
    document.getElementById("priceValue").textContent = money(state.currentPrice) +
      " (hasta " + formatDate(tier ? tier.until : cfg.CAMP_DATE) + ")";

    // button handlers
    document.getElementById("btnAddCamper").addEventListener("click", () => openCamperModal());
    document.getElementById("camperForm").addEventListener("submit", onSaveCamper);
    document.getElementById("paymentFormInline").addEventListener("submit", onSaveInlinePayment);
    document.getElementById("btnAddPayment").addEventListener("click", () => openGlobalPaymentModal());
    document.getElementById("btnExportCampers").addEventListener("click", exportCampersPDF);
    document.getElementById("btnExportPayments").addEventListener("click", exportPaymentsPDF);
    const toggleBtn = document.getElementById("btnTogglePayView");
    function applyPayViewLabel() {
      toggleBtn.textContent = state.payView === "grouped" ? "📋 Lista" : "👤 Por persona";
    }
    applyPayViewLabel();
    toggleBtn.addEventListener("click", () => {
      state.payView = state.payView === "grouped" ? "list" : "grouped";
      applyPayViewLabel();
      renderPayments();
    });
    document.getElementById("paymentsGrouped").addEventListener("click", (e) => {
      const add = e.target.closest && e.target.closest("[data-addpay]");
      const del = e.target.closest && e.target.closest("[data-del]");
      if (add) openGlobalPaymentModal(add.dataset.addpay);
      if (del) deletePayment(del.dataset.del);
    });
    ["fPayDate","fPayCamper","fPayMode","fPayAmount","fPayNote"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", renderPayments);
      el.addEventListener("change", renderPayments);
    });
    document.getElementById("btnClearPayFilters").addEventListener("click", () => {
      ["fPayDate","fPayCamper","fPayMode","fPayAmount","fPayNote"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      renderPayments();
    });
    document.getElementById("globalPaymentForm").addEventListener("submit", onSaveGlobalPayment);
    const gfField = document.getElementById("generalFilterField");
    const gfValue = document.getElementById("generalFilterValue");
    if (gfValue) {
      gfValue.addEventListener("input", renderCampers);
      gfValue.addEventListener("search", renderCampers);
    }
    if (gfField) gfField.addEventListener("change", renderCampers);
    document.querySelectorAll(".col-filter-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        openColMenu(btn.dataset.col, btn);
      });
    });
    document.getElementById("btnClearCamperFilters").addEventListener("click", clearAllCampersFilters);
    document.addEventListener("click", e => {
      if (!colMenu || !colMenu.classList.contains("show")) return;
      if (e.target.closest && (e.target.closest(".col-filter-menu") || e.target.closest(".col-filter-btn"))) return;
      closeColMenu();
    });
    window.addEventListener("scroll", closeColMenu, true);
    window.addEventListener("resize", closeColMenu);
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeColMenu(); });
    init();
  });

  async function init() {
    if (!supabase) { renderAll(); return; }
    await Promise.all([loadCampers(), loadPayments()]);
    renderAll();
  }

  function applyExtrasAvailability() {
    const sel = document.getElementById("category");
    if (sel) sel.disabled = state.hasCategory === false;
    const priceInput = document.getElementById("customPrice");
    if (priceInput) priceInput.disabled = state.hasCustomPrice === false;
  }

  async function loadCampers() {
    const { data, error } = await supabase.from("campers").select("*").order("last_name", { ascending: true });
    if (error) { toast("Error cargando acampantes: " + error.message, "danger"); return; }
    state.campers = data || [];
    if (state.campers.length > 0) {
      const keys = Object.keys(state.campers[0]);
      state.hasCategory = keys.includes("category");
      state.hasCustomPrice = keys.includes("custom_price");
    } else {
      const catProbe = await supabase.from("campers").select("category").limit(1);
      state.hasCategory = !catProbe.error;
      const priceProbe = await supabase.from("campers").select("custom_price").limit(1);
      state.hasCustomPrice = !priceProbe.error;
    }
    applyExtrasAvailability();
  }
  async function loadPayments() {
    const { data, error } = await supabase.from("payments").select("*").order("payment_date", { ascending: false });
    if (error) { toast("Error cargando pagos: " + error.message, "danger"); return; }
    state.payments = data || [];
  }

  function renderAll() {
    renderCampers();
    renderPayments();
    renderDashboard();
  }

  // ---------- campers ----------
  function normText(v) {
    return String(v == null ? "" : v)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().trim();
  }
  function digitsOnly(v) {
    return String(v == null ? "" : v).replace(/\D+/g, "");
  }
  function parseNumberLoose(raw) {
    if (raw === null || raw === undefined) return NaN;
    let s = String(raw).replace(/[\s%$]/g, "");
    if (!s) return NaN;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    return Number(s);
  }
  function camperCategory(c) { return c.category || "Acampante"; }
  function camperAge(c) {
    const a = ageAt(c.birth_date, cfg.CAMP_DATE);
    return a === "-" ? null : Number(a);
  }

  const CAMPER_COLUMNS = {
    name: { label: "Apellido y Nombre", type: "text", value: c => nameOf(c) },
    category: { label: "Categoría", type: "text", value: c => camperCategory(c) },
    dni: { label: "DNI", type: "text", value: c => String(c.dni || "").trim() },
    age: { label: "Edad", type: "number", value: c => camperAge(c) },
    phone: { label: "Celular", type: "text", value: c => String(c.phone || "").trim() },
    email: { label: "Mail", type: "text", value: c => String(c.email || "").trim() },
    church: { label: "Iglesia", type: "text", value: c => String(c.church || "").trim() },
    price: { label: "Valor final", type: "number", value: c => effectivePriceFor(c) },
    paid: { label: "Pagado", type: "number", value: c => paidFor(c.id) },
    due: { label: "Saldo", type: "number", value: c => saldoForCamper(c) },
  };

  function colValueKey(key, c) {
    const col = CAMPER_COLUMNS[key];
    if (!col) return "";
    const v = col.value(c);
    if (col.type === "number") return v === null || v === undefined || v === "" ? "" : String(v);
    return normText(v);
  }
  function colDisplay(key, valueKey, rawValue) {
    const col = CAMPER_COLUMNS[key];
    if (valueKey === "") return "(vacío)";
    if (col.type === "number") {
      return key === "age" ? String(valueKey) : money(Number(valueKey));
    }
    const txt = String(rawValue == null ? "" : rawValue).trim();
    return txt || "(vacío)";
  }

  function matchesColumnFilters(c, skipKey) {
    for (const key of Object.keys(CAMPER_COLUMNS)) {
      if (key === skipKey) continue;
      const sel = state.colFilters[key];
      if (!Array.isArray(sel)) continue;
      if (!sel.includes(colValueKey(key, c))) return false;
    }
    return true;
  }

  function generalFilterState() {
    const fieldEl = document.getElementById("generalFilterField");
    const valueEl = document.getElementById("generalFilterValue");
    return { field: fieldEl ? fieldEl.value : "", raw: valueEl ? valueEl.value.trim() : "" };
  }

  function matchesGeneralFilter(c) {
    const { field, raw } = generalFilterState();
    if (!raw) return true;
    if (!field) {
      const tokens = normText(raw).split(/\s+/).filter(Boolean);
      const haystack = normText([
        nameOf(c), camperCategory(c), c.dni, c.phone, c.email, c.church,
        ageAt(c.birth_date, cfg.CAMP_DATE), effectivePriceFor(c), paidFor(c.id), saldoForCamper(c)
      ].join(" "));
      return tokens.every(t => haystack.includes(t));
    }
    const col = CAMPER_COLUMNS[field];
    if (!col) return true;
    const rawVal = col.value(c);
    if (col.type === "number") {
      if (rawVal === null || rawVal === undefined || rawVal === "") return false;
      const m = raw.match(/^(>=|<=|>|<|=)?\s*(-?[\d.,]+)$/);
      if (!m) return normText(rawVal).includes(normText(raw));
      const target = parseNumberLoose(m[2]);
      if (!isFinite(target)) return true;
      const val = Number(rawVal);
      const op = m[1] || "=";
      if (op === ">") return val > target;
      if (op === "<") return val < target;
      if (op === ">=") return val >= target;
      if (op === "<=") return val <= target;
      return val === target;
    }
    return normText(rawVal).includes(normText(raw));
  }

  function sortCampers(list) {
    const key = state.sort && state.sort.key;
    const dir = state.sort && state.sort.dir;
    if (!key || !dir || !CAMPER_COLUMNS[key]) return list;
    const col = CAMPER_COLUMNS[key];
    const mult = dir === "desc" ? -1 : 1;
    return list.slice().sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      let cmp;
      if (col.type === "number") cmp = Number(av) - Number(bv);
      else cmp = String(av).localeCompare(String(bv), "es", { numeric: true, sensitivity: "base" });
      return cmp * mult;
    });
  }

  function filteredCampers() {
    const list = state.campers.filter(c => matchesGeneralFilter(c) && matchesColumnFilters(c, null));
    return sortCampers(list);
  }

  function columnValueEntries(key) {
    const col = CAMPER_COLUMNS[key];
    const map = new Map();
    state.campers
      .filter(c => matchesGeneralFilter(c) && matchesColumnFilters(c, key))
      .forEach(c => {
        const k = colValueKey(key, c);
        if (!map.has(k)) map.set(k, col.type === "number" ? Number(k) : col.value(c));
      });
    const entries = [...map.entries()].map(([k, raw]) => ({
      key: k,
      display: colDisplay(key, k, raw),
      empty: k === "",
      sort: col.type === "number" ? (k === "" ? Infinity : Number(k)) : normText(k),
    }));
    entries.sort((a, b) => {
      if (a.empty !== b.empty) return a.empty ? 1 : -1;
      if (typeof a.sort === "number" && typeof b.sort === "number") return a.sort - b.sort;
      return String(a.sort).localeCompare(String(b.sort), "es", { numeric: true, sensitivity: "base" });
    });
    return entries;
  }

  // ---------- menú de filtro estilo Excel ----------
  let colMenu = null;
  let colMenuCol = null;

  function ensureColMenu() {
    if (colMenu) return colMenu;
    colMenu = document.createElement("div");
    colMenu.className = "col-filter-menu";
    colMenu.innerHTML = `
      <div class="cfm-sort">
        <button type="button" data-sort="asc">▲ Orden ascendente</button>
        <button type="button" data-sort="desc">▼ Orden descendente</button>
      </div>
      <div class="cfm-search"><input type="search" data-cfm-search placeholder="Buscar valor..." /></div>
      <div class="cfm-values" data-cfm-values></div>
      <div class="cfm-footer">
        <button type="button" class="btn small" data-cfm-clear>Limpiar</button>
        <button type="button" class="btn small primary" data-cfm-apply>Aplicar</button>
      </div>`;
    document.body.appendChild(colMenu);
    colMenu.addEventListener("click", e => e.stopPropagation());
    colMenu.querySelector("[data-cfm-search]").addEventListener("input", filterMenuValues);
    colMenu.querySelector("[data-cfm-apply]").addEventListener("click", applyColMenu);
    colMenu.querySelector("[data-cfm-clear]").addEventListener("click", clearColMenu);
    colMenu.querySelector("[data-cfm-values]").addEventListener("change", e => {
      if (e.target.matches("[data-cfm-all]")) {
        colMenu.querySelectorAll("[data-cfm-val]").forEach(cb => { cb.checked = e.target.checked; });
      } else if (e.target.matches("[data-cfm-val]")) {
        const boxes = [...colMenu.querySelectorAll("[data-cfm-val]")];
        const allBox = colMenu.querySelector("[data-cfm-all]");
        if (allBox) allBox.checked = boxes.length > 0 && boxes.every(b => b.checked);
      }
    });
    colMenu.querySelectorAll("[data-sort]").forEach(btn => {
      btn.addEventListener("click", () => {
        const dir = btn.dataset.sort;
        const same = state.sort && state.sort.key === colMenuCol && state.sort.dir === dir;
        state.sort = same ? { key: null, dir: "" } : { key: colMenuCol, dir };
        closeColMenu();
        renderCampers();
      });
    });
    return colMenu;
  }

  function openColMenu(key, btn) {
    if (!CAMPER_COLUMNS[key]) return;
    if (colMenu && colMenu.classList.contains("show") && colMenuCol === key) {
      closeColMenu();
      return;
    }
    ensureColMenu();
    colMenuCol = key;
    const selected = Array.isArray(state.colFilters[key]) ? new Set(state.colFilters[key]) : null;
    const entries = columnValueEntries(key);
    const valuesEl = colMenu.querySelector("[data-cfm-values]");
    colMenu.querySelector("[data-cfm-search]").value = "";
    const rows = entries.map(entry => `
      <label class="cfm-item" data-text="${escapeHtml(normText(entry.display))}">
        <input type="checkbox" data-cfm-val value="${escapeHtml(entry.key)}"${!selected || selected.has(entry.key) ? " checked" : ""} />
        <span>${escapeHtml(entry.display)}</span>
      </label>`).join("");
    const allChecked = !selected || (entries.length > 0 && entries.every(e => selected.has(e.key)));
    valuesEl.innerHTML = `
      <label class="cfm-item cfm-all"><input type="checkbox" data-cfm-all${allChecked ? " checked" : ""} /> <strong>Seleccionar todo</strong></label>
      ${rows || '<div class="cfm-empty">Sin valores</div>'}`;
    colMenu.querySelectorAll("[data-sort]").forEach(b => {
      b.classList.toggle("active", !!state.sort && state.sort.key === key && state.sort.dir === b.dataset.sort);
    });
    colMenu.classList.add("show");
    const rect = btn.getBoundingClientRect();
    const mw = Math.min(colMenu.offsetWidth || 270, window.innerWidth - 16);
    let left = rect.left;
    if (left + mw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - mw - 8);
    colMenu.style.left = left + "px";
    const mh = colMenu.offsetHeight;
    let top = rect.bottom + 4;
    if (top + mh > window.innerHeight - 8 && rect.top - mh - 4 > 8) top = rect.top - mh - 4;
    colMenu.style.top = Math.max(8, top) + "px";
    colMenu.style.maxHeight = Math.min(420, window.innerHeight - 16) + "px";
  }

  function filterMenuValues() {
    if (!colMenu) return;
    const q = normText(colMenu.querySelector("[data-cfm-search]").value);
    colMenu.querySelectorAll(".cfm-item[data-text]").forEach(el => {
      el.style.display = !q || el.dataset.text.includes(q) ? "" : "none";
    });
  }

  function applyColMenu() {
    if (!colMenuCol) return;
    const key = colMenuCol;
    const boxes = [...colMenu.querySelectorAll("[data-cfm-val]")];
    const checked = boxes.filter(b => b.checked).map(b => b.value);
    if (boxes.length === 0 || checked.length === boxes.length) delete state.colFilters[key];
    else state.colFilters[key] = checked;
    closeColMenu();
    renderCampers();
  }

  function clearColMenu() {
    if (colMenuCol) delete state.colFilters[colMenuCol];
    closeColMenu();
    renderCampers();
  }

  function closeColMenu() {
    if (colMenu) colMenu.classList.remove("show");
    colMenuCol = null;
  }

  function clearAllCampersFilters() {
    state.colFilters = {};
    state.sort = { key: null, dir: "" };
    const fieldEl = document.getElementById("generalFilterField");
    const valueEl = document.getElementById("generalFilterValue");
    if (fieldEl) fieldEl.value = "";
    if (valueEl) valueEl.value = "";
    renderCampers();
  }

  function updateColFilterButtons() {
    document.querySelectorAll(".col-filter-btn").forEach(btn => {
      const key = btn.dataset.col;
      const filtered = Array.isArray(state.colFilters[key]);
      const sorted = !!state.sort && state.sort.key === key && !!state.sort.dir;
      btn.classList.toggle("active", filtered);
      btn.classList.toggle("sorted", sorted);
      btn.textContent = sorted ? (state.sort.dir === "asc" ? "▲" : "▼") : "▾";
      btn.title = (filtered ? "Filtro activo" : "Filtrar") + " · " + (sorted ? "orden " + (state.sort.dir === "asc" ? "ascendente" : "descendente") : "sin orden");
    });
  }

  function renderCampers() {
    updateColFilterButtons();
    state.filtered = filteredCampers();
    const tbody = document.getElementById("campersTbody");
    tbody.innerHTML = "";
    state.filtered.forEach((c, idx) => {
      const paid = paidFor(c.id);
      const price = effectivePriceFor(c);
      const due = saldoForCamper(c);
      const settled = settledFor(c);
      const cat = c.category || (state.hasCategory ? "Acampante" : "");
      let catCell;
      if (state.hasCategory) {
        catCell = `<select class="cat-select" data-cat="${c.id}" aria-label="Categoría de ${escapeHtml(nameOf(c))}">
          <option value="Acampante"${cat === "Equipo" ? "" : " selected"}>Acampante</option>
          <option value="Equipo"${cat === "Equipo" ? " selected" : ""}>Equipo</option>
        </select>`;
      } else {
        catCell = cat
          ? `<span class="cat-badge ${cat === "Equipo" ? "cat-team" : "cat-camper"}">${escapeHtml(cat)}</span>`
          : '<span class="muted">—</span>';
      }
      let priceCell;
      if (state.hasCustomPrice) {
        const cp = customPriceOf(c);
        priceCell = `<span class="price-edit">
          <input type="number" class="price-input" data-price="${c.id}" min="0" step="any" inputmode="numeric"
            value="${price}" title="Valor final del campamento" aria-label="Valor final de ${escapeHtml(nameOf(c))}" />
          ${cp !== null ? `<button type="button" class="btn small icon-action" data-resetprice="${c.id}" title="Usar precio general" aria-label="Usar precio general">↺</button>` : ""}
        </span>`;
      } else {
        priceCell = `<span class="amount">${money(price)}</span>`;
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="row-num">${idx + 1}</td>
        <td><strong>${escapeHtml(nameOf(c))}</strong></td>
        <td>${catCell}</td>
        <td>${escapeHtml(c.dni || "-")}</td>
        <td>${ageAt(c.birth_date, cfg.CAMP_DATE)}</td>
        <td>${escapeHtml(c.phone || "-")}</td>
        <td>${escapeHtml(c.email || "-")}</td>
        <td>${escapeHtml(c.church || "-")}</td>
        <td class="price-cell">${priceCell}</td>
        <td><span class="amount">${money(paid)}</span></td>
        <td class="${due > 0 ? "due" : "ok"}">${settled ? '<span class="saldado">Saldado</span>' : '<span class="amount">' + money(due) + '</span>'}</td>
        <td class="actions">
          <button class="btn small icon-action" data-action="edit" data-id="${c.id}" title="Editar" aria-label="Editar">✏️</button>
          <button class="btn small icon-action" data-action="payments" data-id="${c.id}" title="Pagos" aria-label="Pagos">💳</button>
          <button class="btn small danger icon-action" data-action="delete" data-id="${c.id}" title="Eliminar" aria-label="Eliminar">🗑️</button>
        </td>`;
      tbody.appendChild(tr);

      const catSel = tr.querySelector("[data-cat]");
      if (catSel) catSel.addEventListener("change", () => saveCategory(c.id, catSel.value));
      const priceInput = tr.querySelector("[data-price]");
      if (priceInput) {
        priceInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); priceInput.blur(); }
        });
        priceInput.addEventListener("change", () => saveCustomPrice(c.id, priceInput.value));
      }
      const resetBtn = tr.querySelector("[data-resetprice]");
      if (resetBtn) resetBtn.addEventListener("click", () => saveCustomPrice(c.id, ""));
    });
    const emptyEl = document.getElementById("campersEmpty");
    emptyEl.textContent = state.campers.length === 0 ? "No hay acampantes cargados." : "Sin resultados para los filtros.";
    emptyEl.classList.toggle("show", state.filtered.length === 0);

    // attach handlers via delegation (avoid rebind)
    tbody.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === "edit") openCamperModal(id);
        if (action === "payments") openPaymentsModal(id);
        if (action === "delete") deleteCamper(id);
      });
    });
  }

  async function saveCategory(id, value) {
    if (!supabase) { toast("Configurá Supabase primero", "danger"); return; }
    const { error } = await supabase.from("campers").update({ category: value }).eq("id", id);
    if (error) { toast("Error guardando categoría: " + error.message, "danger"); renderCampers(); return; }
    const c = state.campers.find(x => x.id === id);
    if (c) c.category = value;
    renderCampers();
    renderDashboard();
    toast("Categoría actualizada");
  }

  async function saveCustomPrice(id, raw) {
    if (!supabase) { toast("Configurá Supabase primero", "danger"); return; }
    const trimmed = String(raw == null ? "" : raw).trim();
    let value = null;
    if (trimmed !== "") {
      value = Number(trimmed.replace(",", "."));
      if (!isFinite(value) || value < 0) {
        toast("Valor final inválido", "danger");
        renderCampers();
        return;
      }
    }
    const { error } = await supabase.from("campers").update({ custom_price: value }).eq("id", id);
    if (error) { toast("Error guardando valor final: " + error.message, "danger"); renderCampers(); return; }
    const c = state.campers.find(x => x.id === id);
    if (c) c.custom_price = value;
    renderAll();
    toast(value === null ? "Valor final restablecido al precio general" : "Valor final actualizado");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  function openCamperModal(id) {
    const title = document.getElementById("camperModalTitle");
    document.getElementById("camperForm").reset();
    document.getElementById("camperId").value = "";
    if (id) {
      const c = state.campers.find(x => x.id === id);
      title.textContent = "Editar acampante";
      document.getElementById("camperId").value = c.id;
      document.getElementById("lastName").value = c.last_name || "";
      document.getElementById("firstName").value = c.first_name || "";
      document.getElementById("dni").value = c.dni || "";
      document.getElementById("birthDate").value = c.birth_date || "";
      document.getElementById("phone").value = c.phone || "";
      document.getElementById("email").value = c.email || "";
      document.getElementById("church").value = c.church || "";
      document.getElementById("category").value = c.category || "Acampante";
      document.getElementById("customPrice").value = c.custom_price != null ? c.custom_price : "";
    } else {
      title.textContent = "Agregar acampante";
    }
    openModal("camperModalBackdrop");
  }

  async function onSaveCamper(e) {
    e.preventDefault();
    const id = document.getElementById("camperId").value;
    const payload = {
      last_name: document.getElementById("lastName").value.trim(),
      first_name: document.getElementById("firstName").value.trim(),
      dni: document.getElementById("dni").value.trim() || null,
      birth_date: document.getElementById("birthDate").value || null,
      phone: document.getElementById("phone").value.trim() || null,
      email: document.getElementById("email").value.trim() || null,
      church: document.getElementById("church").value.trim() || null,
    };
    if (state.hasCategory) payload.category = document.getElementById("category").value;
    if (state.hasCustomPrice) {
      const rawPrice = document.getElementById("customPrice").value.trim();
      if (rawPrice === "") {
        payload.custom_price = null;
      } else {
        const priceValue = Number(rawPrice.replace(",", "."));
        if (!isFinite(priceValue) || priceValue < 0) {
          toast("Valor final inválido", "danger");
          return;
        }
        payload.custom_price = priceValue;
      }
    }
    if (!supabase) { toast("Configurá Supabase primero", "danger"); return; }
    let res;
    if (id) {
      res = await supabase.from("campers").update(payload).eq("id", id).select();
    } else {
      res = await supabase.from("campers").insert(payload).select();
    }
    if (res.error) { toast("Error guardando: " + res.error.message, "danger"); return; }
    await loadCampers();
    await loadPayments();
    renderAll();
    closeModal("camperModalBackdrop");
    if (state.hasCategory !== false && state.hasCustomPrice !== false) {
      toast(id ? "Acampante actualizado" : "Acampante agregado");
    } else {
      toast("Guardado, pero faltan habilitar campos en Supabase (ver schema.sql)", "danger");
    }
  }

  async function deleteCamper(id) {
    if (!confirm("¿Eliminar este acampante y sus pagos?")) return;
    if (!supabase) { toast("Configurá Supabase primero", "danger"); return; }
    const { error } = await supabase.from("campers").delete().eq("id", id);
    if (error) { toast("Error eliminando: " + error.message, "danger"); return; }
    await loadCampers();
    await loadPayments();
    renderAll();
    toast("Acampante eliminado");
  }

  // ---------- payments modal per camper ----------
  function openPaymentsModal(camperId) {
    const c = state.campers.find(x => x.id === camperId);
    document.getElementById("paymentsModalTitle").textContent = "Pagos - " + nameOf(c);
    document.getElementById("payCamperId").value = camperId;
    document.getElementById("paymentFormInline").reset();
    document.getElementById("payDate").value = todayISO();
    renderCamperPayments(camperId);
    openModal("paymentsModalBackdrop");
  }
  function renderCamperPayments(camperId) {
    const list = paymentsFor(camperId).sort((a,b) => (b.payment_date||"").localeCompare(a.payment_date||""));
    const paid = list.reduce((s,p)=>s+Number(p.amount||0),0);
    const c = state.campers.find(x => x.id === camperId);
    const rp = effectivePriceFor(c);
    const due = Math.max(0, rp - paid);
    const custom = customPriceOf(c) !== null;
    document.getElementById("balanceBox").innerHTML = `
      <div><div class="bb-label">Precio aplicable${custom ? " (personalizado)" : ""}</div><div class="bb-value">${money(rp)}</div></div>
      <div><div class="bb-label">Pagado</div><div class="bb-value">${money(paid)}</div></div>
      <div><div class="bb-label">Saldo</div><div class="bb-value">${money(due)}</div></div>`;
    const tbody = document.getElementById("camperPaymentsTbody");
    tbody.innerHTML = "";
    list.forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(p.payment_date)}</td>
        <td>${escapeHtml(p.payment_mode || "-")}</td>
        <td><span class="amount">${money(p.amount)}</span></td>
        <td>${escapeHtml(p.note || "")}</td>
        <td><button class="btn small danger icon-action" data-del="${p.id}" title="Eliminar" aria-label="Eliminar">🗑️</button></td>`;
      tbody.appendChild(tr);
      tr.querySelector("button").addEventListener("click", () => deletePayment(p.id, camperId));
    });
  }
  async function onSaveInlinePayment(e) {
    e.preventDefault();
    const camperId = document.getElementById("payCamperId").value;
    const payload = {
      camper_id: camperId,
      amount: Number(document.getElementById("payAmount").value),
      payment_mode: document.getElementById("payMode").value,
      payment_date: document.getElementById("payDate").value || todayISO(),
      note: document.getElementById("payNote").value.trim() || null,
    };
    if (!supabase) { toast("Configurá Supabase primero", "danger"); return; }
    const { error } = await supabase.from("payments").insert(payload);
    if (error) { toast("Error guardando pago: " + error.message, "danger"); return; }
    await loadPayments();
    renderCamperPayments(camperId);
    renderAll();
    document.getElementById("paymentFormInline").reset();
    document.getElementById("payDate").value = todayISO();
    toast("Pago agregado");
  }

  // ---------- global payments ----------
  function openGlobalPaymentModal(camperId) {
    const sel = document.getElementById("gpCamper");
    sel.innerHTML = "";
    [...state.campers].sort((a,b)=>nameOf(a).localeCompare(nameOf(b))).forEach(c => {
      const o = document.createElement("option");
      o.value = c.id; o.textContent = nameOf(c);
      sel.appendChild(o);
    });
    document.getElementById("globalPaymentForm").reset();
    document.getElementById("gpDate").value = todayISO();
    if (camperId) document.getElementById("gpCamper").value = camperId;
    openModal("globalPaymentModalBackdrop");
  }
  async function onSaveGlobalPayment(e) {
    e.preventDefault();
    const payload = {
      camper_id: document.getElementById("gpCamper").value,
      amount: Number(document.getElementById("gpAmount").value),
      payment_mode: document.getElementById("gpMode").value,
      payment_date: document.getElementById("gpDate").value || todayISO(),
      note: document.getElementById("gpNote").value.trim() || null,
    };
    if (!supabase) { toast("Configurá Supabase primero", "danger"); return; }
    const { error } = await supabase.from("payments").insert(payload);
    if (error) { toast("Error guardando pago: " + error.message, "danger"); return; }
    await loadPayments();
    renderAll();
    closeModal("globalPaymentModalBackdrop");
    toast("Pago agregado");
  }

  function filteredPayments() {
    const dateQ = (document.getElementById("fPayDate")?.value || "").toLowerCase().trim();
    const camperQ = (document.getElementById("fPayCamper")?.value || "").toLowerCase().trim();
    const modeQ = (document.getElementById("fPayMode")?.value || "").trim();
    const amountQ = (document.getElementById("fPayAmount")?.value || "").toLowerCase().trim();
    const noteQ = (document.getElementById("fPayNote")?.value || "").toLowerCase().trim();
    return state.payments.filter(p => {
      const c = state.campers.find(x => x.id === p.camper_id);
      const name = c ? nameOf(c) : "(eliminado)";
      if (dateQ && !formatDate(p.payment_date).toLowerCase().includes(dateQ) && !(p.payment_date || "").toLowerCase().includes(dateQ)) return false;
      if (camperQ && !name.toLowerCase().includes(camperQ)) return false;
      if (modeQ && (p.payment_mode || "").toLowerCase() !== modeQ.toLowerCase()) return false;
      if (amountQ && !String(p.amount).includes(amountQ) && !money(p.amount).toLowerCase().includes(amountQ)) return false;
      if (noteQ && !(p.note || "").toLowerCase().includes(noteQ)) return false;
      return true;
    });
  }
  function renderGroupedPayments(list) {
    const box = document.getElementById("paymentsGrouped");
    box.innerHTML = "";
    if (!list.length) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    const byCamper = new Map();
    list.forEach(p => {
      if (!byCamper.has(p.camper_id)) byCamper.set(p.camper_id, []);
      byCamper.get(p.camper_id).push(p);
    });
    [...byCamper.entries()].sort((a,b) => {
      const ca = state.campers.find(x=>x.id===a[0]); const cb = state.campers.find(x=>x.id===b[0]);
      return nameOf(ca||{}).localeCompare(nameOf(cb||{}));
    }).forEach(([camperId, pays]) => {
      const c = state.campers.find(x=>x.id===camperId);
      const total = pays.reduce((s,p)=>s+Number(p.amount||0),0);
      const card = document.createElement("div");
      card.className = "person-card";
      const prows = pays.sort((a,b)=>(b.payment_date||"").localeCompare(a.payment_date||"")).map(p => `
        <tr>
          <td>${formatDate(p.payment_date)}</td>
          <td>${escapeHtml(p.payment_mode || "-")}</td>
          <td><span class="amount">${money(p.amount)}</span></td>
          <td>${escapeHtml(p.note || "")}</td>
          <td class="actions">
            <button class="btn small icon-action" data-addpay="${p.camper_id}" title="Otro pago" aria-label="Otro pago">➕</button>
            <button class="btn small danger icon-action" data-del="${p.id}" title="Eliminar" aria-label="Eliminar">🗑️</button>
          </td>
        </tr>`).join("");
      card.innerHTML = `
        <div class="person-header">
          <strong>${escapeHtml(c ? nameOf(c) : "(eliminado)")}</strong>
          <span class="person-total">${money(total)}</span>
        </div>
        <table class="mini-table">
          <thead><tr><th>Fecha</th><th>Modo</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
          <tbody>${prows}</tbody>
        </table>`;
      box.appendChild(card);
    });
  }
  function renderPayments() {
    const tbody = document.getElementById("paymentsTbody");
    const tableWrap = document.getElementById("paymentsTableWrap");
    tbody.innerHTML = "";
    const list = filteredPayments().sort((a,b)=>(b.payment_date||"").localeCompare(a.payment_date||""));
    const box = document.getElementById("paymentsGrouped");
    if (state.payView === "grouped") {
      tableWrap.classList.add("hidden");
      renderGroupedPayments(list);
    } else {
      tableWrap.classList.remove("hidden");
      box.classList.add("hidden");
    }
    if (state.payView !== "grouped") {
      list.forEach(p => {
        const c = state.campers.find(x => x.id === p.camper_id);
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${formatDate(p.payment_date)}</td>
          <td>${escapeHtml(c ? nameOf(c) : "(eliminado)")}</td>
          <td>${escapeHtml(p.payment_mode || "-")}</td>
          <td><span class="amount">${money(p.amount)}</span></td>
          <td>${escapeHtml(p.note || "")}</td>
          <td class="actions">
            <button class="btn small icon-action" data-addpay="${p.camper_id}" title="Otro pago" aria-label="Otro pago">➕</button>
            <button class="btn small danger icon-action" data-del="${p.id}" title="Eliminar" aria-label="Eliminar">🗑️</button>
          </td>`;
        tbody.appendChild(tr);
        const addBtn = tr.querySelector("[data-addpay]");
        if (addBtn && p.camper_id) addBtn.addEventListener("click", () => openGlobalPaymentModal(p.camper_id));
        const delBtn = tr.querySelector("[data-del]");
        if (delBtn) delBtn.addEventListener("click", () => deletePayment(p.id));
      });
    }
    const emptyEl = document.getElementById("paymentsEmpty");
    if (state.payments.length === 0) { emptyEl.textContent = "No hay pagos registrados."; emptyEl.classList.add("show"); }
    else { emptyEl.textContent = "Sin resultados para los filtros."; emptyEl.classList.toggle("show", list.length === 0); }
  }

  async function deletePayment(id, camperId) {
    if (!confirm("¿Eliminar este pago?")) return;
    if (!supabase) { toast("Configurá Supabase primero", "danger"); return; }
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) { toast("Error eliminando pago: " + error.message, "danger"); return; }
    await loadPayments();
    if (camperId) renderCamperPayments(camperId);
    renderAll();
    toast("Pago eliminado");
  }

  // ---------- dashboard ----------
  // ---------- exportar PDF ----------
  function printStyles() {
    return `
      body { font-family: "Inter", system-ui, Arial, sans-serif; margin: 24px; color: #1f1214; }
      h1 { color: #cc0000; margin-bottom: 4px; }
      p { color: #6b555a; font-size: 12px; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
      th { background: #cc0000; color: #fff; }
      tr:nth-child(even) { background: #fff5f5; }
      .saldado { color: #15803d; font-weight: 700; }
      .amount { font-weight: 600; }
      @media print { body { margin: 12px; } }
    `;
  }
  function openPrintWindow(title, bodyHtml) {
    const win = window.open("", "_blank");
    if (!win) { toast("Habilitá ventanas emergentes para exportar PDF", "danger"); return; }
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${printStyles()}</style></head><body>${bodyHtml}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  }
  function exportCampersPDF() {
    const rows = filteredCampers();
    const trs = rows.map((c, idx) => {
      const paid = paidFor(c.id);
      const price = effectivePriceFor(c);
      const due = saldoForCamper(c);
      const saldoCell = settledFor(c) ? '<span class="saldado">Saldado</span>' : money(due);
      const cat = c.category || (state.hasCategory ? "Acampante" : "-");
      return `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(nameOf(c))}</td>
        <td>${escapeHtml(cat)}</td>
        <td>${escapeHtml(c.dni || "-")}</td>
        <td>${ageAt(c.birth_date, cfg.CAMP_DATE)}</td>
        <td>${escapeHtml(c.phone || "-")}</td>
        <td>${escapeHtml(c.email || "-")}</td>
        <td>${escapeHtml(c.church || "-")}</td>
        <td class="amount">${money(price)}</td>
        <td class="amount">${money(paid)}</td>
        <td>${saldoCell}</td>
      </tr>`;
    }).join("");
    const totalPaid = rows.reduce((s, c) => s + paidFor(c.id), 0);
    const body = `
      <h1>Acampantes</h1>
      <p>Generado el ${formatDate(todayISO())} · Total: ${rows.length} acampantes</p>
      <table>
        <thead><tr>
          <th>#</th><th>Apellido y Nombre</th><th>Categoría</th><th>DNI</th><th>Edad</th><th>Celular</th><th>Mail</th><th>Iglesia</th><th>Valor final</th><th>Pagado</th><th>Saldo</th>
        </tr></thead>
        <tbody>${trs}</tbody>
      </table>
      <p style="margin-top:12px;"><strong>Total recaudado:</strong> ${money(totalPaid)}</p>
    `;
    openPrintWindow("Acampantes - PDF", body);
  }
  function exportPaymentsPDF() {
    const list = filteredPayments().sort((a, b) => (b.payment_date || "").localeCompare(a.payment_date || ""));
    const trs = list.map(p => {
      const c = state.campers.find(x => x.id === p.camper_id);
      return `<tr>
        <td>${formatDate(p.payment_date)}</td>
        <td>${escapeHtml(c ? nameOf(c) : "(eliminado)")}</td>
        <td>${escapeHtml(p.payment_mode || "-")}</td>
        <td class="amount">${money(p.amount)}</td>
        <td>${escapeHtml(p.note || "")}</td>
      </tr>`;
    }).join("");
    const total = list.reduce((s, p) => s + Number(p.amount || 0), 0);
    const body = `
      <h1>Pagos</h1>
      <p>Generado el ${formatDate(todayISO())} · Total: ${list.length} pagos</p>
      <table>
        <thead><tr>
          <th>Fecha</th><th>Acampante</th><th>Modo</th><th>Monto</th><th>Nota</th>
        </tr></thead>
        <tbody>${trs}</tbody>
      </table>
      <p style="margin-top:12px;"><strong>Total recaudado:</strong> ${money(total)}</p>
    `;
    openPrintWindow("Pagos - PDF", body);
  }

  function renderDashboard() {
    const totalPaid = state.payments.reduce((s,p)=>s+Number(p.amount||0),0);
    const expected = state.campers.reduce((s,c)=>s+effectivePriceFor(c),0);
    const totalDue = state.campers.reduce((s,c)=>s+saldoForCamper(c),0);
    document.getElementById("statCampers").textContent = state.campers.length;
    document.getElementById("statPaid").textContent = money(totalPaid);
    document.getElementById("statExpected").textContent = money(expected);
    document.getElementById("statDue").textContent = money(totalDue);
  }
})();
