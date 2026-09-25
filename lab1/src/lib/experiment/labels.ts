import type { Condition, Form, Group } from "./types";

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

export const GROUP_LABEL: Record<Group, string> = {
  test: "Тестовая группа",
  control: "Контрольная группа (авторы программы)",
};

export const GROUP_SHORT: Record<Group, string> = {
  test: "Тест",
  control: "Контр.",
};
