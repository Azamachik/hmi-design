"""Управление файловым каталогом через меню в текстовой консоли — без стандартных виджетов.

Программа не использует никакой библиотеки интерфейса: экран — это строки текста в обычном окне
консоли, цвет и положение задаются управляющими последовательностями, клавиши читаются по одной.
Меню, список файлов, поля ввода и подсказки программа строит сама.
"""

import os
import shutil
import sys

import fileops
from fileops import FileError, Rename

TITLE = 'Управление файлами — меню в консоли'
MIN_COLS, MIN_ROWS = 80, 20
LEFT = 38                                   # ширина левой колонки (меню)

# стили — параметры управляющей последовательности ESC[…m; только белый и чёрный
NORMAL = ''                                 # обычный белый текст на чёрном фоне
BRIGHT = '1;97'                             # ярко-белый: заголовки, цифры, отметки, сообщения
INVERSE = '30;47'                           # чёрный на белом: заголовок, выбранный пункт, курсор, поле ввода
ON_BLACK = '97;40'                          # белый на чёрном внутри поля: выделенный текст и курсор поля

SORT_KEYS = [('name', 'по имени'), ('size', 'по размеру'), ('modified', 'по дате')]
ACTIONS = [
    ('prefix', 'Добавить текст в начало', 'Текст'),
    ('suffix', 'Добавить текст в конец', 'Текст'),
    ('extension', 'Сменить расширение', 'Расширение'),
]
MOVE_HINTS = ['↑ ↓ PgUp PgDn Home End — курсор', 'буква — к имени на эту букву']

HELP_LINES = [
    'СПРАВКА',
    '',
    'Программа показывает содержимое текущего каталога и переименовывает файлы.',
    'Лабораторная работа № 3, вариант 1. Меню без виджетов: только текст в консоли.',
    '',
    'Пункт меню выбирается цифрой сразу или стрелками ↑ ↓ и Enter.',
    'Esc возвращает на шаг назад, 0 в главном меню — выход.',
    '',
    '1 — переименовать файл: выберите его в списке справа и введите новое имя.',
    '2 — переименовать группу: отметьте файлы вручную, по маске или все сразу,',
    '    затем выберите действие: текст в начало, в конец или новое расширение.',
    '    Пока вводится текст, справа видны новые имена.',
    '3 — перейти в каталог из списка, 4 — по пути, 5 — порядок сортировки.',
    '',
    'В списке: ↑ ↓ PgUp PgDn Home End, буква — к имени на эту букву.',
    'Пробел или Insert — отметить файл, Ctrl+A — отметить все.',
    'Маска: * — любые символы, ? — один символ. Например: *.txt, IMG_*, отчёт_?.docx',
    '',
    'Если хотя бы одно новое имя занято или недопустимо, не переименовывается',
    'ни один файл. Каталоги программа не переименовывает.',
]


def fit(text: str, width: int) -> str:
    """Текст ровно в width знаков: короткий дополняется пробелами, длинный обрезается с «…»."""
    if width <= 0:
        return ''
    if len(text) > width:
        return text[:width - 1] + '…'
    return text.ljust(width)


def fit_left(text: str, width: int) -> str:
    """Как fit, но длинный текст обрезается слева — для путей, где важен конец."""
    if len(text) > width:
        return '…' + text[len(text) - width + 1:]
    return text.ljust(width)


def wrap(text: str, width: int) -> list:
    """Перенос по словам."""
    lines, line = [], ''
    for word in text.split():
        if line and len(line) + 1 + len(word) > width:
            lines.append(line)
            line = word
        else:
            line = line + ' ' + word if line else word
    if line:
        lines.append(line)
    return lines


# --- экран: сетка знаков со стилями ---------------------------------------------------------------

