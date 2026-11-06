"""Управление файловым каталогом через меню в стиле Norton Commander — без стандартных виджетов.

Из библиотеки Tkinter берутся только окно и холст (Canvas) как поверхность рисования. Строка меню,
выпадающие меню, список файлов, строка функциональных клавиш, поля ввода и диалоговые окна
рисуются программой; нажатия клавиш и щелчки мыши она обрабатывает сама.
"""

import ctypes
import os
import sys
import tkinter as tk
from tkinter import font as tkfont

import fileops
from fileops import FileError, Rename

TITLE = 'Управление файлами — меню без стандартных виджетов'
FONT = ('Consolas', 12)
START_COLS, START_ROWS = 100, 32
MIN_COLS, MIN_ROWS = 72, 22
PREVIEW_ROWS = 6

# цвета текстового режима Norton Commander
BLUE, CYAN, LIGHT_CYAN = '#0000a8', '#00a8a8', '#55ffff'
WHITE, BLACK, GRAY, DARK_GRAY = '#ffffff', '#000000', '#a8a8a8', '#545454'
YELLOW, RED, DARK_RED = '#ffff55', '#a80000', '#7a0000'

SINGLE = '┌─┐│└┘'
DOUBLE = '╔═╗║╚╝'

SORT_KEYS = [('name', 'по имени'), ('size', 'по размеру'), ('modified', 'по дате')]
ACTIONS = [
    ('prefix', 'добавить текст в начало имени', 'Текст:'),
    ('suffix', 'добавить текст в конец имени (перед расширением)', 'Текст:'),
    ('extension', 'сменить расширение', 'Расширение:'),
]
KEYBAR = [('1', 'Помощь', 'help'), ('2', 'Переим', 'rename_one'), ('3', 'Группа', 'rename_group'),
          ('4', 'Маска', 'select_by_mask'), ('5', 'Обнов', 'refresh'), ('6', 'Путь', 'go_to_path'),
          ('7', 'Сорт', 'next_sort'), ('8', '', None), ('9', 'Меню', 'open_menu'), ('10', 'Выход', 'quit')]
FUNCTION_KEYS = {'F%d' % (index + 1): action for index, (_, _, action) in enumerate(KEYBAR) if action}
# коды клавиш вместо букв, чтобы сочетания работали и в русской раскладке
CONTROL_A = 65
CONTROL_MASK, SHIFT_MASK = 0x0004, 0x0001

HELP_LINES = [
    'Программа показывает содержимое текущего каталога и переименовывает файлы.',
    '',
    'Перемещение по списку: ↑ ↓, PgUp, PgDn, Home, End, колесо мыши, щелчок.',
    'Enter или двойной щелчок — войти в каталог; Backspace или строка «..» — вверх.',
    'F6 — перейти в каталог по пути.',
    '',
    'F2 — переименовать файл под курсором (Enter на файле делает то же).',
    'Insert, пробел или правая кнопка мыши — отметить файл. Ctrl+A — отметить все',
    'файлы, F4 — отметить по маске, Esc — снять отметку.',
    'F3 — переименовать отмеченные файлы: текст в начало, в конец или новое расширение.',
    'Маска: * — любые символы, ? — один символ. Например: *.txt, IMG_*, отчёт_?.docx.',
    '',
    'Если хотя бы одно новое имя занято или недопустимо, не переименовывается ни один',
    'файл. Каталоги программа не переименовывает.',
    '',
    'F9 — меню, F7 — сменить сортировку, F5 — обновить, F10 — выход.',
    'В меню и окнах: стрелки, Enter, Esc и выделенные буквы.',
]


