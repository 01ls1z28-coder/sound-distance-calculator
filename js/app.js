(function () {
  "use strict";

  const YD_TO_M = 0.9144;
  const M_TO_YD = 1.09361;
  // Form1 mil-spec: always 1 meter reference → yards
  const REF_METERS = 1;
  const REF_YARDS = REF_METERS * M_TO_YD;
  const DEFAULT_CALIBER = "22 LR - Bolt Action TBS2024";
  const DEFAULT_MANUFACTURER = "AAC";
  const DEFAULT_MODEL = "Element 3";

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
      ctx.font = "600 15px \"Segoe UI\", system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(text, chartArea.right - 8, chartArea.bottom - 8);
      ctx.restore();
    },
  };

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

  /** Inverse-square falloff in yards (Form1 mil-spec math). */
  function splAtDistance(startingDb, distYards, refYards) {
    if (!refYards || refYards <= 0 || distYards <= 0) return NaN;
    return startingDb - 20 * Math.log10(distYards / refYards);
  }

  function yardsToMeters(yd) {
    return yd * YD_TO_M;
  }

  function buildRows(startingDb, refYards) {
    const rows = [];
    for (let yd = 5; yd <= 1000; yd += 5) {
      const meters = yardsToMeters(yd);
      const spl = splAtDistance(startingDb, yd, refYards);
      rows.push({ yd: yd, m: meters, spl: spl });
    }
    return rows;
  }

  function splRowClass(spl) {
    if (spl >= 120) return "spl-red";
    if (spl >= 85) return "spl-yellow";
    if (spl >= 40) return "spl-green";
    return "spl-gray";
  }

  function renderTable(rows) {
    el.splBody.innerHTML = "";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      if (Number.isFinite(row.spl)) {
        tr.className = splRowClass(row.spl);
      }
      const tdYd = document.createElement("td");
      tdYd.textContent = String(row.yd);
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

  function renderChart(rows) {
    const points = rows.map((r) => ({
      x: r.yd,
      y: Number.isFinite(r.spl) ? Number(r.spl.toFixed(2)) : null,
    }));
    const ctx = document.getElementById("splChart").getContext("2d");
    if (chart) {
      chart.data.datasets[0].data = points;
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
            text: "SPL (dB) vs Distance (yd)",
            color: titleColor,
            font: { size: 13, weight: "600" },
          },
        },
        scales: {
          x: {
            type: "linear",
            title: {
              display: true,
              text: "Distance (Yards)",
              color: tickColor,
            },
            min: 0,
            max: 1000,
            ticks: { stepSize: 200, color: tickColor },
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
      plugins: [jorgeWatermarkPlugin],
    });
  }

  function generateSPL() {
    const startingDb = parseFloat(el.startingDb.value);
    if (!Number.isFinite(startingDb)) {
      return;
    }
    // Hardcoded Form1 mil-spec: ref = 1 m → yards via 1 * 1.09361
    const rows = buildRows(startingDb, REF_YARDS);
    renderTable(rows);
    renderChart(rows);
  }

  // Expose helpers for verification / debugging
  window.SoundDistanceCalc = {
    splAtDistance: splAtDistance,
    yardsToMeters: yardsToMeters,
    buildRows: buildRows,
    M_TO_YD: M_TO_YD,
    REF_YARDS: REF_YARDS,
  };

  el.caliber.addEventListener("change", () => refreshManufacturers());
  el.manufacturer.addEventListener("change", () => refreshModels());
  el.model.addEventListener("change", () => {
    onModelChanged();
  });
  el.startingDb.addEventListener("input", generateSPL);
  el.startingDb.addEventListener("change", generateSPL);

  function init() {
    if (!Array.isArray(window.SUPPRESSOR_DATA) || window.SUPPRESSOR_DATA.length === 0) {
      throw new Error("Missing window.SUPPRESSOR_DATA — ensure js/suppressors-data.js is loaded before app.js");
    }
    data = window.SUPPRESSOR_DATA;

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
