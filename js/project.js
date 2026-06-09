const CATEGORIES = [
  { key: 'interest',   label: 'Ciekawość',    color: '#534AB7' },
  { key: 'learning',   label: 'Nauka',        color: '#0F6E56' },
  { key: 'difficulty', label: 'Trudność',     color: '#993C1D' },
  { key: 'mood',       label: 'Samopoczucie', color: '#B8860B' },
];

async function initProjectView() {
  const params  = new URLSearchParams(window.location.search);
  const name    = params.get('name');
  if (!name) { window.location.href = 'index.html'; return; }

  const allEntries     = await fetchSheetData();
  const projectEntries = allEntries.filter(e => e.project === name);

  document.title = `Projekt: ${name}`;

  if (!projectEntries.length) {
    document.getElementById('project-title').textContent = 'Brak wpisów dla tego projektu';
    return;
  }

  document.getElementById('project-title').textContent = name;
  const total = projectEntries.reduce((s, e) => s + e.hours, 0);
  document.getElementById('total-hours').textContent =
    `${Math.round(total * 10) / 10}h łącznie · ${projectEntries.length} wpisów`;

  const grid = document.getElementById('charts-grid');

  projectEntries.forEach((entry, i) => {
    const dateObj = new Date(entry.date + 'T12:00:00');
    const dateStr = dateObj.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap entry-card';
    wrap.innerHTML = `
      <div class="entry-info">
        <div class="entry-header">
          <span class="entry-title">${entry.title}</span>
          <span class="entry-hours">${entry.hours}h</span>
        </div>
        <a href="day.html?date=${entry.date}" class="entry-date-link">${dateStr}</a>
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

initProjectView();
