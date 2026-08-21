/**
 * Pętla tury — jedyne miejsce, w którym stan gry się zmienia.
 * Używają jej i terminal (src/cli.js), i serwer webowy (src/server.js).
 */

import { applyDelta } from "./state.js";
import { generateTurn, mockTurn, hasApiKey } from "./ai.js";
import { SCENARIO, startState } from "./scenario.js";

export { SCENARIO, startState };

/**
 * @param {object} state stan przed tura
 * @param {string} action co zrobił gracz ("" dla pierwszej tury)
 * @param {{scenario?: object, offline?: boolean}} opts
 * @returns {Promise<{state: object, narracja: string, uplyw_czasu: string, propozycje: string[], zakonczenie: object|null}>}
 */
export async function takeTurn(state, action, opts = {}) {
  const scenario = opts.scenario ?? SCENARIO;
  const opening = state.turn === 0;
  const offline = opts.offline ?? !hasApiKey();

  if (state.zakonczenie) {
    throw new Error("Ta historia już się skończyła. Zacznij nową grę.");
  }
  if (!opening && !action.trim()) {
    throw new Error("Brak akcji gracza.");
  }

  const args = { state, action: action.trim(), scenario, opening };
  const turn = offline ? mockTurn(args) : await generateTurn(args);

  const next = applyDelta(state, { ...turn.delta, zakonczenie: turn.zakonczenie }, {
    action: opening ? "(start)" : action.trim(),
  });

  return {
    state: next,
    narracja: turn.narracja,
    uplyw_czasu: turn.uplyw_czasu ?? "",
    propozycje: (turn.propozycje ?? []).filter(Boolean).slice(0, 4),
    zakonczenie: next.zakonczenie,
  };
}
