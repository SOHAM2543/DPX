const apiBase = "/api";

// images - relative paths (ensure they exist under static/images/shapes/)
const SHAPES = [
  { key: "RD", name: "Round (RD)", img: "/images/shapes/rd.png" },
  { key: "PS", name: "Pear (PS)", img: "/images/shapes/ps.png" }
];

// clarity order desired
const CLARITY_ORDER = ["FL","IF","VVS1","VVS2","VS1","VS2","SI1","SI2","SI3"];

// render shape buttons
function renderShapeButtons(containerId, defaultKey = "RD") {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  SHAPES.forEach((s, idx) => {
    const btn = document.createElement("div");
    btn.className = "shape-btn";
    btn.dataset.value = s.key;
    btn.innerHTML = `<img src="${s.img}" alt="${s.name}" onerror="this.onerror=null; this.src='/images/placeholder.png'; this.style.opacity=0.4"><span>${s.key}</span>`;
    btn.addEventListener("click", () => {
      [...container.children].forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      disableAutoCalcOnInputs(container.closest('.mode-panel'));
    });
    container.appendChild(btn);
    if (idx === 0 && defaultKey === s.key) btn.classList.add("active");
  });
}

// render pills (colors/clarities). For clarity, enforce CLARITY_ORDER.
function renderPills(containerId, options, isClarity=false) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  let opts = options ? [...options] : [];
  if (isClarity) {
    opts = CLARITY_ORDER.filter(c => options.includes(c));
    options.forEach(c => { if (!opts.includes(c)) opts.push(c); });
  }
  opts.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-outline-secondary pill";
    btn.textContent = opt;
    btn.dataset.value = opt;
    btn.addEventListener("click", () => {
      [...container.children].forEach(c=>c.classList.remove("active"));
      btn.classList.add("active");
      disableAutoCalcOnInputs(container.closest('.mode-panel'));
    });
    container.appendChild(btn);
    if (idx === 0) btn.classList.add("active");
  });
}

// render LAB buttons below clarity in GIA panel
function renderLabButtons(containerId, defaultLab = "GIA") {
  const labs = ["GIA", "HRD", "IGI"];
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  labs.forEach((lab, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-outline-secondary pill lab-btn";
    btn.textContent = lab;
    btn.dataset.value = lab;
    btn.addEventListener("click", () => {
      [...container.children].forEach(c=>c.classList.remove("active"));
      btn.classList.add("active");
      disableAutoCalcOnInputs(container.closest('.mode-panel'));
    });
    container.appendChild(btn);
    if (lab === defaultLab) btn.classList.add("active");
  });
}

// fetch meta
const EXTRA_COLORS = ["N", "OP", "QR", "ST", "UV", "WX", "YZ"];
async function loadMeta() {
  try {
    const res = await fetch(`${apiBase}/meta`);
    const meta = await res.json();

    // Append extra colors to meta.colors if not present
    const colorsWithExtra = [...new Set([...(meta.colors || []), ...EXTRA_COLORS])];

    // Ensure "FL" is included in clarities
    const claritiesWithFL = [...new Set([...(meta.clarities || []), "FL"])];

    // shapes
    ["gia-shapes","hrd-shapes","recut-a-shapes","recut-b-shapes"].forEach(id => renderShapeButtons(id));

    // colors
    renderPills("gia-colors", colorsWithExtra);
    renderPills("hrd-colors", colorsWithExtra);
    renderPills("recut-a-colors", colorsWithExtra);
    renderPills("recut-b-colors", colorsWithExtra);

    // clarities with forced FL and correct order
    renderPills("gia-clarities", claritiesWithFL, true);
    renderPills("hrd-clarities", claritiesWithFL, true);
    renderPills("recut-a-clarities", claritiesWithFL, true);
    renderPills("recut-b-clarities", claritiesWithFL, true);

    // render LAB buttons in GIA panel below clarity
    renderLabButtons("gia-labs", "GIA");

    document.getElementById("lastUpdated").textContent = meta.last_updated ? ("Last updated Rapaport data: " + meta.last_updated) : "";

  } catch (err) {
    console.error("meta load error", err);
  }
}

// helpers to get selected pill & shape
function getPillValue(containerId) {
  const c = document.getElementById(containerId);
  const active = c ? c.querySelector(".active") : null;
  return active ? active.dataset.value : null;
}
function getShapeValue(containerId) {
  const c = document.getElementById(containerId);
  const active = c ? c.querySelector(".shape-btn.active") : null;
  return active ? active.dataset.value : null;
}
function getLabValue() {
  const container = document.getElementById("gia-labs");
  if (!container) return "GIA";
  const active = container.querySelector(".lab-btn.active");
  return active ? active.dataset.value : "GIA";
}

