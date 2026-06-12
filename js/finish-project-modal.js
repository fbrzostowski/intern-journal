import { setProjectDone, resumeProject, deleteProject } from "./store.js";

let modal      = null;
let projectCtx = null;

export function setupFinishProjectModal() {
  modal = document.createElement("div");
  modal.className     = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-box finish-project-box">
      <h2 id="finish-modal-title"></h2>
      <p class="finish-project-desc">Co chcesz zrobić z projektem <strong id="finish-project-name"></strong>?</p>
      <div class="finish-project-actions" id="finish-project-actions"></div>
      <p id="finish-project-error" class="form-error"></p>
      <div class="form-actions">
        <button type="button" id="btn-finish-cancel" class="btn-secondary">Anuluj</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("btn-finish-cancel").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
}

export function openFinishProjectModal(project) {
  projectCtx = project;
  const isDone = project.status === "done";

  document.getElementById("finish-modal-title").textContent  = isDone ? "Wznów projekt" : "Zakończ projekt";
  document.getElementById("finish-project-name").textContent = project.name;
  document.getElementById("finish-project-error").textContent = "";

  const actions = document.getElementById("finish-project-actions");
  actions.innerHTML = "";

  if (isDone) {
    actions.appendChild(makeOption(
      "btn-resume", "", "↩",
      "Wznów projekt",
      "Etykieta DONE zostanie usunięta",
      false,
      async (btn) => {
        await resumeProject(projectCtx.id);
        closeModal();
      }
    ));
  } else {
    actions.appendChild(makeOption(
      "btn-finish-done", "", "✓",
      "Oznacz jako DONE",
      "Projekt zostanie zachowany z etykietą DONE",
      false,
      async () => {
        await setProjectDone(projectCtx.id);
        closeModal();
      }
    ));
  }

  actions.appendChild(makeOption(
    "btn-finish-delete", "btn-finish-option--danger", "✕",
    "Usuń dane",
    "Projekt, zadania i wpisy zostaną trwale usunięte",
    true,
    async () => {
      await deleteProject(projectCtx.id, projectCtx.name);
      window.location.href = "index.html";
    }
  ));

  modal.style.display = "flex";
}

function makeOption(id, extraClass, icon, label, desc, isDanger, onClick) {
  const btn = document.createElement("button");
  btn.type      = "button";
  btn.id        = id;
  btn.className = `btn-finish-option${extraClass ? " " + extraClass : ""}`;
  btn.innerHTML = `
    <span class="finish-option-icon">${icon}</span>
    <span class="finish-option-label">${label}</span>
    <span class="finish-option-desc">${desc}</span>
  `;
  const err = document.getElementById("finish-project-error");
  btn.addEventListener("click", async () => {
    btn.disabled    = true;
    err.textContent = "";
    try {
      await onClick(btn);
    } catch (e) {
      err.textContent = "Błąd: " + e.message;
      btn.disabled    = false;
    }
  });
  return btn;
}

function closeModal() {
  modal.style.display = "none";
}
