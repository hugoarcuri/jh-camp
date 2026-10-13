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
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function toast(msg, kind) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    t.classList.add("show");
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.classList.add("hidden"), 200); }, 2800);
  }
  function currentPrice() {
    const now = new Date();
    for (const tier of (cfg.PRICE_TIERS || [])) {
      if (now <= new Date(tier.until + "T23:59:59")) return tier.price;
    }
    const last = (cfg.PRICE_TIERS || []).slice(-1)[0];
    return last ? last.price : 0;
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
  function isSettled(paid) { return paid >= (cfg.FIRST_TIER_PRICE || 0); }
  function requiredPrice(paid) {
    const lp = lockedPrice(paid);
    return lp !== null ? lp : currentPrice();
  }
  function saldoFor(paid) {
    if (isSettled(paid)) return 0;
    return Math.max(0, currentPrice() - paid);
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
    let initialTheme = "light";
    try { initialTheme = localStorage.getItem("jh-theme") || initialTheme; } catch(e){}
    if (!initialTheme && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) initialTheme = "dark";
    applyTheme(initialTheme);
    themeToggle.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      applyTheme(cur === "dark" ? "light" : "dark");
    });

    // price badge
    state.currentPrice = currentPrice();
    document.getElementById("priceValue").textContent = money(state.currentPrice) +
      " (campamento " + cfg.CAMP_DATE + ")";

    // button handlers
    document.getElementById("btnAddCamper").addEventListener("click", () => openCamperModal());
    document.getElementById("camperForm").addEventListener("submit", onSaveCamper);
    document.getElementById("paymentFormInline").addEventListener("submit", onSaveInlinePayment);
    document.getElementById("btnAddPayment").addEventListener("click", () => openGlobalPaymentModal());
    document.getElementById("globalPaymentForm").addEventListener("submit", onSaveGlobalPayment);
    document.getElementById("searchInput").addEventListener("input", renderCampers);

    init();
  });

  async function init() {
    if (!supabase) { renderAll(); return; }
    await Promise.all([loadCampers(), loadPayments()]);
    renderAll();
  }

  async function loadCampers() {
    const { data, error } = await supabase.from("campers").select("*").order("last_name", { ascending: true });
    if (error) { toast("Error cargando acampantes: " + error.message, "danger"); return; }
    state.campers = data || [];
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
  function renderCampers() {
    const q = (document.getElementById("searchInput").value || "").toLowerCase().trim();
    state.filtered = state.campers.filter(c => {
      if (!q) return true;
      return [c.last_name, c.first_name, c.dni, c.church, c.email, c.phone].some(v => (v || "").toLowerCase().includes(q));
    });
    const tbody = document.getElementById("campersTbody");
    tbody.innerHTML = "";
    state.filtered.forEach((c, idx) => {
      const paid = paidFor(c.id);
      const due = saldoFor(paid);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="row-num">${idx + 1}</td>
        <td><strong>${escapeHtml(nameOf(c))}</strong></td>
        <td>${escapeHtml(c.dni || "-")}</td>
        <td>${ageAt(c.birth_date, cfg.CAMP_DATE)}</td>
        <td>${escapeHtml(c.phone || "-")}</td>
        <td>${escapeHtml(c.email || "-")}</td>
        <td>${escapeHtml(c.church || "-")}</td>
        <td>${money(paid)}</td>
        <td class="${due > 0 ? "due" : "ok"}">${isSettled(paid) ? '<span class="saldado">Saldado</span>' : money(due)}</td>
        <td class="actions">
          <button class="btn small icon-action" data-action="edit" data-id="${c.id}" title="Editar" aria-label="Editar">✏️</button>
          <button class="btn small icon-action" data-action="payments" data-id="${c.id}" title="Pagos" aria-label="Pagos">💳</button>
          <button class="btn small danger icon-action" data-action="delete" data-id="${c.id}" title="Eliminar" aria-label="Eliminar">🗑️</button>
        </td>`;
      tbody.appendChild(tr);
    });
    document.getElementById("campersEmpty").classList.toggle("show", state.filtered.length === 0);

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
    toast(id ? "Acampante actualizado" : "Acampante agregado");
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
    const due = saldoFor(paid);
    const rp = requiredPrice(paid);
    document.getElementById("balanceBox").innerHTML = `
      <div><div class="bb-label">Precio aplicable</div><div class="bb-value">${money(rp)}</div></div>
      <div><div class="bb-label">Pagado</div><div class="bb-value">${money(paid)}</div></div>
      <div><div class="bb-label">Saldo</div><div class="bb-value">${money(Math.max(0,due))}${due<0?" (a favor)":""}</div></div>`;
    const tbody = document.getElementById("camperPaymentsTbody");
    tbody.innerHTML = "";
    list.forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(p.payment_date || "-")}</td>
        <td>${escapeHtml(p.payment_mode || "-")}</td>
        <td>${money(p.amount)}</td>
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
  function openGlobalPaymentModal() {
    const sel = document.getElementById("gpCamper");
    sel.innerHTML = "";
    state.campers.sort((a,b)=>nameOf(a).localeCompare(nameOf(b))).forEach(c => {
      const o = document.createElement("option");
      o.value = c.id; o.textContent = nameOf(c);
      sel.appendChild(o);
    });
    document.getElementById("globalPaymentForm").reset();
    document.getElementById("gpDate").value = todayISO();
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

  function renderPayments() {
    const tbody = document.getElementById("paymentsTbody");
    tbody.innerHTML = "";
    const list = [...state.payments].sort((a,b)=>(b.payment_date||"").localeCompare(a.payment_date||""));
    list.forEach(p => {
      const c = state.campers.find(x => x.id === p.camper_id);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(p.payment_date || "-")}</td>
        <td>${escapeHtml(c ? nameOf(c) : "(eliminado)")}</td>
        <td>${escapeHtml(p.payment_mode || "-")}</td>
        <td>${money(p.amount)}</td>
        <td>${escapeHtml(p.note || "")}</td>
        <td><button class="btn small danger icon-action" data-del="${p.id}" title="Eliminar" aria-label="Eliminar">🗑️</button></td>`;
      tbody.appendChild(tr);
      tr.querySelector("button").addEventListener("click", () => deletePayment(p.id));
    });
    document.getElementById("paymentsEmpty").classList.toggle("show", list.length === 0);
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
  function renderDashboard() {
    const totalPaid = state.payments.reduce((s,p)=>s+Number(p.amount||0),0);
    const expected = state.campers.reduce((s,c)=>s+requiredPrice(paidFor(c.id)),0);
    const totalDue = state.campers.reduce((s,c)=>s+saldoFor(paidFor(c.id)),0);
    document.getElementById("statCampers").textContent = state.campers.length;
    document.getElementById("statPaid").textContent = money(totalPaid);
    document.getElementById("statExpected").textContent = money(expected);
    document.getElementById("statDue").textContent = money(totalDue);
  }
})();
