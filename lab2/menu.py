"""Управление файловым каталогом через меню: окно со списком файлов на виджетах Tkinter."""

import ctypes
import os
import sys
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from tkinter import font as tkfont

import fileops
from fileops import FileError, Rename

TITLE = 'Управление файлами'
PARENT_NAME = '..'
RENAME_ONE = 'Переименовать…'
RENAME_GROUP = 'Переименовать группу…'
SELECT_BY_MASK = 'Выделить по маске…'

COLUMNS = [('size', 'Размер', 110, 'e'), ('modified', 'Изменён', 150, 'w')]
SORT_KEYS = [('name', 'По имени'), ('size', 'По размеру'), ('modified', 'По дате изменения')]
# коды клавиш вместо букв, чтобы сочетания работали и в русской раскладке
CONTROL_KEYS = {65: 'select_all', 70: 'select_by_mask', 79: 'choose_directory', 82: 'rename_group'}
ACTIONS = [
    ('prefix', 'добавить текст в начало имени', 'Текст:'),
    ('suffix', 'добавить текст в конец имени (перед расширением)', 'Текст:'),
    ('replace', 'заменить текст в имени', 'Найти:'),
    ('extension', 'сменить расширение', 'Расширение:'),
]
PREVIEW_ROWS = 7
MESSAGE_TIME = 8000
ERROR_COLOR = '#c00000'
HINT_COLOR = '#555555'

FOLDER_SHAPES = [
    ('#c8962a', (1, 2, 7, 5)),
    ('#c8962a', (1, 4, 15, 14)),
    ('#f3c755', (2, 3, 6, 5)),
    ('#f8d978', (2, 5, 14, 13)),
]
FILE_SHAPES = [
    ('#8c8c8c', (3, 1, 13, 15)),
    ('#ffffff', (4, 2, 12, 14)),
    ('#b0b0b0', (5, 5, 11, 6)),
    ('#b0b0b0', (5, 8, 11, 9)),
    ('#b0b0b0', (5, 11, 9, 12)),
]

HELP_SECTIONS = [
    ('', 'Программа показывает содержимое текущего каталога и переименовывает файлы.'),
    ('Переход по каталогам',
     'Двойной щелчок по каталогу или Enter — войти в него. Строка «..» или Backspace — на уровень выше. '
     'Любой каталог открывается через «Файл → Открыть каталог…» или по пути в адресной строке.'),
    ('Переименование одного файла',
     'Выделите файл, выберите «Правка → Переименовать…» (F2 или двойной щелчок) и введите новое имя.'),
    ('Переименование группы файлов',
     'Выделите файлы мышью с Ctrl или Shift либо по маске («Правка → Выделить по маске…», Ctrl+F). '
     'Затем выберите «Правка → Переименовать группу…» (Ctrl+R) и укажите, что сделать с именами: '
     'добавить текст в начало или в конец, заменить текст либо сменить расширение. '
     'Новые имена сразу видны в предпросмотре.'),
    ('Маска', '* — любое число любых символов, ? — ровно один символ. Например: *.txt, IMG_*, отчёт_?.docx.'),
    ('Проверка имён',
     'Если хотя бы одно новое имя занято или недопустимо, не переименовывается ни один файл. '
     'Каталоги программа не переименовывает.'),
    ('Вид списка',
     'Столбцы «Размер» и «Изменён» и порядок сортировки выбираются в меню «Вид». '
     'Сортировку также меняет щелчок по заголовку столбца.'),
]


def draw_icon(shapes: list, zoom: int) -> tk.PhotoImage:
    image = tk.PhotoImage(width=16, height=16)
    for color, box in shapes:
        image.put(color, to=box)
    return image.zoom(zoom) if zoom > 1 else image


