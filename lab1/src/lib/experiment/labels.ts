import type { Condition, Form } from "./types";

export const CONDITION_LABEL: Record<Condition, string> = {
  picto: "Пиктограммы",
  arabic: "Арабские цифры",
  mixed: "Цифры и пиктограммы",
  colored: "Яркие цифры",
  mono: "Монохромные цифры",
};

export const FORM_LABEL: Record<Form, string> = {
  a: "Арабские цифры",
  p: "Пиктограммы",
};
