/**
 * Schemat odpowiedzi AI (structured outputs).
 *
 * To jest serce projektu: model w JEDNYM wywołaniu zwraca narrację ORAZ
 * ustrukturyzowaną zmianę stanu. Dzięki temu fabuła może być w pełni
 * generowana, a stan gry i tak zostaje spójny i przewidywalny.
 *
 * Zasada: żadnych pól opcjonalnych. Wszystko jest wymagane, a "brak zmiany"
 * wyraża się wartością neutralną (0, "" albo []). Mniej pułapek dla modelu.
 */

const str = (description) => ({ type: "string", description });
const int = (description) => ({ type: "integer", description });
const list = (items, description) => ({ type: "array", items, description });

const obj = (properties, description) => ({
  type: "object",
  description,
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const TURN_SCHEMA = obj(
  {
    narracja: str(
      "Opis tego, co się stało, po polsku, w drugiej osobie ('idziesz', 'słyszysz'). " +
        "120-220 słów. Konkret zamiast ogólników: jedno miejsce, jedna osoba, jeden szczegół. " +
        "Kończy się momentem decyzji, ale NIE wypisuje listy opcji."
    ),
    uplyw_czasu: str("Ile czasu minęło, np. 'wieczór', 'trzy dni', 'pół roku'."),
    delta: obj(
      {
        wiek_delta: int("O ile lat postarzała się postać. Zwykle 0."),
        miejsce: str("Nowe miejsce pobytu. Pusty string = bez zmian."),
        pora_roku: str("wiosna / lato / jesień / zima. Pusty string = bez zmian."),
        rok_delta: int("O ile lat przesunął się kalendarz gry. Zwykle 0."),
        staty: obj(
          {
            zdrowie: int("Zmiana względna, zwykle od -15 do +15."),
            energia: int("Zmiana względna, zwykle od -20 do +20."),
            nastroj: int("Zmiana względna, zwykle od -20 do +20."),
            reputacja: int("Zmiana względna w oczach otoczenia, zwykle od -15 do +15."),
          },
          "Zmiany statów. 0 = bez zmian."
        ),
        pieniadze: int("Zmiana stanu portfela w złotówkach (może być ujemna). 0 = bez zmian."),
        umiejetnosci: list(
          obj({
            nazwa: str("Nazwa umiejętności po polsku, małymi literami, np. 'gospodarstwo'."),
            zmiana: int("Zmiana poziomu w skali 0-10. Zwykle +1."),
          }),
          "Umiejętności, które urosły albo zardzewiały. Pusta lista, jeśli nic."
        ),
        relacje: list(
          obj({
            kto: str("Imię postaci, dokładnie tak samo jak w stanie gry."),
            rola: str("Kim jest dla bohatera, np. 'matka', 'sąsiad'. Pusty string = bez zmian."),
            wiez_zmiana: int("Zmiana więzi w skali 0-100, zwykle od -20 do +20."),
            notatka: str("Krótka aktualna notatka o tej osobie. Pusty string = bez zmian."),
            usun: { type: "boolean", description: "true tylko wtedy, gdy postać znika z życia bohatera." },
          }),
          "Nowe i zmienione relacje. Pusta lista, jeśli nic."
        ),
        zajecie: obj(
          {
            nazwa: str("Nowe zajęcie/zawód. Pusty string = bez zmian."),
            opis: str("Jedno zdanie o tym zajęciu. Pusty string = bez zmian."),
          },
          "Zmiana zajęcia bohatera."
        ),
        ekwipunek_dodaj: list(str("Przedmiot"), "Rzeczy, które bohater zdobył."),
        ekwipunek_usun: list(str("Przedmiot"), "Rzeczy, które stracił, sprzedał albo zużył."),
        cele_dodaj: list(str("Cel"), "Nowe cele albo zobowiązania bohatera."),
        cele_zrobione: list(str("Cel"), "Cele domknięte w tej turze (dokładna treść z listy celów)."),
        flagi: list(
          obj({
            klucz: str("Nazwa flagi, np. 'ślub'."),
            wartosc: str("Wartość flagi, np. 'zaręczyny'."),
          }),
          "Trwałe fakty logiczne, które nie mieszczą się w innych polach."
        ),
        lore_dodaj: list(
          str("Jedno zdanie faktu"),
          "Fakty, o których gra ma pamiętać do końca rozgrywki (maks. 1-2 na turę). " +
            "Tylko rzeczy trwałe: obietnice, sekrety, straty, decyzje. Nie pogoda."
        ),
        podsumowanie: str("Jedno zdanie do dziennika, w trzeciej osobie, np. 'Została na noc w oborze'."),
      },
      "Ustrukturyzowana zmiana stanu gry. Musi zgadzać się z narracją."
    ),
    propozycje: list(
      str("Krótka propozycja akcji w trybie rozkazującym, np. 'Powiedz ojcu prawdę'."),
      "3-4 różne propozycje kolejnego ruchu. Różne w skutkach, nie warianty tego samego."
    ),
    zakonczenie: obj(
      {
        typ: str("Pusty string = gra trwa. Inaczej: 'dobre', 'gorzkie', 'śmierć', 'odejście'."),
        tekst: str("Domknięcie historii, 2-4 zdania. Pusty string, gdy gra trwa."),
      },
      "Wypełnij tylko wtedy, gdy historia naprawdę się kończy."
    ),
  },
  "Jedna tura gry."
);
