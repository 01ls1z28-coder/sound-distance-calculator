(function () {
  "use strict";

  const YD_TO_M = 0.9144;
  const M_TO_YD = 1.09361;
  // Form1 mil-spec: 1 meter reference
  const REF_METERS = 1;
  const REF_YARDS = REF_METERS * M_TO_YD;
  const DEFAULT_CALIBER = "22 LR - Bolt Action TBS2024";
  const DEFAULT_MANUFACTURER = "AAC";
  const DEFAULT_MODEL = "Element 3";
  const DEFAULT_MAX_DISTANCE_M = 1000;
  const MIN_DISTANCE_M = 1;
  const MAX_DISTANCE_CAP_M = 1000;

  /**
   * Official OSHA 29 CFR 1910.95 reference levels drawn on the chart.
   * Action level: 1910.95(c)(1)–(c)(2). Others: Table G-16 (dBA slow response).
   * Peak 140 dB impulse omitted to keep the chart readable.
   */
  const OSHA_LINES = [
    { db: 85, label: "85 action · 8-hr TWA", color: "rgba(200, 255, 74, 0.95)" },
    { db: 90, label: "90 PEL · 8 h", color: "rgba(255, 196, 86, 0.92)" },
    { db: 95, label: "95 · 4 h", color: "rgba(255, 168, 76, 0.9)" },
    { db: 100, label: "100 · 2 h", color: "rgba(255, 120, 90, 0.9)" },
    { db: 105, label: "105 · 1 h", color: "rgba(255, 90, 110, 0.9)" },
    { db: 115, label: "115 · ≤¼ h", color: "rgba(255, 72, 120, 0.95)" },
  ];

  let data = [];
  let chart = null;
  let currentItem = null;

  const el = {
    caliber: document.getElementById("caliber"),
    manufacturer: document.getElementById("manufacturer"),
    model: document.getElementById("model"),
    startingDb: document.getElementById("startingDb"),
    rankedList: document.getElementById("rankedList"),
    splBody: document.getElementById("splBody"),
    specs: document.getElementById("specs"),
    maxDistance: document.getElementById("maxDistance"),
    maxDistanceLabel: document.getElementById("maxDistanceLabel"),
  };

  /** Subtle Chart.js watermark — visual only; does not affect SPL math. */
  const jorgeWatermarkPlugin = {
    id: "jorgeWatermark",
    afterDraw(chartInstance) {
      const { ctx, chartArea } = chartInstance;
      if (!chartArea) return;
      const text = "Jorge Guerra";
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = "#c8ff4a";
      ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(text, chartArea.right - 8, chartArea.bottom - 8);
      ctx.restore();
    },
  };

  /** Horizontal OSHA reference lines — custom plugin (no annotation vendor). */
  const oshaLinesPlugin = {
    id: "oshaLines",
    afterDraw(chartInstance) {
      const { ctx, chartArea, scales } = chartInstance;
      if (!chartArea || !scales || !scales.y) return;
      const yScale = scales.y;
      ctx.save();
      ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
      ctx.textBaseline = "bottom";
      ctx.textAlign = "left";

      OSHA_LINES.forEach((line) => {
        if (line.db < yScale.min || line.db > yScale.max) return;
        const y = yScale.getPixelForValue(line.db);
        if (y < chartArea.top || y > chartArea.bottom) return;

        ctx.beginPath();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 1.25;
        ctx.setLineDash([5, 4]);
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label chip readable on dark carbon
        const label = line.label;
        const padX = 5;
        const padY = 2;
        const metrics = ctx.measureText(label);
        const boxW = metrics.width + padX * 2;
        const boxH = 14;
        let boxX = chartArea.left + 6;
        let boxY = y - boxH - 2;
        if (boxY < chartArea.top + 2) boxY = y + 3;

        ctx.fillStyle = "rgba(8, 10, 14, 0.82)";
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 1;
        roundRect(ctx, boxX, boxY, boxW, boxH, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = line.color;
        ctx.fillText(label, boxX + padX, boxY + boxH - padY);
      });

      ctx.restore();
    },
  };

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values)).sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
    );
  }

  function fillSelect(select, values, selected) {
    select.innerHTML = "";
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      if (v === selected) opt.selected = true;
      select.appendChild(opt);
    });
    if (!values.includes(selected) && values.length) {
      select.value = values[0];
    }
  }

  function itemsForCaliber(caliber) {
    return data.filter((d) => d.caliber === caliber);
  }

  function findItem(caliber, manufacturer, model) {
    return data.find(
      (d) =>
        d.caliber === caliber &&
        d.manufacturer === manufacturer &&
        d.model === model
    );
  }

  function updateSpecs(item) {
    currentItem = item || null;
    const set = (key, text) => {
      const node = el.specs.querySelector('[data-spec="' + key + '"]');
      if (node) node.textContent = text;
    };
    if (!item) {
      set("cartridge", "—");
      set("weight", "—");
      set("length", "—");
      set("diameter", "—");
      set("volume", "—");
      return;
    }
    set("cartridge", item.cartridge != null ? String(item.cartridge) : "—");
    set("weight", item.weight_oz != null ? item.weight_oz + " oz" : "—");
    set("length", item.length_in != null ? item.length_in + " in" : "—");
    set("diameter", item.diameter_in != null ? item.diameter_in + " in" : "—");
    set("volume", item.volume_cc != null ? item.volume_cc + " cc" : "—");
  }

  function applyItemToForm(item, updateStartingDb) {
    if (!item) return;
    updateSpecs(item);
    if (updateStartingDb !== false && item.ml_dba != null) {
      // Match Form1 ToString("F1")
      el.startingDb.value = Number(item.ml_dba).toFixed(1);
    }
  }

  function refreshManufacturers(preferred) {
    const caliber = el.caliber.value;
    const items = itemsForCaliber(caliber);
    const mans = uniqueSorted(items.map((d) => d.manufacturer));
    const selected =
      preferred && mans.includes(preferred)
        ? preferred
        : mans.includes(DEFAULT_MANUFACTURER) && caliber === DEFAULT_CALIBER
          ? DEFAULT_MANUFACTURER
          : mans[0] || "";
    fillSelect(el.manufacturer, mans, selected);
    refreshModels();
  }

  function refreshModels(preferred) {
    const caliber = el.caliber.value;
    const manufacturer = el.manufacturer.value;
    const items = data.filter(
      (d) => d.caliber === caliber && d.manufacturer === manufacturer
    );
    const models = uniqueSorted(items.map((d) => d.model));
    const selected =
      preferred && models.includes(preferred)
        ? preferred
        : models.includes(DEFAULT_MODEL) &&
            caliber === DEFAULT_CALIBER &&
            manufacturer === DEFAULT_MANUFACTURER
          ? DEFAULT_MODEL
          : models[0] || "";
    fillSelect(el.model, models, selected);
    onModelChanged();
  }

  function onModelChanged() {
    const item = findItem(el.caliber.value, el.manufacturer.value, el.model.value);
    applyItemToForm(item, true);
    renderRankedList();
    generateSPL();
  }

  function renderRankedList() {
    const caliber = el.caliber.value;
    const ranked = itemsForCaliber(caliber)
      .slice()
      .sort((a, b) => (a.ml_dba ?? 999) - (b.ml_dba ?? 999));

    el.rankedList.innerHTML = "";
    ranked.forEach((item) => {
      const li = document.createElement("li");
      const db =
        item.ml_dba != null ? Number(item.ml_dba).toFixed(2) : "—";
      // Match Form1: "{ml_dba:F2} dB — {manufacturer} {model}"
      li.textContent = db + " dB — " + item.manufacturer + " " + item.model;
      li.dataset.manufacturer = item.manufacturer;
      li.dataset.model = item.model;
      if (
        currentItem &&
        item.manufacturer === currentItem.manufacturer &&
        item.model === currentItem.model &&
        item.caliber === currentItem.caliber
      ) {
        li.classList.add("selected");
      }
      li.addEventListener("click", () => {
        fillSelect(
          el.manufacturer,
          uniqueSorted(itemsForCaliber(caliber).map((d) => d.manufacturer)),
          item.manufacturer
        );
        const models = uniqueSorted(
          data
            .filter(
              (d) =>
                d.caliber === caliber && d.manufacturer === item.manufacturer
            )
            .map((d) => d.model)
        );
        fillSelect(el.model, models, item.model);
        applyItemToForm(item, true);
        renderRankedList();
        generateSPL();
      });
      el.rankedList.appendChild(li);
    });
  }

  /** Inverse-square falloff with 1 m reference (mil-spec). */
  function splAtDistanceMeters(startingDb, distMeters, refMeters) {
    if (!refMeters || refMeters <= 0 || distMeters <= 0) return NaN;
    return startingDb - 20 * Math.log10(distMeters / refMeters);
  }

  /** Legacy yards helper (kept for debug / parity checks). */
  function splAtDistance(startingDb, distYards, refYards) {
    if (!refYards || refYards <= 0 || distYards <= 0) return NaN;
    return startingDb - 20 * Math.log10(distYards / refYards);
  }

  function yardsToMeters(yd) {
    return yd * YD_TO_M;
  }

  function metersToYards(m) {
    return m * M_TO_YD;
  }

  /** Nice adaptive step so the table stays roughly 40–80 rows. */
  function adaptiveStepMeters(maxM) {
    const targetRows = 55;
    const raw = Math.max(maxM / targetRows, 0.05);
    const nice = [
      0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250,
    ];
    for (let i = 0; i < nice.length; i++) {
      if (nice[i] >= raw) return nice[i];
    }
    return nice[nice.length - 1];
  }

  function getMaxDistanceM() {
    if (!el.maxDistance) return DEFAULT_MAX_DISTANCE_M;
    let v = parseFloat(el.maxDistance.value);
    if (!Number.isFinite(v)) v = DEFAULT_MAX_DISTANCE_M;
    return Math.min(MAX_DISTANCE_CAP_M, Math.max(MIN_DISTANCE_M, v));
  }

  function updateMaxDistanceLabel() {
    if (!el.maxDistanceLabel) return;
    const maxM = getMaxDistanceM();
    el.maxDistanceLabel.textContent =
      (Number.isInteger(maxM) ? String(maxM) : maxM.toFixed(1)) + " m";
  }

  function buildRows(startingDb, maxMeters) {
    const maxM = Math.max(MIN_DISTANCE_M, maxMeters || DEFAULT_MAX_DISTANCE_M);
    const step = adaptiveStepMeters(maxM);
    const rows = [];
    const seen = new Set();

    function pushM(m) {
      const key = m.toFixed(6);
      if (seen.has(key)) return;
      if (m < MIN_DISTANCE_M - 1e-9 || m > maxM + 1e-9) return;
      seen.add(key);
      const meters = m;
      const yd = metersToYards(meters);
      const spl = splAtDistanceMeters(startingDb, meters, REF_METERS);
      rows.push({ yd: yd, m: meters, spl: spl });
    }

    // Always include the 1 m reference when in range
    pushM(REF_METERS);

    for (let m = step; m < maxM - 1e-9; m += step) {
      // Avoid duplicating 1 m when step lands on it
      if (Math.abs(m - REF_METERS) < 1e-9) continue;
      pushM(Number(m.toFixed(6)));
    }
    pushM(maxM);

    rows.sort((a, b) => a.m - b.m);
    return rows;
  }

  /** Denser samples for a smooth chart curve (independent of table step). */
  function buildChartPoints(startingDb, maxMeters) {
    const maxM = Math.max(MIN_DISTANCE_M, maxMeters || DEFAULT_MAX_DISTANCE_M);
    const count = Math.min(200, Math.max(40, Math.round(maxM)));
    const points = [];
    for (let i = 0; i <= count; i++) {
      const m = MIN_DISTANCE_M + (maxM - MIN_DISTANCE_M) * (i / count);
      const spl = splAtDistanceMeters(startingDb, m, REF_METERS);
      points.push({
        x: Number(m.toFixed(4)),
        y: Number.isFinite(spl) ? Number(spl.toFixed(2)) : null,
      });
    }
    return points;
  }

  function splRowClass(spl) {
    if (spl >= 120) return "spl-red";
    if (spl >= 85) return "spl-yellow";
    if (spl >= 40) return "spl-green";
    return "spl-gray";
  }

  function formatYards(yd) {
    if (!Number.isFinite(yd)) return "—";
    if (Math.abs(yd - Math.round(yd)) < 1e-6) return String(Math.round(yd));
    return yd.toFixed(2);
  }

  function renderTable(rows) {
    el.splBody.innerHTML = "";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      if (Number.isFinite(row.spl)) {
        tr.className = splRowClass(row.spl);
      }
      const tdYd = document.createElement("td");
      tdYd.textContent = formatYards(row.yd);
      const tdM = document.createElement("td");
      tdM.textContent = row.m.toFixed(2);
      const tdSpl = document.createElement("td");
      tdSpl.textContent = Number.isFinite(row.spl) ? row.spl.toFixed(2) : "—";
      tr.appendChild(tdYd);
      tr.appendChild(tdM);
      tr.appendChild(tdSpl);
      el.splBody.appendChild(tr);
    });
  }

  function xAxisTickStep(maxM) {
    if (maxM <= 10) return 1;
    if (maxM <= 50) return 5;
    if (maxM <= 100) return 20;
    if (maxM <= 250) return 50;
    if (maxM <= 500) return 100;
    return 200;
  }

  function renderChart(startingDb, maxMeters) {
    const maxM = Math.max(MIN_DISTANCE_M, maxMeters || DEFAULT_MAX_DISTANCE_M);
    const points = buildChartPoints(startingDb, maxM);
    const ctx = document.getElementById("splChart").getContext("2d");
    if (chart) {
      chart.data.datasets[0].data = points;
      chart.options.scales.x.max = maxM;
      chart.options.scales.x.ticks.stepSize = xAxisTickStep(maxM);
      chart.options.plugins.title.text = "SPL (dB) vs Distance (m)";
      chart.update();
      return;
    }
    const gridColor = "rgba(154, 166, 184, 0.14)";
    const tickColor = "#9aa6b8";
    const titleColor = "#f4f7fb";
    chart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: "SPL (dB)",
            data: points,
            borderColor: "rgba(76, 201, 240, 0.95)",
            backgroundColor: "rgba(76, 201, 240, 0.12)",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.15,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: "SPL (dB) vs Distance (m)",
            color: titleColor,
            font: { size: 13, weight: "600" },
          },
        },
        scales: {
          x: {
            type: "linear",
            title: {
              display: true,
              text: "Distance (Meters)",
              color: tickColor,
            },
            min: 0,
            max: maxM,
            ticks: { stepSize: xAxisTickStep(maxM), color: tickColor },
            grid: { color: gridColor },
            border: { color: "rgba(180, 200, 230, 0.2)" },
          },
          y: {
            title: {
              display: true,
              text: "SPL (dB)",
              color: tickColor,
            },
            min: 0,
            max: 160,
            ticks: { stepSize: 20, color: tickColor },
            grid: { color: gridColor },
            border: { color: "rgba(180, 200, 230, 0.2)" },
          },
        },
      },
      plugins: [jorgeWatermarkPlugin, oshaLinesPlugin],
    });
  }

  function generateSPL() {
    const startingDb = parseFloat(el.startingDb.value);
    if (!Number.isFinite(startingDb)) {
      return;
    }
    updateMaxDistanceLabel();
    const maxM = getMaxDistanceM();
    const rows = buildRows(startingDb, maxM);
    renderTable(rows);
    renderChart(startingDb, maxM);
  }

  // Expose helpers for verification / debugging
  window.SoundDistanceCalc = {
    splAtDistance: splAtDistance,
    splAtDistanceMeters: splAtDistanceMeters,
    yardsToMeters: yardsToMeters,
    metersToYards: metersToYards,
    buildRows: buildRows,
    adaptiveStepMeters: adaptiveStepMeters,
    M_TO_YD: M_TO_YD,
    REF_YARDS: REF_YARDS,
    REF_METERS: REF_METERS,
    OSHA_LINES: OSHA_LINES,
  };

  el.caliber.addEventListener("change", () => refreshManufacturers());
  el.manufacturer.addEventListener("change", () => refreshModels());
  el.model.addEventListener("change", () => {
    onModelChanged();
  });
  el.startingDb.addEventListener("input", generateSPL);
  el.startingDb.addEventListener("change", generateSPL);
  if (el.maxDistance) {
    el.maxDistance.addEventListener("input", generateSPL);
    el.maxDistance.addEventListener("change", generateSPL);
  }

  function init() {
    if (!Array.isArray(window.SUPPRESSOR_DATA) || window.SUPPRESSOR_DATA.length === 0) {
      throw new Error("Missing window.SUPPRESSOR_DATA — ensure js/suppressors-data.js is loaded before app.js");
    }
    data = window.SUPPRESSOR_DATA;

    if (el.maxDistance) {
      el.maxDistance.value = String(DEFAULT_MAX_DISTANCE_M);
      updateMaxDistanceLabel();
    }

    const calibers = uniqueSorted(data.map((d) => d.caliber));
    const defaultCal = calibers.includes(DEFAULT_CALIBER)
      ? DEFAULT_CALIBER
      : calibers[0];
    fillSelect(el.caliber, calibers, defaultCal);

    refreshManufacturers(DEFAULT_MANUFACTURER);
    // generateSPL called from onModelChanged via refreshModels
  }

  try {
    init();
  } catch (err) {
    console.error(err);
    el.rankedList.innerHTML =
      "<li>Error: suppressor data missing. Ensure js/suppressors-data.js loads before app.js.</li>";
  }
})();
