# Scena

Klikalne zdjęcie z wyselekcjonowanym sprzętem. Jedna scena, jedna kategoria, dane
w plikach JSON — bez bazy, bez logowania, bez backendu.

Cel MVP: sprawdzić, **czy ludzie klikają w produkty na stylizowanym zdjęciu**
i czy przechodzą do sklepów małych marek.

---

## Co jest w środku

```
ZDJECIA/                        >>> TUTAJ WRZUCASZ ZDJĘCIA <<<

index.html                      strona główna sklepu
scena.html                      strona kategorii z klikalnym zdjęciem

data/home.json                  cała treść strony głównej
data/scenes.json                spis scen + ustawienia
data/scenes/outdoor-edc.json    produkty sceny "EDC"

assets/css/style.css            motyw wspólny (kolory, cienie, panel produktu)
assets/css/home.css             układ strony głównej i kategorii
assets/js/chrome.js             wspólny nagłówek, menu i stopka obu stron
assets/js/home.js               strona główna: karuzela, sekcje
assets/js/app.js                scena: punkty i panel produktu
assets/js/counter.js            licznik kliknięć
assets/scenes/outdoor-edc.svg   ZDJĘCIE ZASTĘPCZE — podmień na własne
```

Dwa rodzaje stron: **strona główna** (witryna sklepu) i **strona kategorii**
(klikalne zdjęcie). Scen może być wiele — każda pod własnym adresem
`scena.html?scene=<id>`. Kategoria „EDC" na stronie głównej prowadzi właśnie tam.

### Gdzie co edytujesz

| Chcesz zmienić…                        | Otwórz                        |
|----------------------------------------|-------------------------------|
| teksty, przyciski, menu, stopkę        | `data/home.json`              |
| produkty i punkty na zdjęciu sceny     | `data/scenes/outdoor-edc.json`|
| kolory i czcionki                      | `assets/css/style.css` (góra) |

W `data/home.json` **puste `"image"` rysuje na stronie szarą ramkę** z podpisem,
jakie zdjęcie tam wrzucić i w jakim rozmiarze. Wpisz ścieżkę
(np. `"ZDJECIA/hero/moje-zdjecie.jpg"`), żeby ramkę zastąpić zdjęciem.

Nazwa kategorii **nie jest zaszyta w kodzie ani w brandingu** — siedzi wyłącznie
w danych (`label` sceny i pole `category` przy produkcie). Dodanie drugiej sceny
z inną kategorią to dopisanie pliku JSON.

---

## Uruchomienie lokalnie

Strona wczytuje pliki JSON, więc **nie zadziała po dwukliku w `index.html`**
(przeglądarka blokuje `fetch` z `file://`). Potrzebny jest zwykły serwer:

```bash
npx serve .
```

Potem wejdź na adres, który wypisze (zwykle `http://localhost:3000`).

---

## Codzienna edycja

### Zmiana produktu

Otwórz `data/scenes/outdoor-edc.json`. Jeden produkt to jeden blok:

```json
{
  "id": "latarka-aa",
  "name": "Latarka na jedno AA, 600 lm",
  "brand": "ReyLight",
  "category": "outdoor-edc",
  "price": "ok. 350 zł",
  "why": "Jedna paluszkowa bateria, którą kupisz na każdej stacji…",
  "specs": [{ "k": "Waga", "v": "62 g" }],
  "url": "https://…",
  "ctaLabel": "Zobacz u sprzedawcy",
  "hotspot": { "x": 69, "y": 22 }
}
```

Pod dużym zdjęciem jest mniejsza karuzela — slajdy dodajesz w tablicy
`gallery` w tym samym pliku:

```json
"gallery": [
  { "image": "ZDJECIA/kolekcje/ujecie-2.jpg", "title": "Podpis", "text": "Opis ujęcia." }
]
```

Pusta tablica albo brak pola = karuzela w ogóle się nie pokaże.

| Pole        | Do czego                                                        |
|-------------|-----------------------------------------------------------------|
| `id`        | Musi być unikalny — po nim liczą się kliknięcia. Nie zmieniaj bez potrzeby, bo wyzerujesz historię. |
| `specs`     | Opcjonalne. Pusta lista albo brak pola = tabelka się nie pokaże. |
| `ctaLabel`  | Opcjonalne. Domyślnie „Zobacz u sprzedawcy".                     |
| `hotspot`   | Pozycja punktu w **procentach** szerokości i wysokości zdjęcia.  |
| `category`  | Na razie `"outdoor-edc"`. Przy drugiej scenie wpiszesz inną.     |

