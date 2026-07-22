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
const UNLOCK_KEY = "dhauto_unlocked_v1";
const ACCESS_CODE = "6084";

let invoiceCache = null;
let currentInvoiceType = 1;

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

function getCloudConfig() {
  const c = window.DHAUTO_CONFIG || {};
  const url = (c.supabaseUrl || "").trim().replace(/\/$/, "");
  const key = (c.supabaseKey || "").trim();
  return url && key ? { url, key } : null;
}

function setSyncStatus(text, kind = "") {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = text;
  el.className = `sync-status ${kind}`.trim();
}

function loadInvoicesLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveInvoicesLocal(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  invoiceCache = list;
}

function loadInvoices() {
  if (Array.isArray(invoiceCache)) return invoiceCache;
  return loadInvoicesLocal();
}

function saveInvoices(list) {
  saveInvoicesLocal(list);
}

function cloudHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function invoiceToRow(inv) {
  return {
    id: inv.id,
    number: inv.number,
    created_at: inv.createdAt,
    invoice_date: inv.date || null,
    data: inv,
  };
}

function rowToInvoice(row) {
  const data = row.data && typeof row.data === "object" ? row.data : {};
  return {
    ...data,
    id: row.id || data.id,
    number: row.number || data.number,
    createdAt: row.created_at || data.createdAt,
    date: row.invoice_date || data.date,
  };
}

function newInvoiceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `inv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fetchInvoicesFromCloud() {
  const cfg = getCloudConfig();
  const local = loadInvoicesLocal();

  if (!cfg) {
    invoiceCache = local;
    setSyncStatus(
      "Mode local : chaque appareil a son propre historique. Configurez le partage cloud pour tout voir ensemble.",
      "warn"
    );
    return invoiceCache;
  }

  setSyncStatus("Synchronisation en cours…");
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/invoices?select=*&order=created_at.desc`,
      { headers: cloudHeaders(cfg.key) }
    );
    if (!res.ok) {
      const detail = await res.text();
      console.error("Cloud fetch failed", res.status, detail);
      invoiceCache = local;
      setSyncStatus("Erreur cloud — affichage de la copie locale.", "err");
      return invoiceCache;
    }

    const rows = await res.json();
    const byId = new Map(rows.map((row) => {
      const inv = rowToInvoice(row);
      return [inv.id, inv];
    }));

    // Envoie vers le cloud les factures encore seulement locales (ex: téléphone)
    const missing = local.filter((inv) => inv && inv.id && !byId.has(inv.id));
    if (missing.length) {
      await syncInvoicesToCloud(missing);
      missing.forEach((inv) => byId.set(inv.id, inv));
    }

    const list = [...byId.values()].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
    saveInvoicesLocal(list);
    setSyncStatus(
      `Historique partagé en ligne (${list.length} facture${list.length > 1 ? "s" : ""}).`,
      "ok"
    );
    return list;
  } catch (err) {
    console.error(err);
    invoiceCache = local;
    setSyncStatus("Hors ligne — copie locale affichée.", "warn");
    return invoiceCache;
  }
}

