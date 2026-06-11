import { requireAuth, logout } from "./auth.js";
import {
  subscribeUserEntries, subscribeAllProjectNames,
  buildDailySummaries, buildProjectList, chartGridColor,
} from "./store.js";

const CHART_DEFS = [
  { key: "avgInterest",   label: "Ciekawość",    color: "#534AB7" },
  { key: "avgLearning",   label: "Nauka",        color: "#0F6E56" },
  { key: "avgDifficulty", label: "Trudność",     color: "#993C1D" },
  { key: "avgMood",       label: "Samopoczucie", color: "#B8860B" },
];

let chart          = null;
let currentEntries = [];
let allProjectNames = [];

async function init() {
  const { user } = await requireAuth("intern");

  document.getElementById("user-name").textContent = user.displayName ?? user.email;
  const avatar = document.getElementById("user-avatar");
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ""; }

  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("project-goto-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("project-goto-input").value.trim();
    if (name) window.location.href = `project.html?name=${encodeURIComponent(name)}`;
  });
  document.getElementById("btn-export").addEventListener("click", () => exportCSV(currentEntries));

  subscribeAllProjectNames((names) => {
    allProjectNames = names;
    renderProjectsSection();
  });

  subscribeUserEntries(user.uid, (entries) => {
    currentEntries = entries;
    if (entries.length) {
      document.getElementById("status").textContent = "";
      renderStats(entries);
      renderChart(buildDailySummaries(entries));
      document.getElementById("btn-export").style.display = "";
    } else {
      document.getElementById("status").textContent = "Wejdź w projekt, utwórz zadanie i dodaj wpis.";
      document.getElementById("stats-bar").style.display = "none";
    }
    renderProjectsSection();
  });
}

function renderProjectsSection() {
  if (!allProjectNames.length) {
    document.getElementById("projects-section").style.display = "none";
    return;
  }
  const entryMap = {};
  buildProjectList(currentEntries).forEach(p => { entryMap[p.name] = p; });
  renderProjects(allProjectNames.map(name => entryMap[name] ?? { name, hours: 0, count: 0 }));
}

function renderStats(entries) {
  const now          = new Date();
  const startOfWeek  = new Date(now);
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

  const dates      = summaries.map(s => s.date);
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
        if (closest >= 0) window.location.href = `day.html?date=${dates[closest]}`;
      },
      plugins: { legend: { display: false } },
    },
  });

  const ticks = document.getElementById("chart-ticks");
  ticks.innerHTML = "";
  ticks.style.width = chartW + "px";
  dates.forEach((date, i) => {
    const a = document.createElement("a");
    a.href      = `day.html?date=${date}`;
    a.className = "tick-btn";
    a.textContent = dateLabels[i];
    a.style.left  = chart.scales.x.getPixelForTick(i) + "px";
    ticks.appendChild(a);
  });

  requestAnimationFrame(() => {
    document.getElementById("chart-scroll").scrollLeft = document.getElementById("chart-scroll").scrollWidth;
  });
}

function renderProjects(projects) {
  const list = document.getElementById("projects-list");
  list.innerHTML = "";
  const plural = n => n === 1 ? "wpis" : n < 5 ? "wpisy" : "wpisów";
  projects.forEach(p => {
    const card = document.createElement("a");
    card.href      = `project.html?name=${encodeURIComponent(p.name)}`;
    card.className = "project-card";
    card.innerHTML = `
      <div class="project-card-header">
        <span class="project-name">${p.name}</span>
        ${p.hours ? `<span class="project-hours">${p.hours}h</span>` : ""}
      </div>
      <div class="project-meta">${p.count ? `${p.count} ${plural(p.count)}` : "Brak wpisów"}</div>
    `;
    list.appendChild(card);
  });
  document.getElementById("projects-section").style.display = "";
}

function exportCSV(entries) {
  const esc  = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["data", "projekt", "tytuł", "czas", "ciekawość", "nauka", "trudność", "samopoczucie"].map(esc).join(","),
    ...entries.map(e => [
      e.date, e.project, e.title, e.hours,
      e.ratings.interest, e.ratings.learning, e.ratings.difficulty, e.ratings.mood,
    ].map(esc).join(",")),
  ];
  const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `dzienniczek-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

init();