class Grid:
    def __init__(self, cols: int, rows: int):
        self.cols, self.rows = cols, rows
        self.chars = [[' '] * cols for _ in range(rows)]
        self.styles = [[NORMAL] * cols for _ in range(rows)]

    def put(self, x: int, y: int, text: str, style: str = NORMAL, width: int | None = None) -> None:
        if width is not None:
            text = fit(text, width)
        if not 0 <= y < self.rows:
            return
        for offset, char in enumerate(text):
            if 0 <= x + offset < self.cols:
                self.chars[y][x + offset] = char
                self.styles[y][x + offset] = style

    def put_wrapped(self, x: int, y: int, text: str, width: int, style: str = NORMAL) -> int:
        """Текст с переносом по словам; возвращает число занятых строк."""
        lines = wrap(text, width)
        for row, line in enumerate(lines):
            self.put(x, y + row, line, style)
        return len(lines)

    def lines(self) -> list:
        """Строки с управляющими последовательностями: стиль меняется только там, где он другой."""
        result = []
        for chars, styles in zip(self.chars, self.styles):
            parts, current = [], NORMAL
            for char, style in zip(chars, styles):
                if style != current:
                    parts.append('\x1b[0;%sm' % style if style else '\x1b[0m')
                    current = style
                parts.append(char)
            result.append(''.join(parts) + ('\x1b[0m' if current else ''))
        return result

    def text(self) -> list:
        """Те же строки без стилей — для проверок."""
        return [''.join(chars) for chars in self.chars]


# --- поле ввода -----------------------------------------------------------------------------------

class Field:
    def __init__(self, text: str = '', select: tuple | None = None):
        self.text = text
        self.pos = len(text)
        self.anchor = None                  # начало выделения; выделено от anchor до pos
        if select:
            self.anchor, self.pos = select

    def selection(self):
        if self.anchor is None or self.anchor == self.pos:
            return None
        return min(self.anchor, self.pos), max(self.anchor, self.pos)

    def key(self, key: str) -> bool:
        """Обрабатывает клавишу; True, если текст изменился."""
        selected = self.selection()
        if key in ('Left', 'Right', 'Home', 'End'):
            self.anchor = None
            if key == 'Left':
                self.pos = selected[0] if selected else max(self.pos - 1, 0)
            elif key == 'Right':
                self.pos = selected[1] if selected else min(self.pos + 1, len(self.text))
            else:
                self.pos = 0 if key == 'Home' else len(self.text)
            return False
        if key == 'Ctrl+A':
            self.anchor, self.pos = 0, len(self.text)
            return False
        if key in ('Backspace', 'Delete'):
            if selected:
                self.replace('')
            elif key == 'Backspace' and self.pos > 0:
                self.text = self.text[:self.pos - 1] + self.text[self.pos:]
                self.pos -= 1
            elif key == 'Delete' and self.pos < len(self.text):
                self.text = self.text[:self.pos] + self.text[self.pos + 1:]
            else:
                return False
            return True
        if len(key) == 1 and key >= ' ':
            self.replace(key)
            return True
        return False

    def replace(self, text: str) -> None:
        start, end = self.selection() or (self.pos, self.pos)
        self.text = self.text[:start] + text + self.text[end:]
        self.pos = start + len(text)
        self.anchor = None

    def draw(self, grid: Grid, x: int, y: int, width: int) -> None:
        first = max(0, self.pos - width + 1)          # длинный текст прокручивается за курсором
        selected = self.selection()
        for column in range(width):
            index = first + column
            char = self.text[index] if index < len(self.text) else ' '
            marked = selected[0] <= index < selected[1] if selected else index == self.pos
            grid.put(x + column, y, char, ON_BLACK if marked else INVERSE)


# --- экраны: что показано слева и как обрабатываются клавиши --------------------------------------

class View:
    title = ''
    hint = 'Esc — назад'
    right = 'list'                          # что справа: 'list' — каталог, 'preview' — новые имена, 'help'
    picking = False                         # активен ли курсор в списке справа
    field = None                            # поле ввода, если оно сейчас на экране

    def __init__(self, app):
        self.app = app
        self.error = ''

    def draw(self, grid: Grid, x: int, y: int, width: int) -> None:
        pass

    def key(self, key: str) -> None:
        """Общая обработка: Esc — отмена; если на экране поле, Enter — выполнить, остальное — в поле."""
        if key == 'Esc':
            self.cancel()
        elif self.field is None:
            return
        elif key == 'Enter':
            self.attempt(self.accept)
        elif self.field.key(key):
            self.error = ''

    def attempt(self, action) -> None:
        """Выполнить действие; ошибку с понятным текстом показать на этом экране."""
        self.error = ''
        try:
            action()
        except FileError as error:
            self.error = str(error)

    def accept(self) -> None:
        pass

    def cancel(self) -> None:
        self.app.back()


