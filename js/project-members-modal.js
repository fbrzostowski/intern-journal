import { getAllUsers, updateProjectMembers, transferProjectOwnership } from "./store.js";

const CROWN_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
  <path d="M2 19h20v2H2v-2zM2 6l5 8 5-6 5 6 5-8v11H2V6z"/>
</svg>`;

let modal    = null;
let context  = null;
let allUsers = [];

export function setupProjectMembersModal() {
  modal = document.createElement("div");
  modal.className    = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-box members-modal-box">
      <div class="members-modal-header">
        <h2>Zarządzaj dostępem do projektu</h2>
        <button type="button" id="btn-close-project-members" class="btn-modal-close" title="Zamknij">✕</button>
      </div>
      <div id="project-members-content"></div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("btn-close-project-members").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
}

export async function openProjectMembersModal({ project, currentUser, currentUserRole }) {
  context = { project, currentUser, currentUserRole };
  try { allUsers = await getAllUsers(); } catch (_) {}
  modal.style.display = "flex";
  render();
}

export function updateProjectMembersModal({ project, currentUser, currentUserRole }) {
  if (!modal || modal.style.display === "none") return;
  if (!context || context.project?.id !== project?.id) return;
  context = { project, currentUser, currentUserRole };
  render();
}

function closeModal() {
  modal.style.display = "none";
}

function render() {
  if (!context) return;
  const { project, currentUser, currentUserRole } = context;
  const content = document.getElementById("project-members-content");
  if (!content) return;

  const isAdmin   = currentUserRole === "admin";
  const isOwner   = project.uid === currentUser.uid;
  const isManager = isAdmin || isOwner;
  const members   = project.members || {};
  const memberList = Object.entries(members);

  const ownerData   = allUsers.find(u => u.uid === project.uid);
  const ownerName   = displayName(ownerData);
  const ownerAvatar = avatarHtml(ownerData, ownerName);

  const canRemoveOwner = isAdmin && project.uid !== currentUser.uid;

  let membersSection = "";
  if (memberList.length) {
    const rows = memberList.map(([uid, role]) => {
      const ud   = allUsers.find(u => u.uid === uid);
      const name = displayName(ud);
      return `
        <div class="member-row">
          <div class="member-info">
            ${avatarHtml(ud, name)}
            <span class="member-name">${name}</span>
          </div>
          <div class="member-actions">
            ${isAdmin ? `
              <button type="button" class="btn-set-owner btn-crown-member" data-uid="${uid}" data-name="${name}" title="Przenieś własność">
                ${CROWN_SVG}
              </button>
            ` : ""}
            ${isManager ? `
              <select class="member-role-select" data-uid="${uid}">
                <option value="read"  ${role === "read"  ? "selected" : ""}>Odczyt</option>
                <option value="write" ${role === "write" ? "selected" : ""}>Edycja</option>
              </select>
              <button type="button" class="btn-remove-member" data-uid="${uid}" title="Usuń">✕</button>
            ` : `
              <span class="member-role-badge">${role === "write" ? "Edycja" : "Odczyt"}</span>
            `}
          </div>
        </div>
      `;
    }).join("");

    membersSection = `
      <div class="members-section">
        <h3 class="members-section-label">Członkowie</h3>
        ${rows}
      </div>
    `;
  }

  const existingUids   = new Set([project.uid, ...Object.keys(members)]);
  const availableUsers = allUsers.filter(u =>
    !existingUids.has(u.uid) && (u.role === "intern" || !u.role)
  );

  let addSection = "";
  if (isManager) {
    if (availableUsers.length) {
      const options = availableUsers.map(u =>
        `<option value="${u.uid}">${displayName(u)}</option>`
      ).join("");
      addSection = `
        <div class="members-section">
          <h3 class="members-section-label">Dodaj stażystę</h3>
          <div class="add-member-form">
            <select id="new-project-member-select">
              <option value="">Wybierz…</option>
              ${options}
            </select>
            <select id="new-project-member-role">
              <option value="read">Odczyt</option>
              <option value="write">Edycja</option>
            </select>
            <button type="button" id="btn-add-project-member" class="btn-add btn-add-member">Dodaj</button>
          </div>
          <p id="project-members-error" class="form-error"></p>
        </div>
      `;
    } else {
      addSection = `
        <div class="members-section">
          <p class="members-no-users">Wszyscy stażyści już mają dostęp.</p>
        </div>
      `;
    }
  }

  content.innerHTML = `
    <div class="members-section">
      <h3 class="members-section-label">Właściciel</h3>
      <div class="member-row">
        <div class="member-info">
          ${ownerAvatar}
          <span class="member-name">${ownerName}</span>
        </div>
        <div class="member-actions">
          <span class="member-role-badge owner-badge">Właściciel</span>
          ${canRemoveOwner ? `
            <button type="button" class="btn-remove-member btn-remove-owner" data-uid="${project.uid}" title="Przejmij własność">✕</button>
          ` : ""}
        </div>
      </div>
    </div>
    ${membersSection}
    ${addSection}
  `;

  content.querySelectorAll(".btn-crown-member").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uid  = btn.dataset.uid;
      const name = btn.dataset.name;
      if (!confirm(`Przenieść własność projektu do ${name}?`)) return;
      btn.disabled = true;
      const oldOwnerUid = retainableOwner(context.project.uid);
      try { await transferProjectOwnership(context.project.id, uid, oldOwnerUid); }
      catch (err) { alert("Błąd: " + err.message); btn.disabled = false; }
    });
  });

  content.querySelectorAll(".member-role-select").forEach(sel => {
    sel.addEventListener("change", async (e) => {
      const uid  = e.target.dataset.uid;
      const role = e.target.value;
      try { await updateProjectMembers(context.project.id, uid, role); }
      catch (err) { alert("Błąd: " + err.message); }
    });
  });

  content.querySelectorAll(".btn-remove-member").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uid       = btn.dataset.uid;
      const isOwnerOp = btn.classList.contains("btn-remove-owner");
      if (isOwnerOp) {
        if (!confirm("Usunąć właściciela? Zostaniesz nowym właścicielem projektu.")) return;
        try { await transferProjectOwnership(context.project.id, currentUser.uid, retainableOwner(project.uid)); }
        catch (err) { alert("Błąd: " + err.message); }
      } else {
        if (!confirm("Usunąć tego stażystę z projektu?")) return;
        try { await updateProjectMembers(context.project.id, uid, null); }
        catch (err) { alert("Błąd: " + err.message); }
      }
    });
  });

  const btnAddMember = document.getElementById("btn-add-project-member");
  if (btnAddMember) {
    btnAddMember.addEventListener("click", async () => {
      const uid   = document.getElementById("new-project-member-select").value;
      const role  = document.getElementById("new-project-member-role").value;
      const errEl = document.getElementById("project-members-error");
      if (!uid) { errEl.textContent = "Wybierz stażystę."; return; }
      btnAddMember.disabled = true;
      errEl.textContent = "";
      try { await updateProjectMembers(context.project.id, uid, role); }
      catch (err) { errEl.textContent = "Błąd: " + err.message; }
      finally { btnAddMember.disabled = false; }
    });
  }
}

function retainableOwner(uid) {
  const u = allUsers.find(u => u.uid === uid);
  return u?.role === "admin" ? null : uid;
}

function displayName(userData) {
  if (!userData) return "Stażysta";
  return userData.displayName || userData.name || userData.email || "Stażysta";
}

function avatarHtml(userData, name) {
  if (userData?.photoURL) {
    return `<img src="${userData.photoURL}" class="member-avatar" referrerpolicy="no-referrer" alt="">`;
  }
  return `<div class="member-initials">${(name || "?")[0].toUpperCase()}</div>`;
}
