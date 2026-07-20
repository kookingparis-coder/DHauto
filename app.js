const GARAGE = {
  name: "DHauto",
  legalForm: "SASU",
  address: "20-22 rue de Méru",
  zip: "60570",
  city: "Andéville",
  phone: "03 44 07 12 24",
  email: "dh.auto84@gmail.com",
  siret: "10551282600014",
  tvaIntra: "FR39105512826",
  tvaRate: 0.2,
};

const SERVICES = [
  "Révision complète",
  "Vidange moteur + filtre à huile",
  "Remplacement filtres (air / habitacle / carburant)",
  "Freinage — plaquettes",
  "Freinage — disques + plaquettes",
  "Freinage — liquide de frein",
  "Pneumatiques — montage / équilibrage",
  "Pneumatiques — permutation",
  "Géométrie / parallélisme",
  "Diagnostic électronique",
  "Contrôle pré-visite technique",
  "Batterie — diagnostic / remplacement",
  "Démarreur",
  "Alternateur",
  "Embrayage",
  "Kit de distribution",
  "Courroie d'accessoires",
  "Pompe à eau",
  "Système de refroidissement / radiateur",
  "Climatisation — recharge",
  "Climatisation — diagnostic / réparation",
  "Échappement",
  "Amortisseurs",
  "Rotules / triangles / silentblocs",
  "Direction assistée",
  "Cardans",
  "Boîte de vitesses",
  "Turbo",
  "Injecteurs / rampe d'injection",
  "Fap / vanne EGR",
  "Éclairage / optique",
  "Électricité / faisceau",
  "Pare-brise / vitrage",
  "Essuie-glaces",
  "Carrosserie — réparation",
  "Peinture",
  "Débosselage",
  "Polissage / lustrage",
  "Nettoyage intérieur / extérieur",
  "Remorquage / dépannage",
  "Main d'œuvre",
  "Fourniture de pièces",
  "Divers / autre prestation",
];

const STORAGE_KEY = "dhauto_invoices_v1";
const PIN_KEY = "dhauto_pin_v1";
const SESSION_KEY = "dhauto_unlocked";

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const dateFr = (iso) =>
  new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

