const CHART_DEFS = [
  { key: 'avgInterest',   label: 'Ciekawość',    color: '#534AB7' },
  { key: 'avgLearning',   label: 'Nauka',        color: '#0F6E56' },
  { key: 'avgDifficulty', label: 'Trudność',     color: '#993C1D' },
  { key: 'avgMood',       label: 'Samopoczucie', color: '#B8860B' },
];

async function initDashboard() {
  document.getElementById('status').textContent = 'Ładowanie danych…';

  const entries   = await fetchSheetData();
  const summaries = buildDailySummaries(entries);

  if (!summaries.length) {
    document.getElementById('status').textContent = 'Brak danych. Wypełnij pierwszy formularz!';
    return;
  }
  document.getElementById('status').textContent = '';

  const dates      = summaries.map(s => s.date);
  const dateLabels = summaries.map(s => s.dateLabel);
  const hoursArr   = summaries.map(s => s.totalHours);

  // Statystyki godzin
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // poniedziałek
  startOfWeek.setHours(0, 0, 0, 0);

  const fmt = h => `${Math.round(h * 10) / 10}h`;
  const totalH = entries.reduce((s, e) => s + e.hours, 0);
  const monthH = entries.filter(e => {
    const d = e.timestamp;
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).reduce((s, e) => s + e.hours, 0);
  const weekH = entries.filter(e => e.timestamp >= startOfWeek)
    .reduce((s, e) => s + e.hours, 0);

  document.getElementById('stat-total').textContent = fmt(totalH);
  document.getElementById('stat-month').textContent = fmt(monthH);
  document.getElementById('stat-week').textContent  = fmt(weekH);
  document.getElementById('stats-bar').style.display = '';

  // Legenda HTML — poza canvas, nie scrolluje się
  document.getElementById('chart-legend').innerHTML = CHART_DEFS.map(def =>
    `<span class="legend-item">
      <span class="legend-dot" style="background:${def.color}"></span>${def.label}
    </span>`
  ).join('');

  const PX_PER_DAY = 170;
  const canvas  = document.getElementById('chart-main');
  const scroll  = document.getElementById('chart-scroll');
  const chartW  = summaries.length * PX_PER_DAY;
  const chartH    = 380;

  canvas.width  = chartW;
  canvas.height = chartH;
  canvas.style.width  = chartW + 'px';
  canvas.style.height = chartH + 'px';

  const ctx = canvas.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dateLabels,
      datasets: CHART_DEFS.map(def => ({
        label: def.label,
        data: summaries.map(s => s[def.key]),
        borderColor: def.color,
        backgroundColor: def.color + '18',
        tension: 0.35,
        pointRadius: 6,
        pointHoverRadius: 9,
        pointBackgroundColor: def.color,
      }))
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0, max: 10,
          ticks: { stepSize: 1 },
          grid: { color: chartGridColor() }
        },
        x: {
          ticks: {
            callback: (_, i) => `${hoursArr[i]}h`,
            color: '#888',
            font: { size: 11 },
          },
          grid: { display: false }
        }
      },
      onClick(event, _elements, chart) {
        const xScale = chart.scales.x;
        let closest = -1, minDist = 40;
        dateLabels.forEach((_, i) => {
          const dist = Math.abs(event.x - xScale.getPixelForTick(i));
          if (dist < minDist) { minDist = dist; closest = i; }
        });
        if (closest >= 0) {
          window.location.href = `day.html?date=${dates[closest]}`;
        }
      },
      plugins: {
        legend: { display: false },
      },
    }
  });

  // Przyciski dat pod wykresem — pozycjonowane wg ticków Chart.js
  const ticks = document.getElementById('chart-ticks');
  ticks.style.width = chartW + 'px';
  dates.forEach((date, i) => {
    const px = chart.scales.x.getPixelForTick(i);
    const btn = document.createElement('a');
    btn.href = `day.html?date=${date}`;
    btn.className = 'tick-btn';
    btn.textContent = dateLabels[i];
    btn.style.left = px + 'px';
    ticks.appendChild(btn);
  });

  // Przewiń do ostatnich VISIBLE_DAYS dni
  requestAnimationFrame(() => { scroll.scrollLeft = scroll.scrollWidth; });

  // Eksport CSV
  document.getElementById('btn-export').style.display = '';
  document.getElementById('btn-export').onclick = () => exportCSV(entries);

  // Lista projektów
  const projects = buildProjectList(entries);
  const list = document.getElementById('projects-list');
  const pluralWpis = n => n === 1 ? 'wpis' : n < 5 ? 'wpisy' : 'wpisów';
  projects.forEach(p => {
    const card = document.createElement('a');
    card.href = `project.html?name=${encodeURIComponent(p.name)}`;
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card-header">
        <span class="project-name">${p.name}</span>
        <span class="project-hours">${p.hours}h</span>
      </div>
      <div class="project-meta">${p.count} ${pluralWpis(p.count)}</div>
    `;
    list.appendChild(card);
  });
  document.getElementById('projects-section').style.display = '';
}

function exportCSV(entries) {
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    ['data', 'projekt', 'wpis', 'czas'].map(esc).join(','),
    ...entries.map(e => [
      e.date,
      e.project,
      e.title,
      e.hours,
    ].map(esc).join(','))
  ];
  const bom  = '﻿';
  const blob = new Blob([bom + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `dzienniczek-stazysty-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

initDashboard();