class Dialog(tk.Toplevel):
    """Модальное окно поверх главного; show() возвращает result после закрытия."""

    def __init__(self, parent: tk.Misc, title: str):
        super().__init__(parent)
        self.withdraw()
        self.title(title)
        self.resizable(False, False)
        self.transient(parent)
        self.result = None
        self.message = None
        self.body = ttk.Frame(self, padding=14)
        self.body.grid(sticky='nsew')
        self.bind('<Escape>', lambda event: self.destroy())

    def add_buttons(self, row: int, text: str, command) -> ttk.Button:
        buttons = ttk.Frame(self.body)
        buttons.grid(row=row, column=0, columnspan=2, sticky='e', pady=(12, 0))
        accept = ttk.Button(buttons, text=text, command=command, default='active')
        accept.pack(side='left', padx=(0, 6))
        ttk.Button(buttons, text='Отмена', command=self.destroy).pack(side='left')
        self.bind('<Return>', lambda event: command())
        return accept

    def add_message(self, row: int) -> None:
        self.message = tk.Label(self.body, text='', height=2, anchor='nw', justify='left')
        self.message.grid(row=row, column=0, columnspan=2, sticky='we', pady=(10, 0))
        self.text_color = self.message.cget('foreground')

    def show(self, focus: tk.Widget):
        parent = self.master
        self.update_idletasks()
        if self.message is not None:
            self.message.configure(wraplength=self.body.winfo_reqwidth() - 28)
        x = parent.winfo_rootx() + (parent.winfo_width() - self.winfo_reqwidth()) // 2
        y = parent.winfo_rooty() + (parent.winfo_height() - self.winfo_reqheight()) // 3
        self.geometry('+%d+%d' % (max(x, 0), max(y, 0)))
        self.deiconify()
        focus.focus_set()
        self.grab_set()
        parent.wait_window(self)
        return self.result


class RenameDialog(Dialog):
    def __init__(self, parent: tk.Misc, entries: list, entry: fileops.Entry):
        super().__init__(parent, 'Переименование файла')
        self.entries = entries
        self.entry = entry
        self.name = tk.StringVar(value=entry.name)

        ttk.Label(self.body, text='Файл:').grid(row=0, column=0, sticky='w', padx=(0, 10))
        ttk.Label(self.body, text=entry.name).grid(row=0, column=1, sticky='w')
        ttk.Label(self.body, text='Новое имя:').grid(row=1, column=0, sticky='w', padx=(0, 10), pady=(8, 0))
        self.name_entry = ttk.Entry(self.body, textvariable=self.name, width=46)
        self.name_entry.grid(row=1, column=1, sticky='we', pady=(8, 0))
        self.add_message(2)
        self.message.configure(foreground=ERROR_COLOR)
        self.add_buttons(3, 'Переименовать', self.accept)
        self.name.trace_add('write', lambda *args: self.message.configure(text=''))

        base = os.path.splitext(entry.name)[0]
        self.name_entry.select_range(0, len(base))
        self.name_entry.icursor(len(base))

    def accept(self) -> None:
        try:
            self.result = fileops.check_plan(self.entries, [Rename(self.entry.name, self.name.get().strip())])
        except FileError as error:
            self.message.configure(text=str(error))
            return
        self.destroy()

    def show(self):
        return super().show(self.name_entry)


class MaskDialog(Dialog):
    def __init__(self, parent: tk.Misc, entries: list):
        super().__init__(parent, 'Выделение файлов по маске')
        self.entries = entries
        self.mask = tk.StringVar(value='*')

        ttk.Label(self.body, text='Маска имени:').grid(row=0, column=0, sticky='w', padx=(0, 10))
        self.mask_entry = ttk.Entry(self.body, textvariable=self.mask, width=40)
        self.mask_entry.grid(row=0, column=1, sticky='we')
        ttk.Label(self.body, text='* — любые символы, ? — один символ.\nНапример: *.txt, IMG_*, отчёт_?.docx',
                  foreground=HINT_COLOR).grid(row=1, column=1, sticky='w', pady=(4, 0))
        self.add_message(2)
        self.accept_button = self.add_buttons(3, 'Выделить', self.accept)
        self.mask.trace_add('write', lambda *args: self.update_summary())
        self.update_summary()
        self.mask_entry.select_range(0, 'end')

    def matching(self) -> list:
        mask = self.mask.get().strip()
        if mask == '':
            raise FileError('Введите маску.')
        found = fileops.select(self.entries, mask, files_only=True)
        if not found:
            raise FileError('Нет файлов, соответствующих маске: ' + mask)
        return found

    def update_summary(self):
        try:
            found = self.matching()
        except FileError as error:
            self.message.configure(text=str(error), foreground=ERROR_COLOR)
            self.accept_button.state(['disabled'])
            return None
        self.message.configure(text='Подходит: ' + fileops.files_text(len(found)), foreground=self.text_color)
        self.accept_button.state(['!disabled'])
        return found

    def accept(self) -> None:
        found = self.update_summary()
        if found is not None:
            self.result = found
            self.destroy()

    def show(self):
        return super().show(self.mask_entry)


