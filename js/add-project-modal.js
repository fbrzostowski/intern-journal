import { addProject, updateProjectMembers } from "./store.js";

let modal            = null;
let currentUid       = null;
let contextUsers     = null;
let showOwnerSection = false;
let pendingOwner     = null;
let pendingMembers   = [];

const CROWN_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
  <path d="M2 19h20v2H2v-2zM2 6l5 8 5-6 5 6 5-8v11H2V6z"/>
</svg>`;

export function setupAddProjectModal(uid, { allUsers, showOwnerPicker = false } = {}) {
  currentUid       = uid;
  contextUsers     = allUsers ?? null;
  showOwnerSection = showOwnerPicker === true && !!contextUsers;

  const hasUsers = !!contextUsers;
  const isAdmin  = showOwnerSection;

  modal = document.createElement("div");
  modal.className     = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-box entry-form-box">
      <h2>Utwórz projekt</h2>
      <form id="add-project-form" novalidate>
        <div class="form-group">
          <label for="ap-name">Nazwa projektu *</label>
          <input type="text" id="ap-name" required placeholder="np. Projekt Alpha" autocomplete="off">
        </div>

        ${hasUsers ? `
          <div class="task-members-setup">
            ${isAdmin ? `
              <div class="members-setup-owner" id="ap-owner-section" style="display:none">
                <p class="members-section-label">Właściciel</p>
                <div id="ap-owner-row"></div>
              </div>
            ` : ""}
            <div id="ap-members-section" style="display:none">
              <p class="members-section-label">Dostęp do projektu</p>
              <div id="ap-members-list"></div>
            </div>
            <div class="add-member-inline" id="ap-add-member-row">
              <select id="ap-new-member" class="add-member-select">
                <option value="">Wybierz stażystę…</option>
              </select>
              <select id="ap-new-role" class="member-role-select">
                <option value="write">Edycja</option>
                <option value="read">Odczyt</option>
              </select>
              <button type="button" id="btn-add-ap-member" class="btn-add btn-add-member">+ Dodaj stażystę</button>
            </div>
            <p id="ap-members-error" class="form-error"></p>
          </div>
        ` : ""}

        <p id="add-project-error" class="form-error"></p>
        <div class="form-actions">
          <button type="button" id="btn-cancel-add-project" class="btn-secondary">Anuluj</button>
          <button type="submit" id="btn-submit-add-project" class="btn-add">Utwórz</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("btn-cancel-add-project").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  if (hasUsers) {
    document.getElementById("btn-add-ap-member").addEventListener("click", () => {
      const uid   = document.getElementById("ap-new-member").value;
      const role  = document.getElementById("ap-new-role").value;
      const errEl = document.getElementById("ap-members-error");
      if (!uid) { errEl.textContent = "Wybierz stażystę."; return; }
      errEl.textContent = "";
      if (showOwnerSection && !pendingOwner) {
        pendingOwner = { uid };
      } else {
        pendingMembers.push({ uid, role });
      }
      renderAll();
      document.getElementById("ap-new-member").value = "";
    });
  }

  document.getElementById("add-project-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn  = document.getElementById("btn-submit-add-project");
    const err  = document.getElementById("add-project-error");
    const name = document.getElementById("ap-name").value.trim();
    if (!name) { err.textContent = "Podaj nazwę projektu."; return; }
    btn.disabled    = true;
    btn.textContent = "Tworzenie…";
    err.textContent = "";

    const ownerUid = (showOwnerSection && pendingOwner) ? pendingOwner.uid : currentUid;

    try {
      const ref = await addProject(ownerUid, name);
      for (const { uid, role } of pendingMembers) {
        await updateProjectMembers(ref.id, uid, role);
      }
      closeModal();
      const page = showOwnerSection ? "admin-project.html" : "project.html";
      window.location.href = `${page}?name=${encodeURIComponent(name)}`;
    } catch (error) {
      err.textContent = "Błąd: " + error.message;
      btn.disabled    = false;
      btn.textContent = "Utwórz";
    }
  });
}

export function openAddProjectModal() {
  pendingOwner   = showOwnerSection ? { uid: currentUid } : null;
  pendingMembers = [];
  document.getElementById("ap-name").value = "";
  document.getElementById("add-project-error").textContent = "";
  if (contextUsers) {
    renderAll();
    document.getElementById("ap-members-error").textContent = "";
  }
  modal.style.display = "flex";
  setTimeout(() => document.getElementById("ap-name").focus(), 50);
}

// ── Render ─────────────────────────────────────────────────────

function renderAll() {
  renderOwnerRow();
  renderMembers();
  refreshSelect();
}

function renderOwnerRow() {
  const row     = document.getElementById("ap-owner-row");
  const section = document.getElementById("ap-owner-section");
  if (!row) return;

  if (!pendingOwner) {
    section.style.display = "none";
    row.innerHTML = "";
    return;
  }
  section.style.display = "";

  const ud   = contextUsers.find(u => u.uid === pendingOwner.uid);
  const name = displayName(ud);
  const avatarHtml = ud?.photoURL
    ? `<img src="${ud.photoURL}" class="member-avatar" referrerpolicy="no-referrer" alt="">`
    : `<div class="member-initials">${name[0].toUpperCase()}</div>`;

  row.innerHTML = `
    <div class="member-row">
      <div class="member-info">
        ${avatarHtml}
        <span class="member-name">${name}</span>
      </div>
      <div class="member-actions">
        <span class="member-role-badge owner-badge">Właściciel</span>
        <button type="button" class="btn-remove-member" id="ap-btn-remove-owner" title="Usuń właściciela">✕</button>
      </div>
    </div>
  `;

  row.querySelector("#ap-btn-remove-owner").addEventListener("click", () => {
    const oldOwner = pendingOwner;
    // Stażysta wraca na dół z prawami edycji; admin po prostu znika
    if (oldOwner && isIntern(oldOwner.uid)) {
      pendingMembers.unshift({ uid: oldOwner.uid, role: "write" });
    }
    // Własność przejmuje admin tworzący projekt
    pendingOwner = { uid: currentUid };
    renderAll();
  });
}

function renderMembers() {
  const list    = document.getElementById("ap-members-list");
  const section = document.getElementById("ap-members-section");
  if (!list) return;

  list.innerHTML        = "";
  section.style.display = pendingMembers.length ? "" : "none";

  pendingMembers.forEach(({ uid, role }, idx) => {
    const ud   = contextUsers.find(u => u.uid === uid);
    const name = displayName(ud);
    const avatarHtml = ud?.photoURL
      ? `<img src="${ud.photoURL}" class="member-avatar" referrerpolicy="no-referrer" alt="">`
      : `<div class="member-initials">${name[0].toUpperCase()}</div>`;

    const row = document.createElement("div");
    row.className = "member-row";
    row.innerHTML = `
      <div class="member-info">
        ${avatarHtml}
        <span class="member-name">${name}</span>
      </div>
      <div class="member-actions">
        ${showOwnerSection ? `
          <button type="button" class="btn-set-owner" data-uid="${uid}" title="Ustaw jako właściciela">
            ${CROWN_SVG}
          </button>
        ` : ""}
        <select class="member-role-select" data-idx="${idx}">
          <option value="write" ${role === "write" ? "selected" : ""}>Edycja</option>
          <option value="read"  ${role === "read"  ? "selected" : ""}>Odczyt</option>
        </select>
        <button type="button" class="btn-remove-member" data-idx="${idx}">✕</button>
      </div>
    `;

    if (showOwnerSection) row.querySelector(".btn-set-owner").addEventListener("click", () => {
      const oldOwner = pendingOwner;
      pendingOwner   = { uid };
      pendingMembers.splice(idx, 1);
      // Poprzedni właściciel wraca na listę tylko jeśli jest stażystą (admin nie)
      if (oldOwner && isIntern(oldOwner.uid)) {
        pendingMembers.unshift({ uid: oldOwner.uid, role: "write" });
      }
      renderAll();
    });

    row.querySelector(".member-role-select").addEventListener("change", (e) => {
      pendingMembers[+e.target.dataset.idx].role = e.target.value;
    });
    row.querySelector(".btn-remove-member").addEventListener("click", (e) => {
      pendingMembers.splice(+e.target.closest("[data-idx]").dataset.idx, 1);
      renderAll();
    });

    list.appendChild(row);
  });
}

function refreshSelect() {
  const sel = document.getElementById("ap-new-member");
  if (!sel) return;

  const excluded  = new Set([
    currentUid,
    ...(pendingOwner ? [pendingOwner.uid] : []),
    ...pendingMembers.map(m => m.uid),
  ]);
  const available = contextUsers.filter(u =>
    !excluded.has(u.uid) && (u.role === "intern" || !u.role)
  );

  sel.innerHTML = `<option value="">Wybierz stażystę…</option>`;
  available.forEach(u => {
    const opt = document.createElement("option");
    opt.value       = u.uid;
    opt.textContent = displayName(u);
    sel.appendChild(opt);
  });

  const addRow = document.getElementById("ap-add-member-row");
  if (addRow) addRow.style.display = available.length ? "" : "none";
}

function isIntern(uid) {
  const u = contextUsers?.find(x => x.uid === uid);
  return !!u && (u.role === "intern" || !u.role);
}

function displayName(u) {
  if (!u) return "Stażysta";
  return u.displayName || u.name || u.email || "Stażysta";
}

function closeModal() {
  modal.style.display = "none";
}