class Menu(View):
    """Пункты с цифрами: цифра выбирает сразу, стрелки двигают выделение, Enter выбирает.
    Пункт может открыть поле ввода под меню — тогда клавиши идут в поле, Esc закрывает его."""
    menu_hint = 'Цифра — выбрать · ↑ ↓ Enter · Esc — назад'
    field_hint = 'Enter — готово · Esc — к выбору пункта'

    def __init__(self, app, title: str, heading: str, items: list):
        super().__init__(app)
        self.title = title
        self.heading = heading
        self.items = items                  # (цифра, текст, действие)
        self.cursor = 0

    @property
    def hint(self):
        return self.menu_hint if self.field is None else self.field_hint

    def draw(self, grid, x, y, width):
        grid.put(x, y, self.heading, BRIGHT, width)
        for row, (digit, text, _) in enumerate(self.items):
            chosen = row == self.cursor
            grid.put(x, y + 2 + row, ' %s  %s' % (digit, text), INVERSE if chosen else NORMAL, width)
            if not chosen:
                grid.put(x + 1, y + 2 + row, digit, BRIGHT)
        if self.field is None:
            grid.put_wrapped(x, y + 3 + len(self.items), self.error, width, BRIGHT)

    def key(self, key):
        digits = [digit for digit, _, _ in self.items]
        if self.field is not None:
            super().key(key)
        elif key in digits:
            self.choose(digits.index(key))
        elif key in ('Up', 'Down'):
            self.cursor = (self.cursor + (1 if key == 'Down' else -1)) % len(self.items)
        elif key == 'Enter':
            self.choose(self.cursor)
        else:
            super().key(key)

    def choose(self, index: int) -> None:
        self.cursor = index
        self.attempt(self.items[index][2])

    def cancel(self):
        if self.field is not None:
            self.field = None               # Esc в поле — снова выбор пункта
        else:
            super().cancel()


class MainMenu(Menu):
    menu_hint = 'Цифра — выбрать пункт · ↑ ↓ Enter · 0 — выход'

    def __init__(self, app):
        super().__init__(app, 'Главное меню', 'ГЛАВНОЕ МЕНЮ', [
            ('1', 'Переименовать файл', app.rename_one),
            ('2', 'Переименовать группу файлов', app.rename_group),
            ('3', 'Перейти в каталог', app.choose_directory),
            ('4', 'Перейти по пути', app.go_to_path),
            ('5', 'Порядок сортировки', app.choose_sort),
            ('6', 'Справка', app.show_help),
            ('0', 'Выход', app.quit),
        ])

    def cancel(self):
        pass                                # из главного меню назад некуда


class Picker(View):
    """Выбор в списке справа: один файл, несколько файлов или каталог."""
    picking = True
    modes = {                               # название, первая строка подсказки, что делает Enter
        'one': ('Переименовать файл', 'Выберите файл в списке справа.', 'Enter — переименовать'),
        'many': ('Отметить вручную', 'Отметьте файлы в списке справа.', 'Enter — готово'),
        'dir': ('Перейти в каталог', 'Выберите каталог в списке справа.', 'Enter — перейти'),
    }
    extra = {'many': ['Пробел или Insert — отметить', 'Ctrl+A — отметить все файлы'],
             'dir': ['«..» — на уровень выше.']}

    def __init__(self, app, mode: str, done):
        super().__init__(app)
        self.mode = mode
        self.done = done
        self.title, prompt, enter = self.modes[mode]
        self.lines = [prompt, ''] + self.extra.get(mode, []) + MOVE_HINTS + ['', enter, 'Esc — назад']
        self.hint = enter + (' · Пробел — отметить' if mode == 'many' else '') + ' · Esc — назад'
        app.cursor = max(self.step(-1, 1), 0)     # первая подходящая строка

    def fits(self, index: int) -> bool:
        entry = self.app.items[index]
        if self.mode == 'dir':
            return entry is None or entry.is_dir
        return entry is not None and not entry.is_dir

    def step(self, start: int, direction: int, count: int = 1) -> int:
        """Индекс строки, отстоящей от start на count подходящих строк; у края списка — крайняя подходящая."""
        found, index = start, start
        while count > 0:
            index += direction
            if not 0 <= index < len(self.app.items):
                break
            if self.fits(index):
                found = index
                count -= 1
        return found

    def draw(self, grid, x, y, width):
        for row, line in enumerate(self.lines):
            grid.put(x, y + row, line, BRIGHT if row == 0 else NORMAL, width)
        row = y + len(self.lines) + 1
        if self.mode == 'many':
            grid.put(x, row, 'Отмечено: ' + fileops.files_text(len(self.app.marked)), BRIGHT, width)
            row += 2
        grid.put_wrapped(x, row, self.error, width, BRIGHT)

    def key(self, key):
        app = self.app
        page = max(app.list_height - 1, 1)
        moves = {'Up': (-1, 1), 'Down': (1, 1), 'PgUp': (-1, page), 'PgDn': (1, page),
                 'Home': (-1, len(app.items)), 'End': (1, len(app.items))}
        here = app.items[app.cursor] if app.items and self.fits(app.cursor) else None
        self.error = ''
        if key in moves:
            direction, count = moves[key]
            app.cursor = self.step(app.cursor, direction, count)
        elif key == 'Enter':
            if app.items and self.fits(app.cursor):
                self.attempt(lambda: self.done(here))
        elif self.mode == 'many' and key in (' ', 'Insert'):
            if here is not None:
                app.marked ^= {here.name}
                app.cursor = self.step(app.cursor, 1)
        elif self.mode == 'many' and key == 'Ctrl+A':
            app.marked = {entry.name for entry in app.files()}
        elif len(key) == 1 and key > ' ':
            self.jump(key)
        else:
            super().key(key)

    def jump(self, char: str) -> None:
        """К следующей подходящей строке, имя которой начинается с этой буквы (по кругу)."""
        items = self.app.items
        for shift in range(1, len(items) + 1):
            index = (self.app.cursor + shift) % len(items)
            entry = items[index]
            if self.fits(index) and entry is not None and entry.name.casefold().startswith(char.casefold()):
                self.app.cursor = index
                return


