import { addEntry } from "./store.js";

const SLIDERS = ["interest", "learning", "difficulty", "mood"];
const SLIDER_LABELS = { interest: "Ciekawość", learning: "Nauka", difficulty: "Trudność", mood: "Samopoczucie" };

let modal = null;
let uid   = null;

export function setupAddModal(userUid) {
  uid   = userUid;
  modal = document.createElement("div");
  modal.className    = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-box entry-form-box">
      <h2>Nowy wpis</h2>
      <form id="add-form" novalidate>
        <div class="form-group">
          <label for="af-title">Tytuł zadania *</label>
          <input type="text" id="af-title" required placeholder="Np. Analiza wymagań">
        </div>
        <div class="form-group">
          <label for="af-desc">Opis</label>
          <textarea id="af-desc" rows="3" placeholder="Co robiłeś/aś?"></textarea>
        </div>
        <div class="form-row form-row-3">
          <div class="form-group">
            <label for="af-date">Data *</label>
            <input type="date" id="af-date" required>
          </div>
          <div class="form-group">
            <label for="af-hours">Godziny *</label>
            <input type="number" id="af-hours" min="0.25" max="24" step="0.25" required placeholder="2">
          </div>
          <div class="form-group">
            <label for="af-project">Projekt</label>
            <input type="text" id="af-project" placeholder="Np. Backend">
          </div>
        </div>
        <div class="form-sliders">
          ${SLIDERS.map(key => `
            <div class="slider-row">
              <div class="slider-label">
                <span>${SLIDER_LABELS[key]}</span>
                <span class="slider-value" id="av-${key}">5</span>
              </div>
              <input type="range" id="af-${key}" min="1" max="10" value="5">
            </div>
          `).join("")}
        </div>
        <p id="add-form-error" class="form-error"></p>
        <div class="form-actions">
          <button type="button" id="btn-cancel-add" class="btn-secondary">Anuluj</button>
          <button type="submit" id="btn-submit-add" class="btn-add">Zapisz wpis</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  SLIDERS.forEach(key => {
    document.getElementById(`af-${key}`).addEventListener("input", function () {
      document.getElementById(`av-${key}`).textContent = this.value;
    });
  });

  document.getElementById("btn-cancel-add").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  document.getElementById("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-add");
    const err = document.getElementById("add-form-error");
    btn.disabled = true;
    btn.textContent = "Zapisywanie…";
    err.textContent = "";
    try {
      await addEntry(uid, {
        date:        document.getElementById("af-date").value,
        title:       document.getElementById("af-title").value.trim(),
        description: document.getElementById("af-desc").value.trim(),
        hours:       parseFloat(document.getElementById("af-hours").value),
        project:     document.getElementById("af-project").value.trim(),
        interest:    parseInt(document.getElementById("af-interest").value),
        learning:    parseInt(document.getElementById("af-learning").value),
        difficulty:  parseInt(document.getElementById("af-difficulty").value),
        mood:        parseInt(document.getElementById("af-mood").value),
      });
      closeModal();
    } catch (error) {
      err.textContent = "Błąd zapisu: " + error.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Zapisz wpis";
    }
  });
}

export function openAddModal({ date, project } = {}) {
  document.getElementById("add-form").reset();
  SLIDERS.forEach(key => { document.getElementById(`av-${key}`).textContent = "5"; });
  document.getElementById("add-form-error").textContent = "";
  document.getElementById("af-date").value = date || new Date().toISOString().slice(0, 10);
  if (project) document.getElementById("af-project").value = project;
  modal.style.display = "flex";
}

function closeModal() {
  modal.style.display = "none";
}