class GroupDialog(Dialog):
    def __init__(self, parent: tk.Misc, entries: list, files: list):
        super().__init__(parent, 'Переименование группы файлов')
        self.entries = entries
        self.files = files
        self.changes = None
        self.action = tk.StringVar(value=ACTIONS[0][0])
        self.text = tk.StringVar()
        self.replacement = tk.StringVar()

        ttk.Label(self.body, text='Выбрано: ' + fileops.files_text(len(files))).grid(
            row=0, column=0, columnspan=2, sticky='w')
        actions = ttk.LabelFrame(self.body, text='Что сделать с именами', padding=(10, 4))
        actions.grid(row=1, column=0, columnspan=2, sticky='we', pady=(8, 0))
        for key, title, _ in ACTIONS:
            ttk.Radiobutton(actions, text=title, variable=self.action, value=key).pack(anchor='w', pady=1)

        self.text_label = ttk.Label(self.body, text='')
        self.text_label.grid(row=2, column=0, sticky='w', padx=(0, 10), pady=(10, 0))
        self.text_entry = ttk.Entry(self.body, textvariable=self.text, width=44)
        self.text_entry.grid(row=2, column=1, sticky='we', pady=(10, 0))
        self.replacement_label = ttk.Label(self.body, text='Заменить на:')
        self.replacement_label.grid(row=3, column=0, sticky='w', padx=(0, 10), pady=(6, 0))
        self.replacement_entry = ttk.Entry(self.body, textvariable=self.replacement, width=44)
        self.replacement_entry.grid(row=3, column=1, sticky='we', pady=(6, 0))

        ttk.Label(self.body, text='Предпросмотр:').grid(row=4, column=0, columnspan=2, sticky='w', pady=(12, 2))
        preview = ttk.Frame(self.body)
        preview.grid(row=5, column=0, columnspan=2, sticky='we')
        self.tree = ttk.Treeview(preview, columns=('old', 'new'), show='headings', selectmode='none',
                                 height=min(max(len(files), 3), PREVIEW_ROWS))
        width = tkfont.nametofont('TkDefaultFont').measure('0' * 34)
        for key, title in (('old', 'Старое имя'), ('new', 'Новое имя')):
            self.tree.heading(key, text=title, anchor='w')
            self.tree.column(key, width=width, anchor='w')
        scrollbar = ttk.Scrollbar(preview, orient='vertical', command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.pack(side='left', fill='both', expand=True)
        scrollbar.pack(side='right', fill='y')

        self.add_message(6)
        self.accept_button = self.add_buttons(7, 'Переименовать', self.accept)
        for variable in (self.action, self.text, self.replacement):
            variable.trace_add('write', lambda *args: self.update_preview())
        # после выбора действия мышью текст можно вводить сразу, без щелчка по полю
        self.action.trace_add('write', lambda *args: self.text_entry.focus_set())
        self.update_preview()

    def new_name(self, name: str) -> str:
        action = self.action.get()
        text = self.text.get()
        if action == 'prefix':
            return fileops.add_prefix(name, text)
        if action == 'suffix':
            return fileops.add_suffix(name, text)
        if action == 'replace':
            return fileops.replace_text(name, text, self.replacement.get())
        return fileops.change_extension(name, text)

    def update_preview(self) -> None:
        action = self.action.get()
        self.text_label.configure(text=next(label for key, _, label in ACTIONS if key == action))
        replacing = ['!disabled'] if action == 'replace' else ['disabled']
        self.replacement_label.state(replacing)
        self.replacement_entry.state(replacing)

        plan = [Rename(file.name, self.new_name(file.name)) for file in self.files]
        self.tree.delete(*self.tree.get_children())
        for step in plan:
            self.tree.insert('', 'end', values=(step.old, step.new))
        self.changes = None
        self.accept_button.state(['disabled'])
        if self.text.get() == '':
            self.message.configure(text='Заполните поле «' + self.text_label.cget('text').rstrip(':') + '».',
                                   foreground=HINT_COLOR)
            return
        try:
            self.changes = fileops.check_plan(self.entries, plan)
        except FileError as error:
            self.message.configure(text=str(error), foreground=ERROR_COLOR)
            return
        self.message.configure(text='Будет переименовано: ' + fileops.files_text(len(self.changes)),
                               foreground=self.text_color)
        self.accept_button.state(['!disabled'])

    def accept(self) -> None:
        if self.changes:
            self.result = self.changes
            self.destroy()

    def show(self):
        return super().show(self.text_entry)


class HelpWindow(Dialog):
    def __init__(self, parent: tk.Misc):
        super().__init__(parent, 'Как пользоваться')
        text = tk.Text(self.body, width=84, height=26, wrap='word', relief='flat', padx=4, pady=2,
                       background=self.cget('background'), font=tkfont.nametofont('TkDefaultFont'))
        scrollbar = ttk.Scrollbar(self.body, orient='vertical', command=text.yview)
        text.configure(yscrollcommand=scrollbar.set)
        heading = tkfont.nametofont('TkDefaultFont').copy()
        heading.configure(weight='bold')
        text.tag_configure('heading', font=heading, spacing1=8, spacing3=2)
        for title, body in HELP_SECTIONS:
            if title:
                text.insert('end', title + '\n', 'heading')
            text.insert('end', body + '\n')
        text.configure(state='disabled')
        text.grid(row=0, column=0)
        scrollbar.grid(row=0, column=1, sticky='ns')
        self.close_button = ttk.Button(self.body, text='Закрыть', command=self.destroy, default='active')
        self.close_button.grid(row=1, column=0, columnspan=2, sticky='e', pady=(10, 0))
        self.bind('<Return>', lambda event: self.destroy())

    def show(self):
        return super().show(self.close_button)


class App:
    def __init__(self, root: tk.Tk, directory: str):
        self.root = root
        self.directory = directory
        self.entries = []
        self.items = {}
        self.parent_item = None
        self.message = ''
        self.message_timer = None
        self.scale = root.winfo_fpixels('1i') / 96
        zoom = 2 if self.scale >= 1.75 else 1
        self.folder_icon = draw_icon(FOLDER_SHAPES, zoom)
        self.file_icon = draw_icon(FILE_SHAPES, zoom)
        self.window_icon = draw_icon(FOLDER_SHAPES, 2)
        self.address = tk.StringVar()
        self.sort_key = tk.StringVar(value=SORT_KEYS[0][0])
        self.descending = tk.BooleanVar(value=False)
        self.visible = {key: tk.BooleanVar(value=True) for key, _, _, _ in COLUMNS}

        root.title(TITLE)
        root.iconphoto(True, self.window_icon)
        root.geometry('%dx%d' % (860 * self.scale, 540 * self.scale))
        root.minsize(int(560 * self.scale), int(340 * self.scale))
        self.build_menu()
        self.build_toolbar()
        self.build_status()
        self.build_list()
        self.bind_keys()
        self.open_directory(directory)

    # --- построение окна ---

    def build_menu(self) -> None:
        menubar = tk.Menu(self.root)

        file_menu = tk.Menu(menubar, tearoff=False)
        file_menu.add_command(label='Открыть каталог…', accelerator='Ctrl+O', command=self.choose_directory)
        file_menu.add_command(label='Вверх', accelerator='Backspace', command=self.go_up)
        file_menu.add_command(label='Обновить', accelerator='F5', command=self.refresh)
        file_menu.add_separator()
        file_menu.add_command(label='Выход', accelerator='Alt+F4', command=self.root.destroy)
        menubar.add_cascade(label='Файл', menu=file_menu, underline=0)

        self.edit_menu = tk.Menu(menubar, tearoff=False)
        self.edit_menu.add_command(label=RENAME_ONE, accelerator='F2', command=self.rename_one)
        self.edit_menu.add_command(label=RENAME_GROUP, accelerator='Ctrl+R', command=self.rename_group)
        self.edit_menu.add_separator()
        self.edit_menu.add_command(label='Выделить всё', accelerator='Ctrl+A', command=self.select_all)
        self.edit_menu.add_command(label=SELECT_BY_MASK, accelerator='Ctrl+F', command=self.select_by_mask)
        self.edit_menu.add_command(label='Снять выделение', accelerator='Esc', command=self.clear_selection)
        menubar.add_cascade(label='Правка', menu=self.edit_menu, underline=0)

        view_menu = tk.Menu(menubar, tearoff=False)
        for key, title, _, _ in COLUMNS:
            view_menu.add_checkbutton(label='Столбец «' + title + '»', variable=self.visible[key],
                                      command=self.update_columns)
        view_menu.add_separator()
        sort_menu = tk.Menu(view_menu, tearoff=False)
        for key, title in SORT_KEYS:
            sort_menu.add_radiobutton(label=title, variable=self.sort_key, value=key, command=self.show_entries)
        sort_menu.add_separator()
        sort_menu.add_checkbutton(label='По убыванию', variable=self.descending, command=self.show_entries)
        view_menu.add_cascade(label='Сортировка', menu=sort_menu)
        menubar.add_cascade(label='Вид', menu=view_menu, underline=0)

        help_menu = tk.Menu(menubar, tearoff=False)
        help_menu.add_command(label='Как пользоваться', accelerator='F1', command=self.show_help)
        help_menu.add_command(label='О программе', command=self.show_about)
        menubar.add_cascade(label='Справка', menu=help_menu, underline=0)

        self.root.configure(menu=menubar)

        self.context_menu = tk.Menu(self.root, tearoff=False)
        self.context_menu.add_command(label='Открыть каталог', accelerator='Enter', command=self.open_selected)
        self.context_menu.add_separator()
        self.context_menu.add_command(label=RENAME_ONE, accelerator='F2', command=self.rename_one)
        self.context_menu.add_command(label=RENAME_GROUP, accelerator='Ctrl+R', command=self.rename_group)
        self.context_menu.add_separator()
        self.context_menu.add_command(label='Выделить всё', accelerator='Ctrl+A', command=self.select_all)
        self.context_menu.add_command(label=SELECT_BY_MASK, accelerator='Ctrl+F', command=self.select_by_mask)
        self.context_menu.add_separator()
        self.context_menu.add_command(label='Обновить', accelerator='F5', command=self.refresh)

    def build_toolbar(self) -> None:
        toolbar = ttk.Frame(self.root, padding=(6, 6, 6, 4))
        toolbar.pack(side='top', fill='x')
        ttk.Button(toolbar, text='Вверх', command=self.go_up).pack(side='left')
        ttk.Button(toolbar, text='Обновить', command=self.refresh).pack(side='left', padx=(4, 0))
        self.rename_button = ttk.Button(toolbar, text='Переименовать', command=self.rename_one)
        self.rename_button.pack(side='left', padx=(12, 0))
        self.group_button = ttk.Button(toolbar, text='Группа…', command=self.rename_group)
        self.group_button.pack(side='left', padx=(4, 0))
        ttk.Label(toolbar, text='Адрес:').pack(side='left', padx=(16, 4))
        ttk.Button(toolbar, text='Перейти', command=self.go_to_address).pack(side='right', padx=(4, 0))
        self.address_entry = ttk.Entry(toolbar, textvariable=self.address)
        self.address_entry.pack(side='left', fill='x', expand=True)
        self.address_entry.bind('<Return>', lambda event: self.go_to_address())

    def build_status(self) -> None:
        self.status = ttk.Label(self.root, text='', anchor='w', padding=(8, 4), relief='sunken')
        self.status.pack(side='bottom', fill='x')

    def build_list(self) -> None:
        linespace = tkfont.nametofont('TkDefaultFont').metrics('linespace')
        ttk.Style(self.root).configure('Treeview', rowheight=linespace + int(8 * self.scale))
        frame = ttk.Frame(self.root, padding=(6, 0, 6, 4))
        frame.pack(side='top', fill='both', expand=True)
        self.tree = ttk.Treeview(frame, columns=[key for key, _, _, _ in COLUMNS], selectmode='extended')
        self.tree.column('#0', width=int(420 * self.scale), anchor='w')
        self.tree.heading('#0', anchor='w', command=lambda: self.sort_by('name'))
        for key, _, width, anchor in COLUMNS:
            self.tree.heading(key, anchor=anchor, command=lambda key=key: self.sort_by(key))
            self.tree.column(key, width=int(width * self.scale), anchor=anchor, stretch=False)
        scrollbar = ttk.Scrollbar(frame, orient='vertical', command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.pack(side='left', fill='both', expand=True)
        scrollbar.pack(side='right', fill='y')
        self.update_columns()

        self.tree.bind('<Double-1>', self.on_double_click)
        self.tree.bind('<Return>', lambda event: self.open_selected())
        self.tree.bind('<F2>', lambda event: self.rename_one())
        self.tree.bind('<BackSpace>', lambda event: self.go_up())
        self.tree.bind('<Escape>', lambda event: self.clear_selection())
        self.tree.bind('<Button-3>', self.show_context_menu)
        self.tree.bind('<<TreeviewSelect>>', lambda event: self.on_select())

    def bind_keys(self) -> None:
        self.root.bind('<F5>', lambda event: self.refresh())
        self.root.bind('<F1>', lambda event: self.show_help())
        self.root.bind('<Control-KeyPress>', self.on_control_key)

    def on_control_key(self, event):
        action = CONTROL_KEYS.get(event.keycode)
        if action is None:
            return None
        if action == 'select_all' and event.widget is not self.tree:
            return None
        getattr(self, action)()
        return 'break'

    # --- список ---

    def open_directory(self, directory: str, select: tuple = ()) -> bool:
        try:
            entries = fileops.list_directory(directory)
        except FileError as error:
            messagebox.showerror(TITLE, str(error), parent=self.root)
            self.address.set(self.directory)
            return False
        if directory != self.directory:
            self.message = ''
        self.directory = directory
        self.entries = entries
        self.address.set(directory)
        self.address_entry.xview_moveto(1)
        self.root.title(TITLE + ' — ' + directory)
        self.show_entries(select)
        self.tree.focus_set()
        return True

    def refresh(self, select=None) -> None:
        if select is None:
            select = [entry.name for entry in self.selected_entries()]
        self.open_directory(self.directory, select)

    def sorted_entries(self) -> list:
        key = self.sort_key.get()
        descending = self.descending.get()
        entries = sorted(self.entries, key=lambda entry: entry.name.casefold(), reverse=descending and key == 'name')
        if key != 'name':
            entries.sort(key=lambda entry: getattr(entry, key), reverse=descending)
        entries.sort(key=lambda entry: not entry.is_dir)
        return entries

    def show_entries(self, select=None) -> None:
        if select is None:
            select = [entry.name for entry in self.selected_entries()]
        self.tree.delete(*self.tree.get_children())
        self.items = {}
        self.parent_item = None
        if os.path.dirname(self.directory) != self.directory:
            self.parent_item = self.tree.insert('', 'end', text=' ' + PARENT_NAME, image=self.folder_icon)
        for entry in self.sorted_entries():
            item = self.tree.insert('', 'end', text=' ' + entry.name,
                                    image=self.folder_icon if entry.is_dir else self.file_icon,
                                    values=('Каталог' if entry.is_dir else fileops.format_size(entry.size),
                                            fileops.format_date(entry.modified)))
            self.items[item] = entry
        chosen = [item for item, entry in self.items.items() if entry.name in select]
        self.tree.selection_set(chosen)
        focused = chosen[0] if chosen else next(iter(self.tree.get_children()), '')
        if focused:
            self.tree.focus(focused)
            self.tree.see(focused)
        self.update_headings()
        self.on_select()

    def update_headings(self) -> None:
        arrow = ' ▼' if self.descending.get() else ' ▲'
        titles = [('#0', 'name', 'Имя')] + [(key, key, title) for key, title, _, _ in COLUMNS]
        for column, key, title in titles:
            self.tree.heading(column, text=title + (arrow if key == self.sort_key.get() else ''))

    def update_columns(self) -> None:
        self.tree.configure(displaycolumns=[key for key, _, _, _ in COLUMNS if self.visible[key].get()])

    def sort_by(self, key: str) -> None:
        if self.sort_key.get() == key:
            self.descending.set(not self.descending.get())
        else:
            self.sort_key.set(key)
            self.descending.set(False)
        self.show_entries()

    def selected_entries(self) -> list:
        return [self.items[item] for item in self.tree.selection() if item in self.items]

    def selected_files(self) -> list:
        return [entry for entry in self.selected_entries() if not entry.is_dir]

    def on_select(self) -> None:
        selection = self.tree.selection()
        files = self.selected_files()
        one = 'normal' if len(selection) == 1 and len(files) == 1 else 'disabled'
        group = 'normal' if files else 'disabled'
        folder = 'normal' if len(selection) == 1 and not files else 'disabled'
        for menu in (self.edit_menu, self.context_menu):
            menu.entryconfigure(RENAME_ONE, state=one)
            menu.entryconfigure(RENAME_GROUP, state=group)
        self.context_menu.entryconfigure('Открыть каталог', state=folder)
        self.rename_button.state(['!disabled'] if one == 'normal' else ['disabled'])
        self.group_button.state(['!disabled'] if group == 'normal' else ['disabled'])
        self.update_status()

    def update_status(self) -> None:
        text = 'Всего: ' + fileops.entries_text(self.entries)
        selected = self.selected_entries()
        if selected:
            text += '      Выделено: ' + fileops.entries_text(selected)
        if self.message:
            text += '      ' + self.message
        self.status.configure(text=text)

    def show_message(self, text: str) -> None:
        if self.message_timer is not None:
            self.root.after_cancel(self.message_timer)
        self.message = text
        self.update_status()
        self.message_timer = self.root.after(MESSAGE_TIME, self.clear_message)

    def clear_message(self) -> None:
        self.message_timer = None
        self.message = ''
        self.update_status()

    def select_all(self) -> None:
        self.tree.selection_set(list(self.items))

    def clear_selection(self) -> None:
        self.tree.selection_remove(self.tree.selection())

    def select_by_mask(self) -> None:
        found = MaskDialog(self.root, self.entries).show()
        if found is None:
            return
        matched = [item for item, entry in self.items.items() if entry in found]
        self.tree.selection_set(matched)
        self.tree.focus(matched[0])
        self.tree.see(matched[0])
        self.tree.focus_set()

    # --- переход по каталогам ---

    def go_up(self) -> None:
        parent = os.path.dirname(self.directory)
        if parent != self.directory:
            self.open_directory(parent, [os.path.basename(self.directory)])

    def go_to_address(self) -> None:
        try:
            directory = fileops.resolve_directory(self.directory, self.address.get().strip())
        except FileError as error:
            messagebox.showerror(TITLE, str(error), parent=self.root)
            self.address.set(self.directory)
            return
        self.open_directory(directory)

    def choose_directory(self) -> None:
        directory = filedialog.askdirectory(parent=self.root, initialdir=self.directory, title='Выберите каталог')
        if directory:
            self.open_directory(os.path.normpath(directory))

    def on_double_click(self, event) -> None:
        if self.tree.identify_region(event.x, event.y) in ('tree', 'cell'):
            self.open_selected()

    def open_selected(self) -> None:
        selection = self.tree.selection()
        if len(selection) != 1:
            return
        if selection[0] == self.parent_item:
            self.go_up()
        elif self.items[selection[0]].is_dir:
            self.open_directory(self.items[selection[0]].path)
        else:
            self.rename_one()

    def show_context_menu(self, event) -> None:
        item = self.tree.identify_row(event.y)
        if item and item not in self.tree.selection():
            self.tree.selection_set(item)
            self.tree.focus(item)
        self.tree.focus_set()
        self.context_menu.tk_popup(event.x_root, event.y_root)

    # --- переименование ---

    def rename_one(self) -> None:
        selected = self.selected_entries()
        if len(selected) != 1:
            self.show_message('Выделите один файл.')
            return
        if selected[0].is_dir:
            self.show_message('Каталоги программа не переименовывает.')
            return
        changes = RenameDialog(self.root, self.entries, selected[0]).show()
        if changes:
            self.apply(changes)

    def rename_group(self) -> None:
        files = self.selected_files()
        if not files:
            self.show_message('Выделите файлы: мышью с Ctrl или Shift либо командой «' + SELECT_BY_MASK + '».')
            return
        changes = GroupDialog(self.root, self.entries, files).show()
        if changes:
            self.apply(changes)

    def apply(self, changes: list) -> None:
        try:
            fileops.apply_plan(self.directory, changes)
        except FileError as error:
            messagebox.showerror(TITLE, str(error), parent=self.root)
            self.refresh()
            return
        self.refresh([step.new for step in changes])
        text = fileops.renamed_text(len(changes))
        if len(changes) == 1:
            text += ': ' + changes[0].old + ' → ' + changes[0].new
        self.show_message(text + '.')

    # --- справка ---

    def show_help(self) -> None:
        HelpWindow(self.root).show()

    def show_about(self) -> None:
        messagebox.showinfo('О программе', TITLE + '\n\nЛабораторная работа № 2, вариант 1:\n'
                            'переименование файла.\nПарадигма интерфейса — меню.', parent=self.root)


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