async function upsertInvoiceCloud(inv) {
  const cfg = getCloudConfig();
  if (!cfg) return false;
  const res = await fetch(`${cfg.url}/rest/v1/invoices?on_conflict=id`, {
    method: "POST",
    headers: cloudHeaders(cfg.key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(invoiceToRow(inv)),
  });
  if (!res.ok) {
    console.error("Cloud upsert failed", res.status, await res.text());
    return false;
  }
  return true;
}

async function deleteInvoiceCloud(id) {
  const cfg = getCloudConfig();
  if (!cfg) return false;
  const res = await fetch(`${cfg.url}/rest/v1/invoices?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: cloudHeaders(cfg.key),
  });
  if (!res.ok) {
    console.error("Cloud delete failed", res.status, await res.text());
    return false;
  }
  return true;
}

async function syncInvoicesToCloud(list) {
  const cfg = getCloudConfig();
  if (!cfg || !list.length) return;
  const res = await fetch(`${cfg.url}/rest/v1/invoices?on_conflict=id`, {
    method: "POST",
    headers: cloudHeaders(cfg.key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(list.map(invoiceToRow)),
  });
  if (!res.ok) {
    console.error("Cloud bulk sync failed", res.status, await res.text());
  }
}

function nextInvoiceNumber(list = loadInvoices()) {
  const year = new Date().getFullYear();
  const prefix = `FA-${year}-`;
  const nums = list
    .map((inv) => inv.number)
    .filter((n) => n && n.startsWith(prefix))
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureServiceDatalist() {
  let list = document.getElementById("service-suggestions");
  if (!list) {
    list = document.createElement("datalist");
    list.id = "service-suggestions";
    document.body.appendChild(list);
  }
  list.innerHTML = SERVICES.map(
    (s) => `<option value="${escapeHtml(s)}"></option>`
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
        hours: data.hours ?? "",
        qty: data.qty ?? "",
        ...totals,
      },
    ];
  } else {
    lines = lines.map((line) => {
      const totals = calcTotals(line.amountHt);
      return {
        service: line.service || "Prestation",
        serviceDetail: line.serviceDetail || "",
        hours: line.hours ?? "",
        qty: line.qty ?? "",
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

function blankCell() {
  return "";
}

function parseOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(value);
  return Number.isNaN(n) ? "" : n;
}

function formatQty(value) {
  const n = parseOptionalNumber(value);
  if (n === "") return blankCell();
  return String(n).replace(".", ",");
}

function lineMontantHt(line) {
  const qty = parseOptionalNumber(line.qty);
  if (qty === "") return null;
  const tarif = Number(line.amountHt) || 0;
  return Math.round(qty * tarif * 100) / 100;
}

function lineTotalForSum(line) {
  const montant = lineMontantHt(line);
  if (montant !== null) return montant;
  return Number(line.amountHt) || 0;
}

function renderInvoiceHtml(data) {
  const inv = normalizeInvoice(data);
  const isType2 = Number(inv.invoiceType) === 2;
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
      const montant = lineMontantHt(line);
      const tarifCell =
        isType2 && !(Number(line.amountHt) > 0)
          ? blankCell()
          : money(line.amountHt);
      return `
        <tr>
          <td>${escapeHtml(line.service)}${detail}</td>
          <td>${formatQty(line.qty)}</td>
          <td>${montant === null ? blankCell() : money(montant)}</td>
          <td>${tarifCell}</td>
        </tr>`;
    })
    .join("");

  const notes = inv.notes
    ? `<p><strong>Observations :</strong> ${escapeHtml(inv.notes)}</p>`
    : "";

  const tableHead = `<tr>
            <th>Désignation</th>
            <th>Qté</th>
            <th>Montant HT</th>
            <th>Tarif HT</th>
          </tr>`;

  const summedHt = Math.round(
    inv.lines.reduce((s, l) => s + lineTotalForSum(l), 0) * 100
  ) / 100;
  const summedTva = Math.round(summedHt * GARAGE.tvaRate * 100) / 100;
  const summedTtc = Math.round((summedHt + summedTva) * 100) / 100;

  const totalsBlock = isType2 && !inv.lines.some((l) => Number(l.amountHt) > 0)
    ? `<div class="totals">
        <div><span>Total HT</span><span>${blankCell()}</span></div>
        <div><span>TVA (20 %)</span><span>${blankCell()}</span></div>
        <div class="grand"><span>Total TTC</span><span>${blankCell()}</span></div>
      </div>`
    : `<div class="totals">
        <div><span>Total HT</span><span>${money(summedHt)}</span></div>
        <div><span>TVA (20 %)</span><span>${money(summedTva)}</span></div>
        <div class="grand"><span>Total TTC</span><span>${money(summedTtc)}</span></div>
      </div>`;

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
          <div class="badge">FACTURE${isType2 ? " — TYPE 2" : ""}</div>
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
          ${tableHead}
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      ${totalsBlock}

      ${notes}

      <div class="legal">
        <p><strong>Mode de paiement :</strong> ${escapeHtml(inv.paymentMethod || "—")}</p>
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
  ensureServiceDatalist();
  const wrap = document.createElement("div");
  wrap.className = "service-line";
  const type2 = currentInvoiceType === 2;
  const amountBlock = `
    <div class="row">
      <div class="field">
        <label>Quantité (facultatif)</label>
        <input class="line-qty" type="number" min="0" step="0.01" placeholder="ex. 2" value="${data.qty ?? ""}" />
      </div>
      <div class="field grow">
        <label>Tarif HT (€) ${type2 ? "(facultatif)" : "*"}</label>
        <input class="line-ht" type="number" min="0" step="0.01" ${type2 ? "" : "required"} placeholder="0.00" value="${data.amountHt ?? ""}" />
      </div>
    </div>`;
  wrap.innerHTML = `
    <div class="service-line-top">
      <strong>Prestation</strong>
      <button type="button" class="btn btn-ghost line-remove" data-action="remove-line">Supprimer</button>
    </div>
    <div class="field">
      <label>Type de prestation *</label>
      <input
        class="line-service"
        type="text"
        list="service-suggestions"
        required
        placeholder="Choisir dans la liste ou écrire"
        value="${escapeHtml(data.service || "")}"
        autocomplete="off"
      />
      <span class="field-hint">Liste déroulante ou saisie libre.</span>
    </div>
    <div class="field">
      <label>Détail (facultatif)</label>
      <input class="line-detail" type="text" placeholder="ex. plaquettes avant + disques" value="${escapeHtml(data.serviceDetail || "")}" />
    </div>
    ${amountBlock}
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
  if (currentInvoiceType === 2) {
    // still update if tarifs filled
  }
  const lines = [...document.querySelectorAll("#service-lines .service-line")];
  let amountHt = 0;
  lines.forEach((el) => {
    const htInput = el.querySelector(".line-ht");
    if (!htInput) return;
    const tarif = Number(htInput.value) || 0;
    const qtyRaw = el.querySelector(".line-qty")?.value;
    const qty = parseOptionalNumber(qtyRaw);
    amountHt += qty === "" ? tarif : Math.round(qty * tarif * 100) / 100;
  });
  amountHt = Math.round(amountHt * 100) / 100;
  const tva = Math.round(amountHt * GARAGE.tvaRate * 100) / 100;
  const ttc = Math.round((amountHt + tva) * 100) / 100;
  const liveHt = document.getElementById("live-ht");
  const liveTva = document.getElementById("live-tva");
  const liveTtc = document.getElementById("live-ttc");
  if (liveHt) liveHt.textContent = money(amountHt);
  if (liveTva) liveTva.textContent = money(tva);
  if (liveTtc) liveTtc.textContent = money(ttc);
}

function readForm() {
  const type2 = currentInvoiceType === 2;
  const lines = [...document.querySelectorAll("#service-lines .service-line")].map((el) => {
    const service = el.querySelector(".line-service").value.trim();
    const serviceDetail = el.querySelector(".line-detail").value.trim();
    const qty = parseOptionalNumber(el.querySelector(".line-qty")?.value);
    const htInput = el.querySelector(".line-ht");
    const totals = calcTotals(htInput ? htInput.value : 0);
    if (type2 && !(Number(htInput?.value) > 0)) {
      return {
        service,
        serviceDetail,
        qty,
        hours: "",
        amountHt: 0,
        tva: 0,
        ttc: 0,
      };
    }
    return {
      service,
      serviceDetail,
      qty,
      hours: "",
      ...totals,
    };
  });

  const amountHt = Math.round(lines.reduce((s, l) => s + lineTotalForSum(l), 0) * 100) / 100;
  const tva = Math.round(amountHt * GARAGE.tvaRate * 100) / 100;
  const ttc = Math.round((amountHt + tva) * 100) / 100;

  return {
    invoiceType: currentInvoiceType,
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
    paymentMethod: document.getElementById("payment-method").value,
    date: document.getElementById("invoice-date").value,
    amountHt,
    tva,
    ttc,
  };
}

function applyInvoiceTypeUI() {
  const type2 = currentInvoiceType === 2;
  document.body.classList.toggle("invoice-type-2", type2);
  const hint = document.getElementById("prestations-hint");
  if (hint) {
    hint.textContent = type2
      ? "Facture type 2 : quantité et tarif facultatifs ; cases vides si non renseignés."
      : "Quantité facultative : si remplie, le Montant HT = quantité × tarif.";
  }
  document.querySelectorAll(".type1-only").forEach((el) => {
    el.classList.toggle("hidden-type", type2);
  });
}

function setInvoiceType(type, preserveLines = true) {
  const prevLines = preserveLines
    ? [...document.querySelectorAll("#service-lines .service-line")].map((el) => ({
        service: el.querySelector(".line-service")?.value.trim() || "",
        serviceDetail: el.querySelector(".line-detail")?.value.trim() || "",
        amountHt: el.querySelector(".line-ht")?.value ?? "",
        qty: el.querySelector(".line-qty")?.value ?? "",
        hours: "",
      }))
    : [];
  currentInvoiceType = Number(type) === 2 ? 2 : 1;
  applyInvoiceTypeUI();
  const container = document.getElementById("service-lines");
  if (!container) return;
  container.innerHTML = "";
  const seed = prevLines.length ? prevLines : [{}];
  seed.forEach((line) => container.appendChild(createServiceLine(line)));
  renumberLines();
  updateLiveTotals();
}

function fillForm(data) {
  const inv = normalizeInvoice(data);
  currentInvoiceType = Number(inv.invoiceType) === 2 ? 2 : 1;
  applyInvoiceTypeUI();
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
  document.getElementById("payment-method").value =
    inv.paymentMethod === "Virement" ||
    inv.paymentMethod === "Espèces" ||
    inv.paymentMethod === "Chèque"
      ? inv.paymentMethod
      : "Espèces";
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

async function renderHistory() {
  const root = document.getElementById("history-list");
  if (root) {
    root.innerHTML = `<div class="empty-history">Chargement de l’historique…</div>`;
  }

  const all = (await fetchInvoicesFromCloud())
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  renderCalendar();

  const list = selectedHistoryDate
    ? all.filter((inv) => inv.date === selectedHistoryDate)
    : all;

  if (!root) return;

  if (!all.length) {
    root.innerHTML = `<div class="empty-history">Aucune facture enregistrée pour le moment.</div>`;
    return;
  }

  if (!list.length) {
    root.innerHTML = `<div class="empty-history">Aucune facture à cette date. Cliquez sur « Voir tout » ou choisissez un autre jour.</div>`;
    return;
  }

  root.innerHTML = list
    .map((inv) => {
      const norm = normalizeInvoice(inv);
      const typeLabel = Number(inv.invoiceType) === 2 ? "Type 2" : "Type 1";
      const amountLabel =
        Number(inv.invoiceType) === 2 ? "À la main" : money(norm.ttc);
      return `
      <article class="history-item" data-id="${escapeHtml(inv.id)}">
        <div>
          <h3>${escapeHtml(inv.number)} — ${escapeHtml(inv.clientName)}</h3>
          <p>${escapeHtml(dateFr(inv.date))} · ${escapeHtml(typeLabel)} · ${escapeHtml(norm.service)} · ${escapeHtml(inv.carPlate || "")}</p>
        </div>
        <div class="amount">${escapeHtml(amountLabel)}</div>
        <div class="item-actions">
          <button type="button" class="btn btn-secondary" data-action="open">Ouvrir</button>
          <button type="button" class="btn btn-primary" data-action="print">Imprimer</button>
          <button type="button" class="btn btn-ghost" data-action="delete">Supprimer</button>
        </div>
      </article>`;
    })
    .join("");
}

function switchTab(name) {
  if (name === "create") setInvoiceType(1);
  if (name === "create2") setInvoiceType(2);

  const showCreate = name === "create" || name === "create2";

  document.querySelectorAll(".tab").forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    const active = showCreate
      ? panel.id === "tab-create"
      : panel.id === `tab-${name}`;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  if (name === "history") renderHistory();
}

function unlockApp() {
  localStorage.setItem(UNLOCK_KEY, "1");
  document.getElementById("lock-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  fetchInvoicesFromCloud().catch(() => {});
}

function lockApp() {
  localStorage.removeItem(UNLOCK_KEY);
  document.getElementById("app").classList.add("hidden");
  const lockScreen = document.getElementById("lock-screen");
  lockScreen.classList.remove("hidden");
  buildLockScreen();
}

function buildLockScreen() {
  const lockScreen = document.getElementById("lock-screen");
  lockScreen.innerHTML = `
    <div class="lock-card" style="width:min(100%,400px);background:#fff;border:2px solid #111;border-radius:16px;padding:28px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.08);">
      <img src="assets/logo.png" alt="DHauto" width="96" height="96" style="border-radius:50%;background:#000;object-fit:contain;" />
      <h1 style="margin:14px 0 6px;font-size:28px;">Accès DHauto</h1>
      <p style="margin:0 0 16px;color:#5c5c5c;">Entrez le code d’accès pour ouvrir l’outil factures.</p>
      <div style="text-align:left;">
        <label for="access-code-input" style="display:block;font-weight:700;margin:0 0 8px;">Code d’accès</label>
        <input
          id="access-code-input"
          type="text"
          inputmode="numeric"
          maxlength="8"
          placeholder="Tapez le code ici"
          style="display:block !important;visibility:visible !important;opacity:1 !important;width:100%;height:56px;min-height:56px;padding:12px 14px;border:3px solid #c8102e;border-radius:8px;background:#fff;color:#111;font-size:24px;text-align:center;box-sizing:border-box;"
        />
        <p id="lock-error" style="display:none;color:#c8102e;font-weight:700;text-align:center;margin:10px 0 0;">Code incorrect.</p>
        <button
          id="access-code-btn"
          type="button"
          style="display:block;width:100%;margin-top:14px;height:48px;border:0;border-radius:8px;background:#c8102e;color:#fff;font-size:18px;font-weight:700;cursor:pointer;"
        >Entrer</button>
      </div>
    </div>
  `;

  const input = document.getElementById("access-code-input");
  const error = document.getElementById("lock-error");
  const btn = document.getElementById("access-code-btn");

  const submitCode = () => {
    const value = (input.value || "").trim();
    if (value === ACCESS_CODE) {
      error.style.display = "none";
      unlockApp();
      return;
    }
    error.style.display = "block";
    input.value = "";
    input.focus();
  };

  btn.onclick = submitCode;
  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitCode();
    }
  };

  setTimeout(() => input.focus(), 80);
}

function initAuth() {
  if (localStorage.getItem(UNLOCK_KEY) === "1") {
    unlockApp();
    return;
  }
  document.getElementById("lock-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
  buildLockScreen();
}

function initServices() {
  ensureServiceDatalist();
  applyInvoiceTypeUI();
  const container = document.getElementById("service-lines");
  container.innerHTML = "";
  container.appendChild(createServiceLine());
  renumberLines();
  updateLiveTotals();
}

function init() {
  initAuth();
  try {
    initServices();
    document.getElementById("invoice-date").value = todayIso();
    updateLiveTotals();
  } catch (err) {
    console.error(err);
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("service-lines").addEventListener("input", (e) => {
    if (e.target.matches(".line-ht, .line-qty")) updateLiveTotals();
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

  document.getElementById("refresh-btn").addEventListener("click", () => {
    renderHistory();
  });

  document.getElementById("preview-btn").addEventListener("click", async () => {
    const form = document.getElementById("invoice-form");
    if (!form.reportValidity()) return;
    await fetchInvoicesFromCloud();
    const data = {
      ...readForm(),
      number: window.__currentInvoice?.number || nextInvoiceNumber(),
    };
    showInvoice(data);
  });

  document.getElementById("invoice-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    if (!form.reportValidity()) return;

    await fetchInvoicesFromCloud();
    const invoices = loadInvoices();
    const data = {
      id: newInvoiceId(),
      number: nextInvoiceNumber(invoices),
      createdAt: Date.now(),
      ...readForm(),
    };
    invoices.push(data);
    saveInvoices(invoices);
    const ok = await upsertInvoiceCloud(data);
    if (getCloudConfig()) {
      setSyncStatus(
        ok
          ? "Facture enregistrée et partagée en ligne."
          : "Facture sauvée en local, mais l’envoi cloud a échoué.",
        ok ? "ok" : "err"
      );
      if (!ok) {
        alert(
          "Attention : la facture est sur cet appareil, mais pas encore partagée en ligne.\nVérifiez la connexion puis ouvrez Historique → Actualiser."
        );
      }
    } else {
      alert("Cloud non configuré : la facture reste seulement sur cet appareil.");
    }
    showInvoice(data);
    switchTab(currentInvoiceType === 2 ? "create2" : "create");
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

  document.getElementById("history-list").addEventListener("click", async (e) => {
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
      switchTab(Number(inv.invoiceType) === 2 ? "create2" : "create");
    }

    if (btn.dataset.action === "print") {
      fillForm(inv);
      showInvoice(inv);
      switchTab(Number(inv.invoiceType) === 2 ? "create2" : "create");
      setTimeout(() => window.print(), 50);
    }

    if (btn.dataset.action === "delete") {
      if (!confirm(`Supprimer la facture ${inv.number} ?`)) return;
      const next = invoices.filter((x) => x.id !== id);
      saveInvoices(next);
      await deleteInvoiceCloud(id);
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
      const merged = [...byId.values()];
      saveInvoices(merged);
      await syncInvoicesToCloud(merged);
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
