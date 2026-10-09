"""Тесты общего модуля. Запуск: python -m unittest test_fileops"""

import os
import tempfile
import unittest
from unittest import mock

import fileops
from fileops import FileError, Rename


class DirectoryCase(unittest.TestCase):
    FILES = ['a.txt', 'b.txt', 'b.md', 'IMG_01.jpg', 'IMG_02.jpg', 'мой файл.txt']
    FOLDERS = ['Фото', 'a.dir']

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.directory = os.path.realpath(temp.name)
        for name in self.FILES:
            with open(os.path.join(self.directory, name), 'w', encoding='utf-8') as file:
                file.write(name)
        for name in self.FOLDERS:
            os.mkdir(os.path.join(self.directory, name))

    def entries(self):
        return fileops.list_directory(self.directory)

    def names(self):
        return sorted(os.listdir(self.directory))

    def rename(self, source, target):
        entries = self.entries()
        changes = fileops.check_plan(entries, fileops.plan_rename(entries, source, target))
        fileops.apply_plan(self.directory, changes)
        return changes

    def assert_error(self, text, function, *arguments):
        with self.assertRaises(FileError) as caught:
            function(*arguments)
        self.assertEqual(str(caught.exception), text)


class ListingTest(DirectoryCase):
    def test_folders_go_first_then_names_without_case(self):
        names = [entry.name for entry in self.entries()]
        self.assertEqual(names, ['a.dir', 'Фото', 'a.txt', 'b.md', 'b.txt', 'IMG_01.jpg', 'IMG_02.jpg', 'мой файл.txt'])

    def test_missing_directory(self):
        missing = os.path.join(self.directory, 'нет')
        self.assert_error('Каталог не найден: ' + missing, fileops.list_directory, missing)

    def test_resolve_relative_parent_and_absolute(self):
        photos = fileops.resolve_directory(self.directory, 'фото')
        self.assertEqual(photos, os.path.join(self.directory, 'Фото'))
        self.assertEqual(fileops.resolve_directory(photos, '..'), self.directory)
        self.assertEqual(fileops.resolve_directory(photos, self.directory), self.directory)

    def test_resolve_errors(self):
        self.assert_error('Каталог не найден: Нет', fileops.resolve_directory, self.directory, 'Нет')
        self.assert_error('Это файл, а не каталог: a.txt', fileops.resolve_directory, self.directory, 'a.txt')


class MaskTest(unittest.TestCase):
    def test_matches(self):
        self.assertTrue(fileops.matches('report.TXT', '*.txt'))
        self.assertTrue(fileops.matches('a.txt', '?.txt'))
        self.assertFalse(fileops.matches('ab.txt', '?.txt'))
        self.assertTrue(fileops.matches('.txt', '*.txt'))
        self.assertFalse(fileops.matches('a.txt.bak', '*.txt'))
        self.assertTrue(fileops.matches('a[1].txt', 'a[1].*'))

    def test_substitute(self):
        self.assertEqual(fileops.substitute('a.txt', '*.txt', '*.md'), 'a.md')
        self.assertEqual(fileops.substitute('IMG_01.jpg', 'IMG_*.jpg', 'отпуск_*.jpg'), 'отпуск_01.jpg')
        self.assertEqual(fileops.substitute('a.b.txt', '*.*', '*.bak'), 'a.b.bak')
        self.assertEqual(fileops.substitute('x1-report.txt', '?1-*.txt', '*_?.txt'), 'report_x.txt')
        self.assertEqual(fileops.substitute('a.txt', '*.txt', 'все.txt'), 'все.txt')

    def test_transforms(self):
        self.assertEqual(fileops.add_prefix('a.txt', 'new_'), 'new_a.txt')
        self.assertEqual(fileops.add_suffix('a.tar.gz', '_old'), 'a.tar_old.gz')
        self.assertEqual(fileops.add_suffix('README', '_old'), 'README_old')
        self.assertEqual(fileops.replace_text('IMG_01.jpg', 'img_', 'фото '), 'фото 01.jpg')
        self.assertEqual(fileops.replace_text('a.txt', '', 'x'), 'a.txt')
        self.assertEqual(fileops.change_extension('a.txt', '.md'), 'a.md')
        self.assertEqual(fileops.change_extension('README', 'md'), 'README.md')
        self.assertEqual(fileops.change_extension('a.txt', ''), 'a')


