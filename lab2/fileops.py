"""Общая часть обеих программ: чтение каталога, маски имён, переименование файлов."""

import os
import re
from dataclasses import dataclass
from datetime import datetime

FORBIDDEN_CHARS = '\\/:*?"<>|'
RESERVED_NAMES = {'CON', 'PRN', 'AUX', 'NUL'} | {
    port + str(number) for port in ('COM', 'LPT') for number in range(1, 10)
}
MAX_NAME_LENGTH = 255


class FileError(Exception):
    """Ошибка, текст которой показывается пользователю без изменений."""


@dataclass(frozen=True)
class Entry:
    name: str
    path: str
    is_dir: bool
    size: int
    modified: datetime


@dataclass(frozen=True)
class Rename:
    old: str
    new: str


# --- каталог ---------------------------------------------------------------

def list_directory(directory: str) -> list[Entry]:
    entries = []
    try:
        with os.scandir(directory) as scan:
            for item in scan:
                try:
                    info = item.stat()
                    is_dir = item.is_dir()
                    modified = datetime.fromtimestamp(info.st_mtime)
                except (OSError, ValueError, OverflowError):
                    continue
                entries.append(Entry(item.name, item.path, is_dir, 0 if is_dir else info.st_size, modified))
    except FileNotFoundError:
        raise FileError('Каталог не найден: ' + directory) from None
    except PermissionError:
        raise FileError('Нет доступа к каталогу: ' + directory) from None
    except OSError as error:
        raise FileError('Не удалось прочитать каталог: ' + (error.strerror or str(error))) from None
    entries.sort(key=lambda entry: (not entry.is_dir, entry.name.casefold()))
    return entries


def resolve_directory(current: str, target: str) -> str:
    """Путь каталога по тому, что ввёл пользователь: относительный или абсолютный."""
    if len(target) == 2 and target[1] == ':':
        target += os.sep
    path = os.path.normpath(os.path.join(current, target))
    if not os.path.exists(path):
        raise FileError('Каталог не найден: ' + target)
    if not os.path.isdir(path):
        raise FileError('Это файл, а не каталог: ' + target)
    try:
        os.scandir(path).close()
    except OSError:
        raise FileError('Нет доступа к каталогу: ' + target) from None
    return os.path.realpath(path)


def find_entry(entries: list[Entry], name: str) -> Entry | None:
    for entry in entries:
        if entry.name.casefold() == name.casefold():
            return entry
    return None


# --- маски -----------------------------------------------------------------

def is_mask(text: str) -> bool:
    return '*' in text or '?' in text


def mask_regex(mask: str) -> re.Pattern:
    parts = []
    for char in mask:
        if char == '*':
            parts.append('(.*)')
        elif char == '?':
            parts.append('(.)')
        else:
            parts.append(re.escape(char))
    return re.compile(''.join(parts), re.IGNORECASE | re.DOTALL)


def matches(name: str, mask: str) -> bool:
    return mask_regex(mask).fullmatch(name) is not None


def select(entries: list[Entry], mask: str, files_only: bool = False) -> list[Entry]:
    return [entry for entry in entries
            if matches(entry.name, mask) and not (files_only and entry.is_dir)]


def substitute(name: str, mask: str, new_mask: str) -> str:
    """Имя по новой маске: каждый знак * и ? в ней заменяется тем, что совпало
    с таким же по счёту знаком исходной маски."""
    found = mask_regex(mask).fullmatch(name)
    wildcards = [char for char in mask if char in '*?']
    captured = {'*': [], '?': []}
    for char, text in zip(wildcards, found.groups()):
        captured[char].append(text)
    stars, marks = iter(captured['*']), iter(captured['?'])
    return ''.join(next(stars) if char == '*' else next(marks) if char == '?' else char
                   for char in new_mask)


# --- план переименования ---------------------------------------------------

def plan_rename(entries: list[Entry], source: str, target: str) -> list[Rename]:
    """План команды ren: имя и новое имя либо маска и новая маска."""
    for text in (source, target):
        if '\\' in text or '/' in text:
            raise FileError('Имя указывается без пути, команда работает в текущем каталоге: ' + text)
    if not is_mask(source):
        entry = find_entry(entries, source)
        if entry is None:
            raise FileError('Файл не найден: ' + source)
        if entry.is_dir:
            raise FileError('Это каталог, а не файл: ' + entry.name)
        if is_mask(target):
            raise FileError('Знаки * и ? в новом имени допустимы только вместе с маской: ' + target)
        return [Rename(entry.name, target)]
    for char in '*?':
        if target.count(char) > source.count(char):
            raise FileError('В новой маске знаков ' + char + ' больше, чем в исходной: ' + target)
    files = select(entries, source, files_only=True)
    if not files:
        raise FileError('Нет файлов, соответствующих маске: ' + source)
    return [Rename(entry.name, substitute(entry.name, source, target)) for entry in files]


def add_prefix(name: str, text: str) -> str:
    return text + name