function loadInvoices() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveInvoices(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function nextInvoiceNumber(list = loadInvoices()) {
  const year = new Date().getFullYear();
  const prefix = `FA-${year}-`;
  const nums = list
    .map((inv) => inv.number)
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

function money(n) {
  return euro.format(Number(n) || 0);
}

function calcTotals(ht) {
  const amountHt = Math.round((Number(ht) || 0) * 100) / 100;
  const tva = Math.round(amountHt * GARAGE.tvaRate * 100) / 100;
  const ttc = Math.round((amountHt + tva) * 100) / 100;
  return { amountHt, tva, ttc };
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function serviceOptionsHtml(selected = "") {
  return SERVICES.map(
    (s) =>
      `<option value="${escapeHtml(s)}" ${s === selected ? "selected" : ""}>${escapeHtml(s)}</option>`
  ).join("");
}

function normalizeInvoice(data) {
  if (!data) return data;
  let lines = Array.isArray(data.lines) ? data.lines : null;
  if (!lines || !lines.length) {
    const totals = calcTotals(data.amountHt);
    lines = [
      {
        service: data.service || "Prestation",
        serviceDetail: data.serviceDetail || "",
        ...totals,
      },
    ];
  } else {
    lines = lines.map((line) => {
      const totals = calcTotals(line.amountHt);
      return {
        service: line.service || "Prestation",
        serviceDetail: line.serviceDetail || "",
        ...totals,
      };
    });
  }

  const amountHt = Math.round(lines.reduce((s, l) => s + l.amountHt, 0) * 100) / 100;
  const tva = Math.round(lines.reduce((s, l) => s + l.tva, 0) * 100) / 100;
  const ttc = Math.round(lines.reduce((s, l) => s + l.ttc, 0) * 100) / 100;
  const service = lines.map((l) => l.service).join(" · ");

  return { ...data, lines, amountHt, tva, ttc, service };
}

function renderInvoiceHtml(data) {
  const inv = normalizeInvoice(data);
  const vehicleBits = [
    inv.carBrand,
    inv.carModel,
    inv.carPlate ? `immat. ${inv.carPlate}` : "",
    inv.carKm ? `${Number(inv.carKm).toLocaleString("fr-FR")} km` : "",
  ].filter(Boolean);

  const rows = inv.lines
    .map((line) => {
      const detail = line.serviceDetail
        ? `<br><span style="color:#555">${escapeHtml(line.serviceDetail)}</span>`
        : "";
      return `
        <tr>
          <td>${escapeHtml(line.service)}${detail}</td>
          <td>1</td>
          <td>${money(line.amountHt)}</td>
        </tr>`;
    })
    .join("");

  const notes = inv.notes
    ? `<p><strong>Observations :</strong> ${escapeHtml(inv.notes)}</p>`
    : "";

  return `
    <article class="invoice">
      <div class="invoice-top">
        <div style="display:flex;gap:14px;align-items:flex-start">
          <img class="invoice-logo" src="assets/logo.png" alt="Logo DHauto" />
          <div class="invoice-garage">
            <h1><span>DH</span> AUTO</h1>
            <p>
              ${GARAGE.legalForm} ${escapeHtml(GARAGE.name)}<br>
              ${escapeHtml(GARAGE.address)}<br>
              ${escapeHtml(GARAGE.zip)} ${escapeHtml(GARAGE.city)}<br>
              Tél. ${escapeHtml(GARAGE.phone)} · ${escapeHtml(GARAGE.email)}<br>
              SIRET ${escapeHtml(GARAGE.siret)} · TVA ${escapeHtml(GARAGE.tvaIntra)}
            </p>
          </div>
        </div>
        <div class="invoice-meta">
          <div class="badge">FACTURE</div>
          <div>N° <strong>${escapeHtml(inv.number)}</strong></div>
          <div>Date : ${escapeHtml(dateFr(inv.date))}</div>
        </div>
      </div>

      <div class="invoice-parties">
        <div class="party">
          <h2>Émetteur</h2>
          <p>
            <strong>${escapeHtml(GARAGE.name)}</strong><br>
            ${escapeHtml(GARAGE.address)}<br>
            ${escapeHtml(GARAGE.zip)} ${escapeHtml(GARAGE.city)}
          </p>
        </div>
        <div class="party">
          <h2>Client</h2>
          <p>
            <strong>${escapeHtml(inv.clientName)}</strong><br>
            ${escapeHtml(inv.clientAddress)}<br>
            ${escapeHtml(inv.clientZip)} ${escapeHtml(inv.clientCity)}
            ${inv.clientPhone ? `<br>Tél. ${escapeHtml(inv.clientPhone)}` : ""}
            ${inv.clientEmail ? `<br>${escapeHtml(inv.clientEmail)}` : ""}
          </p>
        </div>
      </div>

      <div class="vehicle-box">
        <strong>Véhicule :</strong> ${escapeHtml(vehicleBits.join(" · ") || "—")}
      </div>

      <table class="lines">
        <thead>
          <tr>
            <th>Désignation</th>
            <th>Qté</th>
            <th>Montant HT</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="totals">
        <div><span>Total HT</span><span>${money(inv.amountHt)}</span></div>
        <div><span>TVA (20 %)</span><span>${money(inv.tva)}</span></div>
        <div class="grand"><span>Total TTC</span><span>${money(inv.ttc)}</span></div>
      </div>

      ${notes}

      <div class="legal">
        <p><strong>Conditions de règlement :</strong> payable à réception.</p>
        <p>Pas d’escompte pour paiement anticipé.</p>
        <p>
          En cas de retard de paiement, seront exigibles une pénalité de retard calculée
          sur la base de trois fois le taux d’intérêt légal, ainsi qu’une indemnité
          forfaitaire pour frais de recouvrement de 40 € (art. L.441-10 et D.441-5 du Code de commerce).
        </p>
        <p>
          ${GARAGE.legalForm} ${escapeHtml(GARAGE.name)} — SIRET ${escapeHtml(GARAGE.siret)} —
          N° TVA ${escapeHtml(GARAGE.tvaIntra)} — TVA applicable : 20 %.
        </p>
      </div>
    </article>
  `;
}

function createServiceLine(data = {}) {
  const wrap = document.createElement("div");
  wrap.className = "service-line";
  wrap.innerHTML = `
    <div class="service-line-top">
      <strong>Prestation</strong>
      <button type="button" class="btn btn-ghost line-remove" data-action="remove-line">Supprimer</button>
    </div>
    <div class="field">
      <label>Type de prestation *</label>
      <select class="line-service" required>${serviceOptionsHtml(data.service || SERVICES[0])}</select>
    </div>
    <div class="field">
      <label>Détail (facultatif)</label>
      <input class="line-detail" type="text" placeholder="ex. plaquettes avant + disques" value="${escapeHtml(data.serviceDetail || "")}" />
    </div>
    <div class="field">
      <label>Montant HT (€) *</label>
      <input class="line-ht" type="number" min="0" step="0.01" required placeholder="0.00" value="${data.amountHt ?? ""}" />
    </div>
  `;
  return wrap;
}

function renumberLines() {
  document.querySelectorAll("#service-lines .service-line").forEach((el, i) => {
    el.querySelector(".service-line-top strong").textContent = `Prestation ${i + 1}`;
    const removeBtn = el.querySelector('[data-action="remove-line"]');
    removeBtn.style.display =
      document.querySelectorAll("#service-lines .service-line").length > 1 ? "" : "none";
  });
}

function updateLiveTotals() {
  const lines = [...document.querySelectorAll("#service-lines .service-line")];
  let amountHt = 0;
  let tva = 0;
  let ttc = 0;
  lines.forEach((el) => {
    const totals = calcTotals(el.querySelector(".line-ht").value);
    amountHt += totals.amountHt;
    tva += totals.tva;
    ttc += totals.ttc;
  });
  amountHt = Math.round(amountHt * 100) / 100;
  tva = Math.round(tva * 100) / 100;
  ttc = Math.round(ttc * 100) / 100;
  document.getElementById("live-ht").textContent = money(amountHt);
  document.getElementById("live-tva").textContent = money(tva);
  document.getElementById("live-ttc").textContent = money(ttc);
}

function readForm() {
  const lines = [...document.querySelectorAll("#service-lines .service-line")].map((el) => {
    const totals = calcTotals(el.querySelector(".line-ht").value);
    return {
      service: el.querySelector(".line-service").value,
      serviceDetail: el.querySelector(".line-detail").value.trim(),
      ...totals,
    };
  });

  const amountHt = Math.round(lines.reduce((s, l) => s + l.amountHt, 0) * 100) / 100;
  const tva = Math.round(lines.reduce((s, l) => s + l.tva, 0) * 100) / 100;
  const ttc = Math.round(lines.reduce((s, l) => s + l.ttc, 0) * 100) / 100;

  return {
    clientName: document.getElementById("client-name").value.trim(),
    clientAddress: document.getElementById("client-address").value.trim(),
    clientZip: document.getElementById("client-zip").value.trim(),
    clientCity: document.getElementById("client-city").value.trim(),
    clientPhone: document.getElementById("client-phone").value.trim(),
    clientEmail: document.getElementById("client-email").value.trim(),
    carPlate: document.getElementById("car-plate").value.trim().toUpperCase(),
    carBrand: document.getElementById("car-brand").value.trim(),
    carModel: document.getElementById("car-model").value.trim(),
    carKm: document.getElementById("car-km").value,
    lines,
    service: lines.map((l) => l.service).join(" · "),
    notes: document.getElementById("notes").value.trim(),
    date: document.getElementById("invoice-date").value,
    amountHt,
    tva,
    ttc,
  };
}

function fillForm(data) {
  const inv = normalizeInvoice(data);
  document.getElementById("client-name").value = inv.clientName || "";
  document.getElementById("client-address").value = inv.clientAddress || "";
  document.getElementById("client-zip").value = inv.clientZip || "";
  document.getElementById("client-city").value = inv.clientCity || "";
  document.getElementById("client-phone").value = inv.clientPhone || "";
  document.getElementById("client-email").value = inv.clientEmail || "";
  document.getElementById("car-plate").value = inv.carPlate || "";
  document.getElementById("car-brand").value = inv.carBrand || "";
  document.getElementById("car-model").value = inv.carModel || "";
  document.getElementById("car-km").value = inv.carKm || "";
  document.getElementById("notes").value = inv.notes || "";
  document.getElementById("invoice-date").value = inv.date || todayIso();

  const container = document.getElementById("service-lines");
  container.innerHTML = "";
  (inv.lines.length ? inv.lines : [{}]).forEach((line) => {
    container.appendChild(createServiceLine(line));
  });
  renumberLines();
  updateLiveTotals();
}

let zipLookupTimer = null;
async function lookupCityFromZip(zip) {
  const hint = document.getElementById("zip-hint");
  const cityInput = document.getElementById("client-city");
  const list = document.getElementById("city-suggestions");
  list.innerHTML = "";

  if (!/^\d{5}$/.test(zip)) {
    hint.textContent = "La ville se remplit toute seule.";
    hint.classList.remove("error-hint");
    return;
  }

  hint.textContent = "Recherche de la ville…";
  hint.classList.remove("error-hint");

  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(zip)}&fields=nom&format=json`
    );
    if (!res.ok) throw new Error("API error");
    const communes = await res.json();
    if (!Array.isArray(communes) || !communes.length) {
      hint.textContent = "Code postal inconnu — saisissez la ville à la main.";
      hint.classList.add("error-hint");
      return;
    }

    const names = [...new Set(communes.map((c) => c.nom))];
    list.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
    cityInput.value = names[0];
    hint.textContent =
      names.length > 1
        ? `${names.length} villes possibles — choisissez si besoin.`
        : "Ville remplie automatiquement.";
    hint.classList.remove("error-hint");
  } catch {
    hint.textContent = "Impossible de trouver la ville (hors ligne ?) — saisie manuelle.";
    hint.classList.add("error-hint");
  }
}

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function showInvoice(data) {
  const inv = normalizeInvoice(data);
  const sheet = document.getElementById("invoice-sheet");
  sheet.classList.remove("empty");
  sheet.innerHTML = renderInvoiceHtml(inv);
  document.getElementById("print-btn").disabled = false;
  window.__currentInvoice = inv;
}

let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();
let selectedHistoryDate = null; // "YYYY-MM-DD" or null = all

function invoicesByDateMap(list = loadInvoices()) {
  const map = new Map();
  list.forEach((inv) => {
    if (!inv.date) return;
    const arr = map.get(inv.date) || [];
    arr.push(inv);
    map.set(inv.date, arr);
  });
  return map;
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const title = document.getElementById("cal-title");
  const label = document.getElementById("cal-filter-label");
  if (!grid || !title) return;

  const byDate = invoicesByDateMap();
  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  title.textContent = monthLabel;

  // Monday-first calendar
  const firstDay = new Date(calYear, calMonth, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Sun=0 -> 6
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayIsoStr = todayIso();

  const cells = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push(`<button type="button" class="cal-day" disabled aria-hidden="true"></button>`);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const count = (byDate.get(iso) || []).length;
    const classes = [
      "cal-day",
      count ? "has-invoice" : "",
      selectedHistoryDate === iso ? "selected" : "",
      iso === todayIsoStr ? "today" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const aria = count
      ? `${day} ${monthLabel}, ${count} facture${count > 1 ? "s" : ""}`
      : `${day} ${monthLabel}`;
    cells.push(
      `<button type="button" class="${classes}" data-date="${iso}" aria-label="${escapeHtml(aria)}" ${
        selectedHistoryDate === iso ? 'aria-pressed="true"' : 'aria-pressed="false"'
      }>${day}</button>`
    );
  }

  grid.innerHTML = cells.join("");

  if (selectedHistoryDate) {
    label.textContent = `Factures du ${dateFr(selectedHistoryDate)}`;
  } else {
    label.textContent = "Toutes les factures";
  }
}

function renderHistory() {
  renderCalendar();

  const all = loadInvoices().slice().sort((a, b) => b.createdAt - a.createdAt);
  const list = selectedHistoryDate
    ? all.filter((inv) => inv.date === selectedHistoryDate)
    : all;
  const root = document.getElementById("history-list");

  if (!all.length) {
    root.innerHTML = `<div class="empty-history">Aucune facture enregistrée pour le moment.</div>`;
    return;
  }

  if (!list.length) {
    root.innerHTML = `<div class="empty-history">Aucune facture à cette date. Cliquez sur « Voir tout » ou choisissez un autre jour.</div>`;
    return;
  }

  root.innerHTML = list
    .map(
      (inv) => `
      <article class="history-item" data-id="${escapeHtml(inv.id)}">
        <div>
          <h3>${escapeHtml(inv.number)} — ${escapeHtml(inv.clientName)}</h3>
          <p>${escapeHtml(dateFr(inv.date))} · ${escapeHtml(normalizeInvoice(inv).service)} · ${escapeHtml(inv.carPlate || "")}</p>
        </div>
        <div class="amount">${money(normalizeInvoice(inv).ttc)}</div>
        <div class="item-actions">
          <button type="button" class="btn btn-secondary" data-action="open">Ouvrir</button>
          <button type="button" class="btn btn-primary" data-action="print">Imprimer</button>
          <button type="button" class="btn btn-ghost" data-action="delete">Supprimer</button>
        </div>
      </article>`
    )
    .join("");
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    const active = panel.id === `tab-${name}`;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  if (name === "history") renderHistory();
}

function unlockApp() {
  sessionStorage.setItem(SESSION_KEY, "1");
  document.getElementById("lock-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

function lockApp() {
  sessionStorage.removeItem(SESSION_KEY);
  document.getElementById("app").classList.add("hidden");
  document.getElementById("lock-screen").classList.remove("hidden");
  document.getElementById("pin-input").value = "";
  document.getElementById("lock-error").classList.add("hidden");
}

function initAuth() {
  const pin = localStorage.getItem(PIN_KEY);
  const lockScreen = document.getElementById("lock-screen");
  const lockForm = document.getElementById("lock-form");
  const setupForm = document.getElementById("setup-pin-form");

  lockScreen.classList.remove("hidden");

  if (!pin) {
    lockForm.classList.add("hidden");
    setupForm.classList.remove("hidden");
  } else if (sessionStorage.getItem(SESSION_KEY) === "1") {
    unlockApp();
  } else {
    lockForm.classList.remove("hidden");
    setupForm.classList.add("hidden");
  }

  setupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const a = document.getElementById("setup-pin").value;
    const b = document.getElementById("setup-pin-confirm").value;
    const err = document.getElementById("setup-error");
    if (a !== b || !/^\d{4,8}$/.test(a)) {
      err.textContent = !/^\d{4,8}$/.test(a)
        ? "Le code doit contenir 4 à 8 chiffres."
        : "Les codes ne correspondent pas.";
      err.classList.remove("hidden");
      return;
    }
    localStorage.setItem(PIN_KEY, a);
    unlockApp();
  });

  lockForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = document.getElementById("pin-input").value;
    if (value === localStorage.getItem(PIN_KEY)) {
      unlockApp();
    } else {
      document.getElementById("lock-error").classList.remove("hidden");
    }
  });
}

function initServices() {
  const container = document.getElementById("service-lines");
  container.innerHTML = "";
  container.appendChild(createServiceLine());
  renumberLines();
  updateLiveTotals();
}

function init() {
  initServices();
  initAuth();
  document.getElementById("invoice-date").value = todayIso();
  updateLiveTotals();

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("service-lines").addEventListener("input", (e) => {
    if (e.target.matches(".line-ht")) updateLiveTotals();
  });

  document.getElementById("service-lines").addEventListener("click", (e) => {
    const removeBtn = e.target.closest('[data-action="remove-line"]');
    if (!removeBtn) return;
    const lines = document.querySelectorAll("#service-lines .service-line");
    if (lines.length <= 1) return;
    removeBtn.closest(".service-line").remove();
    renumberLines();
    updateLiveTotals();
  });

  document.getElementById("add-line-btn").addEventListener("click", () => {
    document.getElementById("service-lines").appendChild(createServiceLine());
    renumberLines();
    updateLiveTotals();
  });

  document.getElementById("client-zip").addEventListener("input", (e) => {
    const zip = e.target.value.replace(/\D/g, "").slice(0, 5);
    e.target.value = zip;
    clearTimeout(zipLookupTimer);
    zipLookupTimer = setTimeout(() => lookupCityFromZip(zip), 350);
  });

  document.getElementById("logout-btn").addEventListener("click", lockApp);

  document.getElementById("cal-prev").addEventListener("click", () => {
    calMonth -= 1;
    if (calMonth < 0) {
      calMonth = 11;
      calYear -= 1;
    }
    renderCalendar();
  });

  document.getElementById("cal-next").addEventListener("click", () => {
    calMonth += 1;
    if (calMonth > 11) {
      calMonth = 0;
      calYear += 1;
    }
    renderCalendar();
  });

  document.getElementById("cal-clear").addEventListener("click", () => {
    selectedHistoryDate = null;
    renderHistory();
  });

  document.getElementById("calendar-grid").addEventListener("click", (e) => {
    const dayBtn = e.target.closest(".cal-day[data-date]");
    if (!dayBtn) return;
    const date = dayBtn.dataset.date;
    selectedHistoryDate = selectedHistoryDate === date ? null : date;
    renderHistory();
  });

  document.getElementById("preview-btn").addEventListener("click", () => {
    const form = document.getElementById("invoice-form");
    if (!form.reportValidity()) return;
    const data = {
      ...readForm(),
      number: window.__currentInvoice?.number || nextInvoiceNumber(),
    };
    showInvoice(data);
  });

  document.getElementById("invoice-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    if (!form.reportValidity()) return;

    const invoices = loadInvoices();
    const data = {
      id: crypto.randomUUID(),
      number: nextInvoiceNumber(invoices),
      createdAt: Date.now(),
      ...readForm(),
    };
    invoices.push(data);
    saveInvoices(invoices);
    showInvoice(data);
    switchTab("create");
  });

  document.getElementById("print-btn").addEventListener("click", () => {
    if (!window.__currentInvoice) return;
    window.print();
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    document.getElementById("invoice-form").reset();
    document.getElementById("invoice-date").value = todayIso();
    initServices();
    document.getElementById("zip-hint").textContent = "La ville se remplit toute seule.";
    document.getElementById("zip-hint").classList.remove("error-hint");
    document.getElementById("city-suggestions").innerHTML = "";
    window.__currentInvoice = null;
    const sheet = document.getElementById("invoice-sheet");
    sheet.classList.add("empty");
    sheet.innerHTML =
      '<p class="empty-msg">Remplissez le formulaire puis cliquez sur « Aperçu » ou « Enregistrer & générer ».</p>';
    document.getElementById("print-btn").disabled = true;
  });

  document.getElementById("history-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const item = btn.closest(".history-item");
    const id = item.dataset.id;
    const invoices = loadInvoices();
    const inv = invoices.find((x) => x.id === id);
    if (!inv) return;

    if (btn.dataset.action === "open") {
      fillForm(inv);
      showInvoice(inv);
      switchTab("create");
    }

    if (btn.dataset.action === "print") {
      fillForm(inv);
      showInvoice(inv);
      switchTab("create");
      setTimeout(() => window.print(), 50);
    }

    if (btn.dataset.action === "delete") {
      if (!confirm(`Supprimer la facture ${inv.number} ?`)) return;
      saveInvoices(invoices.filter((x) => x.id !== id));
      renderHistory();
    }
  });

  document.getElementById("export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(loadInvoices(), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dhauto-factures-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById("import-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("Format invalide");
      const existing = loadInvoices();
      const byId = new Map(existing.map((x) => [x.id, x]));
      data.forEach((inv) => {
        if (inv && inv.id && inv.number) byId.set(inv.id, inv);
      });
      saveInvoices([...byId.values()]);
      renderHistory();
      alert("Import terminé.");
    } catch {
      alert("Impossible d’importer ce fichier.");
    } finally {
      e.target.value = "";
    }
  });
}

init();
