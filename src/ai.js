/**
 * Warstwa AI: jedno wywołanie = jedna tura.
 *
 * Model zwraca narrację i deltę stanu naraz, wymuszone schematem
 * (structured outputs), więc nie ma parsowania wolnego tekstu na siłę.
 */

import Anthropic from "@anthropic-ai/sdk";
import { TURN_SCHEMA } from "./schema.js";
import { systemPrompt, turnMessage } from "./prompt.js";

export const MODEL = process.env.DROGA_MODEL || "claude-opus-5";
export const EFFORT = process.env.DROGA_EFFORT || "low";

let client = null;

export function hasApiKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Wykonuje ture w modelu.
 * @returns {Promise<{narracja:string, uplyw_czasu:string, delta:object, propozycje:string[], zakonczenie:object}>}
 */
export async function generateTurn({ state, action, scenario, opening = false }) {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 16000,
    // Stały prefiks — dobrze się cache'uje między turami.
    system: [{ type: "text", text: systemPrompt(scenario), cache_control: { type: "ephemeral" } }],
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema", schema: TURN_SCHEMA },
    },
    messages: [{ role: "user", content: turnMessage(state, action, { opening }) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Model odmówił wygenerowania tej tury. Spróbuj innej akcji.");
  }

  const text = response.content.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("Pusta odpowiedź modelu.");

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
    ? `${scenario.otwarcie}\n\n[tryb offline — ustaw ANTHROPIC_API_KEY, żeby narrację pisał model]`
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
