import { requireAuth, logout } from "./auth.js";
import {
  subscribeAllEntries, getAllUsers,
  buildDailySummaries, buildProjectList, chartGridColor,
} from "./store.js";
import { buildInternPicker } from "./intern-picker.js";

const CHART_DEFS = [
  { key: "avgInterest",   label: "Ciekawość",    color: "#534AB7" },
  { key: "avgLearning",   label: "Nauka",        color: "#0F6E56" },
  { key: "avgDifficulty", label: "Trudność",     color: "#993C1D" },
  { key: "avgMood",       label: "Samopoczucie", color: "#B8860B" },
];

let chart      = null;
let allEntries = [];
let selectedUid = new URLSearchParams(window.location.search).get('uid') || null;

async function init() {
  const { user } = await requireAuth("admin");

  document.getElementById("user-name").textContent = user.displayName ?? user.email;
  const avatar = document.getElementById("user-avatar");
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ""; }
  document.getElementById("btn-logout").addEventListener("click", logout);

  const users = await getAllUsers();
  buildInternPicker(
    document.getElementById("intern-picker-wrap"),
    users, selectedUid,
    (uid) => { selectedUid = uid; renderView(); }
  );

  subscribeAllEntries((entries) => {
    allEntries = entries;
    renderView();
  });
}

function renderView() {
  const entries = selectedUid
    ? allEntries.filter(e => e.uid === selectedUid)
    : allEntries;

  if (!entries.length) {
    document.getElementById("status").textContent = "Brak wpisów.";
    document.getElementById("stats-bar").style.display   = "none";
    document.getElementById("projects-section").style.display = "none";
    if (chart) { chart.destroy(); chart = null; }
    document.getElementById("chart-ticks").innerHTML = "";
    return;
  }
  document.getElementById("status").textContent = "";
  renderStats(entries);
  renderChart(buildDailySummaries(entries));
  renderProjects(buildProjectList(entries));
}

function renderStats(entries) {
  const now         = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  startOfWeek.setHours(0, 0, 0, 0);

  const fmt   = h => `${Math.round(h * 10) / 10}h`;
  const total = entries.reduce((s, e) => s + e.hours, 0);
  const month = entries
    .filter(e => e.timestamp.getFullYear() === now.getFullYear() && e.timestamp.getMonth() === now.getMonth())
    .reduce((s, e) => s + e.hours, 0);
  const week = entries
    .filter(e => e.timestamp >= startOfWeek)
    .reduce((s, e) => s + e.hours, 0);

  document.getElementById("stat-total").textContent = fmt(total);
  document.getElementById("stat-month").textContent = fmt(month);
  document.getElementById("stat-week").textContent  = fmt(week);
  document.getElementById("stats-bar").style.display = "";
}

function renderChart(summaries) {
  if (chart) { chart.destroy(); chart = null; }

  const dateLabels = summaries.map(s => s.dateLabel);
  const hoursArr   = summaries.map(s => s.totalHours);

  document.getElementById("chart-legend").innerHTML = CHART_DEFS.map(def =>
    `<span class="legend-item">
       <span class="legend-dot" style="background:${def.color}"></span>${def.label}
     </span>`
  ).join("");

  const PX_PER_DAY = 170;
  const chartW     = Math.max(summaries.length * PX_PER_DAY, 600);
  const chartH     = 380;
  const canvas     = document.getElementById("chart-main");
  canvas.width  = chartW; canvas.height = chartH;
  canvas.style.width = chartW + "px"; canvas.style.height = chartH + "px";

  chart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: dateLabels,
      datasets: CHART_DEFS.map(def => ({
        label:                def.label,
        data:                 summaries.map(s => s[def.key]),
        borderColor:          def.color,
        backgroundColor:      def.color + "18",
        tension:              0.35,
        pointRadius:          6,
        pointHoverRadius:     9,
        pointBackgroundColor: def.color,
      })),
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 10, ticks: { stepSize: 1 }, grid: { color: chartGridColor() } },
        x: {
          ticks: { callback: (_, i) => `${hoursArr[i]}h`, color: "#888", font: { size: 11 } },
          grid: { display: false },
        },
      },
      onClick(event, _el, c) {
        const xScale = c.scales.x;
        let closest = -1, minDist = 40;
        dateLabels.forEach((_, i) => {
          const dist = Math.abs(event.x - xScale.getPixelForTick(i));
          if (dist < minDist) { minDist = dist; closest = i; }
        });
        if (closest >= 0) {
          const uidParam = selectedUid ? `&uid=${selectedUid}` : "";
          window.location.href = `admin-day.html?date=${summaries[closest].date}${uidParam}`;
        }
      },
      plugins: { legend: { display: false } },
    },
  });

  const ticks = document.getElementById("chart-ticks");
  ticks.innerHTML = "";
  ticks.style.width = chartW + "px";
  summaries.forEach((s, i) => {
    const uidParam = selectedUid ? `&uid=${selectedUid}` : "";
    const a = document.createElement("a");
    a.href      = `admin-day.html?date=${s.date}${uidParam}`;
    a.className = "tick-btn";
    a.textContent = s.dateLabel;
    a.style.left  = chart.scales.x.getPixelForTick(i) + "px";
    ticks.appendChild(a);
  });

  requestAnimationFrame(() => {
    document.getElementById("chart-scroll").scrollLeft =
      document.getElementById("chart-scroll").scrollWidth;
  });
}

function renderProjects(projects) {
  const list  = document.getElementById("projects-list");
  list.innerHTML = "";
  const plural = n => n === 1 ? "wpis" : n < 5 ? "wpisy" : "wpisów";
  projects.forEach(p => {
    const uidParam = selectedUid ? `&uid=${selectedUid}` : "";
    const card = document.createElement("a");
    card.href      = `admin-project.html?name=${encodeURIComponent(p.name)}${uidParam}`;
    card.className = "project-card";
    card.innerHTML = `
      <div class="project-card-header">
        <span class="project-name">${p.name}</span>
        <span class="project-hours">${p.hours}h</span>
      </div>
      <div class="project-meta">${p.count} ${plural(p.count)}</div>
    `;
    list.appendChild(card);
  });
  document.getElementById("projects-section").style.display = "";
}

init();