class Form(View):
    """Экран с одним полем ввода: заголовок, строки над полем, поле, строки под ним и ошибка."""

    def __init__(self, app, heading: str, above: list, field: Field, below: list):
        super().__init__(app)
        self.heading, self.above, self.field, self.below = heading, above, field, below

    def draw(self, grid, x, y, width):
        grid.put(x, y, self.heading, BRIGHT, width)
        row = y + 2
        for line in self.above:
            grid.put(x, row, line, NORMAL, width)
            row += 1
        self.field.draw(grid, x, row, width)
        row += 2
        for line in self.below:
            grid.put(x, row, line, NORMAL, width)
            row += 1
        grid.put_wrapped(x, row + 1, self.error, width, BRIGHT)


class RenameView(Form):
    title = 'Новое имя'
    hint = 'Enter — переименовать · Esc — назад'

    def __init__(self, app, entry: fileops.Entry):
        base = len(os.path.splitext(entry.name)[0])     # имя без расширения выделено: печать его заменяет
        super().__init__(app, 'ПЕРЕИМЕНОВАНИЕ ФАЙЛА', ['Файл:', entry.name, '', 'Новое имя:'],
                         Field(entry.name, (0, base)), ['Enter — переименовать', 'Esc — назад к списку'])
        self.entry = entry

    def accept(self):
        new = self.field.text.strip()
        self.app.apply(fileops.check_plan(self.app.entries, [Rename(self.entry.name, new)]))


class PathView(Form):
    title = 'Перейти по пути'
    hint = 'Enter — перейти · Esc — назад'

    def __init__(self, app):
        super().__init__(app, 'ПЕРЕХОД ПО ПУТИ', ['Путь: относительный (Фото, ..)', 'или абсолютный (C:\\Windows)', ''],
                         Field(app.directory, (0, len(app.directory))), [])

    def accept(self):
        self.app.open_directory(fileops.resolve_directory(self.app.directory, self.field.text.strip()))
        self.app.home()


class SourceMenu(Menu):
    """Какие файлы переименовать. Пункт «по маске» открывает поле маски на этом же экране."""
    field_hint = 'Enter — отметить · Esc — к выбору пункта'

    def __init__(self, app):
        super().__init__(app, 'Переименовать группу', 'КАКИЕ ФАЙЛЫ ПЕРЕИМЕНОВАТЬ', [
            ('1', 'Отметить файлы вручную', self.manual),
            ('2', 'Отметить по маске', self.by_mask),
            ('3', 'Все файлы каталога', lambda: self.next_step(app.files())),
        ])

    def manual(self):
        self.app.push(Picker(self.app, 'many', lambda entry: self.next_step(self.app.marked_files())))

    def by_mask(self):
        self.field = Field('*', (0, 1))

    def next_step(self, files: list) -> None:
        if not files:
            raise FileError('Нет файлов для переименования: отметьте хотя бы один.')
        self.app.marked = {entry.name for entry in files}
        self.app.push(ActionMenu(self.app, files))

    def matching(self) -> list:
        mask = self.field.text.strip()
        if not mask:
            raise FileError('Введите маску.')
        found = fileops.select(self.app.files(), mask)
        if not found:
            raise FileError('Нет файлов, соответствующих маске: ' + mask)
        return found

    def accept(self):
        self.next_step(self.matching())

    def draw(self, grid, x, y, width):
        super().draw(grid, x, y, width)
        if self.field is None:
            return
        grid.put(x, y + 6, 'Маска:', NORMAL)
        self.field.draw(grid, x, y + 7, width)
        grid.put(x, y + 8, '* — любые символы, ? — один', NORMAL, width)
        try:
            summary = 'Подходит: ' + fileops.files_text(len(self.matching()))
        except FileError as error:
            summary = str(error)
        grid.put_wrapped(x, y + 10, summary, width, BRIGHT)     # пересчитывается после каждой клавиши


