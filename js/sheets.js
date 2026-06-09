function buildMockEntries() {
  // Deterministyczny LCG — zawsze te same "losowe" wartości
  let seed = 42;
  const rnd = (min, max) => {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return min + (seed % (max - min + 1));
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

  const tasks = [
    ['Onboarding i setup środowiska',    'Instalacja narzędzi, dostępy, pierwsze spotkanie z zespołem.',        3  ],
    ['Czytanie dokumentacji projektu',   'Przegląd architektury systemu i backlogu.',                           2  ],
    ['Pierwszy PR — poprawka w UI',      'Naprawienie wyrównania komponentu w widoku listy.',                   2.5],
    ['Code review z mentorem',           'Omówienie stylu kodu, wzorzec repository.',                           1.5],
    ['Testy jednostkowe',                'Pokrycie nowego modułu testami jednostkowymi.',                        2  ],
    ['Bugfix — błąd w paginacji',        'Trudny off-by-one w zapytaniu do bazy.',                              3  ],
    ['Daily standup + sprint planning',  'Szacowanie tasków, przydzielenie zadań na sprint.',                   1  ],
    ['Nowy endpoint REST',               'GET /api/resource z filtrowaniem i paginacją.',                       3  ],
    ['Swagger dokumentacja',             'Opisanie nowych endpointów w OpenAPI 3.0.',                           1.5],
    ['Integracja z frontendem',          'Podłączenie nowego endpointu do widoku React.',                       2  ],
    ['Migracja bazy danych',             'Nowa kolumna z backfillem — deployment na staging.',                  2  ],
    ['Debugging na stagingu',            'Migracja blokowała tabelę — analiza i fix.',                          2  ],
    ['Retrospektywa sprintu',            'Co poszło dobrze, co można poprawić w następnym sprincie.',           1  ],
    ['Refaktor modułu autoryzacji',      'Wydzielenie logiki JWT do osobnego serwisu.',                         3  ],
    ['Pair programming z seniorem',      'Razem przepisaliśmy warstwę cache — bardzo dużo się nauczyłem.',      2  ],
    ['Implementacja websocketów',        'Real-time powiadomienia — zupełnie nowy obszar dla mnie.',            3  ],
    ['Testy integracyjne',               'Pokrycie testami modułu websocket + mock serwera.',                   2  ],
    ['Deploy na produkcję',              'Samodzielny deploy — pipeline przeszedł za pierwszym razem.',         1  ],
    ['Analiza wydajności zapytań',       'EXPLAIN ANALYZE, identyfikacja N+1 i dodanie indeksów.',              2.5],
    ['Prezentacja wyników dla zespołu',  'Demo ulepszeń wydajnościowych — dobre przyjęcie.',                    1  ],
    ['Dokumentacja techniczna',          'Opisanie architektury nowego modułu w Confluence.',                   1.5],
    ['Nowy feature — eksport CSV',       'Eksport danych na życzenie klienta z filtrowaniem.',                  3  ],
    ['Code review dla kolegi',           'Przejrzałem PR — znalazłem edge case w walidacji.',                   1  ],
    ['Hotfix — błąd w eksporcie',        'Encoding UTF-8 psuł polskie znaki — szybki fix.',                     1.5],
    ['Sprint review z klientem',         'Demo nowych funkcji — klient zadowolony z postępów.',                 1.5],
    ['Implementacja cache Redis',        'Cache dla najczęściej odpytywanych zasobów.',                         3  ],
    ['Security audit',                   'Przegląd podatności OWASP w nowych endpointach.',                     2  ],
    ['Optymalizacja frontendu',          'Lazy loading i code splitting — poprawa LCP o 40%.',                  2.5],
    ['Onboarding nowego stażysty',       'Pomoc przy setupie, wdrożenie w projekt.',                            1.5],
    ['Naprawa flakey testów',            'Race condition w testach asynchronicznych.',                           2  ],
    ['Feature flags implementacja',      'System flag do stopniowego rollout nowych funkcji.',                  3  ],
    ['Monitoring i alerty',              'Konfiguracja Grafany, progi alertów na p95 latency.',                 2  ],
    ['Integracja Stripe',                'Podłączenie płatności — webhooks i obsługa zdarzeń.',                 3.5],
    ['Konfiguracja CI/CD',               'GitHub Actions: testy, linting, auto-deploy na staging.',             2.5],
    ['Refaktor testów e2e',              'Przepisanie Cypress testów na Page Object Model.',                     3  ],
    ['Rate limiting',                    'Implementacja throttlingu na publicznych endpointach.',                2  ],
    ['Lokalizacja i i18n',               'Dodanie obsługi języka angielskiego — react-i18next.',                 2.5],
    ['GraphQL endpoint',                 'Próba zamiany REST na GraphQL dla jednego modułu.',                   3  ],
    ['Analiza metryk produktowych',      'Dashboard w Metabase — retencja i funnel konwersji.',                 2  ],
    ['Poprawki po code review',          'Refaktor po uwagach — zmiana nazewnictwa i struktury.',               1.5],
  ];

  const entries = [];
  // 60 dni roboczych startując od 2026-04-01
  let date = new Date(2026, 3, 1);
  let dayIdx = 0;
  let taskIdx = 0;

  while (dayIdx < 60) {
    const dow = date.getDay();
    if (dow === 0 || dow === 6) { date = new Date(date.getTime() + 86400000); continue; }

    const p = dayIdx / 59; // postęp 0..1

    // Łuk emocjonalny: entuzjazm → kryzys środka (tydz 5-8) → stabilizacja
    const arc    = Math.sin(p * Math.PI);
    const slump  = (p > 0.3 && p < 0.55) ? -2 : 0;

    const baseI = 7.5 + arc * 1.5 + slump;
    const baseL = 7   + arc * 2;
    const baseD = 8.5 - p * 4;             // trudność maleje w miarę nauki
    const baseM = 7   + arc * 1 + slump * 0.6;

    const numTasks = 2 + (rnd(0, 9) < 5 ? 1 : 0) + (rnd(0, 9) < 2 ? 1 : 0);

    for (let t = 0; t < numTasks; t++) {
      const [title, desc, baseHours] = tasks[taskIdx % tasks.length];
      taskIdx++;

      const timestamp = new Date(date);
      timestamp.setHours(9 + t * 2 + rnd(0, 1), rnd(0, 59), 0, 0);

      const DEMO_PROJECTS = ['Frontend', 'Backend', 'DevOps', 'Dokumentacja'];
      entries.push({
        timestamp,
        date:        timestamp.toISOString().slice(0, 10),
        dateLabel:   formatDateLabel(timestamp),
        title,
        description: desc,
        hours:       Math.max(0.5, baseHours + (rnd(0, 4) - 2) * 0.25),
        project:     DEMO_PROJECTS[taskIdx % DEMO_PROJECTS.length],
        ratings: {
          interest:   clamp(baseI + rnd(0, 4) - 2, 1, 10),
          learning:   clamp(baseL + rnd(0, 4) - 2, 1, 10),
          difficulty: clamp(baseD + rnd(0, 4) - 2, 1, 10),
          mood:       clamp(baseM + rnd(0, 4) - 2, 1, 10),
        }
      });
    }

    dayIdx++;
    date = new Date(date.getTime() + 86400000);
  }

  return entries;
}

function fetchSheetData() {
  if (CONFIG.DEMO) return Promise.resolve(buildMockEntries());
  return new Promise((resolve, reject) => {
    const cb = '_gscb' + Date.now();

    window[cb] = function(response) {
      delete window[cb];
      script.remove();
      try {
        resolve(parseResponse(response));
      } catch (e) {
        reject(e);
      }
    };

    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEETS_ID}/gviz/tq?tqx=responseHandler:${cb}`;
    script.onerror = () => {
      delete window[cb];
      reject(new Error('Błąd ładowania danych'));
    };
    document.head.appendChild(script);
  });
}

function parseResponse(response) {
  const rows = response.table.rows;

  return rows
    .filter(row => row.c && row.c[CONFIG.COLUMNS.timestamp]?.v)
    .map(row => {
      const get = (colIdx) => row.c[colIdx]?.v ?? null;

      const rawTs = get(CONFIG.COLUMNS.timestamp);
      const timestamp = rawTs ? parseGoogleDate(rawTs) : new Date();

      return {
        timestamp,
        date:        timestamp.toISOString().slice(0, 10),
        dateLabel:   formatDateLabel(timestamp),
        title:       get(CONFIG.COLUMNS.title)       ?? '',
        description: get(CONFIG.COLUMNS.description) ?? '',
        hours:       parseFloat(String(get(CONFIG.COLUMNS.hours) ?? '').replace(',', '.')) || 0,
        project:     get(CONFIG.COLUMNS.project) ?? '(brak projektu)',
        ratings: {
          interest:   parseInt(get(CONFIG.COLUMNS.interest))   || 0,
          learning:   parseInt(get(CONFIG.COLUMNS.learning))   || 0,
          difficulty: parseInt(get(CONFIG.COLUMNS.difficulty)) || 0,
          mood:       parseInt(get(CONFIG.COLUMNS.mood))       || 0,
        }
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

function parseGoogleDate(raw) {
  const m = String(raw).match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
  if (!m) return new Date(raw);
  return new Date(+m[1], +m[2], +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0));
}

function formatDateLabel(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}.${m}`;
}

function buildProjectList(entries) {
  const map = {};
  for (const e of entries) {
    if (!map[e.project]) map[e.project] = { name: e.project, hours: 0, count: 0 };
    map[e.project].hours += e.hours;
    map[e.project].count += 1;
  }
  return Object.values(map)
    .map(p => ({ ...p, hours: Math.round(p.hours * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours);
}

function buildDailySummaries(entries) {
  const byDay = {};
  for (const e of entries) {
    if (!byDay[e.date]) byDay[e.date] = [];
    byDay[e.date].push(e);
  }

  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayEntries]) => {
      const totalHrs = dayEntries.reduce((s, e) => s + e.hours, 0);
      const avg = key => Math.round(
        dayEntries.reduce((s, e) => s + e.ratings[key] * e.hours, 0) / totalHrs * 10
      ) / 10;
      return {
        date,
        dateLabel:     dayEntries[0].dateLabel,
        totalHours:    Math.round(dayEntries.reduce((s, e) => s + e.hours, 0) * 10) / 10,
        entryCount:    dayEntries.length,
        avgInterest:   avg('interest'),
        avgLearning:   avg('learning'),
        avgDifficulty: avg('difficulty'),
        avgMood:       avg('mood'),
      };
    });
}
