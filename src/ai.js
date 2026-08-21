/**
 * Warstwa AI: jedno wywołanie = jedna tura.
 *
 * Model zwraca narrację i deltę stanu naraz, wymuszone schematem
 * (structured outputs), więc nie ma parsowania wolnego tekstu na siłę.
 *
 * Dostawca jest wymienny: Claude albo Gemini. Reszta gry o tym nie wie.
 */

import * as claude from "./providers/claude.js";
import * as gemini from "./providers/gemini.js";
import { systemPrompt, turnMessage } from "./prompt.js";

const DOSTAWCY = { claude, gemini };

/** Wybór dostawcy: DROGA_PROVIDER, a jak nie ma — ten, do którego jest klucz. */
export function dostawca() {
  const wybrany = (process.env.DROGA_PROVIDER || "").toLowerCase();
  if (DOSTAWCY[wybrany]) return DOSTAWCY[wybrany];
  if (claude.maKlucz()) return claude;
  if (gemini.maKlucz()) return gemini;
  return null;
}

export function hasApiKey() {
  const d = dostawca();
  return Boolean(d && d.maKlucz());
}

/** Nazwa modelu do pokazania w interfejsie. */
export function opisModelu() {
  const d = dostawca();
  if (!d || !d.maKlucz()) return null;
  return `${d.NAZWA} / ${model(d)}`;
}

function model(d) {
  return process.env.DROGA_MODEL || d.domyslnyModel();
}

/**
 * Wykonuje turę w modelu.
 * @returns {Promise<{narracja:string, uplyw_czasu:string, delta:object, propozycje:string[], zakonczenie:object}>}
 */
export async function generateTurn({ state, action, scenario, opening = false }) {
  const d = dostawca();
  if (!d) throw new Error("Brak klucza API (ANTHROPIC_API_KEY albo GEMINI_API_KEY).");

  const text = await d.generujTure({
    system: systemPrompt(scenario),
    wiadomosc: turnMessage(state, action, { opening }),
    model: model(d),
    effort: process.env.DROGA_EFFORT || "low",
  });

  let turn;
  try {
    turn = JSON.parse(text);
  } catch {
    throw new Error("Odpowiedź modelu nie jest poprawnym JSON-em.");
  }

  if (!turn?.narracja) throw new Error("Odpowiedź modelu nie zawiera narracji.");
  return turn;
}

/**
 * Tryb offline — bez klucza API.
 * Nie udaje narratora, tylko pozwala przeklikać pętlę gry i testy.
 */
export function mockTurn({ state, action, scenario, opening = false }) {
  const kto = state.relacje[0]?.kto ?? "ktoś z domowników";
  const narracja = opening
    ? `${scenario.otwarcie}\n\n[tryb offline — ustaw klucz API, żeby narrację pisał model]`
    : `Robisz to: ${action}. Dzień schodzi na tym szybciej, niż myślałeś. ` +
      `${kto} patrzy na ciebie dłużej niż zwykle i nic nie mówi. Wieczorem w kuchni ` +
      `zostaje pytanie, które i tak trzeba będzie domknąć.\n\n[tryb offline — bez modelu]`;

  return {
    narracja,
    uplyw_czasu: opening ? "poranek" : "jeden dzień",
    delta: {
      wiek_delta: 0,
      miejsce: "",
      pora_roku: "",
      rok_delta: 0,
      staty: { zdrowie: 0, energia: opening ? 0 : -5, nastroj: 0, reputacja: 0 },
      pieniadze: 0,
      umiejetnosci: [],
      relacje: [],
      zajecie: { nazwa: "", opis: "" },
      ekwipunek_dodaj: [],
      ekwipunek_usun: [],
      cele_dodaj: [],
      cele_zrobione: [],
      flagi: [],
      lore_dodaj: [],
      podsumowanie: opening ? "Początek historii." : `Akcja: ${action}`,
    },
    propozycje: opening ? scenario.propozycje : ["Wróć do domu", "Poczekaj do rana", "Powiedz prawdę"],
    zakonczenie: { typ: "", tekst: "" },
  };
}
