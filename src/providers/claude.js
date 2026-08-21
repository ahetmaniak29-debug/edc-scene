/**
 * Dostawca: Claude (Anthropic).
 *
 * Structured outputs — model zwraca jeden obiekt JSON zgodny ze schematem,
 * więc narracja i delta stanu powstają w jednym wywołaniu.
 */

import Anthropic from "@anthropic-ai/sdk";
import { TURN_SCHEMA } from "../schema.js";

export const NAZWA = "claude";

let client = null;

export function domyslnyModel() {
  return "claude-opus-5";
}

export function maKlucz() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function generujTure({ system, wiadomosc, model, effort }) {
  if (!client) client = new Anthropic();

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    // Stały prefiks — dobrze się cache'uje między turami.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    output_config: {
      effort,
      format: { type: "json_schema", schema: TURN_SCHEMA },
    },
    messages: [{ role: "user", content: wiadomosc }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Model odmówił wygenerowania tej tury. Spróbuj innej akcji.");
  }

  const text = response.content.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("Pusta odpowiedź modelu.");
  return text;
}
