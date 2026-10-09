"""Управление файловым каталогом на командном языке: dir, cd, ren, help, exit."""

import ctypes
import os
import sys

import fileops
from fileops import FileError

TITLE = 'Управление файлами — командный язык'

COMMANDS = ['dir', 'cd', 'ren', 'help', 'exit']

SUMMARY = [
    ('dir [маска]', 'содержимое текущего каталога или проверка маски'),
    ('cd [путь]', 'смена текущего каталога'),
    ('ren <имя> <новое-имя>', 'переименование одного файла'),
    ('ren <маска> <новая-маска>', 'переименование группы файлов'),
    ('help [команда]', 'справка'),
    ('exit', 'выход'),
]

GENERAL_HELP = (
    'Маска: * — любое число любых символов, ? — ровно один символ.\n'
    '  *.txt           все файлы с расширением txt\n'
    '  IMG_*           имена, которые начинаются на IMG_\n'
    '  отчёт_?.docx    отчёт_1.docx, отчёт_2.docx и т. п.\n'
    'В новой маске знаки * и ? заменяются тем, что совпало с такими же\n'
    'знаками исходной маски: ren *.txt *.md, ren IMG_*.jpg отпуск_*.jpg\n'
    'Имена с пробелами заключаются в кавычки: ren "мой файл.txt" план.txt\n'
    'Регистр букв в командах и именах не учитывается.'
)

HELP = {
    'dir': (
        ['dir [маска]'],
        'Выводит содержимое текущего каталога: сначала каталоги (с \\ в конце имени),\n'
        'затем файлы; для каждого объекта — размер и время изменения.\n'
        'Если указана маска, выводятся только подходящие под неё объекты. Так можно\n'
        'проверить маску перед переименованием группы файлов.',
        ['dir', 'dir *.txt', 'dir IMG_*', 'dir отчёт_?.docx'],
    ),
    'cd': (
        ['cd [путь]'],
        'Делает текущим указанный каталог. Путь может быть относительным или абсолютным:\n'
        '.. — на уровень выше, \\ — корень диска, D: — диск D.\n'
        'Без параметра выводит текущий каталог.',
        ['cd Фото', 'cd ..', 'cd "Мои документы"', 'cd C:\\Users'],
    ),
    'ren': (
        ['ren <имя> <новое-имя>', 'ren <маска> <новая-маска>'],
        'Переименовывает один файл или группу файлов текущего каталога.\n'
        'Каталоги команда не переименовывает.\n'
        'Каждый знак * и ? новой маски заменяется тем, что совпало с таким же по счёту\n'
        'знаком исходной маски, остальные символы новой маски переносятся в имя как есть.\n'
        'Сначала проверяются все новые имена. Если хотя бы одно из них занято или\n'
        'недопустимо, не переименовывается ни один файл.',
        ['ren заметки.txt записи.txt', 'ren "список покупок.txt" покупки.txt', 'ren *.txt *.md',
         'ren IMG_*.jpg отпуск_*.jpg', 'ren * старое_*', 'ren отчёт_?.docx отчёт_2026_?.docx'],
    ),
    'help': (
        ['help [команда]'],
        'Без параметра выводит список команд, с параметром — справку по команде.',
        ['help', 'help ren'],
    ),
    'exit': (
        ['exit'],
        'Завершает работу программы.',
        ['exit'],
    ),
}


def split_words(line: str) -> list[str]:
    words = []
    word = ''
    quoted = False
    started = False
    for char in line:
        if char == '"':
            quoted = not quoted
            started = True
        elif char.isspace() and not quoted:
            if started:
                words.append(word)
            word = ''
            started = False
        else:
            word += char
            started = True
    if quoted:
        raise FileError('Не закрыта кавычка. Имя с пробелами пишется так: "мой файл.txt"')
    if started:
        words.append(word)
    return words


def display_name(entry: fileops.Entry) -> str:
    return entry.name + ('\\' if entry.is_dir else '')


def print_entries(entries: list[fileops.Entry]) -> None:
    width = max(len('Имя'), *(len(display_name(entry)) for entry in entries))
    print('Имя'.ljust(width) + '  ' + 'Размер'.rjust(9) + '  ' + 'Изменён')
    for entry in entries:
        size = '<каталог>' if entry.is_dir else fileops.format_size(entry.size)
        print(display_name(entry).ljust(width) + '  ' + size.rjust(9) + '  ' + fileops.format_date(entry.modified))