// loaders
const overlay = document.getElementById("overlay");
function showLoader(text="Calculating...") { 
  overlay.style.display = "flex"; 
  document.getElementById("overlayText").textContent = text; 
}
function hideLoader() { overlay.style.display = "none"; }
function pulseBtn(btn) { 
  btn.classList.add("btn-clicked"); 
  setTimeout(() => btn.classList.remove("btn-clicked"), 280); 
}

// clear results helper
function clearResultForPanel(panelEl) {
  if (!panelEl) return;
  const res = panelEl.querySelector('[id$="-result"]');
  if (res) res.innerHTML = "";
}

// validation modal
function showError(message) {
  document.getElementById("errorModalBody").textContent = message;
  const modal = new bootstrap.Modal(document.getElementById('errorModal'));
  modal.show();
}

// Reset panel: restore defaults
function resetPanel(panelPrefix) {
  const panel = document.getElementById(`panel-${panelPrefix}`);
  if (!panel) return;

  panel.querySelectorAll("input[type=number]").forEach(inp => inp.value = inp.defaultValue || "");
  panel.querySelectorAll("input[type=range]").forEach(inp => {
    const defaultVal = parseFloat(inp.getAttribute("value")) || 0;
    inp.value = defaultVal;
    const valEl = document.getElementById(inp.id + "-val");
    if (valEl) valEl.textContent = inp.value;
  });
  panel.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = false);
  panel.querySelectorAll(".shape-container .shape-btn").forEach((btn, idx) => {
    btn.classList.toggle("active", idx === 0);
  });
  panel.querySelectorAll(".pill").forEach((p, idx) => p.classList.toggle("active", idx === 0));
  const res = panel.querySelector('[id$="-result"]');
  if (res) res.innerHTML = "";
}

// Reset with loader
function resetWithLoader(panelPrefix) {
  showLoader("Resetting...");
  resetPanel(panelPrefix);
  setTimeout(() => hideLoader(), 800);
}

// Disable auto calculation on input changes, only clear results
function disableAutoCalcOnInputs(panelEl) {
  if (!panelEl) return;
  clearResultForPanel(panelEl);
}

// bind sliders and show signed values
function bindSlider(sliderId, displayId) {
  const s = document.getElementById(sliderId);
  const d = document.getElementById(displayId);
  if (!s || !d) return;
  d.textContent = s.value;
  s.addEventListener("input", () => {
    d.textContent = s.value;
    disableAutoCalcOnInputs(s.closest('.mode-panel'));
  });
}

// Validation functions
function isGIAInputsValid(silent=false) {
  if (!getShapeValue("gia-shapes")) { if (!silent) showError("Please select a Shape."); return false; }
  if (!getPillValue("gia-colors")) { if (!silent) showError("Please select a Color."); return false; }
  if (!getPillValue("gia-clarities")) { if (!silent) showError("Please select a Clarity."); return false; }
  return true;
}

function isHRDInputsValid(silent=false) {
  if (!getShapeValue("hrd-shapes")) { if (!silent) showError("Please select a Shape."); return false; }
  if (!getPillValue("hrd-colors")) { if (!silent) showError("Please select a Color."); return false; }
  if (!getPillValue("hrd-clarities")) { if (!silent) showError("Please select a Clarity."); return false; }
  return true;
}

function isRecutInputsValid(silent=false) {
  if (!getShapeValue("recut-a-shapes") || !getShapeValue("recut-b-shapes")) { if (!silent) showError("Please select Shape for both stones."); return false; }
  if (!getPillValue("recut-a-colors") || !getPillValue("recut-b-colors")) { if (!silent) showError("Please select Color for both stones."); return false; }
  if (!getPillValue("recut-a-clarities") || !getPillValue("recut-b-clarities")) { if (!silent) showError("Please select Clarity for both stones."); return false; }
  return true;
}

// transform clarity: if FL selected, send IF
function normalizeClarity(c) {
  if (!c) return c;
  if (c === "FL") return "IF";
  return c;
}

const rapPriceGlobal = { value: 0 };

function setupInputListeners() {
  const discountEl = document.getElementById("gia-discount");

  if (discountEl) discountEl.addEventListener("input", () => {
    // discount slider value update
    document.getElementById("gia-discount-val").textContent = discountEl.value;
  });
}

