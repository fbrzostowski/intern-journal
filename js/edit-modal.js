import { updateEntry } from "./store.js";

const SLIDERS = ["interest", "learning", "difficulty", "mood"];
const SLIDER_LABELS = { interest: "Ciekawość", learning: "Nauka", difficulty: "Trudność", mood: "Samopoczucie" };

let modal          = null;
let currentEntryId = null;

export function setupEditModal() {
  modal = document.createElement("div");
  modal.className    = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-box entry-form-box">
      <h2>Edytuj wpis</h2>
      <form id="edit-form" novalidate>
        <div class="form-group">
          <label for="ef-title">Tytuł zadania *</label>
          <input type="text" id="ef-title" required>
        </div>
        <div class="form-group">
          <label for="ef-desc">Opis</label>
          <textarea id="ef-desc" rows="3"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="ef-hours">Godziny *</label>
            <input type="number" id="ef-hours" min="0.25" max="24" step="0.25" required>
          </div>
          <div class="form-group">
            <label for="ef-project">Projekt</label>
            <input type="text" id="ef-project">
          </div>
        </div>
        <div class="form-sliders">
          ${SLIDERS.map(key => `
            <div class="slider-row">
              <div class="slider-label">
                <span>${SLIDER_LABELS[key]}</span>
                <span class="slider-value" id="ev-${key}">5</span>
              </div>
              <input type="range" id="ef-${key}" min="1" max="10" value="5">
            </div>
          `).join("")}
        </div>
        <p id="edit-form-error" class="form-error"></p>
        <div class="form-actions">
          <button type="button" id="btn-cancel-edit" class="btn-secondary">Anuluj</button>
          <button type="submit" id="btn-submit-edit" class="btn-add">Zapisz zmiany</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  SLIDERS.forEach(key => {
    document.getElementById(`ef-${key}`).addEventListener("input", function () {
      document.getElementById(`ev-${key}`).textContent = this.value;
    });
  });

  document.getElementById("btn-cancel-edit").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  document.getElementById("edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-edit");
    const err = document.getElementById("edit-form-error");
    btn.disabled = true;
    btn.textContent = "Zapisywanie…";
    err.textContent = "";
    try {
      await updateEntry(currentEntryId, {
        title:       document.getElementById("ef-title").value.trim(),
        description: document.getElementById("ef-desc").value.trim(),
        hours:       parseFloat(document.getElementById("ef-hours").value),
        project:     document.getElementById("ef-project").value.trim(),
        interest:    parseInt(document.getElementById("ef-interest").value),
        learning:    parseInt(document.getElementById("ef-learning").value),
        difficulty:  parseInt(document.getElementById("ef-difficulty").value),
        mood:        parseInt(document.getElementById("ef-mood").value),
      });
      closeModal();
    } catch (error) {
      err.textContent = "Błąd zapisu: " + error.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Zapisz zmiany";
    }
  });
}

export function openEditModal(entry) {
  currentEntryId = entry.id;

  document.getElementById("ef-title").value   = entry.title;
  document.getElementById("ef-desc").value    = entry.description;
  document.getElementById("ef-hours").value   = entry.hours;
  document.getElementById("ef-project").value = entry.project === "(brak projektu)" ? "" : entry.project;
  document.getElementById("edit-form-error").textContent = "";

  SLIDERS.forEach(key => {
    const val = entry.ratings[key];
    document.getElementById(`ef-${key}`).value       = val;
    document.getElementById(`ev-${key}`).textContent = val;
  });

  modal.style.display = "flex";
}

function closeModal() {
  modal.style.display = "none";
}