class RenameTest(DirectoryCase):
    def test_single_file(self):
        self.assertEqual(self.rename('A.TXT', 'c.txt'), [Rename('a.txt', 'c.txt')])
        self.assertIn('c.txt', self.names())
        self.assertNotIn('a.txt', self.names())

    def test_group_by_mask(self):
        changes = self.rename('IMG_*.jpg', 'отпуск_*.jpg')
        self.assertEqual(changes, [Rename('IMG_01.jpg', 'отпуск_01.jpg'), Rename('IMG_02.jpg', 'отпуск_02.jpg')])
        self.assertIn('отпуск_02.jpg', self.names())

    def test_mask_skips_folders(self):
        self.assertEqual(self.rename('a.*', 'z.*'), [Rename('a.txt', 'z.txt')])
        self.assertIn('a.dir', self.names())

    def test_case_only_change(self):
        self.rename('a.txt', 'A.TXT')
        self.assertIn('A.TXT', self.names())

    def test_errors_from_the_agreed_table(self):
        self.assert_error('Файл не найден: нет.txt', self.rename, 'нет.txt', 'x.txt')
        self.assert_error('Нет файлов, соответствующих маске: *.xyz', self.rename, '*.xyz', '*.abc')
        self.assert_error('Нет файлов, соответствующих маске: Фот*', self.rename, 'Фот*', 'x*')
        self.assert_error('Файл с именем b.txt уже существует. Переименование отменено.', self.rename, 'a.txt', 'b.txt')

    def test_other_errors(self):
        self.assert_error('Это каталог, а не файл: Фото', self.rename, 'фото', 'x')
        self.assert_error('Каталог с именем фото уже существует. Переименование отменено.',
                          self.rename, 'a.txt', 'фото')
        self.assert_error('Новое имя совпадает со старым: a.txt', self.rename, 'a.txt', 'a.txt')
        self.assert_error('В новой маске знаков * больше, чем в исходной: *_*.txt', self.rename, '*.txt', '*_*.txt')
        self.assert_error('Знаки * и ? в новом имени допустимы только вместе с маской: *.md',
                          self.rename, 'a.txt', '*.md')
        self.assert_error('Недопустимое имя файла: a:b. Нельзя использовать символы \\ / : * ? " < > |',
                          self.rename, 'a.txt', 'a:b')
        self.assert_error('Недопустимое имя файла: x.. Имя не может заканчиваться точкой или пробелом.',
                          self.rename, 'a.txt', 'x.')
        self.assert_error('Недопустимое имя файла: con.txt. Это имя зарезервировано системой.',
                          self.rename, 'a.txt', 'con.txt')
        self.assert_error('Имя указывается без пути, команда работает в текущем каталоге: Фото\\a.txt',
                          self.rename, 'Фото\\a.txt', 'b')

    def test_conflict_cancels_the_whole_group(self):
        before = self.names()
        self.assert_error('Файл с именем b.md уже существует. Переименование отменено.', self.rename, '*.txt', '*.md')
        self.assert_error('Файлы IMG_01.jpg и IMG_02.jpg получили бы одно имя фото.jpg. Переименование отменено.',
                          self.rename, 'IMG_*.jpg', 'фото.jpg')
        self.assertEqual(self.names(), before)

    def test_failure_in_the_middle_restores_names(self):
        before = self.names()
        real_rename = os.rename

        def failing_rename(source, target):
            if os.path.basename(source) == 'IMG_02.jpg':
                raise PermissionError(13, 'Отказано в доступе')
            real_rename(source, target)

        with mock.patch('fileops.os.rename', failing_rename):
            self.assert_error('Не удалось переименовать IMG_02.jpg: нет доступа или файл открыт в другой программе. '
                              'Переименование отменено.', self.rename, 'IMG_*.jpg', 'x_*.jpg')
        self.assertEqual(self.names(), before)


class TextTest(unittest.TestCase):
    def test_sizes(self):
        self.assertEqual(fileops.format_size(0), '0 Б')
        self.assertEqual(fileops.format_size(1023), '1023 Б')
        self.assertEqual(fileops.format_size(1024), '1 КБ')
        self.assertEqual(fileops.format_size(1536), '1,5 КБ')
        self.assertEqual(fileops.format_size(5 * 1024 ** 2), '5 МБ')

    def test_counts(self):
        self.assertEqual(fileops.renamed_text(1), 'Переименован 1 файл')
        self.assertEqual(fileops.renamed_text(3), 'Переименовано 3 файла')
        self.assertEqual(fileops.renamed_text(11), 'Переименовано 11 файлов')
        self.assertEqual(fileops.renamed_text(21), 'Переименован 21 файл')


if __name__ == '__main__':
    unittest.main()