class ActionMenu(Menu):
    """Что сделать с именами. Выбор пункта открывает поле текста; справа — новые имена."""
    field_hint = 'Enter — переименовать · Esc — к выбору действия'

    def __init__(self, app, files: list):
        super().__init__(app, 'Действие', 'ЧТО СДЕЛАТЬ С ИМЕНАМИ', [
            (str(index + 1), title, self.start) for index, (_, title, _) in enumerate(ACTIONS)
        ])                                  # какое действие выбрано, видно по cursor: его ставит choose()
        self.files = files

    @property
    def right(self):
        return 'preview' if self.field is not None else 'list'

    def start(self) -> None:
        self.field = Field()

    def new_name(self, name: str) -> str:
        key, text = ACTIONS[self.cursor][0], self.field.text
        if key == 'prefix':
            return fileops.add_prefix(name, text)
        if key == 'suffix':
            return fileops.add_suffix(name, text)
        return fileops.change_extension(name, text)

    def plan(self):
        """План переименования, проверенные шаги и причина, если переименовать нельзя."""
        plan = [Rename(entry.name, self.new_name(entry.name)) for entry in self.files]
        if not self.field.text:
            return plan, None, 'Заполните поле «%s».' % ACTIONS[self.cursor][2]
        try:
            return plan, fileops.check_plan(self.app.entries, plan), None
        except FileError as error:
            return plan, None, str(error)

    def accept(self):
        _, changes, _ = self.plan()
        if changes:                         # иначе причина уже видна под полем
            self.app.apply(changes)

    def draw(self, grid, x, y, width):
        grid.put(x, y, 'Выбрано: ' + fileops.files_text(len(self.files)), BRIGHT, width)
        super().draw(grid, x, y + 2, width)
        if self.field is None:
            return
        grid.put(x, y + 8, ACTIONS[self.cursor][2] + ':', NORMAL)
        self.field.draw(grid, x, y + 9, width)
        _, changes, problem = self.plan()
        summary = problem or 'Будет переименовано: ' + fileops.files_text(len(changes))
        grid.put_wrapped(x, y + 11, summary, width, BRIGHT if problem and self.field.text else NORMAL)


class SortMenu(Menu):
    def __init__(self, app):
        super().__init__(app, 'Сортировка', 'ПОРЯДОК СОРТИРОВКИ', [
            (str(index + 1), title, lambda key=key: app.set_sort(key))
            for index, (key, title) in enumerate(SORT_KEYS)
        ])
        self.cursor = [key for key, _ in SORT_KEYS].index(app.sort_key)

    def draw(self, grid, x, y, width):
        super().draw(grid, x, y, width)
        grid.put(x, y + 6, 'Сейчас: ' + dict(SORT_KEYS)[self.app.sort_key], NORMAL, width)


class HelpView(View):
    title = 'Справка'
    hint = 'Любая клавиша — назад'
    right = 'help'                          # справка занимает обе колонки, левая часть не рисуется

    def key(self, key):
        self.app.back()


# --- программа ------------------------------------------------------------------------------------

