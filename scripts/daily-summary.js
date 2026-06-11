"use strict";

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { google } = require("googleapis");

// ── Init ──────────────────────────────────────────────────────────

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const chatAuth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/chat.bot"],
});
const chat = google.chat({ version: "v1", auth: chatAuth });

const TIMEZONE      = "Europe/Warsaw";
const FALLBACK_NAME = "(brak projektu)";

// ── Helpers ───────────────────────────────────────────────────────

function normalizeSpaceId(raw) {
  // https://mail.google.com/chat/u/0/#chat/space/AAABBB  →  spaces/AAABBB
  const urlMatch = raw.match(/space\/([^/?#]+)/);
  if (urlMatch) return `spaces/${urlMatch[1]}`;
  if (raw.startsWith("spaces/")) return raw;
  return `spaces/${raw}`;
}

async function sendDM(spaceId, text) {
  await chat.spaces.messages.create({
    parent: normalizeSpaceId(spaceId),
    requestBody: { text },
  });
}

function fmtHours(h) {
  return (Math.round(h * 10) / 10) + "h";
}

function formatDateLabel(date) {
  const dayNames = ["nd", "pn", "wt", "śr", "cz", "pt", "sb"];
  const dow = dayNames[date.getDay()];
  const d   = String(date.getDate()).padStart(2, "0");
  const m   = String(date.getMonth() + 1).padStart(2, "0");
  const y   = date.getFullYear();
  return `${dow}, ${d}.${m}.${y}`;
}

function getWarsawOffsetMs(year, month, day) {
  const testDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(testDate);
  const get = (type) => parseInt(parts.find(p => p.type === type).value, 10);
  const warsawUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return -(testDate.getTime() - warsawUtc);
}

function getTodayBounds() {
  const fmt    = new Intl.DateTimeFormat("pl-PL", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts  = fmt.formatToParts(new Date());
  const year   = parseInt(parts.find(p => p.type === "year").value,  10);
  const month  = parseInt(parts.find(p => p.type === "month").value, 10) - 1;
  const day    = parseInt(parts.find(p => p.type === "day").value,   10);
  const offset = getWarsawOffsetMs(year, month, day);
  const startMs = Date.UTC(year, month, day) - offset;
  const endMs   = startMs + 24 * 60 * 60 * 1000;
  return {
    start: Timestamp.fromMillis(startMs),
    end:   Timestamp.fromMillis(endMs),
    date:  new Date(startMs + offset),
  };
}

function getCurrentWarsawMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === "hour").value,   10);
  const m = parseInt(parts.find(p => p.type === "minute").value, 10);
  return h * 60 + m;
}

function parseSendMinutes(val) {
  if (!val && val !== 0) return 17 * 60; // domyślnie 17:00
  if (typeof val === "number") return val * 60;
  const [h, m] = String(val).split(":").map(Number);
  return h * 60 + (m || 0);
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const { start, end, date } = getTodayBounds();
  console.log(`Zakres: ${start.toDate().toISOString()} — ${end.toDate().toISOString()}`);

  const [entriesSnap, usersSnap] = await Promise.all([
    db.collection("entries")
      .where("timestamp", ">=", start)
      .where("timestamp", "<",  end)
      .get(),
    db.collection("users").get(),
  ]);

  const currentMin = getCurrentWarsawMinutes();
  const currentLabel = `${String(Math.floor(currentMin / 60)).padStart(2, "0")}:${String(currentMin % 60).padStart(2, "0")}`;
  console.log(`Aktualna godzina (Warszawa): ${currentLabel}`);

  // Administratorzy ze skonfigurowanym Chat Space ID i pasującą godziną wysyłki (okno ±7 min)
  const admins = usersSnap.docs
    .filter(d => {
      const u = d.data();
      if (u.role !== "admin" || !u.chatSpaceId || !u.chatSpaceId.trim()) return false;
      return Math.abs(parseSendMinutes(u.sendHour) - currentMin) <= 7;
    })
    .map(d => {
      const u = d.data();
      return { uid: d.id, name: u.name || u.email || d.id, spaceId: u.chatSpaceId.trim() };
    });

  if (admins.length === 0) {
    console.log(`Brak administratorów z wysyłką o ${currentLabel} (±7 min) — przerywam.`);
    return;
  }
  console.log(`Odbiorcy: ${admins.map(a => a.name).join(", ")}`);

  const dateLabel = formatDateLabel(date);

  if (entriesSnap.empty) {
    const text = `📋 *Podsumowanie dnia — ${dateLabel}*\n\nBrak wpisów dzisiaj.`;
    await Promise.all(admins.map(a =>
      sendDM(a.spaceId, text)
        .then(() => console.log(`Wysłano (brak wpisów) → ${a.name}`))
        .catch(err => console.error(`Błąd → ${a.name}: ${err.message}`))
    ));
    return;
  }

  // Mapa uid → nazwa wyświetlana
  const userMap = new Map();
  usersSnap.docs.forEach(d => {
    const u = d.data();
    userMap.set(d.id, u.name || u.email || d.id);
  });

  // Grupowanie: projekt → Map(stażysta → łączne godziny)
  const projects = new Map();
  entriesSnap.docs.forEach(d => {
    const data    = d.data();
    const project = (data.project && data.project.trim()) ? data.project.trim() : FALLBACK_NAME;
    const name    = userMap.get(data.uid) || data.uid;
    const hours   = typeof data.hours === "number" ? data.hours : 0;
    if (!projects.has(project)) projects.set(project, new Map());
    const internMap = projects.get(project);
    internMap.set(name, (internMap.get(name) || 0) + hours);
  });

  // Budowanie wiadomości
  const lines = [`📋 *Podsumowanie dnia — ${dateLabel}*`, ""];

  let grandTotal      = 0;
  const activeInterns = new Set();

  const sortedProjects = [...projects.entries()].sort(([a], [b]) => {
    if (a === FALLBACK_NAME) return 1;
    if (b === FALLBACK_NAME) return -1;
    return a.localeCompare(b, "pl");
  });

  for (const [projectName, internMap] of sortedProjects) {
    lines.push(`🗂️ *${projectName}*`);
    let projectTotal    = 0;
    const sortedInterns = [...internMap.entries()].sort(([a], [b]) => a.localeCompare(b, "pl"));
    for (const [name, hours] of sortedInterns) {
      lines.push(`• ${name} — ${fmtHours(hours)}`);
      projectTotal += hours;
      activeInterns.add(name);
    }
    grandTotal += projectTotal;
    lines.push(`Łącznie: ${fmtHours(projectTotal)}`);
    lines.push("");
  }

  lines.push(`📊 Wszystkich godzin: ${fmtHours(grandTotal)} | Aktywnych stażystów: ${activeInterns.size}`);

  const text = lines.join("\n");
  console.log("Treść:\n" + text);

  await Promise.all(admins.map(a =>
    sendDM(a.spaceId, text)
      .then(() => console.log(`Wysłano → ${a.name}`))
      .catch(err => console.error(`Błąd → ${a.name}: ${err.message}`))
  ));
}

main().catch(err => { console.error(err); process.exit(1); });
