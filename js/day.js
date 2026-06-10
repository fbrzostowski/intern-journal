import { requireAuth } from "./auth.js";
import { subscribeUserEntries, chartGridColor } from "./store.js";
import { setupEditModal, openEditModal } from "./edit-modal.js";

const CATEGORIES = [
  { key: 'interest',   label: 'Ciekawość',    color: '#534AB7' },
  { key: 'learning',   label: 'Nauka',        color: '#0F6E56' },
  { key: 'difficulty', label: 'Trudność',     color: '#993C1D' },
  { key: 'mood',       label: 'Samopoczucie', color: '#B8860B' },
];

async function init() {
  const params = new URLSearchParams(window.location.search);
  const date   = params.get('date');
  if (!date) { window.location.href = 'index.html'; return; }

  const { user } = await requireAuth();
  setupEditModal();

  subscribeUserEntries(user.uid, (allEntries) => {
    const dayEntries = allEntries.filter(e => e.date === date);

    // Nawigacja prev/next
    const allDates = [...new Set(allEntries.map(e => e.date))].sort();
    const idx      = allDates.indexOf(date);
    const prevEl   = document.getElementById('nav-prev');
    const nextEl   = document.getElementById('nav-next');
    prevEl.classList.toggle('nav-arrow--disabled', idx <= 0);
    nextEl.classList.toggle('nav-arrow--disabled', idx >= allDates.length - 1);
    prevEl.href = idx > 0                   ? `day.html?date=${allDates[idx - 1]}` : '#';
    nextEl.href = idx < allDates.length - 1 ? `day.html?date=${allDates[idx + 1]}` : '#';

    if (!dayEntries.length) {
      document.getElementById('day-title').textContent = 'Brak wpisów dla tego dnia';
      return;
    }

    const dateObj = new Date(date + 'T12:00:00');
    document.getElementById('day-title').textContent =
      dateObj.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
    const total = dayEntries.reduce((s, e) => s + e.hours, 0);
    document.getElementById('total-hours').textContent = `${Math.round(total * 10) / 10}h łącznie`;

    const grid = document.getElementById('charts-grid');
    grid.innerHTML = '';

    dayEntries.forEach((entry, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'chart-wrap entry-card';
      wrap.innerHTML = `
        <div class="entry-info">
          <div class="entry-header">
            <span class="entry-title">${entry.title}</span>
            <div class="entry-header-right">
              <span class="entry-hours">${entry.hours}h</span>
              <button class="btn-edit-entry" title="Edytuj wpis">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>
          </div>
          <a href="project.html?name=${encodeURIComponent(entry.project)}" class="entry-project-link">${entry.project}</a>
          ${entry.description ? `<p class="entry-desc">${entry.description}</p>` : ''}
        </div>
        <div class="entry-canvas-wrap">
          <canvas id="chart-entry-${i}"></canvas>
        </div>
      `;
      wrap.querySelector('.btn-edit-entry').addEventListener('click', () => openEditModal(entry));
      grid.appendChild(wrap);

      new Chart(document.getElementById(`chart-entry-${i}`).getContext('2d'), {
        type: 'bar',
        data: {
          labels:   CATEGORIES.map(c => c.label),
          datasets: [{
            data:            CATEGORIES.map(c => entry.ratings[c.key]),
            backgroundColor: CATEGORIES.map(c => c.color + 'bb'),
            borderColor:     CATEGORIES.map(c => c.color),
            borderWidth: 1.5,
            borderRadius: 6,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { min: 0, max: 10, ticks: { stepSize: 1 }, grid: { color: chartGridColor() } },
            x: { ticks: { color: '#333', font: { size: 12, weight: '500' } }, grid: { display: false } }
          },
          plugins: { legend: { display: false } }
        }
      });
    });
  });
}

init();
