const CATEGORIES = [
  { key: 'interest',   label: 'Ciekawość',    color: '#534AB7' },
  { key: 'learning',   label: 'Nauka',        color: '#0F6E56' },
  { key: 'difficulty', label: 'Trudność',     color: '#993C1D' },
  { key: 'mood',       label: 'Samopoczucie', color: '#B8860B' },
];

async function initDayView() {
  const params = new URLSearchParams(window.location.search);
  const date   = params.get('date');
  if (!date) { window.location.href = 'index.html'; return; }

  const allEntries = await fetchSheetData();
  const dayEntries = allEntries.filter(e => e.date === date);

  if (!dayEntries.length) {
    document.getElementById('day-title').textContent = 'Brak wpisów dla tego dnia';
    return;
  }

  // Nawigacja prev/next
  const allDates = [...new Set(allEntries.map(e => e.date))].sort();
  const idx = allDates.indexOf(date);
  const prevEl = document.getElementById('nav-prev');
  const nextEl = document.getElementById('nav-next');
  if (idx > 0)                    prevEl.href = `day.html?date=${allDates[idx - 1]}`;
  else                            prevEl.classList.add('nav-arrow--disabled');
  if (idx < allDates.length - 1)  nextEl.href = `day.html?date=${allDates[idx + 1]}`;
  else                            nextEl.classList.add('nav-arrow--disabled');

  const dateObj = new Date(date + 'T12:00:00');
  document.getElementById('day-title').textContent =
    dateObj.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  const total = dayEntries.reduce((s, e) => s + e.hours, 0);
  document.getElementById('total-hours').textContent = `${Math.round(total * 10) / 10}h łącznie`;

  const grid = document.getElementById('charts-grid');

  dayEntries.forEach((entry, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap entry-card';
    wrap.innerHTML = `
      <div class="entry-info">
        <div class="entry-header">
          <span class="entry-title">${entry.title}</span>
          <span class="entry-hours">${entry.hours}h</span>
        </div>
        <a href="project.html?name=${encodeURIComponent(entry.project)}" class="entry-project-link">${entry.project}</a>
        ${entry.description ? `<p class="entry-desc">${entry.description}</p>` : ''}
      </div>
      <div class="entry-canvas-wrap">
        <canvas id="chart-entry-${i}"></canvas>
      </div>
    `;
    grid.appendChild(wrap);

    new Chart(document.getElementById(`chart-entry-${i}`).getContext('2d'), {
      type: 'bar',
      data: {
        labels: CATEGORIES.map(c => c.label),
        datasets: [{
          data: CATEGORIES.map(c => entry.ratings[c.key]),
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
          y: { min: 0, max: 10, ticks: { stepSize: 1 }, grid: { color: '#f0f0f0' } },
          x: {
            ticks: { color: '#333', font: { size: 12, weight: '500' } },
            grid: { display: false }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  });
}

initDayView();
