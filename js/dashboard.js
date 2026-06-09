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
          grid: { color: '#f0f0f0' }
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
}

initDashboard();
