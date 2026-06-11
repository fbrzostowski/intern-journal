# Dzienniczek stażysty

Aplikacja webowa do śledzenia postępów stażu. Stażyści logują się przez Google i dodają wpisy z oceną dnia; administratorzy widzą wszystkich i otrzymują codzienne podsumowanie na Google Chat.

**URL:** https://fbrzostowski.github.io/dzienniczek-stazysty

---

## Stack

| Warstwa | Technologia |
|---|---|
| Frontend | Statyczny HTML + Vanilla JS (ES modules) + Chart.js |
| Baza danych | Firebase Firestore |
| Auth | Firebase Authentication (Google Sign-In) |
| Hosting | GitHub Pages |
| Automatyzacja | GitHub Actions + Google Chat API |

Bez backendu, bez serwera — wszystko działa przez Firebase SDK w przeglądarce.

---

## Role użytkowników

| Rola | Opis |
|---|---|
| `setup` (Oczekuje) | Nowe konto, czeka na aktywację przez administratora |
| `intern` (Stażysta) | Może dodawać i edytować własne wpisy |
| `admin` (Administrator) | Widzi wszystkich stażystów, zarządza rolami, otrzymuje codzienne DM z podsumowaniem |
| `inactive` (Nie Aktywny) | Konto wyłączone — przekierowuje na stronę oczekiwania |

Przy pierwszym logowaniu konto otrzymuje automatycznie rolę `setup`. Administrator musi ją zmienić w Panelu Sterowania.

---

## Struktura stron

| Plik | Dostęp | Opis |
|---|---|---|
| `login.html` | publiczny | Logowanie przez Google |
| `pending.html` | publiczny | Strona oczekiwania dla `setup` i `inactive` |
| `index.html` | intern / admin | Dashboard stażysty — statystyki, wykresy, lista wpisów |
| `day.html` | intern | Wpisy z wybranego dnia |
| `project.html` | intern | Wpisy z wybranego projektu |
| `admin.html` | admin | Dashboard admina z wyborem stażysty |
| `admin-day.html` | admin | Wpisy z wybranego dnia dla wszystkich stażystów |
| `admin-intern.html` | admin | Widok konkretnego stażysty |
| `admin-project.html` | admin | Widok konkretnego projektu |
| `admin-sheet.html` | admin | Arkusz danych (Tabulator) z eksportem CSV |
| `admin-control.html` | admin | Panel Sterowania — zarządzanie użytkownikami i rolami |

---

## Wpis dzienny

Każdy wpis zawiera:

- **Tytuł** zadania (wymagany)
- **Opis** (opcjonalny)
- **Godziny** (wymagane, min. 0.25)
- **Projekt** (opcjonalny tekst)
- Cztery oceny w skali 1–10: **Ciekawość**, **Nauka**, **Trudność**, **Samopoczucie**

---

## Codzienne podsumowanie na Google Chat

GitHub Actions uruchamia skrypt `scripts/daily-summary.js` każdego dnia roboczego o **17:00 CEST** (15:00 UTC). Skrypt pobiera wpisy z bieżącego dnia z Firestore i wysyła DM do każdego administratora ze skonfigurowanym `chatSpaceId`.

Chat Space ID ustawia się w **Panelu Sterowania** (pole przy każdym administratorze). Format: `AAABBBCCC` lub `spaces/AAABBBCCC`.

### Wymagane sekrety GitHub

| Sekret | Opis |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON konta serwisowego Firebase (z uprawnieniami Firestore i Google Chat API) |

---

## Konfiguracja od zera

### 1. Firebase

1. Utwórz projekt na [console.firebase.google.com](https://console.firebase.google.com)
2. Włącz **Authentication** → Google Sign-In
3. Włącz **Firestore Database** w trybie produkcyjnym
4. Skopiuj konfigurację webową i wklej do `js/config.js`

### 2. Reguły Firestore

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
      allow read: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }
    match /entries/{id} {
      allow read, write: if request.auth.uid == resource.data.uid;
      allow read, write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }
  }
}
```

### 3. Google Chat (podsumowanie automatyczne)

1. W Google Cloud Console włącz **Google Chat API**
2. Utwórz konto serwisowe z rolą wystarczającą do wysyłania wiadomości
3. Pobierz klucz JSON konta serwisowego
4. Dodaj sekret `FIREBASE_SERVICE_ACCOUNT` w GitHub (Settings → Secrets → Actions)
5. Dodaj bota do przestrzeni (Space) i skopiuj jej ID do Panelu Sterowania

### 4. Hosting

Push do gałęzi `main` → GitHub Actions automatycznie deployuje na GitHub Pages.

Włącz GitHub Pages w ustawieniach repozytorium: **Settings → Pages → Source: GitHub Actions**.

---

## Lokalny podgląd

Projekt to statyczne pliki — wystarczy dowolny lokalny serwer HTTP (ES modules nie działają przez `file://`):

```bash
npx serve .
# lub
python3 -m http.server 8080
```
