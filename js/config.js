const CONFIG = {
  DEMO: true,  // zmień na false żeby używać prawdziwych danych z Google Sheets

  SHEETS_ID: '1FS498thr4ler0ertFzkuYaGW9bjof-RPaDUEpEskckk',

  // Indeksy kolumn (0-based) — w tej kolejności Google Forms zawsze je tworzy
  COLUMNS: {
    timestamp:   0,
    title:       1,
    description: 2,
    hours:       3,
    interest:    4,
    learning:    5,
    difficulty:  6,
    mood:        7,
  }
};
