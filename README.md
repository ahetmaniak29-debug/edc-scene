# Droga

Tekstowa gra-symulacja życia napędzana AI. Zamiast sztywnego drzewa wyborów
model generuje sytuację **i** ustrukturyzowaną zmianę stanu postaci — dzięki
temu można wpisać własną akcję, a gra i tak wie, co się zmieniło.

MVP to jeden wycinek życia: siedemnaście lat, wieś, wiosna i decyzja o tym,
co dalej.

```
> Weź list ze stołu i przeczytaj go przy matce

Matka nie przerywa obierania. Papier jest cienki, pieczątka rozmazana...
(wieczór)

  zdrowie 85 | energia 65 | nastrój 60 | reputacja 50 | 340 zł
```

---

## Szybki start

```bash
git clone <adres-repo> && cd droga-zycia
npm install
cp .env.example .env       # wklej swój ANTHROPIC_API_KEY
```

**W terminalu:**

```bash
npm run play
```

**W przeglądarce:**

```bash
npm start                  # http://localhost:3000
```

Bez klucza API gra działa w **trybie offline** — narratora zastępuje atrapa.
Pętla, stan i interfejs działają, tylko narracja jest sztywna. Dobre do
klikania po UI i do testów.

Klucz API zostaje na serwerze, przeglądarka go nie widzi.

---

## Jak to działa

### 1. Stan postaci (JSON)

Jeden obiekt trzyma wszystko, co gra pamięta. To jedyne „twarde" dane —
reszta jest generowana na bieżąco.

```jsonc
{
  "turn": 7,
  "postac":   { "imie": "Ola", "wiek": 17, "plec": "kobieta", "pochodzenie": "…" },
  "swiat":    { "miejsce": "obora", "pora_roku": "wiosna", "rok": 1 },
  "staty":    { "zdrowie": 85, "energia": 65, "nastroj": 60, "reputacja": 50 },
  "pieniadze": 340,
  "umiejetnosci": { "gospodarstwo": 4 },
  "relacje":  [{ "kto": "Ojciec, Stanisław", "rola": "ojciec", "wiez": 48, "notatka": "…" }],
  "zajecie":  { "nazwa": "uczeń", "opis": "…" },
  "cele":     [{ "tresc": "Zdecydować, co po szkole", "zrobione": false }],
  "ekwipunek": ["rower"],
  "flagi":    { },
  "lore":     ["Na gospodarstwie wisi kredyt na maszynę."],
  "dziennik": [{ "tura": 6, "akcja": "…", "streszczenie": "…" }],
  "zakonczenie": null
}
```

### 2. Pętla tury

```
stan + ruch gracza  →  jedno wywołanie modelu  →  { narracja, delta, propozycje }
                                                        │
                                        applyDelta(stan, delta) → nowy stan
```

### 3. Strukturalna zmiana stanu (najważniejsze)

Model odpowiada **jednym** obiektem JSON wymuszonym schematem
(`output_config.format`, patrz `src/schema.js`) — narracja i delta powstają
razem, więc nie da się ich rozjechać.

Delta jest **względna** (`pieniadze: -200`, `wiez_zmiana: +5`), nigdy nie
nadpisuje stanu wprost. `applyDelta()` w `src/state.js` waliduje ją i przycina
do zakresów: staty 0-100, umiejętności 0-10, więzi 0-100. Model, który zwróci
`-900 zdrowia`, nie rozwali gry.

Zasada schematu: **żadnych pól opcjonalnych**. „Brak zmiany" to wartość
neutralna (`0`, `""`, `[]`). Mniej pułapek dla modelu, mniej pustych `null`
w kodzie.

### 4. Pamięć i spójność

Trzy warstwy, wszystkie doklejane do zapytania:

| Warstwa | Co trzyma | Limit |
|---|---|---|
| `lore` | trwałe fakty: obietnice, sekrety, straty, decyzje | 40 |
| `dziennik` | jednozdaniowe streszczenia tur (do promptu idzie 8 ostatnich) | 60 |
| stan | wszystko policzalne: staty, relacje, kasa, cele | — |

`lore` to lekki „lorebook": model dostaje go w całości przy każdej turze,
z instrukcją, żeby nigdy mu nie zaprzeczał.

---

## Struktura

```
src/
  state.js      stan postaci + applyDelta() (cała mechanika, bez AI)
  schema.js     schemat odpowiedzi modelu — narracja + delta + propozycje
  prompt.js     instrukcja systemowa i budowa zapytania o turę
  ai.js         wywołanie Claude API + tryb offline
  engine.js     pętla tury — jedyne miejsce, gdzie stan się zmienia
  scenario.js   MVP: wieś, 17 lat (tu robisz własny scenariusz)
  cli.js        gra w terminalu
  server.js     bezstanowy serwer wersji webowej
web/            interfejs przeglądarkowy (bez frameworków)
test/           testy applyDelta, schematu i pętli tury
```

`state.js` nie wie nic o AI, `ai.js` nie wie nic o mechanice. Testy chodzą
w trybie offline, więc nie kosztują ani grosza.

```bash
npm test
```

---

## Podjęte decyzje (odpowiedzi na otwarte pytania z briefu)

**Ile twardych kategorii stanu?** Cztery liczbowe (`zdrowie`, `energia`,
`nastroj`, `reputacja`) plus pieniądze, umiejętności, relacje, zajęcie, cele
i ekwipunek. Wszystko, co się nie mieści, idzie w `flagi` (dowolny klucz →
wartość) albo w `lore` jako zdanie. Dzięki temu nowa możliwość nie wymaga
nowego pola w schemacie — a to była cała teza briefu.

**Propozycje AI czy wolny tekst?** Jedno i drugie. Model podaje 3-4 różne
ruchy (klik albo cyfra), ale każda własna akcja jest równie ważna — instrukcja
systemowa wprost zabrania zawężania gracza do listy.

**Styl wizualny na MVP?** Czysty tekst. Terminal i prosta strona
(ciemne tło, szeryfowa narracja, panel stanu z boku). Żadnych pikseli, dopóki
fabuła nie będzie dopracowana — grafika zamraża to, co jeszcze się zmienia.

---

## Model

Domyślnie `claude-opus-5` z `effort: "low"` (krótsza tura = szybsza gra).
Do zmiany w `.env`:

```bash
DROGA_MODEL=claude-opus-5
DROGA_EFFORT=medium        # low | medium | high
```

Instrukcja systemowa jest stała przez całą rozgrywkę i oznaczona
`cache_control`, więc powtarzany prefiks nie kosztuje pełnej stawki.

---

## Własny scenariusz

Cały silnik jest od scenariusza niezależny. Wystarczy podmienić
`src/scenario.js`:

- `SCENARIO.swiat` — realia, które trafiają do instrukcji systemowej,
- `SCENARIO.otwarcie` i `SCENARIO.propozycje` — pierwsza scena,
- `startState()` — stan startowy postaci.

---

## Co dalej

- [ ] Kolejne etapy życia (dorosłość, rodzina, starość) jako osobne scenariusze
      podpinane po zakończeniu poprzedniego
- [ ] Strumieniowanie narracji (`stream: true`) — tekst zamiast czekania
- [ ] Podsumowanie długiej rozgrywki do `lore`, gdy dziennik urośnie
- [ ] Eksport historii życia do pliku na koniec gry
- [ ] Prosta grafika — dopiero po dopracowaniu tonu i logiki
