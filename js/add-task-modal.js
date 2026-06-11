import { addTask, updateTaskMembers } from "./store.js";

let modal          = null;
let ownerUid       = null;
let projectCtx     = null;
let contextUsers   = null;
let pendingMembers = []; // [{ uid, role }]

export function setupAddTaskModal(userUid, { allUsers } = {}) {
  ownerUid     = userUid;
  contextUsers = allUsers || null;

  const isAdmin  = !!contextUsers;
  const title    = isAdmin ? "Zleć zadanie" : "Nowe zadanie";
  const submitLbl = isAdmin ? "Zleć zadanie" : "Utwórz zadanie";

  modal = document.createElement("div");
  modal.className     = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-box entry-form-box${isAdmin ? " task-modal-admin" : ""}">
      <h2>${title}</h2>
      <form id="task-form" novalidate>
        <div class="form-group">
          <label for="tf-title">Tytuł zadania *</label>
          <input type="text" id="tf-title" required placeholder="Np. Integracja API">
        </div>
        <div class="form-group">
          <label for="tf-desc">Opis</label>
          <textarea id="tf-desc" rows="3" placeholder="Czym jest to zadanie?"></textarea>
        </div>

        ${isAdmin ? `
          <div class="task-members-setup">
            <p class="members-section-label">Dostęp do zadania</p>
            <div id="tf-members-list"></div>
            <div class="add-member-inline" id="add-member-inline-row">
              <select id="tf-new-member" class="add-member-select">
                <option value="">Wybierz stażystę…</option>
              </select>
              <select id="tf-new-role" class="member-role-select">
                <option value="write">Edycja</option>
                <option value="read">Odczyt</option>
              </select>
              <button type="button" id="btn-add-member-inline" class="btn-add btn-add-member">+ Dodaj stażystę</button>
            </div>
            <p id="task-members-error" class="form-error"></p>
          </div>
        ` : ""}

        <p id="task-form-error" class="form-error"></p>
        <div class="form-actions">
          <button type="button" id="btn-cancel-task" class="btn-secondary">Anuluj</button>
          <button type="submit" id="btn-submit-task" class="btn-add">${submitLbl}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("btn-cancel-task").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  if (isAdmin) {
    document.getElementById("btn-add-member-inline").addEventListener("click", () => {
      const uid   = document.getElementById("tf-new-member").value;
      const role  = document.getElementById("tf-new-role").value;
      const errEl = document.getElementById("task-members-error");
      if (!uid) { errEl.textContent = "Wybierz stażystę."; return; }
      errEl.textContent = "";
      pendingMembers.push({ uid, role });
      renderMembersList();
      refreshNewMemberSelect();
      document.getElementById("tf-new-member").value = "";
    });
  }

  document.getElementById("task-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-task");
    const err = document.getElementById("task-form-error");
    btn.disabled    = true;
    btn.textContent = "Zapisywanie…";
    err.textContent = "";

    try {
      const taskRef = await addTask(ownerUid, {
        projectName:  projectCtx,
        title:        document.getElementById("tf-title").value.trim(),
        description:  document.getElementById("tf-desc").value.trim(),
        status:       "todo",
      });
      for (const { uid, role } of pendingMembers) {
        await updateTaskMembers(taskRef.id, uid, role);
      }
      closeModal();
    } catch (error) {
      err.textContent = "Błąd zapisu: " + error.message;
    } finally {
      btn.disabled    = false;
      btn.textContent = isAdmin ? "Zleć zadanie" : "Utwórz zadanie";
    }
  });
}

export function openAddTaskModal(projectName) {
  projectCtx    = projectName;
  pendingMembers = [];
  document.getElementById("task-form").reset();
  document.getElementById("task-form-error").textContent = "";

  if (contextUsers) {
    renderMembersList();
    refreshNewMemberSelect();
    if (document.getElementById("task-members-error")) {
      document.getElementById("task-members-error").textContent = "";
    }
  }

  modal.style.display = "flex";
}

// ── Helpers ────────────────────────────────────────────────────

function refreshNewMemberSelect() {
  const sel = document.getElementById("tf-new-member");
  if (!sel) return;

  const excluded = new Set([ownerUid, ...pendingMembers.map(m => m.uid)]);
  const available    = contextUsers.filter(u =>
    !excluded.has(u.uid) && (u.role === "intern" || !u.role)
  );

  sel.innerHTML = `<option value="">Wybierz stażystę…</option>`;
  available.forEach(u => {
    const opt = document.createElement("option");
    opt.value       = u.uid;
    opt.textContent = displayName(u);
    sel.appendChild(opt);
  });

  const row = document.getElementById("add-member-inline-row");
  if (row) row.style.display = available.length ? "" : "none";
}

function renderMembersList() {
  const list = document.getElementById("tf-members-list");
  if (!list) return;
  list.innerHTML = "";

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
        <select class="member-role-select" data-idx="${idx}">
          <option value="write" ${role === "write" ? "selected" : ""}>Edycja</option>
          <option value="read"  ${role === "read"  ? "selected" : ""}>Odczyt</option>
        </select>
        <button type="button" class="btn-remove-member" data-idx="${idx}">✕</button>
      </div>
    `;

    row.querySelector(".member-role-select").addEventListener("change", (e) => {
      pendingMembers[+e.target.dataset.idx].role = e.target.value;
    });
    row.querySelector(".btn-remove-member").addEventListener("click", (e) => {
      pendingMembers.splice(+e.target.closest("[data-idx]").dataset.idx, 1);
      renderMembersList();
      refreshNewMemberSelect();
    });

    list.appendChild(row);
  });
}

function displayName(u) {
  if (!u) return "Stażysta";
  return u.displayName || u.name || u.email || "Stażysta";
}

function closeModal() {
  modal.style.display = "none";
}
