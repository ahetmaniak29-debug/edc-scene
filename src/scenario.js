/**
 * MVP: jeden wycinek życia zamiast całego życiorysu.
 *
 * Siedemnastolatka (albo siedemnastolatek) na wsi, wiosna, moment w którym
 * trzeba zdecydować, co dalej: gospodarstwo rodziców, szkoła w mieście,
 * wyjazd, albo coś, czego nie ma na żadnej liście.
 *
 * Żeby zrobić własny scenariusz: skopiuj ten plik i podmień SCENARIO
 * oraz startState(). Reszta silnika jest od scenariusza niezależna.
 */

import { emptyState } from "./state.js";

export const SCENARIO = {
  id: "wies-17",
  tytul: "Wiosna, siedemnaście lat",
  swiat:
    "Współczesna Polska, mała wieś kilkanaście kilometrów od miasta powiatowego. " +
    "Gospodarstwo rodzinne: kilka hektarów, obora, stary ciągnik, kredyt na maszynę. " +
    "Realizm bez magii i bez cudów — liczy się praca, pieniądze, ludzie i pogoda.",
  otwarcie:
    "Marzec dopiero zaczyna odpuszczać. Ojciec od tygodnia mówi o wiosennych siewach tak, " +
    "jakby to było oczywiste, że będziesz przy nich stać. W kuchni na stole leży list ze szkoły " +
    "w mieście — trzeba potwierdzić, czy zdajesz w tym roku. Matka nie odezwała się o nim ani słowem, " +
    "ale przesunęła go tak, żebyś zobaczył. Za oknem obora, w oborze siedem krów, które trzeba wydoić " +
    "niezależnie od tego, co postanowisz.",
  propozycje: [
    "Powiedz ojcu, że zostajesz w gospodarstwie",
    "Weź list ze stołu i przeczytaj go przy matce",
    "Idź do obory i odłóż rozmowę na wieczór",
    "Zadzwoń do kolegi, który wyjechał do miasta",
  ],
};

/** Startowy stan postaci dla tego scenariusza. */
export function startState({ imie = "Ola", plec = "kobieta" } = {}) {
  const state = emptyState();

  state.postac = {
    imie,
    wiek: 17,
    plec,
    pochodzenie: "wieś Podlesie, gospodarstwo rodziców",
  };
  state.swiat = { miejsce: "kuchnia w domu rodziców", pora_roku: "wiosna", rok: 1 };
  state.staty = { zdrowie: 85, energia: 70, nastroj: 55, reputacja: 50 };
  state.pieniadze = 340;
  state.umiejetnosci = { gospodarstwo: 3, "praca z ludźmi": 2, nauka: 3 };
  state.ekwipunek = ["telefon z pękniętym ekranem", "rower", "kurtka po bracie"];
  state.zajecie = { nazwa: "uczeń", opis: "Ostatnia klasa, pomoc w gospodarstwie po lekcjach." };
  state.relacje = [
    { kto: "Ojciec, Stanisław", rola: "ojciec", wiez: 55, notatka: "Twardy, małomówny. Liczy, że zostaniesz." },
    { kto: "Matka, Halina", rola: "matka", wiez: 70, notatka: "Chce, żebyś się uczył, ale nie powie tego wprost." },
    { kto: "Kuba", rola: "przyjaciel", wiez: 65, notatka: "Wyjechał do miasta na budowę. Dzwoni rzadko." },
  ];
  state.cele = [{ tresc: "Zdecydować, co po szkole", zrobione: false }];
  state.lore = [
    "Rodzice prowadzą kilkuhektarowe gospodarstwo z siedmioma krowami.",
    "Na gospodarstwie wisi kredyt na maszynę.",
    "List ze szkoły w mieście czeka na odpowiedź.",
  ];

  return state;
}
