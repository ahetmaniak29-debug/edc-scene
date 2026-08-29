# Gdzie co jest

Ściąga na start nowej rozmowy. Wklej ją albo po prostu powiedz:
*„projekt sklepu leży w `C:\Users\PC\Desktop\sklep`, przeczytaj START-TUTAJ.md"*.

---

## Adresy

| Co | Gdzie |
|---|---|
| **Projekt na dysku** | `C:\Users\PC\Desktop\sklep` |
| **Strona na żywo** | https://ahetmaniak29-debug.github.io/edc-scene/ |
| **Panel administratora** | https://ahetmaniak29-debug.github.io/edc-scene/admin.html |
| **Repozytorium** | https://github.com/ahetmaniak29-debug/edc-scene |
| **Baza (Supabase)** | https://sfajnuvpvvprjocqqbpe.supabase.co |

Publikacja zmiany: `git push` na gałąź `main`. GitHub Pages odświeża stronę
w ciągu 1–2 minut, bez żadnego budowania.

> Jeśli zmiana nie dochodzi, sprawdź w Supabase/GitHub, czy build nie padł —
> zdarzało się, że GitHub Pages wywalał budowanie bez powodu. Wtedy wystarczy
> wymusić przebudowę.

---

## Strony

| Plik | Co to |
|---|---|
| `index.html` | strona główna sklepu |
| `scena.html?scene=<id>` | kategoria — klikalne zdjęcie z punktami |
| `produkt.html?id=<slug>` | jeden produkt, układ mozaikowy |
| `admin.html` | panel — **niepodlinkowany z witryny**, wchodzisz z ręki |

---

## Gdzie się co edytuje

**Prawie wszystko w panelu**, po zalogowaniu:

- **Sceny i produkty** — zdjęcie sceny, punkty (ustawiasz klikając w zdjęcie),
  produkty, ich zdjęcia, ceny, parametry
- **Strona główna** — nazwa sklepu, menu, karuzela na górze, kafelki, kolekcje,
  pasek zaufania, „o nas", wartości, newsletter, stopka, wyróżnione produkty

Konto do panelu zakładasz sam: Supabase → **Authentication → Users → Add user**,
zaznacz „Auto Confirm User".

Pliki, które czasem trzeba ruszyć ręcznie:

| Plik | Do czego |
|---|---|
| `data/scenes.json` | adres i klucz bazy, teksty wspólne |
| `data/home.json` | **kopia awaryjna** strony głównej — używana tylko, gdy baza nie odpowie |
| `data/scenes/*.json` | kopia awaryjna scen |
| `assets/css/style.css` | kolory i czcionki (na samej górze pliku) |
| `assets/css/home.css` | układ strony głównej — ściana z kafli (`.sciana`) |
| `ZDJECIA/` | zdjęcia wrzucane ręcznie; te z panelu idą do Supabase Storage |

---

## Baza

Wszystkie skrypty z `db/` są **już uruchomione**. Gdyby trzeba było odtworzyć
bazę od zera, kolejność jest taka:

1. `db/schema.sql` — liczniki kliknięć
2. `db/products.sql` — sceny, produkty, karuzela, Storage
3. `db/product_images.sql` — zdjęcia produktów
4. `db/site.sql` — treść strony głównej, miniatury kategorii
5. `db/events_cart.sql` — zdarzenie „dodano do koszyka"

Tabele: `scenes`, `products`, `product_images`, `scene_images`, `site`, `events`.

**Zasada bezpieczeństwa:** klucz w `data/scenes.json` jest publikowalny i jawny.
Całą ochronę robi RLS w bazie — anonimowy użytkownik czyta tylko opublikowane
wiersze i dopisuje zdarzenia, zapisywać może wyłącznie ktoś zalogowany.
**Nigdy nie wklejaj tu klucza `service_role`.**

---

## Co działa, a co nie

**Działa:** strona główna, kategorie ze scenami, klikalne zdjęcie z punktami,
galeria produktu, strona produktu, koszyk (w przeglądarce), panel z edycją
całej treści, liczniki kliknięć w bazie.

**Nie działa jeszcze:**

- **Płatności** — przycisk „Przejdź do płatności" jest celowo nieaktywny.
  Gdy podłączysz bramkę, punkt wyjścia to `assets/js/koszyk.js`.
- **Wyszukiwarka** — zdjęta z nagłówka, bo niczego nie szukała. Style zostały
  (`.hdr__search` w `home.css`), więc wraca odsłonięciem, gdy będzie działać.
- **Konto i ulubione** — też zdjęte z nagłówka z tego samego powodu.
- **Katalog / lista wszystkich produktów** — nie ma takiej strony.
- **Filtry i sortowanie** — przy kilkudziesięciu produktach zaczną być potrzebne.

---

## Sprzątanie

W tabeli `events` zostały wiersze testowe. Do usunięcia w SQL Editorze:

```sql
delete from public.events
 where scene in ('test-polaczenia', 'test-sprawdzenie');
```

Witryna chodzi na motywie galeryjnym: ciemny grafit, piaskowe płyty, duże
zdjęcia. Panel administratora celowo został jasny — ma przypiętą własną paletę
na górze `assets/css/admin.css`.

Treści na stronie to nadal **puste miejsca** („Nazwa produktu 1", „Główne hasło.",
„0,00 zł"). Wypełniasz je w panelu.