class Shell:
    def __init__(self, directory: str, echo: bool):
        self.directory = directory
        self.echo = echo
        self.running = True

    def run(self) -> None:
        print('Управление файловым каталогом. Командный язык.')
        print('Введите help, чтобы увидеть список команд.')
        print()
        while self.running:
            try:
                line = input(self.directory + '> ')
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if self.echo:
                print(line)
            self.execute(line)

    def execute(self, line: str) -> None:
        try:
            words = split_words(line)
            if not words:
                return
            verb = words[0].lower()
            if verb not in COMMANDS:
                raise FileError('Неизвестная команда: ' + words[0] + '. Введите help.')
            getattr(self, 'do_' + verb)(words[1:])
        except FileError as error:
            print(error)
        if self.running:
            print()

    def do_dir(self, words: list[str]) -> None:
        if len(words) > 1:
            raise FileError('Команда dir принимает одну маску. Имя с пробелами заключите в кавычки.')
        mask = words[0] if words else None
        if mask is not None and ('\\' in mask or '/' in mask):
            raise FileError('Маска указывается без пути, команда работает в текущем каталоге: ' + mask)
        entries = fileops.list_directory(self.directory)
        if mask is not None:
            entries = fileops.select(entries, mask)
            if not entries:
                raise FileError('Нет файлов, соответствующих маске: ' + mask)
        print('Каталог ' + self.directory + (', маска ' + mask if mask is not None else ''))
        print()
        if not entries:
            print('Каталог пуст.')
            return
        print_entries(entries)
        print()
        print(('Подходит под маску: ' if mask is not None else 'Всего: ') + fileops.entries_text(entries) + '.')

    def do_cd(self, words: list[str]) -> None:
        if not words:
            print(self.directory)
            return
        if len(words) > 1:
            raise FileError('Команда cd принимает один путь. Путь с пробелами заключите в кавычки.')
        self.directory = fileops.resolve_directory(self.directory, words[0])

    def do_ren(self, words: list[str]) -> None:
        if len(words) != 2:
            raise FileError('Команде ren нужны два параметра: что переименовать и новое имя. Справка: help ren.')
        entries = fileops.list_directory(self.directory)
        plan = fileops.plan_rename(entries, words[0], words[1])
        changes = fileops.check_plan(entries, plan)
        fileops.apply_plan(self.directory, changes)
        for step in changes:
            print(step.old + ' → ' + step.new)
        print(fileops.renamed_text(len(changes)) + '.')
        if len(changes) < len(plan):
            print('Имя не изменилось: ' + fileops.files_text(len(plan) - len(changes)) + '.')

    def do_help(self, words: list[str]) -> None:
        if not words:
            print('Команды:')
            for usage, purpose in SUMMARY:
                print('  ' + usage.ljust(28) + purpose)
            print()
            print(GENERAL_HELP)
            print()
            print('Подробнее о команде: help <команда>')
            return
        verb = words[0].lower()
        if verb not in COMMANDS:
            raise FileError('Неизвестная команда: ' + words[0] + '. Введите help.')
        usages, description, examples = HELP[verb]
        print('Формат:')
        for usage in usages:
            print('  ' + usage)
        print()
        print(description)
        print()
        print('Примеры:')
        for example in examples:
            print('  ' + example)

    def do_exit(self, words: list[str]) -> None:
        self.running = False


def main() -> int:
    for stream in (sys.stdin, sys.stdout):
        if not stream.isatty():
            stream.reconfigure(encoding='utf-8')
    directory = os.path.realpath(os.getcwd())
    if len(sys.argv) > 1:
        try:
            directory = fileops.resolve_directory(directory, sys.argv[1])
        except FileError as error:
            print(error)
            return 1
    if os.name == 'nt' and sys.stdout.isatty():
        ctypes.windll.kernel32.SetConsoleTitleW(TITLE)
    Shell(directory, echo=not sys.stdin.isatty()).run()
    return 0


if __name__ == '__main__':
    sys.exit(main())
