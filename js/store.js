import { db } from "./config.js";
import {
  collection, query, where, orderBy,
  addDoc, updateDoc, doc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const CACHE_KEY = "dzienniczek_entries";

function saveCache(uid, entries) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      uid,
      savedAt: Date.now(),
      entries: entries.map(e => ({ ...e, timestamp: e.timestamp.toISOString() })),
    }));
  } catch (_) {}
}

function loadCache(uid) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.uid !== uid) return null;
    return data.entries.map(e => ({ ...e, timestamp: new Date(e.timestamp) }));
  } catch (_) { return null; }
}

function clearCache() {
  sessionStorage.removeItem(CACHE_KEY);
}

// Subskrybuje wpisy użytkownika.
// Jeśli cache istnieje — callback odpala się natychmiast z cache,
// potem ponownie gdy Firestore odpowie (zwykle bez widocznej zmiany).
export function subscribeUserEntries(uid, callback) {
  const cached = loadCache(uid);
  if (cached) callback(cached);

  const q = query(
    collection(db, "entries"),
    where("uid", "==", uid),
    orderBy("timestamp", "asc")
  );
  return onSnapshot(q, (snap) => {
    const entries = snap.docs
      .map(d => {
        const data = d.data();
        const ts   = data.timestamp?.toDate() ?? new Date();
        return {
          id:          d.id,
          uid:         data.uid,
          timestamp:   ts,
          date:        ts.toISOString().slice(0, 10),
          dateLabel:   formatDateLabel(ts),
          title:       data.title       ?? "",
          description: data.description ?? "",
          hours:       data.hours       || 0,
          project:     data.project     || "(brak projektu)",
          ratings: {
            interest:   data.interest   || 0,
            learning:   data.learning   || 0,
            difficulty: data.difficulty || 0,
            mood:       data.mood       || 0,
          },
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);
    saveCache(uid, entries);
    callback(entries);
  });
}

export async function addEntry(uid, data) {
  clearCache(); // wymuś świeże dane po dodaniu wpisu
  await addDoc(collection(db, "entries"), {
    uid,
    timestamp:   serverTimestamp(),
    title:       data.title,
    description: data.description,
    hours:       data.hours,
    project:     data.project,
    interest:    data.interest,
    learning:    data.learning,
    difficulty:  data.difficulty,
    mood:        data.mood,
  });
}

export async function updateEntry(entryId, data) {
  clearCache();
  await updateDoc(doc(db, "entries", entryId), {
    title:       data.title,
    description: data.description,
    hours:       data.hours,
    project:     data.project,
    interest:    data.interest,
    learning:    data.learning,
    difficulty:  data.difficulty,
    mood:        data.mood,
  });
}

export function buildDailySummaries(entries) {
  const byDay = {};
  for (const e of entries) {
    if (!byDay[e.date]) byDay[e.date] = [];
    byDay[e.date].push(e);
  }
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayEntries]) => {
      const totalHrs = dayEntries.reduce((s, e) => s + e.hours, 0);
      const avg = key => totalHrs > 0
        ? Math.round(dayEntries.reduce((s, e) => s + e.ratings[key] * e.hours, 0) / totalHrs * 10) / 10
        : 0;
      return {
        date,
        dateLabel:     dayEntries[0].dateLabel,
        totalHours:    Math.round(totalHrs * 10) / 10,
        entryCount:    dayEntries.length,
        avgInterest:   avg("interest"),
        avgLearning:   avg("learning"),
        avgDifficulty: avg("difficulty"),
        avgMood:       avg("mood"),
      };
    });
}

export function buildProjectList(entries) {
  const map = {};
  for (const e of entries) {
    const name = e.project || "(brak projektu)";
    if (!map[name]) map[name] = { name, hours: 0, count: 0 };
    map[name].hours += e.hours;
    map[name].count += 1;
  }
  return Object.values(map)
    .map(p => ({ ...p, hours: Math.round(p.hours * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours);
}

export function chartGridColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--chart-grid").trim();
}

function formatDateLabel(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}.${m}`;
}