def add_suffix(name: str, text: str) -> str:
    base, extension = os.path.splitext(name)
    return base + text + extension


def change_extension(name: str, extension: str) -> str:
    extension = extension.strip().lstrip('.')
    base = os.path.splitext(name)[0]
    return base + '.' + extension if extension else base


def validate_name(name: str) -> None:
    if name == '':
        raise FileError('Новое имя не задано.')
    if any(char in FORBIDDEN_CHARS or ord(char) < 32 for char in name):
        problem = 'Нельзя использовать символы \\ / : * ? " < > |'
    elif name[-1] in ' .':
        problem = 'Имя не может заканчиваться точкой или пробелом.'
    elif name.split('.')[0].strip().upper() in RESERVED_NAMES:
        problem = 'Это имя зарезервировано системой.'
    elif len(name) > MAX_NAME_LENGTH:
        problem = 'Имя длиннее ' + str(MAX_NAME_LENGTH) + ' символов.'
    else:
        return
    raise FileError('Недопустимое имя файла: ' + name + '. ' + problem)


def check_plan(entries: list[Entry], plan: list[Rename]) -> list[Rename]:
    """Проверяет план целиком и возвращает шаги, в которых имя действительно меняется.
    Любая проблема отменяет всё переименование, поэтому файлы не трогаются до конца проверки."""
    changes = [step for step in plan if step.new != step.old]
    if not changes:
        if len(plan) == 1:
            raise FileError('Новое имя совпадает со старым: ' + plan[0].old)
        raise FileError('Новые имена совпадают со старыми, переименовывать нечего.')
    existing = {entry.name.casefold(): entry for entry in entries}
    targets = {}
    for step in changes:
        validate_name(step.new)
        key = step.new.casefold()
        if key in targets:
            raise FileError('Файлы ' + targets[key] + ' и ' + step.old + ' получили бы одно имя '
                            + step.new + '. Переименование отменено.')
        targets[key] = step.old
        if key in existing and key != step.old.casefold():
            kind = 'Каталог' if existing[key].is_dir else 'Файл'
            raise FileError(kind + ' с именем ' + step.new + ' уже существует. Переименование отменено.')
    return changes


def apply_plan(directory: str, changes: list[Rename]) -> None:
    """Переименовывает файлы; при сбое возвращает прежние имена уже переименованным."""
    done = []
    for step in changes:
        source = os.path.join(directory, step.old)
        target = os.path.join(directory, step.new)
        try:
            if step.old.casefold() != step.new.casefold() and os.path.lexists(target):
                raise FileExistsError(target)
            os.rename(source, target)
        except OSError as error:
            stuck = _roll_back(directory, done)
            message = 'Не удалось переименовать ' + step.old + ': ' + _reason(error) + '. Переименование отменено.'
            if stuck:
                message += ' Прежние имена не возвращены: ' + ', '.join(stuck) + '.'
            raise FileError(message) from None
        done.append(step)


def _roll_back(directory: str, done: list[Rename]) -> list[str]:
    stuck = []
    for step in reversed(done):
        try:
            os.rename(os.path.join(directory, step.new), os.path.join(directory, step.old))
        except OSError:
            stuck.append(step.new)
    return stuck


def _reason(error: OSError) -> str:
    if isinstance(error, FileExistsError):
        return 'такое имя уже занято'
    if isinstance(error, FileNotFoundError):
        return 'файл не найден, возможно, он уже переименован или удалён'
    if isinstance(error, PermissionError):
        return 'нет доступа или файл открыт в другой программе'
    return error.strerror or str(error)


# --- текст для вывода ------------------------------------------------------

def format_size(size: int) -> str:
    if size < 1024:
        return str(size) + ' Б'
    value = float(size)
    for unit in ('КБ', 'МБ', 'ГБ'):
        value /= 1024
        if value < 1024 or unit == 'ГБ':
            break
    text = ('%.1f' % value).replace('.', ',')
    return (text[:-2] if text.endswith(',0') else text) + ' ' + unit


def format_date(moment: datetime) -> str:
    return moment.strftime('%d.%m.%Y %H:%M')


def plural(count: int, one: str, few: str, many: str) -> str:
    if 11 <= count % 100 <= 14:
        return many
    if count % 10 == 1:
        return one
    if 2 <= count % 10 <= 4:
        return few
    return many


def files_text(count: int) -> str:
    return str(count) + ' ' + plural(count, 'файл', 'файла', 'файлов')


def folders_text(count: int) -> str:
    return str(count) + ' ' + plural(count, 'каталог', 'каталога', 'каталогов')


def entries_text(entries: list[Entry]) -> str:
    folders = sum(1 for entry in entries if entry.is_dir)
    files = len(entries) - folders
    parts = []
    if folders:
        parts.append(folders_text(folders))
    if files:
        parts.append(files_text(files))
    return ', '.join(parts) if parts else 'ничего'


def renamed_text(count: int) -> str:
    return plural(count, 'Переименован ', 'Переименовано ', 'Переименовано ') + files_text(count)