async function computeGIA(userTriggered = false) {
  if (!isGIAInputsValid(!userTriggered)) return;

  const btn = document.getElementById("gia-calc");
  if (userTriggered) pulseBtn(btn);

  const weight = parseFloat(document.getElementById("gia-weight").value) || 0;
  if (weight <= 0) {
    alert("Weight must be greater than 0");
    return;
  }

  const shape = getShapeValue("gia-shapes");
  const color = getPillValue("gia-colors");
  const clarity = normalizeClarity(getPillValue("gia-clarities"));
  const use_5cts = document.getElementById("gia-5cts").checked;

  let discountRaw = parseFloat(document.getElementById("gia-discount").value);
  if (isNaN(discountRaw)) discountRaw = 0;

  const payload = {
    weight,
    shape,
    color,
    clarity,
    use_5cts,
    discount_val: Math.abs(discountRaw)
  };

  try {
    showLoader();
    const res = await fetch(`${apiBase}/calc/gia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    hideLoader();

    if (!res.ok) {
      document.getElementById("gia-result").innerHTML =
        `<div class='alert alert-danger text-center'>${data.detail || data.error || "Error"}</div>`;
      return;
    }

    rapPriceGlobal.value = data.rap_price_ct || 0;

    document.getElementById("gia-result").innerHTML = `
      <div class="card-result text-center" style="font-size:1.1rem; line-height:1.4;">
        <div class="result-title" style="font-weight:bold; margin-bottom: 10px;">💎 GIA Result</div>
        <div><strong>Rapaport Price/Ct:</strong> $${Number(data.rap_price_ct).toFixed(2)}</div>
        <div><strong>Applied Discount:</strong> ${discountRaw}%</div>
        <div><strong>Price per Ct (USD):</strong> $${Number(data.price_per_ct).toFixed(2)}</div>
        <div><strong>Total (USD):</strong> $${Number(data.total_usd).toFixed(2)}</div>
        <div><strong>USD→INR Rate:</strong> ₹${data.usd_to_inr}</div>
        <div><strong>Total (INR):</strong> ₹${Number(data.total_inr).toLocaleString()}</div>
      </div>
    `;

    // Sync slider display value
    document.getElementById("gia-discount-val").textContent = discountRaw;

  } catch (err) {
    hideLoader();
    document.getElementById("gia-result").innerHTML =
      `<div class='alert alert-danger text-center'>Network error</div>`;
  }
}

async function computeHRD(userTriggered = false) {
  if (!isHRDInputsValid(!userTriggered)) return;

  const btn = document.getElementById("hrd-calc");
  if (userTriggered) pulseBtn(btn);

  const weight = parseFloat(document.getElementById("hrd-weight").value) || 0;
  if (weight <= 0) {
    alert("Weight must be greater than 0");
    return;
  }

  const shape = getShapeValue("hrd-shapes");
  const color = getPillValue("hrd-colors");
  const clarity = normalizeClarity(getPillValue("hrd-clarities"));
  const use_5cts = document.getElementById("hrd-5cts").checked;
  const disc_val = parseFloat(document.getElementById("hrd-disc").value) || 0;
  const disc_val_gia = parseFloat(document.getElementById("hrd-disc-gia").value) || 0;

  const payload = {
    weight,
    shape,
    color,
    clarity,
    use_5cts,
    disc_val: Math.abs(disc_val),
    disc_val_gia: Math.abs(disc_val_gia)
  };

  try {
    showLoader();
    const res = await fetch(`${apiBase}/calc/hrd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    hideLoader();

    if (!res.ok) {
      document.getElementById("hrd-result").innerHTML =
        `<div class='alert alert-danger text-center'>${data.detail || data.error || "Error"}</div>`;
      return;
    }

    document.getElementById("hrd-result").innerHTML = `
      <div class="card-result text-center" style="font-size:1.1rem; line-height:1.4;">
        <div class="result-title" style="font-weight:bold; margin-bottom: 10px;">💎 HRD Result</div>
        <div><strong>Rapaport Price/Ct:</strong> $${Number(data.rap_price_ct).toFixed(2)}</div>
        <div><strong>GIA Rapaport Price/Ct:</strong> $${Number(data.rap_price_ct_gia).toFixed(2)}</div>
        <div><strong>GIA Color Used:</strong> ${data.gia_color}</div>
        <div><strong>Price per Ct (USD):</strong> $${Number(data.price_per_ct).toFixed(2)}</div>
        <div><strong>GIA Price per Ct (USD):</strong> $${Number(data.price_per_ct_gia).toFixed(2)}</div>
        <div><strong>Total (USD):</strong> $${Number(data.total_usd).toFixed(2)}</div>
        <div><strong>USD→INR Rate:</strong> ₹${data.usd_to_inr}</div>
        <div><strong>Total (INR):</strong> ₹${Number(data.total_inr).toLocaleString()}</div>
      </div>
    `;
  } catch (err) {
    hideLoader();
    document.getElementById("hrd-result").innerHTML =
      `<div class='alert alert-danger text-center'>Network error</div>`;
  }
}

async function computeRecut(userTriggered=false) {
  if (!isRecutInputsValid(!userTriggered)) return;
  const btn = document.getElementById("recut-calc");
  if (userTriggered) pulseBtn(btn);

  const payload = {
    use_5cts: document.getElementById("recut-5cts").checked,
    stone_a: {
      weight: parseFloat(document.getElementById("recut-a-weight").value) || 0,
      shape: getShapeValue("recut-a-shapes"),
      color: getPillValue("recut-a-colors"),
      clarity: normalizeClarity(getPillValue("recut-a-clarities")),
      discount_val: Math.abs(parseFloat(document.getElementById("recut-a-disc").value) || 0)
    },
    stone_b: {
      weight: parseFloat(document.getElementById("recut-b-weight").value) || 0,
      shape: getShapeValue("recut-b-shapes"),
      color: getPillValue("recut-b-colors"),
      clarity: normalizeClarity(getPillValue("recut-b-clarities")),
      discount_val: Math.abs(parseFloat(document.getElementById("recut-b-disc").value) || 0)
    }
  };

  try {
    showLoader();
    const res = await fetch(`${apiBase}/calc/recut`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    hideLoader();

    if (!res.ok) {
      document.getElementById("recut-result").innerHTML = `<div class='alert alert-danger text-center'>${data.detail||data.error||"Error"}</div>`;
      return;
    }

    document.getElementById("recut-result").innerHTML = `
      <div class="card-result text-center" style="font-size:1.1rem; line-height:1.4;">
        <div class="result-title" style="font-weight:bold; margin-bottom: 10px;">💎 Recut Result</div>
        <div><strong>Stone A Rapaport:</strong> $${Number(data.stone_a.rap).toFixed(2)}</div>
        <div><strong>Stone A Price/Ct:</strong> $${Number(data.stone_a.price_per_ct).toFixed(2)}</div>
        <div><strong>Stone A Total USD:</strong> $${Number(data.stone_a.total_usd).toFixed(2)}</div>
        <div><strong>Stone B Rapaport:</strong> $${Number(data.stone_b.rap).toFixed(2)}</div>
        <div><strong>Stone B Price/Ct:</strong> $${Number(data.stone_b.price_per_ct).toFixed(2)}</div>
        <div><strong>Stone B Total USD:</strong> $${Number(data.stone_b.total_usd).toFixed(2)}</div>
        <div><strong>Diff USD:</strong> $${Number(data.diff_usd).toFixed(2)}</div>
        <div><strong>Cost %:</strong> ${Number(data.cost_percent).toFixed(2)}%</div>
        <div><strong>Up/Down %:</strong> ${Number(data.up_down_percent).toFixed(2)}%</div>
        <div><strong>USD→INR Rate:</strong> ₹${data.usd_to_inr}</div>
        <div><strong>Total (INR):</strong> ₹${Number(data.total_inr).toLocaleString()}</div>
      </div>
    `;
  } catch (err) {
    hideLoader();
    document.getElementById("recut-result").innerHTML = `<div class='alert alert-danger text-center'>Network error</div>`;
  }
}

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  setupInputListeners();
  loadMeta();
  
  // Show initial loader
  showLoader("✨ Polishing the diamonds... Please wait! ✨");
  setTimeout(() => {
    hideLoader();
  }, 2000);
  
  // Bind all calculate buttons
  document.getElementById("gia-calc").addEventListener("click", () => computeGIA(true));
  document.getElementById("hrd-calc").addEventListener("click", () => computeHRD(true));
  document.getElementById("recut-calc").addEventListener("click", () => computeRecut(true));
  
  // Bind reset buttons
  document.getElementById("gia-reset").addEventListener("click", () => resetWithLoader("gia"));
  document.getElementById("hrd-reset").addEventListener("click", () => resetWithLoader("hrd"));
  document.getElementById("recut-reset").addEventListener("click", () => resetWithLoader("recut"));
  
  // Mode switching
  document.getElementById("modeBtns").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    
    document.querySelectorAll("#modeBtns button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    
    document.querySelectorAll(".mode-panel").forEach(panel => panel.classList.add("d-none"));
    
    const mode = btn.dataset.mode;
    const panelId = `panel-${mode}`;
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.remove("d-none");
  });
  
  // Bind input listeners to clear results
  [
    "gia-weight","hrd-weight","recut-a-weight","recut-b-weight",
    "gia-discount","hrd-disc","hrd-disc-gia","recut-a-disc","recut-b-disc"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => disableAutoCalcOnInputs(el.closest('.mode-panel')));
  });
  
  // Bind sliders
  bindSlider("gia-discount","gia-discount-val");
  bindSlider("hrd-disc","hrd-disc-val");
  bindSlider("hrd-disc-gia","hrd-disc-gia-val");
  bindSlider("recut-a-disc","recut-a-disc-val");
  bindSlider("recut-b-disc","recut-b-disc-val");
});