class Screen:
    """Текстовая сетка поверх холста: всё рисуется в клетках одинакового размера."""

    def __init__(self, canvas: tk.Canvas):
        self.canvas = canvas
        self.font = tkfont.Font(family=FONT[0], size=FONT[1])
        self.cell_w = self.font.measure('0')
        self.cell_h = self.font.metrics('linespace')
        self.cols, self.rows = START_COLS, START_ROWS
        self.regions = []

    def resize(self, width: int, height: int) -> None:
        self.cols = max(width // self.cell_w, MIN_COLS)
        self.rows = max(height // self.cell_h, MIN_ROWS)

    def clear(self, color: str) -> None:
        self.canvas.delete('all')
        self.regions = []
        self.canvas.configure(background=color)

    def fill(self, x: int, y: int, w: int, h: int, color: str) -> None:
        if w > 0 and h > 0:
            self.canvas.create_rectangle(x * self.cell_w, y * self.cell_h, (x + w) * self.cell_w,
                                         (y + h) * self.cell_h, fill=color, width=0)

    def text(self, x: int, y: int, text: str, fg: str, bg: str = None, width: int = None) -> None:
        if width is not None:
            text = (text[:width - 1] + '…') if len(text) > width else text.ljust(width)
        if bg is not None:
            self.fill(x, y, len(text), 1, bg)
        if text.strip():
            self.canvas.create_text(x * self.cell_w, y * self.cell_h, text=text, anchor='nw', fill=fg, font=self.font)

    def label(self, x: int, y: int, markup: str, fg: str, bg: str, accent: str) -> int:
        """Текст, в котором буква после знака & выделена цветом. Возвращает ширину в клетках."""
        plain = markup.replace('&', '')
        self.text(x, y, plain, fg, bg)
        if '&' in markup:
            index = markup.index('&')
            self.text(x + index, y, markup[index + 1], accent, bg)
        return len(plain)

    def frame(self, x: int, y: int, w: int, h: int, fg: str, bg: str, chars: str = DOUBLE, title: str = '',
              title_fg: str = None) -> None:
        top_left, line, top_right, side, bottom_left, bottom_right = chars
        self.fill(x, y, w, h, bg)
        self.text(x, y, top_left + line * (w - 2) + top_right, fg)
        for row in range(y + 1, y + h - 1):
            self.text(x, row, side, fg)
            self.text(x + w - 1, row, side, fg)
        self.text(x, y + h - 1, bottom_left + line * (w - 2) + bottom_right, fg)
        if title:
            title = ' ' + title[:w - 6] + ' '
            self.text(x + (w - len(title)) // 2, y, title, title_fg or fg, bg)

    def wrapped(self, x: int, y: int, text: str, fg: str, width: int, lines: int = 2) -> None:
        """Текст с переносом по словам на несколько строк."""
        rows, line = [], ''
        for word in text.split():
            if line and len(line) + 1 + len(word) > width:
                rows.append(line)
                line = word
            else:
                line = (line + ' ' + word).strip()
        rows.append(line)
        if len(rows) > lines:
            rows = rows[:lines - 1] + [' '.join(rows[lines - 1:])]
        for row, part in enumerate(rows):
            self.text(x, y + row, part, fg, width=width)

    def shadow(self, x: int, y: int, w: int, h: int) -> None:
        self.fill(x + w, y + 1, 2, h, '#202020')
        self.fill(x + 2, y + h, w, 1, '#202020')

    def region(self, x: int, y: int, w: int, h: int, click, double=None, right=None) -> None:
        """Область, которая реагирует на мышь. Проверяются в обратном порядке: верхний слой — первым."""
        self.regions.append((x, y, x + w, y + h, click, double, right))

    def hit(self, px: int, py: int, kind: str) -> bool:
        cx, cy = px // self.cell_w, py // self.cell_h
        for x0, y0, x1, y1, click, double, right in reversed(self.regions):
            if x0 <= cx < x1 and y0 <= cy < y1:
                handler = {'click': click, 'double': double or click, 'right': right}[kind]
                if handler is not None:
                    handler(cx - x0, cy - y0)
                return True
        return False


class TextField:
    """Однострочное поле ввода: текст, курсор и выделение хранятся и рисуются вручную."""

    def __init__(self, text: str = '', select=None):
        self.text = text
        self.pos = len(text) if select is None else select[1]
        self.sel = select if select is not None else (0, len(text)) if text else None
        self.offset = 0

    def _delete_selection(self) -> bool:
        if not self.sel or self.sel[0] == self.sel[1]:
            self.sel = None
            return False
        start, end = self.sel
        self.text = self.text[:start] + self.text[end:]
        self.pos, self.sel = start, None
        return True

    def key(self, event) -> bool:
        """Обрабатывает клавишу; возвращает True, если она относилась к полю."""
        keysym = event.keysym
        if event.state & CONTROL_MASK and event.keycode == CONTROL_A:
            self.sel, self.pos = (0, len(self.text)), len(self.text)
        elif keysym == 'Left':
            self.pos = self.sel[0] if self.sel else max(self.pos - 1, 0)
            self.sel = None
        elif keysym == 'Right':
            self.pos = self.sel[1] if self.sel else min(self.pos + 1, len(self.text))
            self.sel = None
        elif keysym == 'Home':
            self.pos, self.sel = 0, None
        elif keysym == 'End':
            self.pos, self.sel = len(self.text), None
        elif keysym == 'BackSpace':
            if not self._delete_selection() and self.pos > 0:
                self.text = self.text[:self.pos - 1] + self.text[self.pos:]
                self.pos -= 1
        elif keysym == 'Delete':
            if not self._delete_selection():
                self.text = self.text[:self.pos] + self.text[self.pos + 1:]
        elif event.char and event.char.isprintable() and not event.state & CONTROL_MASK:
            self._delete_selection()
            self.text = self.text[:self.pos] + event.char + self.text[self.pos:]
            self.pos += 1
        else:
            return False
        return True

    def draw(self, screen: Screen, x: int, y: int, width: int) -> None:
        if self.pos < self.offset:
            self.offset = self.pos
        if self.pos >= self.offset + width:
            self.offset = self.pos - width + 1
        visible = self.text[self.offset:self.offset + width]
        screen.text(x, y, visible, BLACK, CYAN, width)
        if self.sel:
            start = max(self.sel[0] - self.offset, 0)
            end = min(self.sel[1] - self.offset, width)
            if end > start:
                screen.text(x + start, y, visible[start:end], WHITE, BLUE)
        cursor = self.pos - self.offset
        char = self.text[self.pos] if self.pos < len(self.text) else ' '
        screen.text(x + cursor, y, char, CYAN, BLACK)
        screen.region(x, y, width, 1, lambda cx, cy: self.click(cx))

    def click(self, cx: int) -> None:
        self.pos, self.sel = min(self.offset + cx, len(self.text)), None


class Dialog:
    """Модальное окно, нарисованное на холсте. Пока оно открыто, клавиши и мышь получает только оно."""

    width, height = 60, 9
    title = ''
    colors = (BLACK, GRAY, WHITE)        # текст, фон, рамка

    def __init__(self, app):
        self.app = app
        self.buttons = []                # (подпись, действие)
        self.focus = 0                   # номер кнопки, на которой фокус клавиатуры
        self.message = ''

    def close(self) -> None:
        self.app.close_dialog(self)

    def origin(self, screen: Screen):
        width = min(self.width, screen.cols - 4)
        height = min(self.height, screen.rows - 2)
        return (screen.cols - width) // 2, (screen.rows - height) // 2, width, height

    def draw(self, screen: Screen) -> None:
        x, y, w, h = self.origin(screen)
        fg, bg, border = self.colors
        screen.region(0, 0, screen.cols, screen.rows, lambda cx, cy: None)   # мимо окна — ничего
        screen.shadow(x, y, w, h)
        screen.frame(x, y, w, h, border, bg, DOUBLE, self.title, fg)
        self.draw_body(screen, x + 2, y + 1, w - 4)
        self.draw_buttons(screen, x, y + h - 2, w)

    def draw_body(self, screen: Screen, x: int, y: int, width: int) -> None:
        pass

    def draw_buttons(self, screen: Screen, x: int, y: int, w: int) -> None:
        labels = ['[ %s ]' % text for text, _ in self.buttons]
        total = sum(len(label) for label in labels) + 2 * (len(labels) - 1)
        cx = x + (w - total) // 2
        fg, bg, _ = self.colors
        for index, (label, (_, action)) in enumerate(zip(labels, self.buttons)):
            focused = index == self.focus
            screen.text(cx, y, label, BLACK if focused else fg, CYAN if focused else bg)
            screen.region(cx, y, len(label), 1, lambda _x, _y, action=action: action())
            cx += len(label) + 2

    def key(self, event) -> None:
        if event.keysym == 'Escape':
            self.close()
        elif event.keysym == 'Tab' and self.buttons:
            step = -1 if event.state & SHIFT_MASK else 1
            self.focus = (self.focus + step) % len(self.buttons)
        elif event.keysym in ('Return', 'KP_Enter') and self.buttons:
            self.buttons[self.focus][1]()
        else:
            self.key_body(event)

    def key_body(self, event) -> None:
        pass


class MessageDialog(Dialog):
    def __init__(self, app, title: str, lines: list, error: bool = False):
        super().__init__(app)
        self.title = title
        self.lines = lines
        self.width = min(max(max(len(line) for line in lines) + 6, 40), 92)
        self.height = len(lines) + 5
        if error:
            self.colors = (WHITE, RED, WHITE)
        self.buttons = [('OK', self.close)]

    def draw_body(self, screen, x, y, width):
        fg = self.colors[0]
        for row, line in enumerate(self.lines):
            screen.text(x, y + 1 + row, line, fg, width=width)


class RenameDialog(Dialog):
    title = 'Переименование файла'
    width, height = 66, 11

    def __init__(self, app, entry: fileops.Entry):
        super().__init__(app)
        self.entry = entry
        base = len(os.path.splitext(entry.name)[0])
        self.field = TextField(entry.name, (0, base))
        self.buttons = [('Переименовать', self.accept), ('Отмена', self.close)]

    def draw_body(self, screen, x, y, width):
        screen.text(x, y + 1, 'Файл: ' + self.entry.name, BLACK, width=width)
        screen.text(x, y + 3, 'Новое имя:', BLACK)
        self.field.draw(screen, x + 11, y + 3, width - 11)
        screen.wrapped(x, y + 5, self.message, DARK_RED, width)

    def key_body(self, event):
        if self.field.key(event):
            self.message = ''

    def accept(self):
        try:
            changes = fileops.check_plan(self.app.entries, [Rename(self.entry.name, self.field.text.strip())])
        except FileError as error:
            self.message = str(error)
            return
        self.close()
        self.app.apply(changes)


class MaskDialog(Dialog):
    title = 'Отметить файлы по маске'
    width, height = 62, 11

    def __init__(self, app):
        super().__init__(app)
        self.field = TextField('*')
        self.buttons = [('Отметить', self.accept), ('Отмена', self.close)]

    def matching(self):
        mask = self.field.text.strip()
        if not mask:
            raise FileError('Введите маску.')
        found = fileops.select(self.app.entries, mask, files_only=True)
        if not found:
            raise FileError('Нет файлов, соответствующих маске: ' + mask)
        return found

    def draw_body(self, screen, x, y, width):
        screen.text(x, y + 1, 'Маска:', BLACK)
        self.field.draw(screen, x + 8, y + 1, width - 8)
        screen.text(x + 8, y + 2, '* — любые символы, ? — один символ', DARK_GRAY)
        screen.text(x + 8, y + 3, 'Например: *.txt, IMG_*, отчёт_?.docx', DARK_GRAY)
        try:
            summary, color = 'Подходит: ' + fileops.files_text(len(self.matching())), BLACK
        except FileError as error:
            summary, color = str(error), DARK_RED
        screen.wrapped(x, y + 5, summary, color, width)

    def key_body(self, event):
        self.field.key(event)

    def accept(self):
        try:
            found = self.matching()
        except FileError:
            return
        self.close()
        self.app.mark_entries(found)


class GroupDialog(Dialog):
    title = 'Переименование группы файлов'

    def __init__(self, app, files: list):
        super().__init__(app)
        self.files = files
        self.action = 0
        self.field = TextField()
        self.width = 78
        self.height = 15 + min(len(files), PREVIEW_ROWS)
        self.buttons = [('Переименовать', self.accept), ('Отмена', self.close)]

    def new_name(self, name: str) -> str:
        key, text = ACTIONS[self.action][0], self.field.text
        if key == 'prefix':
            return fileops.add_prefix(name, text)
        if key == 'suffix':
            return fileops.add_suffix(name, text)
        return fileops.change_extension(name, text)

    def plan(self):
        """Проверенный план или текст, почему переименовать нельзя."""
        plan = [Rename(file.name, self.new_name(file.name)) for file in self.files]
        if not self.field.text:
            return plan, None, 'Заполните поле «' + ACTIONS[self.action][2].rstrip(':') + '».'
        try:
            return plan, fileops.check_plan(self.app.entries, plan), None
        except FileError as error:
            return plan, None, str(error)

    def draw_body(self, screen, x, y, width):
        screen.text(x, y, 'Отмечено: ' + fileops.files_text(len(self.files)), BLACK)
        for index, (_, title, _) in enumerate(ACTIONS):
            mark = '(•)' if index == self.action else '( )'
            line = '%s %d — %s' % (mark, index + 1, title)
            screen.text(x, y + 2 + index, line, BLACK, CYAN if index == self.action else None, width=width)
            screen.region(x, y + 2 + index, width, 1, lambda _x, _y, index=index: self.choose(index))
        label = ACTIONS[self.action][2]
        screen.text(x, y + 6, label, BLACK)
        self.field.draw(screen, x + 13, y + 6, width - 13)

        plan, changes, problem = self.plan()
        half = (width - 3) // 2
        screen.text(x, y + 8, 'Старое имя'.ljust(half) + ' → ' + 'Новое имя', DARK_GRAY, width=width)
        for row, step in enumerate(plan[:PREVIEW_ROWS]):
            old = step.old if len(step.old) <= half else step.old[:half - 1] + '…'
            screen.text(x, y + 9 + row, old.ljust(half) + ' → ' + step.new, BLACK, width=width)
        rows = min(len(plan), PREVIEW_ROWS)
        if len(plan) > PREVIEW_ROWS:
            screen.text(x + half + 3, y + 8, '(и ещё %d)' % (len(plan) - PREVIEW_ROWS), DARK_GRAY)
        if problem:
            screen.wrapped(x, y + 10 + rows, problem, DARK_RED if self.field.text else DARK_GRAY, width)
        else:
            screen.text(x, y + 10 + rows, 'Будет переименовано: ' + fileops.files_text(len(changes)), BLACK,
                        width=width)

    def choose(self, index: int) -> None:
        self.action = index

    def key_body(self, event):
        if event.keysym == 'Up':
            self.action = (self.action - 1) % len(ACTIONS)
        elif event.keysym == 'Down':
            self.action = (self.action + 1) % len(ACTIONS)
        elif not self.field.text and event.char in '123' and event.char:
            self.action = int(event.char) - 1        # пока поле пустое, цифра выбирает действие
        else:
            self.field.key(event)

    def accept(self):
        _, changes, _ = self.plan()
        if changes:
            self.close()
            self.app.apply(changes)


class PathDialog(Dialog):
    title = 'Перейти в каталог'
    width, height = 76, 10

    def __init__(self, app):
        super().__init__(app)
        self.field = TextField(app.directory)
        self.buttons = [('Перейти', self.accept), ('Отмена', self.close)]

    def draw_body(self, screen, x, y, width):
        screen.text(x, y + 1, 'Путь: относительный (Фото, ..) или абсолютный (C:\\Windows)', BLACK, width=width)
        self.field.draw(screen, x, y + 2, width)
        screen.wrapped(x, y + 4, self.message, DARK_RED, width)

    def key_body(self, event):
        if self.field.key(event):
            self.message = ''

    def accept(self):
        try:
            directory = fileops.resolve_directory(self.app.directory, self.field.text.strip())
        except FileError as error:
            self.message = str(error)
            return
        self.close()
        self.app.open_directory(directory)


class PullDownMenu:
    """Строка меню и выпадающие меню. Пункт: (подпись с &, клавиша, действие, доступен ли, отмечен ли)."""

    def __init__(self, app):
        self.app = app
        self.opened = None               # номер открытого меню или None
        self.item = 0

    def menus(self):
        app = self.app
        sort = app.sort_key
        return [
            ('&Файл', [
                ('&Перейти в каталог…', 'F6', app.go_to_path, True, False),
                ('&Вверх', 'Backspace', app.go_up, True, False),
                ('&Обновить', 'F5', app.refresh, True, False),
                None,
                ('В&ыход', 'F10', app.quit, True, False),
            ]),
            ('&Правка', [
                ('&Переименовать…', 'F2', app.rename_one, app.cursor_file() is not None, False),
                ('Переименовать &группу…', 'F3', app.rename_group, bool(app.marked), False),
                None,
                ('&Отметить / снять', 'Ins', app.toggle_mark, app.cursor_file() is not None, False),
                ('Отметить &все', 'Ctrl+A', app.mark_all, True, False),
                ('Отметить по &маске…', 'F4', app.select_by_mask, True, False),
                ('&Снять отметку', 'Esc', app.clear_marks, bool(app.marked), False),
            ]),
            ('&Вид', [
                ('По &имени', '', lambda: app.set_sort('name'), True, sort == 'name'),
                ('По &размеру', '', lambda: app.set_sort('size'), True, sort == 'size'),
                ('По &дате', '', lambda: app.set_sort('modified'), True, sort == 'modified'),
                None,
                ('По &убыванию', '', app.toggle_descending, True, app.descending),
            ]),
            ('&Справка', [
                ('&Как пользоваться', 'F1', app.help, True, False),
                ('&О программе', '', app.about, True, False),
            ]),
        ]

    def positions(self):
        x, result = 2, []
        for title, _ in self.menus():
            result.append(x)
            x += len(title.replace('&', '')) + 4
        return result

    def open(self, index: int = 0) -> None:
        self.opened = index
        items = self.menus()[index][1]
        self.item = next(n for n, item in enumerate(items) if item and item[3])

    def close(self) -> None:
        self.opened = None

    def draw_bar(self, screen: Screen) -> None:
        screen.text(0, 0, '', BLACK, CYAN, screen.cols)
        for index, ((title, _), x) in enumerate(zip(self.menus(), self.positions())):
            active = index == self.opened
            bg = BLACK if active else CYAN
            width = screen.label(x - 1, 0, ' ' + title + ' ', WHITE if active else BLACK, bg, YELLOW if active else WHITE)
            screen.region(x - 1, 0, width, 1, lambda _x, _y, index=index: self.toggle(index))

    def draw_drop(self, screen: Screen) -> None:
        if self.opened is None:
            return
        items = self.menus()[self.opened][1]
        x = self.positions()[self.opened] - 1
        width = max(len(item[0].replace('&', '')) + len(item[1]) + 8 for item in items if item)
        height = len(items) + 2
        screen.region(0, 0, screen.cols, screen.rows, lambda cx, cy: self.close())   # щелчок мимо закрывает
        self.draw_bar(screen)                      # строку меню можно щёлкать и при открытом меню
        screen.shadow(x, 1, width, height)
        screen.frame(x, 1, width, height, BLACK, CYAN, SINGLE)
        for row, item in enumerate(items):
            y = 2 + row
            if item is None:
                screen.text(x, y, '├' + '─' * (width - 2) + '┤', BLACK)
                continue
            title, hotkey, action, enabled, checked = item
            selected = row == self.item
            fg = (WHITE if selected else BLACK) if enabled else DARK_GRAY
            bg = BLACK if selected else CYAN
            screen.text(x + 1, y, '', fg, bg, width - 2)
            screen.text(x + 1, y, '√' if checked else ' ', fg)
            screen.label(x + 3, y, title, fg, bg, (YELLOW if selected else WHITE) if enabled else DARK_GRAY)
            screen.text(x + width - 2 - len(hotkey), y, hotkey, fg)
            if enabled:
                screen.region(x + 1, y, width - 2, 1, lambda _x, _y, row=row: self.run(row))

    def toggle(self, index: int) -> None:
        if self.opened == index:
            self.close()
        else:
            self.open(index)

    def run(self, row: int) -> None:
        action = self.menus()[self.opened][1][row][2]
        self.close()
        action()

    def move(self, step: int) -> None:
        items = self.menus()[self.opened][1]
        row = self.item
        for _ in items:
            row = (row + step) % len(items)
            if items[row] and items[row][3]:
                self.item = row
                return

    def key(self, event) -> None:
        keysym = event.keysym
        menus = self.menus()
        if keysym in ('Escape', 'F9', 'F10'):
            self.close()
        elif keysym == 'Left':
            self.open((self.opened - 1) % len(menus))
        elif keysym == 'Right':
            self.open((self.opened + 1) % len(menus))
        elif keysym == 'Up':
            self.move(-1)
        elif keysym == 'Down':
            self.move(1)
        elif keysym in ('Return', 'KP_Enter'):
            self.run(self.item)
        elif event.char:
            letter = event.char.lower()
            for row, item in enumerate(menus[self.opened][1]):
                if item and item[3] and '&' in item[0] and item[0][item[0].index('&') + 1].lower() == letter:
                    self.run(row)
                    return
            for index, (title, _) in enumerate(menus):
                if title[title.index('&') + 1].lower() == letter:
                    self.open(index)
                    return


class App:
    def __init__(self, root: tk.Tk, directory: str):
        self.root = root
        self.canvas = tk.Canvas(root, highlightthickness=0, borderwidth=0, background=BLUE)
        self.canvas.pack(fill='both', expand=True)
        self.screen = Screen(self.canvas)
        self.menu = PullDownMenu(self)
        self.dialogs = []
        self.directory = directory
        self.entries = []
        self.items = []                  # строки панели: None — «..», дальше объекты каталога
        self.cursor = 0
        self.top = 0
        self.marked = set()
        self.sort_key = 'name'
        self.descending = False
        self.message = ''
        self.alive = True

        root.title(TITLE)
        root.geometry('%dx%d' % (START_COLS * self.screen.cell_w, START_ROWS * self.screen.cell_h))
        root.minsize(MIN_COLS * self.screen.cell_w, MIN_ROWS * self.screen.cell_h)
        self.icon = self.draw_icon()
        root.iconphoto(True, self.icon)
        self.canvas.bind('<KeyPress>', self.on_key)
        self.canvas.bind('<Button-1>', lambda event: self.on_mouse(event, 'click'))
        self.canvas.bind('<Double-Button-1>', lambda event: self.on_mouse(event, 'double'))
        self.canvas.bind('<Button-3>', lambda event: self.on_mouse(event, 'right'))
        self.canvas.bind('<MouseWheel>', self.on_wheel)
        self.canvas.bind('<Configure>', self.on_resize)
        self.canvas.focus_set()
        self.open_directory(directory)

    @staticmethod
    def draw_icon() -> tk.PhotoImage:
        image = tk.PhotoImage(width=32, height=32)
        image.put(BLUE, to=(2, 4, 30, 28))
        image.put(LIGHT_CYAN, to=(4, 6, 28, 8))
        for row in range(11, 26, 4):
            image.put(LIGHT_CYAN, to=(6, row, 24, row + 2))
        image.put(YELLOW, to=(6, 15, 24, 17))
        return image

    # --- состояние ---

    def open_directory(self, directory: str, select=()) -> bool:
        try:
            entries = fileops.list_directory(directory)
        except FileError as error:
            self.show_error(str(error))
            return False
        if directory != self.directory:
            self.marked = set()
            self.message = ''
            self.items = []
        self.directory = directory
        self.entries = entries
        self.marked &= {entry.name for entry in entries if not entry.is_dir}
        self.root.title(TITLE + ' — ' + directory)
        self.fill_items(select)
        return True

    def fill_items(self, select=()) -> None:
        current = self.cursor_entry()
        key, descending = self.sort_key, self.descending
        entries = sorted(self.entries, key=lambda entry: entry.name.casefold(), reverse=descending and key == 'name')
        if key != 'name':
            entries.sort(key=lambda entry: getattr(entry, key), reverse=descending)
        entries.sort(key=lambda entry: not entry.is_dir)
        has_parent = os.path.dirname(self.directory) != self.directory
        self.items = ([None] if has_parent else []) + entries
        wanted = list(select) or ([current.name] if current else [])
        self.cursor = 0
        for index, entry in enumerate(self.items):
            if entry is not None and entry.name in wanted:
                self.cursor = index
                break
        self.redraw()

    def cursor_entry(self):
        if 0 <= self.cursor < len(self.items):
            return self.items[self.cursor]
        return None

    def cursor_file(self):
        entry = self.cursor_entry()
        return entry if entry is not None and not entry.is_dir else None

    def marked_files(self) -> list:
        return [entry for entry in self.items if entry is not None and entry.name in self.marked]

    # --- действия (клавиши, строка F-клавиш и меню вызывают одни и те же методы) ---

    def help(self):
        self.show_dialog(MessageDialog(self, 'Как пользоваться', HELP_LINES))

    def about(self):
        self.show_dialog(MessageDialog(self, 'О программе', [
            'Управление файлами', '',
            'Лабораторная работа № 3, вариант 1: переименование файла.',
            'Парадигма меню без стандартных виджетов: всё нарисовано на холсте.']))

    def rename_one(self):
        entry = self.cursor_file()
        if entry is None:
            self.message = 'Поставьте курсор на файл. Каталоги программа не переименовывает.'
            self.redraw()
            return
        self.show_dialog(RenameDialog(self, entry))

    def rename_group(self):
        files = self.marked_files()
        if not files:
            self.message = 'Отметьте файлы: Insert, Ctrl+A или F4 — по маске.'
            self.redraw()
            return
        self.show_dialog(GroupDialog(self, files))

    def select_by_mask(self):
        self.show_dialog(MaskDialog(self))

    def refresh(self):
        self.open_directory(self.directory)

    def go_to_path(self):
        self.show_dialog(PathDialog(self))

    def go_up(self):
        parent = os.path.dirname(self.directory)
        if parent != self.directory:
            self.open_directory(parent, [os.path.basename(self.directory)])

    def enter(self):
        if not self.items:
            return
        entry = self.cursor_entry()
        if entry is None:
            self.go_up()
        elif entry.is_dir:
            self.open_directory(entry.path)
        else:
            self.rename_one()

    def next_sort(self):
        keys = [key for key, _ in SORT_KEYS]
        self.set_sort(keys[(keys.index(self.sort_key) + 1) % len(keys)])

    def set_sort(self, key: str):
        self.sort_key = key
        self.fill_items()

    def toggle_descending(self):
        self.descending = not self.descending
        self.fill_items()

    def open_menu(self):
        self.menu.open(0)
        self.redraw()

    def quit(self):
        self.alive = False
        self.root.destroy()

    def toggle_mark(self, move: bool = True):
        entry = self.cursor_file()
        if entry is not None:
            self.marked ^= {entry.name}
        if move:
            self.move_cursor(1)
        self.redraw()

    def mark_all(self):
        self.marked = {entry.name for entry in self.entries if not entry.is_dir}
        self.redraw()

    def mark_entries(self, entries: list):
        self.marked = {entry.name for entry in entries}
        names = [entry.name for entry in entries]
        for index, entry in enumerate(self.items):
            if entry is not None and entry.name in names:
                self.cursor = index
                break
        self.redraw()

    def clear_marks(self):
        self.marked = set()
        self.redraw()

    def apply(self, changes: list):
        try:
            fileops.apply_plan(self.directory, changes)
        except FileError as error:
            self.refresh()
            self.show_error(str(error))
            return
        renamed_marks = {step.new for step in changes if step.old in self.marked}
        self.marked = (self.marked - {step.old for step in changes}) | renamed_marks
        self.entries = fileops.list_directory(self.directory)
        self.message = fileops.renamed_text(len(changes))
        if len(changes) == 1:
            self.message += ': ' + changes[0].old + ' → ' + changes[0].new
        self.message += '.'
        self.fill_items([step.new for step in changes])

    def show_dialog(self, dialog: Dialog):
        self.menu.close()
        self.dialogs.append(dialog)
        self.redraw()

    def close_dialog(self, dialog: Dialog):
        if dialog in self.dialogs:
            self.dialogs.remove(dialog)
        self.redraw()

    def show_error(self, text: str):
        self.show_dialog(MessageDialog(self, 'Ошибка', [text], error=True))

    def move_cursor(self, step: int):
        if self.items:
            self.cursor = min(max(self.cursor + step, 0), len(self.items) - 1)

    # --- события ---

    def on_key(self, event):
        keysym = event.keysym
        if self.dialogs:
            self.dialogs[-1].key(event)
        elif self.menu.opened is not None:
            self.menu.key(event)
        elif keysym in FUNCTION_KEYS:
            getattr(self, FUNCTION_KEYS[keysym])()
        elif keysym == 'Up':
            self.move_cursor(-1)
        elif keysym == 'Down':
            self.move_cursor(1)
        elif keysym == 'Prior':
            self.move_cursor(-self.page_rows())
        elif keysym == 'Next':
            self.move_cursor(self.page_rows())
        elif keysym == 'Home':
            self.cursor = 0
        elif keysym == 'End':
            self.cursor = max(len(self.items) - 1, 0)
        elif keysym in ('Return', 'KP_Enter'):
            self.enter()
        elif keysym == 'BackSpace':
            self.go_up()
        elif keysym in ('Insert', 'space'):
            self.toggle_mark()
        elif keysym == 'Escape':
            self.clear_marks()
        elif event.state & CONTROL_MASK and event.keycode == CONTROL_A:
            self.mark_all()
        self.redraw()
        return 'break'             # клавиша обработана: системная реакция (например, на F10) не нужна

    def on_mouse(self, event, kind: str):
        self.canvas.focus_set()
        self.screen.hit(event.x, event.y, kind)
        self.redraw()
        return 'break'

    def on_wheel(self, event):
        if not self.dialogs and self.menu.opened is None:
            self.move_cursor(-3 if event.delta > 0 else 3)
            self.redraw()

    def on_resize(self, event):
        self.screen.resize(event.width, event.height)
        self.redraw()

    # --- рисование ---

    def page_rows(self) -> int:
        return max(self.screen.rows - 9, 1)

    def redraw(self):
        if not self.alive:
            return
        screen = self.screen
        screen.clear(BLUE)
        self.draw_panel(screen)
        self.draw_status(screen)
        self.draw_keybar(screen)
        self.menu.draw_bar(screen)
        if self.menu.opened is not None:
            self.menu.draw_drop(screen)
        for dialog in self.dialogs:
            if dialog is self.dialogs[-1]:
                screen.regions = []        # мышь получает только верхнее окно
            dialog.draw(screen)

    def draw_panel(self, screen: Screen):
        cols, rows = screen.cols, screen.rows
        top, height = 1, rows - 3
        screen.frame(0, top, cols, height, LIGHT_CYAN, BLUE, DOUBLE)
        size_w, date_w = 10, 16
        name_w = cols - size_w - date_w - 4
        size_x, date_x = 1 + name_w + 1, 1 + name_w + 1 + size_w + 1
        arrow = ' ▼' if self.descending else ' ▲'
        header = [('Имя', 'name'), ('Размер', 'size'), ('Изменён', 'modified')]
        for (title, key), x, width in zip(header, (1, size_x, date_x), (name_w, size_w, date_w)):
            title += arrow if key == self.sort_key else ''
            screen.text(x + (width - len(title)) // 2, top + 1, title, YELLOW)
            screen.region(x, top + 1, width, 1, lambda _x, _y, key=key: self.click_header(key))
        for x in (size_x - 1, date_x - 1):
            screen.text(x, top, '╤', LIGHT_CYAN)
            for row in range(top + 1, top + height - 3):
                screen.text(x, row, '│', LIGHT_CYAN)
            screen.text(x, top + height - 3, '┴', LIGHT_CYAN)
        screen.text(0, top + height - 3, '╟' + '─' * (cols - 2) + '╢', LIGHT_CYAN)
        for x in (size_x - 1, date_x - 1):
            screen.text(x, top + height - 3, '┴', LIGHT_CYAN)
        title = self.directory if len(self.directory) <= cols - 8 else '…' + self.directory[-(cols - 9):]
        screen.text((cols - len(title) - 2) // 2, top, ' ' + title + ' ', BLACK, CYAN)

        first, visible = top + 2, height - 5
        if self.cursor < self.top:
            self.top = self.cursor
        if self.cursor >= self.top + visible:
            self.top = self.cursor - visible + 1
        self.top = max(min(self.top, max(len(self.items) - visible, 0)), 0)
        for row in range(visible):
            index = self.top + row
            if index >= len(self.items):
                break
            entry = self.items[index]
            y = first + row
            if entry is None:
                name, size, date, marked = '..', 'Вверх', '', False
            else:
                name = entry.name.upper() if entry.is_dir else entry.name
                size = '<Каталог>' if entry.is_dir else fileops.format_size(entry.size)
                date = fileops.format_date(entry.modified)
                marked = entry.name in self.marked
            fg = YELLOW if marked else (WHITE if entry is None or entry.is_dir else LIGHT_CYAN)
            if index == self.cursor:
                fg, bg = (YELLOW if marked else BLACK), CYAN
                screen.text(1, y, '', fg, bg, cols - 2)
            screen.text(1, y, (('√' if marked else ' ') + name), fg, width=name_w)
            screen.text(size_x, y, size.rjust(size_w), fg)
            screen.text(date_x, y, date.ljust(date_w), fg)
            screen.region(1, y, cols - 2, 1, lambda _x, _y, index=index: self.click_row(index),
                          lambda _x, _y, index=index: self.double_row(index),
                          lambda _x, _y, index=index: self.right_row(index))

        info = 'Всего: ' + fileops.entries_text(self.entries)
        marked = self.marked_files()
        if marked:
            info += '   Отмечено: ' + fileops.files_text(len(marked)) + ', ' + \
                    fileops.format_size(sum(entry.size for entry in marked))
        screen.text(1, top + height - 2, info, YELLOW if marked else LIGHT_CYAN, width=cols - 2)

    def draw_status(self, screen: Screen):
        y = screen.rows - 2
        text = self.message or (self.directory + '>')
        screen.text(0, y, text, WHITE if self.message else '#c0c0c0', BLACK, screen.cols)

    def draw_keybar(self, screen: Screen):
        y = screen.rows - 1
        screen.text(0, y, '', BLACK, BLACK, screen.cols)
        width = screen.cols // len(KEYBAR)
        for index, (number, label, action) in enumerate(KEYBAR):
            x = index * width
            key = 'F' + number                 # в узком окне сокращается подпись, а не название клавиши
            screen.text(x, y, key, WHITE)
            enabled = action is not None
            screen.text(x + len(key), y, label, BLACK if enabled else DARK_GRAY, CYAN, width - len(key) - 1)
            if enabled:
                screen.region(x, y, width - 1, 1, lambda _x, _y, action=action: getattr(self, action)())

    # --- мышь в панели ---

    def click_header(self, key: str):
        if self.sort_key == key:
            self.toggle_descending()
        else:
            self.set_sort(key)

    def click_row(self, index: int):
        self.cursor = index

    def double_row(self, index: int):
        self.cursor = index
        self.enter()

    def right_row(self, index: int):
        self.cursor = index
        self.toggle_mark(move=False)


def main() -> int:
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError, OSError):
        pass
    directory = os.path.realpath(os.getcwd())
    if len(sys.argv) > 1:
        try:
            directory = fileops.resolve_directory(directory, sys.argv[1])
        except FileError as error:
            print(error)
            return 1
    root = tk.Tk()
    App(root, directory)
    root.mainloop()
    return 0


if __name__ == '__main__':
    sys.exit(main())
