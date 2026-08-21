/**
 * Dostawca: Gemini (Google AI Studio).
 *
 * Bez SDK — czysty REST przez wbudowany fetch, żeby projekt nie ciągnął
 * kolejnej zależności. Structured output robi `responseSchema`, czyli
 * odpowiednik schematu z src/schema.js w dialekcie OpenAPI.
 */

import { TURN_SCHEMA } from "../schema.js";

export const NAZWA = "gemini";

const API = "https://generativelanguage.googleapis.com/v1beta/models";

export function domyslnyModel() {
  // 3.5-flash: ~4 s na turę i stabilnie trzyma schemat. Nowsze flashe bywają
  // wolniejsze i częściej odbijają 503, pro-modele zwykle nie mieszczą się
  // w darmowym limicie.
  return "gemini-3.5-flash";
}

export function maKlucz() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

function klucz() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

/**
 * JSON Schema -> schemat Gemini.
 * Różnice: typy pisane wielkimi literami, brak additionalProperties,
 * propertyOrdering zamiast kolejności kluczy.
 */
export function naSchematGemini(node) {
  if (node.type === "object") {
    return {
      type: "OBJECT",
      description: node.description,
      properties: Object.fromEntries(
        Object.entries(node.properties).map(([key, value]) => [key, naSchematGemini(value)])
      ),
      required: [...node.required],
      propertyOrdering: Object.keys(node.properties),
    };
  }
  if (node.type === "array") {
    return { type: "ARRAY", description: node.description, items: naSchematGemini(node.items) };
  }
  return { type: node.type.toUpperCase(), description: node.description };
}

const SCHEMAT = naSchematGemini(TURN_SCHEMA);

/** Gemini nie ma "effort" — najbliższy odpowiednik to głębokość myślenia. */
const POZIOM_MYSLENIA = { low: "low", medium: "medium", high: "high" };

/** thinkingLevel rozumieją dopiero modele z rodziny 3.x — starsze zwracają 400. */
function konfiguracjaMyslenia(model, effort) {
  if (!/^gemini-3/.test(model)) return {};
  return { thinkingConfig: { thinkingLevel: POZIOM_MYSLENIA[effort] ?? "low" } };
}

/** 429/503 zdarzają się przy obciążeniu API — warto poczekać, zanim się polegnie. */
const PONOWIENIA = 3;
const czekaj = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generujTure(opcje) {
  let ostatni;
  for (let proba = 0; proba < PONOWIENIA; proba++) {
    try {
      return await jednoWywolanie(opcje);
    } catch (error) {
      ostatni = error;
      if (!error.doPonowienia || proba === PONOWIENIA - 1) throw error;
      await czekaj(1500 * 2 ** proba);
    }
  }
  throw ostatni;
}

async function jednoWywolanie({ system, wiadomosc, model, effort }) {
  const response = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": klucz() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: wiadomosc }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: SCHEMAT,
        maxOutputTokens: 8192,
        ...konfiguracjaMyslenia(model, effort),
      },
    }),
  });

  const dane = await response.json().catch(() => null);

  if (!response.ok) {
    const blad = new Error(`Gemini (${response.status}): ${dane?.error?.message ?? "brak szczegółów"}`);
    blad.doPonowienia = response.status === 429 || response.status >= 500;
    throw blad;
  }

  const kandydat = dane?.candidates?.[0];
  if (kandydat?.finishReason === "SAFETY" || kandydat?.finishReason === "PROHIBITED_CONTENT") {
    throw new Error("Model odmówił wygenerowania tej tury. Spróbuj innej akcji.");
  }

  const text = (kandydat?.content?.parts ?? [])
    .map((part) => part.text)
    .filter(Boolean)
    .join("");

  if (!text) {
    const powod = kandydat?.finishReason ?? dane?.promptFeedback?.blockReason ?? "nieznany";
    throw new Error(`Pusta odpowiedź modelu (${powod}).`);
  }
  return text;
}
