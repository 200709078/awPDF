import { expect, test } from '@playwright/test';
import { LARGE_FILE_WARNING_BYTES, formatMegabytes, needsLargeFileWarning } from '../src/core/open-policy';
import { TOOLS } from '../src/tools';

test('her aracın kimliği tektir', () => {
  const ids = TOOLS.map(tool => tool.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('bir kısayol iki araca bağlanmaz', () => {
  const shortcuts = TOOLS.flatMap(tool => tool.shortcuts ?? []);
  expect(new Set(shortcuts).size).toBe(shortcuts.length);
});

test('büyük dosya uyarısı tam 200 MB\'ın üstünde başlar', () => {
  expect(LARGE_FILE_WARNING_BYTES).toBe(200 * 1024 * 1024);
  expect(needsLargeFileWarning(LARGE_FILE_WARNING_BYTES)).toBe(false);
  expect(needsLargeFileWarning(LARGE_FILE_WARNING_BYTES + 1)).toBe(true);
});

test('boyut Türkçe biçimde yazılır', () => {
  expect(formatMegabytes(1536 * 1024 * 1024)).toBe('1.536 MB');
});
