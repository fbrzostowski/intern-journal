import { requireAuth } from "./auth.js";
import { subscribeTaskEntries, subscribeTask, updateTaskStatus, getAllUsers, chartGridColor, deleteEntry } from "./store.js";
import { setupEditModal, openEditModal } from "./edit-modal.js";
import { setupAddModal, openAddModal } from "./add-entry-modal.js";
import { setupMembersModal, openMembersModal, updateMembersModal } from "./task-members-modal.js";
import { buildInternPicker } from "./intern-picker.js";

let confirmModal = null;

function setupConfirmModal() {
  confirmModal = document.createElement("div");
  confirmModal.className = "modal-overlay";
  confirmModal.style.display = "none";
  confirmModal.innerHTML = `
    <div class="modal-box" style="max-width:420px">
      <h2 style="margin-bottom:12px">Edytuj wpis</h2>
      <p id="confirm-modal-msg" style="margin-bottom:24px;color:var(--text-secondary,#555);line-height:1.5"></p>
      <div class="form-actions">
        <button type="button" id="btn-confirm-cancel" class="btn-secondary">Anuluj</button>
        <button type="button" id="btn-confirm-ok" class="btn-add">Kontynuuj</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmModal);
}

function showConfirm(message) {
  return new Promise((resolve) => {
    document.getElementById("confirm-modal-msg").textContent = message;

    const btnOk     = document.getElementById("btn-confirm-ok");
    const btnCancel = document.getElementById("btn-confirm-cancel");

    function finish(result) {
      confirmModal.style.display = "none";
      btnOk.removeEventListener("click", onOk);
      btnCancel.removeEventListener("click", onCancel);
      confirmModal.removeEventListener("click", onOverlay);
      resolve(result);
    }

    function onOk()      { finish(true);  }
    function onCancel()  { finish(false); }
    function onOverlay(e) { if (e.target === confirmModal) finish(false); }

    btnOk.addEventListener("click", onOk);
    btnCancel.addEventListener("click", onCancel);
    confirmModal.addEventListener("click", onOverlay);
    confirmModal.style.display = "flex";
  });
}

const STATUS_MAP = {
  todo:      { label: "Nie zrobione",   cls: "status-todo" },
  reviewing: { label: "Do sprawdzenia", cls: "status-reviewing" },
  done:      { label: "Wykonane",       cls: "status-done" },
};

const CATEGORIES = [
  { key: "interest",   label: "Ciekawość",    color: "#534AB7" },
  { key: "learning",   label: "Nauka",        color: "#0F6E56" },
  { key: "difficulty", label: "Trudność",     color: "#993C1D" },
  { key: "mood",       label: "Samopoczucie", color: "#B8860B" },
];

async function init() {
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get("id");
  if (!taskId) { window.location.href = "index.html"; return; }

  const { user, role } = await requireAuth();

  document.getElementById("user-name").textContent = user.displayName ?? user.email;
  const avatar = document.getElementById("user-avatar");
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ""; }

  setupEditModal();
  setupAddModal(user.uid);
  setupMembersModal();
  setupConfirmModal();

  const usersMap = new Map();
  try {
    const users = await getAllUsers();
    users.forEach(u => usersMap.set(u.uid, u));
  } catch (_) {}

  let currentAccess      = null;
  let currentTaskStatus  = "todo";
  let currentEntries     = [];
  let activePeriod       = "all";
  let selectedAuthorUid  = null;
  let authorsKey         = "";
  let hasMultipleInterns = false;
  let activeView         = "summary";

  // Picker stażystów jest widoczny tylko w zakładce „Wszystko" i gdy
  // wpisy ma co najmniej dwóch stażystów.
  function updatePickerVisibility() {
    const wrap = document.getElementById("intern-picker-wrap");
    wrap.style.display = (activeView === "all" && hasMultipleInterns) ? "" : "none";
  }

  function periodStart() {
    const now = new Date();
    if (activePeriod === "week") {
      const d = new Date(now);
      d.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (activePeriod === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
    return null;
  }

  function rerenderEntries() {
    if (currentAccess === null) return;
    const start = periodStart();
    let filtered = start ? currentEntries.filter(e => e.timestamp >= start) : currentEntries;
    if (selectedAuthorUid) filtered = filtered.filter(e => e.uid === selectedAuthorUid);
    renderEntries(filtered, user, currentAccess, currentTaskStatus, taskId, usersMap);
  }

  // Buduje/odświeża filtr stażystów na podstawie autorów wpisów.
  function buildAuthorFilter() {
    const authorUids = [...new Set(currentEntries.map(e => e.uid))];
    const authors    = authorUids.map(uid => usersMap.get(uid)).filter(Boolean);
    const interns    = authors.filter(u => u.role === "intern");
    const wrap       = document.getElementById("intern-picker-wrap");

    // Filtr ma sens tylko gdy wpisy ma co najmniej dwóch stażystów.
    hasMultipleInterns = interns.length >= 2;

    if (!hasMultipleInterns) {
      wrap.innerHTML = "";
      authorsKey = "";
      if (selectedAuthorUid) { selectedAuthorUid = null; rerenderEntries(); }
      updatePickerVisibility();
      return;
    }

    const key = interns.map(u => u.uid).sort().join(",");
    if (key !== authorsKey) { // przebuduj tylko gdy zmienił się skład stażystów
      authorsKey = key;

      // Jeśli wybrany stażysta zniknął z listy, zresetuj filtr.
      if (selectedAuthorUid && !interns.some(u => u.uid === selectedAuthorUid)) {
        selectedAuthorUid = null;
      }

      wrap.innerHTML = "";
      buildInternPicker(wrap, interns, selectedAuthorUid, (uid) => {
        selectedAuthorUid = uid;
        rerenderEntries();
      });
    }
    updatePickerVisibility();
  }

  function updatePeriodBtns() {
    document.querySelectorAll(".period-btn").forEach(btn =>
      btn.classList.toggle("period-btn--active", btn.dataset.period === activePeriod));
  }

  document.querySelectorAll(".period-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activePeriod = btn.dataset.period;
      updatePeriodBtns();
      rerenderEntries();
    });
  });
  updatePeriodBtns();

  // Przełączanie zakładek: Podsumowanie / Wszystko
  function setActiveView(view) {
    activeView = view;
    document.querySelectorAll(".view-tab").forEach(btn =>
      btn.classList.toggle("view-tab--active", btn.dataset.view === view));
    document.getElementById("summary-section").style.display = view === "summary" ? "" : "none";
    document.getElementById("all-section").style.display     = view === "all"     ? "" : "none";
    updatePickerVisibility();
  }
  document.querySelectorAll(".view-tab").forEach(btn => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.view));
  });
  setActiveView(activeView);

  function getAccess(task) {
    if (role === "admin")          return "admin";
    if (task.uid === user.uid)     return "owner";
    const m = task.members?.[user.uid];
    if (m)                         return m; // "read" | "write"
    return null;
  }

  function canWrite(access) {
    return access === "owner" || access === "write";
  }

  subscribeTask(taskId, (task) => {
    if (!task) { window.location.href = "index.html"; return; }

    currentAccess     = getAccess(task);
    currentTaskStatus = task.status ?? "todo";

    if (!currentAccess) {
      window.location.href = task.projectName
        ? `project.html?name=${encodeURIComponent(task.projectName)}`
        : "index.html";
      return;
    }

    const projectPage = role === "admin" ? "admin-project.html" : "project.html";
    const projectUrl  = `${projectPage}?name=${encodeURIComponent(task.projectName)}`;
    document.getElementById("task-title").innerHTML =
      `<a href="${projectUrl}" class="task-breadcrumb-project">${task.projectName}</a>` +
      `<span class="task-breadcrumb-sep">/</span>` +
      `<span class="task-breadcrumb-name">${task.title}</span>`;
    document.getElementById("btn-back").href = projectUrl;
    document.title = `Zadanie: ${task.projectName}/${task.title}`;

    // "Dodaj wpis"
    const btnAdd = document.getElementById("btn-add-entry");
    if (canWrite(currentAccess)) {
      btnAdd.style.display = "";
      btnAdd.onclick = () => openAddModal({ taskId, taskTitle: task.title, projectName: task.projectName });
    } else {
      btnAdd.style.display = "none";
    }

    // "Dostęp" (zarządzaj memberami)
    const btnManage = document.getElementById("btn-manage-members");
    if (currentAccess === "owner" || currentAccess === "admin") {
      btnManage.style.display = "";
      btnManage.onclick = () => openMembersModal({ task, currentUser: user, currentUserRole: role });
    } else {
      btnManage.style.display = "none";
    }

    // Aktualizuj modal memberów jeśli otwarty
    updateMembersModal({ task, currentUser: user, currentUserRole: role });

    // Status badge
    const s = STATUS_MAP[task.status] ?? STATUS_MAP.todo;
    let badge = document.getElementById("task-status-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "task-status-badge";
      document.getElementById("task-title").after(badge);
    }
    badge.textContent = s.label;
    badge.className   = `task-status-badge ${s.cls}`;

    // "Oznacz jako skończone"
    let btnDone = document.getElementById("btn-mark-done");
    if (task.status === "todo" && canWrite(currentAccess)) {
      if (!btnDone) {
        btnDone = document.createElement("button");
        btnDone.id        = "btn-mark-done";
        btnDone.className = "btn-mark-done";
        btnDone.textContent = "Oznacz jako skończone";
        document.getElementById("btn-add-entry").insertAdjacentElement("beforebegin", btnDone);
        btnDone.addEventListener("click", async () => {
          btnDone.disabled = true;
          await updateTaskStatus(taskId, "reviewing");
          window.location.href = `project.html?name=${encodeURIComponent(task.projectName)}`;
        });
      }
    } else {
      btnDone?.remove();
    }

    // "Zaakceptuj" — admin zatwierdza zadanie „Do sprawdzenia" jako „Wykonane"
    let btnAccept = document.getElementById("btn-accept");
    if (task.status === "reviewing" && currentAccess === "admin") {
      if (!btnAccept) {
        btnAccept = document.createElement("button");
        btnAccept.id        = "btn-accept";
        btnAccept.className  = "btn-accept";
        btnAccept.textContent = "Zaakceptuj jako wykonane";
        document.getElementById("btn-add-entry").insertAdjacentElement("beforebegin", btnAccept);
        btnAccept.addEventListener("click", async () => {
          btnAccept.disabled = true;
          await updateTaskStatus(taskId, "done");
        });
      }
    } else {
      btnAccept?.remove();
    }

    // Renderuj wpisy (dostęp już znany)
    rerenderEntries();
  });

  subscribeTaskEntries(taskId, (entries) => {
    currentEntries = entries;
    buildAuthorFilter();
    renderSummary(entries, usersMap);
    rerenderEntries();
  });
}

function renderEntries(entries, user, access, taskStatus = "todo", taskId = null, usersMap = new Map()) {
  const canEdit = access === "owner" || access === "write";

  if (!entries.length) {
    document.getElementById("total-hours").textContent =
      canEdit ? "Brak wpisów — kliknij «+ Dodaj wpis» żeby zacząć." : "Brak wpisów.";
    document.getElementById("charts-grid").innerHTML = "";
    return;
  }

  const total = entries.reduce((s, e) => s + e.hours, 0);
  document.getElementById("total-hours").textContent =
    `${Math.round(total * 10) / 10}h łącznie · ${entries.length} ${plural(entries.length)}`;

  const grid = document.getElementById("charts-grid");
  grid.innerHTML = "";

  entries.forEach((entry, i) => {
    const dateObj = new Date(entry.date + "T12:00:00");
    const dateStr = dateObj.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });

    const showEdit   = canEdit && entry.uid === user.uid;
    const authorData = usersMap.get(entry.uid);
    const authorName = authorData
      ? (authorData.displayName || authorData.name || authorData.email || "Stażysta")
      : "Stażysta";
    const authorAvatar = authorData?.photoURL
      ? `<img src="${authorData.photoURL}" class="entry-author-avatar" referrerpolicy="no-referrer" alt="">`
      : `<div class="entry-author-initials">${authorName[0].toUpperCase()}</div>`;

    const wrap = document.createElement("div");
    wrap.className = "chart-wrap entry-card";
    wrap.innerHTML = `
      <div class="entry-info">
        <div class="entry-header">
          <span class="entry-title">${entry.title}</span>
          <div class="entry-header-right">
            <span class="entry-hours">${entry.hours}h</span>
            ${showEdit ? `
              <button class="btn-edit-entry" title="Edytuj wpis">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="btn-delete-entry" title="Usuń wpis">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            ` : ""}
          </div>
        </div>
        <div class="entry-author-block">
          <div class="entry-author">
            ${authorAvatar}
            <span class="entry-author-name">${authorName}</span>
          </div>
          <a href="day.html?date=${entry.date}" class="entry-date-link">${dateStr}</a>
        </div>
        ${entry.description ? `<p class="entry-desc">${entry.description}</p>` : ""}
      </div>
      <div class="entry-canvas-wrap">
        <canvas id="chart-entry-${i}"></canvas>
      </div>
    `;
    if (showEdit) {
      wrap.querySelector(".btn-edit-entry").addEventListener("click", async () => {
        if (taskStatus === "done") {
          const ok = await showConfirm(
            `To zadanie jest oznaczone jako „Wykonane”. Edytowanie wpisu spowoduje powr\xF3t statusu zadania do „Nie zrobione”. Czy chcesz kontynuować?`
          );
          if (!ok) return;
          await updateTaskStatus(taskId, "todo");
        }
        openEditModal(entry);
      });
      wrap.querySelector(".btn-delete-entry").addEventListener("click", async () => {
        if (taskStatus === "done") {
          const ok = await showConfirm(
            `To zadanie jest oznaczone jako „Wykonane". Usunięcie wpisu spowoduje powrót statusu zadania do „Nie zrobione". Czy chcesz kontynuować?`
          );
          if (!ok) return;
          await updateTaskStatus(taskId, "todo");
        } else {
          if (!await showConfirm(`Usunąć wpis „${entry.title}"?`)) return;
        }
        try { await deleteEntry(entry.id); }
        catch (err) { alert("Błąd usuwania: " + err.message); }
      });
    }
    grid.appendChild(wrap);

    new Chart(document.getElementById(`chart-entry-${i}`).getContext("2d"), {
      type: "bar",
      data: {
        labels:   CATEGORIES.map(c => c.label),
        datasets: [{
          data:            CATEGORIES.map(c => entry.ratings[c.key]),
          backgroundColor: CATEGORIES.map(c => c.color + "bb"),
          borderColor:     CATEGORIES.map(c => c.color),
          borderWidth: 1.5,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 10, ticks: { stepSize: 1 }, grid: { color: chartGridColor() } },
          x: { ticks: { color: "#333", font: { size: 12, weight: "500" } }, grid: { display: false } },
        },
        plugins: { legend: { display: false } },
      },
    });
  });
}