class App:
    def __init__(self, directory: str):
        self.directory = directory
        self.entries = []
        self.items = []                     # строки списка: None — «..», дальше объекты каталога
        self.cursor = 0
        self.top = 0
        self.list_height = 10
        self.marked = set()
        self.recent = set()                 # имена, полученные последним переименованием
        self.sort_key = 'name'
        self.message = ''
        self.alive = True
        self.stack = [MainMenu(self)]
        self.open_directory(directory)

    # --- состояние ---

    def open_directory(self, directory: str) -> None:
        entries = fileops.list_directory(directory)
        if directory != self.directory:
            self.marked, self.recent = set(), set()
            self.cursor = self.top = 0
            self.message = 'Открыт каталог ' + (os.path.basename(directory) or directory) + '.'
        self.directory = directory
        self.entries = entries
        self.fill_items()

    def fill_items(self) -> None:
        key = self.sort_key
        entries = sorted(self.entries, key=lambda entry: entry.name.casefold())
        if key != 'name':
            entries.sort(key=lambda entry: getattr(entry, key))
        entries.sort(key=lambda entry: not entry.is_dir)
        has_parent = os.path.dirname(self.directory) != self.directory
        self.items = ([None] if has_parent else []) + entries
        self.cursor = min(self.cursor, max(len(self.items) - 1, 0))

    def files(self) -> list:
        """Файлы каталога в порядке списка на экране."""
        return [entry for entry in self.items if entry is not None and not entry.is_dir]

    def marked_files(self) -> list:
        return [entry for entry in self.files() if entry.name in self.marked]

    def top_view(self) -> View:
        return self.stack[-1]

    def push(self, view: View) -> None:
        self.stack.append(view)

    def back(self) -> None:
        if len(self.stack) > 1:
            self.stack.pop()
        if len(self.stack) == 1:
            self.marked = set()

    def home(self) -> None:
        """Возврат в главное меню; список каталога перечитывается."""
        del self.stack[1:]
        self.marked = set()
        self.open_directory(self.directory)

    # --- действия главного меню ---

    def rename_one(self):
        if not self.files():
            raise FileError('В этом каталоге нет файлов.')
        self.push(Picker(self, 'one', lambda entry: self.push(RenameView(self, entry))))

    def rename_group(self):
        self.marked = set()
        self.push(SourceMenu(self))

    def choose_directory(self):
        def enter(entry):
            parent = os.path.dirname(self.directory)
            self.open_directory(entry.path if entry is not None else parent)
            self.home()
        self.push(Picker(self, 'dir', enter))

    def go_to_path(self):
        self.push(PathView(self))

    def choose_sort(self):
        self.push(SortMenu(self))

    def set_sort(self, key: str):
        self.sort_key = key
        self.fill_items()
        self.message = 'Сортировка ' + dict(SORT_KEYS)[key] + '.'
        self.back()

    def show_help(self):
        self.push(HelpView(self))

    def quit(self):
        self.alive = False

    def apply(self, changes: list) -> None:
        """Выполняет проверенный план и возвращается в главное меню с итогом в строке сообщений."""
        try:
            fileops.apply_plan(self.directory, changes)
        except FileError as error:          # например, файл открыт в другой программе
            self.home()
            self.message = str(error)
            return
        self.home()
        self.recent = {step.new for step in changes}
        text = fileops.renamed_text(len(changes))
        if len(changes) == 1:
            text += ': ' + changes[0].old + ' → ' + changes[0].new
        self.message = text + '.'

    # --- клавиши ---

    def handle(self, key: str) -> None:
        if key == 'Quit':
            self.quit()
            return
        self.recent = set()
        self.message = ''                   # сообщение видно до следующей клавиши
        self.top_view().key(key)

    # --- экран ---

    def render(self, cols: int, rows: int) -> Grid:
        grid = Grid(cols, rows)
        if cols < MIN_COLS or rows < MIN_ROWS:
            grid.put(0, 0, 'Окно слишком маленькое: нужно не меньше %d×%d знаков.' % (MIN_COLS, MIN_ROWS), BRIGHT)
            return grid
        view = self.top_view()
        grid.put(0, 0, ' ' + TITLE, INVERSE, cols)
        grid.put(0, 1, ' Каталог: ' + fit_left(self.directory, cols - 11))
        grid.put(0, 2, ' ' + ' › '.join(item.title for item in self.stack), BRIGHT, cols)
        grid.put(1, rows - 2, self.message, BRIGHT, cols - 2)
        grid.put(1, rows - 1, view.hint, NORMAL, cols - 3)
        top, bottom = 4, rows - 4           # средняя часть экрана между двумя линиями
        grid.put(0, top - 1, '─' * cols)
        grid.put(0, bottom + 1, '─' * cols)
        if view.right == 'help':            # справка — на всю ширину
            self.draw_help(grid, 2, top + 1, cols - 4)
            return grid
        view.draw(grid, 2, top + 1, LEFT - 4)                   # колонки разделены промежутком
        x, width, height = LEFT + 2, cols - LEFT - 3, bottom - top + 1
        if view.right == 'preview':
            self.draw_preview(grid, x, top, width, height, view)
        else:
            self.draw_list(grid, x, top, width, height, view.picking)
        return grid

    def draw_list(self, grid: Grid, x: int, y: int, width: int, height: int, picking: bool) -> None:
        size_w, date_w = 10, 16
        name_w = width - size_w - date_w - 4
        grid.put(x, y, fit('  Имя', name_w + 2) + 'Размер'.rjust(size_w) + '  ' + 'Изменён', BRIGHT)
        self.list_height = visible = height - 3
        if self.cursor < self.top:
            self.top = self.cursor
        if self.cursor >= self.top + visible:
            self.top = self.cursor - visible + 1
        self.top = max(min(self.top, max(len(self.items) - visible, 0)), 0)
        for row, entry in enumerate(self.items[self.top:self.top + visible]):
            if entry is None:
                name, size, date = '..', 'Вверх', ''
            else:
                name = entry.name
                size = '<Каталог>' if entry.is_dir else fileops.format_size(entry.size)
                date = fileops.format_date(entry.modified)
            marked = entry is not None and entry.name in self.marked
            style = BRIGHT if marked or (entry is not None and entry.name in self.recent) else NORMAL
            if picking and self.top + row == self.cursor:
                style = INVERSE
            line = ('√ ' if marked else '  ') + fit(name, name_w) + size.rjust(size_w) + '  ' + date
            grid.put(x - 1, y + 1 + row, ' ' + line, style, width + 1)
        info = 'Всего: ' + fileops.entries_text(self.entries)
        marked = self.marked_files()
        if marked:
            info += '   Отмечено: ' + fileops.files_text(len(marked)) + ', ' + \
                fileops.format_size(sum(entry.size for entry in marked))
        grid.put(x, y + height - 1, info, BRIGHT if marked else NORMAL, width)

    def draw_preview(self, grid: Grid, x: int, y: int, width: int, height: int, view: 'ActionMenu') -> None:
        plan = view.plan()[0]               # причина, если переименовать нельзя, показана слева
        half = (width - 3) // 2
        grid.put(x, y, fit('Старое имя', half) + ' → ' + 'Новое имя', BRIGHT, width)
        visible = height - 3
        for row, step in enumerate(plan[:visible]):
            grid.put(x, y + 1 + row, fit(step.old, half) + ' → ')
            grid.put(x + half + 3, y + 1 + row, step.new, NORMAL if step.new == step.old else BRIGHT, width - half - 3)
        if len(plan) > visible:
            grid.put(x, y + height - 2, '(и ещё %d)' % (len(plan) - visible))

    @staticmethod
    def draw_help(grid: Grid, x: int, y: int, width: int) -> None:
        for line in HELP_LINES:
            y += grid.put_wrapped(x, y, line, width, BRIGHT if line.isupper() else NORMAL) or 1

    def window_title(self) -> str:
        return TITLE + ' — ' + self.directory


