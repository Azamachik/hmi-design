"""Создаёт тестовый каталог demo для проверки обеих программ."""

import os
import sys
from datetime import datetime

FILES = [
    ('data_2024.csv', 48_300, '14.01.2025 10:20'),
    ('data_2025.csv', 52_100, '12.01.2026 09:45'),
    ('readme.md', 2_900, '03.09.2026 16:30'),
    ('readme.txt', 2_400, '15.06.2026 12:00'),
    ('заметки.txt', 3_200, '05.10.2026 09:12'),
    ('отчёт_1.docx', 118_000, '20.09.2026 18:40'),
    ('отчёт_2.docx', 96_500, '27.09.2026 19:05'),
    ('отчёт_3.docx', 134_200, '04.10.2026 17:55'),
    ('план.txt', 1_800, '01.10.2026 10:30'),
    ('презентация.pptx', 620_000, '24.09.2026 21:15'),
    ('список покупок.txt', 640, '08.10.2026 19:03'),
    ('черновик.tmp', 0, '02.10.2026 11:47'),
    ('Архив/отчёт_2025.docx', 87_000, '18.12.2025 14:10'),
    ('Документы/договор.pdf', 340_000, '10.09.2026 15:20'),
    ('Документы/резюме.docx', 64_000, '01.09.2026 11:00'),
    ('Фото/IMG_0001.jpg', 348_000, '07.07.2026 13:45'),
    ('Фото/IMG_0002.jpg', 312_000, '07.07.2026 13:46'),
    ('Фото/IMG_0003.jpg', 365_000, '07.07.2026 13:48'),
    ('Фото/IMG_0004.jpg', 331_000, '08.07.2026 09:02'),
]

FOLDER_DATES = {
    'Архив': '18.12.2025 14:10',
    'Документы': '10.09.2026 15:20',
    'Фото': '08.07.2026 09:02',
}

TEXT_EXTENSIONS = ('.txt', '.md', '.csv')


def set_time(path: str, moment: str) -> None:
    timestamp = datetime.strptime(moment, '%d.%m.%Y %H:%M').timestamp()
    os.utime(path, (timestamp, timestamp))


def make_file(path: str, size: int, moment: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as file:
        if path.endswith(TEXT_EXTENSIONS):
            line = ('Строка файла ' + os.path.basename(path) + '\n').encode('utf-8')
            file.write((line * (size // len(line) + 1))[:size])
        else:
            file.write(bytes(size))
    set_time(path, moment)


def build(target: str) -> None:
    for name, size, moment in FILES:
        make_file(os.path.join(target, *name.split('/')), size, moment)
    for name, moment in FOLDER_DATES.items():
        set_time(os.path.join(target, name), moment)


def clear(target: str) -> None:
    """Удаляет содержимое каталога. Сам каталог и подкаталоги, открытые в другой программе
    (например, в Проводнике), остаются на месте: они уже пусты и будут заполнены заново."""
    for folder, folders, files in os.walk(target, topdown=False):
        for name in files:
            os.remove(os.path.join(folder, name))
        for name in folders:
            try:
                os.rmdir(os.path.join(folder, name))
            except OSError:
                pass


def main() -> int:
    if len(sys.argv) > 1:
        target = os.path.abspath(sys.argv[1])
        if os.path.exists(target) and (not os.path.isdir(target) or os.listdir(target)):
            print('Каталог уже существует и не пуст, укажите другой путь: ' + target)
            return 1
    else:
        # каталог demo рядом со скриптом принадлежит ему и заполняется заново
        target = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'demo')
        try:
            clear(target)
        except OSError as error:
            print('Не удалось очистить каталог ' + target + ': ' + (error.strerror or str(error)))
            return 1
    build(target)
    print('Тестовый каталог создан: ' + target)
    return 0


if __name__ == '__main__':
    sys.exit(main())