// Średnia ważona oceny danej kategorii wg liczby godzin wpisu.
function weightedAvg(entries, key) {
  let num = 0, den = 0;
  entries.forEach(e => {
    const v = e.ratings?.[key] ?? 0;
    const h = e.hours ?? 0;
    num += v * h;
    den += h;
  });
  if (den > 0) return num / den;
  // Brak godzin — fallback do zwykłej średniej.
  const vals = entries.map(e => e.ratings?.[key] ?? 0);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

let summaryCharts = [];

// Wykresy podsumowujące (średnia ważona) dla każdego autora wpisów.
// Niezależne od filtra okresu i wyboru stażysty — pokazują całość zadania.
function renderSummary(entries, usersMap = new Map()) {
  const grid = document.getElementById("summary-grid");

  summaryCharts.forEach(c => c.destroy());
  summaryCharts = [];
  grid.innerHTML = "";

  if (!entries.length) {
    grid.innerHTML = `<p class="summary-empty">Brak wpisów.</p>`;
    return;
  }

  const byAuthor = new Map();
  entries.forEach(e => {
    if (!byAuthor.has(e.uid)) byAuthor.set(e.uid, []);
    byAuthor.get(e.uid).push(e);
  });

  const authors = [...byAuthor.entries()]
    .map(([uid, es]) => ({ uid, entries: es, totalHours: es.reduce((s, e) => s + e.hours, 0) }))
    .sort((a, b) => b.totalHours - a.totalHours);

  const containerW = grid.parentElement?.offsetWidth || (window.innerWidth - 48);
  const cols = Math.max(1, Math.floor((containerW + 16) / 296));
  const rows = Math.ceil(authors.length / cols);
  const canvasH = Math.max(160, Math.floor((window.innerHeight - 230) / rows) - 90);

  authors.forEach((a, i) => {
    const authorData = usersMap.get(a.uid);
    const authorName = authorData
      ? (authorData.displayName || authorData.name || authorData.email || "Stażysta")
      : "Stażysta";
    const authorAvatar = authorData?.photoURL
      ? `<img src="${authorData.photoURL}" class="entry-author-avatar" referrerpolicy="no-referrer" alt="">`
      : `<div class="entry-author-initials">${authorName[0].toUpperCase()}</div>`;

    const wrap = document.createElement("div");
    wrap.className = "chart-wrap entry-card summary-card";
    wrap.innerHTML = `
      <div class="entry-info">
        <div class="entry-header">
          <span class="entry-title">${authorName}</span>
          <span class="entry-hours">${Math.round(a.totalHours * 10) / 10}h</span>
        </div>
        <div class="entry-author-block">
          <div class="entry-author">
            ${authorAvatar}
            <span class="entry-author-name">${a.entries.length} ${plural(a.entries.length)} · średnia ważona</span>
          </div>
        </div>
      </div>
      <div class="summary-canvas-wrap" style="height:${canvasH}px">
        <canvas id="chart-summary-${i}"></canvas>
      </div>
    `;
    grid.appendChild(wrap);

    const data = CATEGORIES.map(c => Math.round(weightedAvg(a.entries, c.key) * 10) / 10);
    const chart = new Chart(document.getElementById(`chart-summary-${i}`).getContext("2d"), {
      type: "bar",
      data: {
        labels:   CATEGORIES.map(c => c.label),
        datasets: [{
          data,
          backgroundColor: CATEGORIES.map(c => c.color + "bb"),
          borderColor:     CATEGORIES.map(c => c.color),
          borderWidth: 1.5,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 10, ticks: { stepSize: 1 }, grid: { color: chartGridColor() } },
          x: { ticks: { color: "#333", font: { size: 12, weight: "500" } }, grid: { display: false } },
        },
        plugins: { legend: { display: false } },
      },
    });
    summaryCharts.push(chart);
  });
}

function plural(n) {
  if (n === 1) return "wpis";
  if (n < 5)   return "wpisy";
  return "wpisów";
}

init();