# --- консоль: ввод клавиш и вывод экрана ----------------------------------------------------------

class Console:
    """Всё, что зависит от системы: режим консоли, чтение клавиш, вывод строк."""
    WINDOWS_KEYS = {'H': 'Up', 'P': 'Down', 'K': 'Left', 'M': 'Right', 'G': 'Home', 'O': 'End',
                    'I': 'PgUp', 'Q': 'PgDn', 'R': 'Insert', 'S': 'Delete'}
    POSIX_KEYS = {'[A': 'Up', '[B': 'Down', '[C': 'Right', '[D': 'Left', '[H': 'Home', '[F': 'End',
                  'OH': 'Home', 'OF': 'End', '[1~': 'Home', '[4~': 'End', '[5~': 'PgUp', '[6~': 'PgDn',
                  '[2~': 'Insert', '[3~': 'Delete'}
    CONTROL = {'\r': 'Enter', '\n': 'Enter', '\x1b': 'Esc', '\x08': 'Backspace', '\x7f': 'Backspace',
               '\t': 'Tab', '\x01': 'Ctrl+A', '\x03': 'Quit'}

    def __init__(self):
        self.shown = []                     # что сейчас на экране — выводятся только изменившиеся строки
        self.title = ''
        self.restore = None

    def __enter__(self):
        if os.name == 'nt':
            import ctypes
            kernel32 = ctypes.windll.kernel32
            handle = kernel32.GetStdHandle(-11)                  # STD_OUTPUT_HANDLE
            mode = ctypes.c_uint32()
            if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
                kernel32.SetConsoleMode(handle, mode.value | 0x0004)    # ENABLE_VIRTUAL_TERMINAL_PROCESSING
                self.restore = lambda: kernel32.SetConsoleMode(handle, mode.value)
        else:
            import termios
            import tty
            descriptor = sys.stdin.fileno()
            saved = termios.tcgetattr(descriptor)
            tty.setraw(descriptor)
            self.restore = lambda: termios.tcsetattr(descriptor, termios.TCSADRAIN, saved)
        self.write('\x1b[?1049h\x1b[?25l')                     # отдельный экран, курсор скрыт
        return self

    def __exit__(self, *error):
        self.write('\x1b[0m\x1b[?25h\x1b[?1049l')
        if self.restore:
            self.restore()

    @staticmethod
    def write(text: str) -> None:
        sys.stdout.write(text)
        sys.stdout.flush()

    @staticmethod
    def size() -> tuple:
        size = shutil.get_terminal_size((100, 30))
        return size.columns, size.lines

    def draw(self, lines: list, title: str) -> None:
        output = []
        if title != self.title:
            output.append('\x1b]0;%s\x07' % title)
            self.title = title
        if len(lines) != len(self.shown):
            output.append('\x1b[2J')
            self.shown = [None] * len(lines)
        for row, line in enumerate(lines):
            if line != self.shown[row]:
                output.append('\x1b[%d;1H%s' % (row + 1, line))
                self.shown[row] = line
        self.write(''.join(output))

    def resized(self) -> None:
        self.shown = []

    def read_key(self) -> str:
        if os.name == 'nt':
            import msvcrt
            char = msvcrt.getwch()
            if char in ('\x00', '\xe0'):                         # стрелки и другие особые клавиши
                return self.WINDOWS_KEYS.get(msvcrt.getwch(), '')
            return self.CONTROL.get(char, char)
        import select
        descriptor = sys.stdin.fileno()
        first = os.read(descriptor, 1)
        if first == b'\x1b':
            sequence = b''
            while select.select([descriptor], [], [], 0.03)[0] and len(sequence) < 6:
                sequence += os.read(descriptor, 1)
                if len(sequence) > 1 and (sequence[-1:].isalpha() or sequence.endswith(b'~')):
                    break
            if not sequence:
                return 'Esc'
            return self.POSIX_KEYS.get(sequence.decode('ascii', 'replace'), '')
        length = 1 if first[0] < 0xc0 else 2 if first[0] < 0xe0 else 3 if first[0] < 0xf0 else 4
        data = first + (os.read(descriptor, length - 1) if length > 1 else b'')
        char = data.decode('utf-8', 'replace')
        return self.CONTROL.get(char, char)


