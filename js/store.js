import { db } from "./config.js";
import {
  collection, query, where, orderBy,
  addDoc, updateDoc, deleteDoc, doc, getDocs, writeBatch,
  onSnapshot, serverTimestamp,
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

// ── Entries ────────────────────────────────────────────────────────

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
        const proj = data.projectName || data.project || "(brak projektu)";
        return {
          id:          d.id,
          uid:         data.uid,
          taskId:      data.taskId      || "",
          taskTitle:   data.taskTitle   || "",
          projectName: proj,
          project:     proj, // alias — używane przez buildProjectList i widoki admina
          timestamp:   ts,
          date:        ts.toISOString().slice(0, 10),
          dateLabel:   formatDateLabel(ts),
          title:       data.title       ?? "",
          description: data.description ?? "",
          hours:       data.hours       || 0,
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

export function subscribeTaskEntries(taskId, callback) {
  const q = query(
    collection(db, "entries"),
    where("taskId", "==", taskId),
    orderBy("timestamp", "asc")
  );
  return onSnapshot(q, (snap) => {
    const entries = snap.docs.map(d => {
      const data = d.data();
      const ts   = data.timestamp?.toDate() ?? new Date();
      return {
        id:          d.id,
        uid:         data.uid,
        taskId:      data.taskId      || "",
        taskTitle:   data.taskTitle   || "",
        projectName: data.projectName || "",
        timestamp:   ts,
        date:        ts.toISOString().slice(0, 10),
        title:       data.title       ?? "",
        description: data.description ?? "",
        hours:       data.hours       || 0,
        ratings: {
          interest:   data.interest   || 0,
          learning:   data.learning   || 0,
          difficulty: data.difficulty || 0,
          mood:       data.mood       || 0,
        },
      };
    });
    callback(entries);
  });
}

export async function addEntry(uid, data) {
  clearCache();
  const timestamp = data.date
    ? new Date(data.date + "T12:00:00Z")
    : new Date();
  await addDoc(collection(db, "entries"), {
    uid,
    taskId:      data.taskId,
    taskTitle:   data.taskTitle,
    projectName: data.projectName,
    timestamp,
    title:       data.title,
    description: data.description,
    hours:       data.hours,
    interest:    data.interest,
    learning:    data.learning,
    difficulty:  data.difficulty,
    mood:        data.mood,
  });
}

export async function updateEntry(entryId, data) {
  clearCache();
  const updates = {
    title:       data.title,
    description: data.description,
    hours:       data.hours,
    interest:    data.interest,
    learning:    data.learning,
    difficulty:  data.difficulty,
    mood:        data.mood,
  };
  if (data.date) updates.timestamp = new Date(data.date + "T12:00:00Z");
  await updateDoc(doc(db, "entries", entryId), updates);
}

// ── Tasks ──────────────────────────────────────────────────────────

export async function addTask(uid, data) {
  return await addDoc(collection(db, "tasks"), {
    uid,
    projectName:  data.projectName,
    title:        data.title,
    description:  data.description || "",
    createdAt:    serverTimestamp(),
  });
}

export async function updateTask(taskId, data) {
  await updateDoc(doc(db, "tasks", taskId), {
    title:       data.title,
    description: data.description || "",
  });
}

export async function deleteTask(taskId) {
  const entriesSnap = await getDocs(
    query(collection(db, "entries"), where("taskId", "==", taskId))
  );
  const batch = writeBatch(db);
  entriesSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(doc(db, "tasks", taskId));
  await batch.commit();
  clearCache();
}

export function subscribeProjectTasks(projectName, callback) {
  const q = query(
    collection(db, "tasks"),
    where("projectName", "==", projectName),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snap) => {
    const tasks = snap.docs.map(d => {
      const data = d.data();
      return {
        id:          d.id,
        uid:         data.uid,
        projectName: data.projectName || "",
        title:       data.title       || "",
        description: data.description || "",
        createdAt:   data.createdAt?.toDate() ?? new Date(),
      };
    });
    callback(tasks);
  });
}

// ── Users / Admin ──────────────────────────────────────────────────

export async function updateUserRole(uid, role) {
  await updateDoc(doc(db, "users", uid), { role });
}

export async function updateUserChatSpaceId(uid, chatSpaceId) {
  await updateDoc(doc(db, "users", uid), { chatSpaceId });
}

export async function updateUserSendHour(uid, sendHour) {
  await updateDoc(doc(db, "users", uid), { sendHour });
}

export async function deleteUser(uid) {
  // Usuń wpisy i zadania użytkownika, potem dokument użytkownika
  const [entriesSnap, tasksSnap] = await Promise.all([
    getDocs(query(collection(db, "entries"), where("uid", "==", uid))),
    getDocs(query(collection(db, "tasks"),   where("uid", "==", uid))),
  ]);
  const batch = writeBatch(db);
  entriesSnap.docs.forEach(d => batch.delete(d.ref));
  tasksSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(doc(db, "users", uid));
  await batch.commit();
  clearCache();
}

export async function getAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export function subscribeAllEntries(callback) {
  const q = query(collection(db, "entries"), orderBy("timestamp", "asc"));
  return onSnapshot(q, (snap) => {
    const entries = snap.docs.map(d => {
      const data = d.data();
      const ts   = data.timestamp?.toDate() ?? new Date();
      const proj = data.projectName || data.project || "(brak projektu)";
      return {
        id:          d.id,
        uid:         data.uid,
        taskId:      data.taskId    || "",
        taskTitle:   data.taskTitle || "",
        projectName: proj,
        project:     proj,
        timestamp:   ts,
        date:        ts.toISOString().slice(0, 10),
        dateLabel:   formatDateLabel(ts),
        title:       data.title       ?? "",
        description: data.description ?? "",
        hours:       data.hours       || 0,
        ratings: {
          interest:   data.interest   || 0,
          learning:   data.learning   || 0,
          difficulty: data.difficulty || 0,
          mood:       data.mood       || 0,
        },
      };
    }).sort((a, b) => a.timestamp - b.timestamp);
    callback(entries);
  });
}

// ── Helpers ────────────────────────────────────────────────────────

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
