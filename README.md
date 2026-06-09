# Intern Journal

Dashboard postępów stażu. Dane z Google Forms → Google Sheets → wykresy w przeglądarce.

**Dashboard:** https://fbrzostowski.github.io/intern-journal

## Setup (jednorazowy)

1. Stwórz Google Form z polami: tytuł, opis, godziny, ciekawość, nauka, trudność, samopoczucie
2. Podłącz formularz do Google Sheets (Odpowiedzi → ikona Sheets)
3. Ustaw Sheets jako publiczny (Udostępnij → Każda osoba z linkiem → Przeglądający)
4. Skopiuj SHEETS_ID z URL arkusza
5. Wklej SHEETS_ID do `js/config.js`
6. Wklej link do formularza w `index.html` (przycisk "+ Dodaj wpis")
7. Push do GitHub → GitHub Pages automatycznie hostuje dashboard

## Uruchomienie

Wypełnij formularz → odśwież dashboard → gotowe.