def run(app: App) -> None:
    with Console() as console:
        size = None
        while app.alive:
            if console.size() != size:
                size = console.size()
                console.resized()
            console.draw(app.render(*size).lines(), app.window_title())
            key = console.read_key()
            try:
                app.handle(key)
            except FileError as error:      # например, каталог стал недоступен
                app.message = str(error)


def open_window(directory: str) -> bool:
    """Windows: запустить программу заново в отдельном окне консоли (conhost), а не в текущем терминале."""
    import subprocess
    command = [sys.executable, os.path.abspath(__file__), directory, '--window']
    conhost = os.path.join(os.environ.get('SystemRoot', 'C:\\Windows'), 'System32', 'conhost.exe')
    if os.path.exists(conhost):             # классическое окно консоли, а не вкладка Windows Terminal
        command.insert(0, conhost)
    try:
        subprocess.Popen(command, creationflags=subprocess.CREATE_NEW_CONSOLE)
    except OSError:
        return False
    return True


def main() -> int:
    args = [arg for arg in sys.argv[1:] if not arg.startswith('--')]
    flags = set(sys.argv[1:]) - set(args)   # --here — в текущем терминале; --window — уже в своём окне
    directory = os.path.realpath(os.getcwd())
    if args:
        try:
            directory = fileops.resolve_directory(directory, args[0])
        except FileError as error:
            print(error)
            return 1
    if os.name == 'nt' and not flags & {'--here', '--window'} and open_window(directory):
        print('Программа открыта в отдельном окне консоли.')
        return 0
    if '--window' in flags:
        os.system('mode con: cols=100 lines=30')       # размер окна — 100 × 30 знаков
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        print('Запустите программу в окне консоли: python text_menu.py [каталог]')
        return 1
    try:
        run(App(directory))
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == '__main__':
    sys.exit(main())