Zapisz plik → odśwież stronę. Tyle.

### Podmiana zdjęcia sceny

1. Wrzuć swoje zdjęcie do `assets/scenes/` (jpg lub webp, najlepiej pionowe,
   ok. 1000×1250 px, do ~400 kB).
2. W `data/scenes/outdoor-edc.json` zmień `"image"` na nową ścieżkę
   i opisz zdjęcie w `"imageAlt"`.
3. Ustaw punkty na nowo (niżej).

Zdjęcie nigdy nie jest przycinane, więc punkty w procentach trafiają w to samo
miejsce na każdym ekranie.

### Ustawianie punktów bez liczenia w głowie

Dopisz `?pick=1` do adresu:

```
http://localhost:3000/?pick=1
```

Klikaj w przedmioty na zdjęciu — gotowy fragment (`"hotspot": { "x": …, "y": … }`)
wskoczy do schowka. Wklej go do produktu w JSON-ie.

---

## Licznik kliknięć

Mierzone są dwa zdarzenia na produkt:

- **`open`** — ktoś otworzył panel (zainteresowanie),
- **`outbound`** — ktoś kliknął przycisk do sprzedawcy (zamiar zakupu).

Podgląd: dopisz `?stats=1` do adresu.

### Ważne ograniczenie

Domyślnie liczniki siedzą w `localStorage`, czyli **w przeglądarce jednego
użytkownika**. Na Twoim telefonie zobaczysz swoje kliknięcia, nie cudze.
Do prawdziwego testu potrzebujesz zdalnego zbierania.

### Zbieranie danych od wszystkich (15 minut roboty)

Najprościej przez Google Apps Script — darmowe, dane lądują w arkuszu:

1. Nowy arkusz Google → **Rozszerzenia → Apps Script**.
2. Wklej:

   ```javascript
   function doPost(e) {
     const d = JSON.parse(e.postData.contents);
     SpreadsheetApp.getActiveSpreadsheet().getActiveSheet()
       .appendRow([new Date(), d.scene, d.category, d.product, d.event, d.w, d.ref]);
     return ContentService.createTextOutput('ok');
   }
   ```

3. **Wdróż → Nowe wdrożenie → Aplikacja internetowa**, dostęp: „Wszyscy".
4. Skopiuj adres i wklej do `data/scenes.json`:

   ```json
   "analytics": { "endpoint": "https://script.google.com/macros/s/…/exec" }
   ```

Od tego momentu każde kliknięcie dopisuje wiersz w arkuszu. Wyjście do sprzedawcy
wysyłane jest przez `sendBeacon`, więc nie gubi się przy opuszczaniu strony.

Alternatywy, jeśli wolisz gotowca: Plausible, Umami albo Formspree — kod wysyła
zwykły POST z JSON-em, więc pasuje wszędzie.

---

## Druga scena, inna kategoria

1. Skopiuj `data/scenes/outdoor-edc.json` na np. `data/scenes/kuchnia.json`.
2. Zmień w środku `id`, `label`, `title`, `image` i produkty
   (w każdym `category` na nowe, np. `"kuchnia"`).
3. Dopisz id na listę w `data/scenes.json`:

   ```json
   "scenes": ["outdoor-edc", "kuchnia"]
   ```

Nowa scena będzie pod `?scene=kuchnia`. Żeby stała się domyślna, zmień
`defaultScene`. **Nie trzeba dotykać kodu.**

---

## Publikacja

Strona stoi na GitHub Pages, serwowana wprost z gałęzi `main`. Żadnego builda —
publikacja zmiany to:

```bash
git add -A && git commit -m "nowe ceny" && git push
```

Po minucie-dwóch zmiana jest na żywo. Adres znajdziesz w **Settings → Pages**.

---

## Czego tu celowo nie ma

Kont, płatności, koszyka, panelu admina, bazy danych. To prototyp do jednego
pytania: czy ludzie klikają. Jeśli klikają — wtedy warto rozmawiać o reszcie.

---

## ⚠️ Zanim pokażesz stronę komukolwiek

Produkty w `data/scenes/outdoor-edc.json` to **dane demonstracyjne**. Marki
i adresy stron są prawdziwe, ale **ceny, opisy i linki do konkretnych produktów
zostały zmyślone na potrzeby wyglądu**. Zweryfikuj je i podmień — inaczej
pokażesz ludziom nieprawdziwe informacje o cudzych produktach.

To samo dotyczy zdjęcia: `assets/scenes/outdoor-edc.svg` to rysunek zastępczy,
nie fotografia.
