import { requireAuth, logout } from "./auth.js";
import {
  subscribeUserEntries, subscribeAllProjectNames, subscribeAllProjectDocs,
  subscribeAllTasks, buildDailySummaries, buildProjectList, chartGridColor, getAllUsers,
} from "./store.js";
import { setupAddProjectModal, openAddProjectModal } from "./add-project-modal.js";
import { setupProjectMembersModal, openProjectMembersModal } from "./project-members-modal.js";

const CHART_DEFS = [
  { key: "avgInterest",   label: "Ciekawość",    color: "#534AB7" },
  { key: "avgLearning",   label: "Nauka",        color: "#0F6E56" },
  { key: "avgDifficulty", label: "Trudność",     color: "#993C1D" },
  { key: "avgMood",       label: "Samopoczucie", color: "#B8860B" },
];

let chart            = null;
let chartRafHandle   = null;
let currentEntries   = [];
let currentSummaries = [];
let chartFilter      = 'all';
let allProjectNames  = [];
let projectDocs      = [];
let allTasks         = [];
let allUsers         = [];
let currentUser      = null;
let currentRole      = null;

async function init() {
  const { user, role } = await requireAuth("intern");
  currentUser = user;
  currentRole = role;

  document.getElementById("user-name").textContent = user.displayName ?? user.email;
  const avatar = document.getElementById("user-avatar");
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ""; }

  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("btn-export").addEventListener("click", () => exportCSV(currentEntries));
  document.getElementById("projects-filter").addEventListener("input", () => renderProjectsSection());

  document.querySelectorAll('.chart-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chartFilter = btn.dataset.filter;
      document.querySelectorAll('.chart-filter-btn').forEach(b => b.classList.remove('chart-filter-btn--active'));
      btn.classList.add('chart-filter-btn--active');
      if (currentSummaries.length) renderChart(currentSummaries);
    });
  });

  window.addEventListener('resize', () => {
    if (currentSummaries.length) renderChart(currentSummaries);
  });

  allUsers = await getAllUsers();
  setupAddProjectModal(user.uid, { allUsers });
  setupProjectMembersModal();

  subscribeAllProjectNames((names) => {
    allProjectNames = names;
    renderProjectsSection();
  });

  subscribeAllProjectDocs((docs) => {
    projectDocs = docs;
    renderProjectsSection();
  });

  subscribeAllTasks((tasks) => {
    allTasks = tasks;
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
  const uid = currentUser?.uid;
  const managedNames = projectDocs
    .filter(p => p.uid === uid || (p.members && p.members[uid]))
    .map(p => p.name);
  const merged = [...new Set(managedNames)].sort();

  const query = (document.getElementById("projects-filter")?.value ?? "").trim().toLowerCase();
  const filtered = query ? merged.filter(n => n.toLowerCase().includes(query)) : merged;

  const entryMap  = {};
  buildProjectList(currentEntries).forEach(p => { entryMap[p.name] = p; });
  const docMap = {};
  projectDocs.forEach(p => { docMap[p.name] = p; });
  const taskCountMap = {};
  allTasks.forEach(t => {
    const n = t.projectName;
    if (!n) return;
    if (!taskCountMap[n]) taskCountMap[n] = { done: 0, total: 0 };
    taskCountMap[n].total++;
    if (t.status === "done") taskCountMap[n].done++;
  });

  const usersById = new Map(allUsers.map(u => [u.uid, u]));

  const enrich = name => {
    const doc = docMap[name];
    const memberUids = doc
      ? [...new Set([doc.uid, ...Object.keys(doc.members || {})])]
      : [];
    const members = memberUids.map(uid => usersById.get(uid)).filter(Boolean);
    return {
      ...(entryMap[name] ?? { name, hours: 0, count: 0 }),
      status:     doc?.status,
      createdAt:  doc?.createdAt,
      doc,
      tasksDone:  taskCountMap[name]?.done  ?? 0,
      tasksTotal: taskCountMap[name]?.total ?? 0,
      members,
    };
  };

  const active = filtered.filter(n => docMap[n]?.status !== "done").map(enrich);
  const done   = filtered.filter(n => docMap[n]?.status === "done")
    .map(enrich)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

  renderProjects(active, done);
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

function applyChartFilter(summaries, filter) {
  if (filter === 'all') return summaries;
  const cutoff = new Date();
  if (filter === 'week')  cutoff.setDate(cutoff.getDate() - 7);
  if (filter === 'month') cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return summaries.filter(s => s.date >= cutoffStr);
}

function absOffsetTop(el) {
  let top = 0;
  for (let e = el; e; e = e.offsetParent) top += e.offsetTop;
  return top;
}

function renderChart(summaries) {
  currentSummaries = summaries;
  if (chartRafHandle) cancelAnimationFrame(chartRafHandle);

  document.getElementById("chart-legend").innerHTML = CHART_DEFS.map(def =>
    `<span class="legend-item">
       <span class="legend-dot" style="background:${def.color}"></span>${def.label}
     </span>`
  ).join("");

  chartRafHandle = requestAnimationFrame(() => {
    chartRafHandle = null;
    if (chart) { chart.destroy(); chart = null; }

    const data       = applyChartFilter(summaries, chartFilter);
    const dates      = data.map(s => s.date);
    const dateLabels = data.map(s => s.dateLabel);
    const hoursArr   = data.map(s => s.totalHours);

    const TICKS_H        = 36;
    const MIN_PX_PER_DAY = 70;
    const scrollEl   = document.getElementById("chart-scroll");
    const containerW = scrollEl.offsetWidth || 800;
    const chartW     = Math.max(data.length * MIN_PX_PER_DAY, containerW, 400);

    // Dynamiczny podział wysokości: wykres 60%, projekty 40%
    const wrap       = document.querySelector('.chart-single-wrap');
    const filterBar  = document.querySelector('.chart-filter-bar');
    const legend     = document.getElementById('chart-legend');
    const wrapTop    = absOffsetTop(wrap) - window.scrollY;
    const availH     = window.innerHeight - Math.max(wrapTop, 0);
    const overheadH  = (filterBar?.offsetHeight || 0) + (legend?.offsetHeight || 0) + TICKS_H;
    const chartSectH = Math.max(Math.round(availH * 0.50), overheadH + 220);
    const chartH     = chartSectH - overheadH;

    // wrap.offsetHeight = wrapVert + chartSectH — musimy to odjąć od projectsH
    const wrapCS   = getComputedStyle(wrap);
    const wrapVert = parseFloat(wrapCS.paddingTop) + parseFloat(wrapCS.paddingBottom)
                   + parseFloat(wrapCS.borderTopWidth) + parseFloat(wrapCS.borderBottomWidth);
    const projectsH = availH - wrapVert - chartSectH;

    scrollEl.style.height = (chartH + TICKS_H) + "px";

    const projSection = document.getElementById('projects-section');
    if (projSection) {
      projSection.style.height    = projectsH > 80 ? projectsH + 'px' : '';
      projSection.style.overflowY = projectsH > 80 ? 'auto' : '';
    }

    const canvas  = document.getElementById("chart-main");
    canvas.width  = chartW; canvas.height = chartH;
    canvas.style.width = chartW + "px"; canvas.style.height = chartH + "px";

    chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: dateLabels,
        datasets: CHART_DEFS.map(def => ({
          label:                def.label,
          data:                 data.map(s => s[def.key]),
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

    scrollEl.scrollLeft = scrollEl.scrollWidth;
  });
}

function renderProjects(active, done = []) {
  const list = document.getElementById("projects-list");
  list.innerHTML = "";

  const addCard = document.createElement("button");
  addCard.type = "button";
  addCard.className = "project-card project-card--add";
  addCard.innerHTML = `<span class="project-card-add-icon">+</span><span class="project-card-add-label">Dodaj projekt</span>`;
  addCard.addEventListener("click", openAddProjectModal);
  list.appendChild(addCard);

  const avatarHtml = u => u?.photoURL
    ? `<img src="${u.photoURL}" class="card-member-avatar" referrerpolicy="no-referrer" alt="">`
    : `<div class="card-member-avatar card-member-initials">${(u?.displayName || u?.name || u?.email || "?")[0].toUpperCase()}</div>`;

  const makeCard = (p) => {
    const card = document.createElement("a");
    card.href      = `project.html?name=${encodeURIComponent(p.name)}`;
    card.className = "project-card" + (p.status === "done" ? " project-card--done" : "");

    const tasksMeta = p.tasksTotal ? `${p.tasksDone}/${p.tasksTotal} zadań` : "Brak zadań";
    const members   = p.members ?? [];

    let memberHtml = "";
    if (members.length === 1) {
      const u = members[0];
      const name = u?.displayName || u?.name || u?.email || "Stażysta";
      memberHtml = `
        <div class="card-member-single">
          ${avatarHtml(u)}
          <span class="card-member-name">${name}</span>
        </div>`;
    } else if (members.length > 1) {
      const MAX = 3;
      const shown = members.slice(0, MAX);
      const extra = members.length - MAX;
      memberHtml = `
        <div class="card-members-multi">
          <div class="card-member-avatars">
            ${shown.map(avatarHtml).join("")}
            ${extra > 0 ? `<div class="card-member-avatar card-member-extra">+${extra}</div>` : ""}
          </div>
          <span class="link-members-count">${members.length} stażystów</span>
        </div>`;
    }

    card.innerHTML = `
      <div class="project-card-header">
        <span class="project-name">${p.name}</span>
        ${p.status === "done" ? `<span class="project-done-badge">DONE</span>` : p.hours ? `<span class="project-hours">${p.hours}h</span>` : ""}
      </div>
      <div class="project-meta">${tasksMeta}</div>
      ${memberHtml}
    `;

    if (members.length > 1 && p.doc) {
      card.querySelector(".link-members-count")?.addEventListener("click", (e) => {
        e.preventDefault();
        openProjectMembersModal({ project: p.doc, currentUser, currentUserRole: currentRole });
      });
    }

    return card;
  };

  active.forEach(p => list.appendChild(makeCard(p)));

  if (done.length) {
    const sep = document.createElement("div");
    sep.className = "projects-done-separator";
    sep.textContent = "Zakończone";
    list.appendChild(sep);
    done.forEach(p => list.appendChild(makeCard(p)));
  }

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
