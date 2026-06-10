import { requireAuth, logout } from "./auth.js";
import { subscribeAllEntries, getAllUsers } from "./store.js";
import { buildInternPicker } from "./intern-picker.js";

const params     = new URLSearchParams(window.location.search);
let selectedUid  = params.get('uid') || null;
let allEntries   = [];
let usersMap     = new Map();
let table        = null;

const COLUMNS = [
  {
    title: 'Autor', field: 'autor', sorter: 'string', minWidth: 140,
    headerFilter: 'input', headerFilterPlaceholder: 'Szukaj…',
  },
  {
    title: 'Data', field: 'data', sorter: 'date',
    sorterParams: { format: 'yyyy-MM-dd' }, minWidth: 110,
    headerFilter: 'input', headerFilterPlaceholder: 'Szukaj…',
  },
  {
    title: 'Projekt', field: 'projekt', sorter: 'string', minWidth: 130,
    headerFilter: 'input', headerFilterPlaceholder: 'Szukaj…',
  },
  {
    title: 'Tytuł', field: 'tytul', sorter: 'string', minWidth: 200,
    headerFilter: 'input', headerFilterPlaceholder: 'Szukaj…',
  },
  {
    title: 'Czas (h)', field: 'czas', sorter: 'number', hozAlign: 'right',
    headerHozAlign: 'right', minWidth: 90,
  },
  {
    title: 'Ciekawość', field: 'ciekawosc', sorter: 'number',
    hozAlign: 'center', headerHozAlign: 'center', minWidth: 100,
  },
  {
    title: 'Nauka', field: 'nauka', sorter: 'number',
    hozAlign: 'center', headerHozAlign: 'center', minWidth: 80,
  },
  {
    title: 'Trudność', field: 'trudnosc', sorter: 'number',
    hozAlign: 'center', headerHozAlign: 'center', minWidth: 100,
  },
  {
    title: 'Samopoczucie', field: 'samopoczucie', sorter: 'number',
    hozAlign: 'center', headerHozAlign: 'center', minWidth: 120,
  },
];

async function init() {
  const { user } = await requireAuth('admin');

  document.getElementById('user-name').textContent = user.displayName ?? user.email;
  const avatar = document.getElementById('user-avatar');
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ''; }
  document.getElementById('btn-logout').addEventListener('click', logout);

  const users = await getAllUsers();
  usersMap = new Map(users.map(u => [u.uid, u]));

  buildInternPicker(
    document.getElementById('intern-picker-wrap'),
    users, selectedUid,
    (uid) => { selectedUid = uid; refreshTable(); }
  );

  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const filename = `dzienniczek-${new Date().toISOString().slice(0, 10)}.csv`;
    table?.download('csv', filename);
  });

  subscribeAllEntries((entries) => {
    allEntries = entries;
    refreshTable();
  });
}

function toRows() {
  return allEntries
    .filter(e => !selectedUid || e.uid === selectedUid)
    .map(e => {
      const u = usersMap.get(e.uid);
      return {
        autor:        u ? (u.name ?? u.email) : '—',
        data:         e.date,
        projekt:      e.project,
        tytul:        e.title,
        czas:         e.hours,
        ciekawosc:    e.ratings.interest,
        nauka:        e.ratings.learning,
        trudnosc:     e.ratings.difficulty,
        samopoczucie: e.ratings.mood,
      };
    });
}

function refreshTable() {
  const rows = toRows();
  if (table) {
    table.replaceData(rows);
    return;
  }
  table = new Tabulator('#table-wrap', {
    data:          rows,
    layout:        'fitColumns',
    pagination:    true,
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, true],
    columns:       COLUMNS,
    initialSort:   [{ column: 'data', dir: 'desc' }],
    placeholder:   'Brak wpisów',
    downloadConfig: { columnHeaders: true },
  });
}

init();
