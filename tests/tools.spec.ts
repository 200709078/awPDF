import { expect, test } from '@playwright/test';
import { LARGE_FILE_WARNING_BYTES, formatMegabytes, needsLargeFileWarning } from '../src/core/open-policy';
import { isOpenableLink } from '../src/core/links';
import { foldTurkish } from '../src/core/turkish-search';
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

test('Türkçe I harfleri tek harfe iner, uzunluk değişmez', () => {
  const text = 'ISI ısı İZMİR izmir';
  expect(foldTurkish(text)).toBe('iSi isi iZMiR izmir');
  expect(foldTurkish(text).length).toBe(text.length);
});

test('yalnız web ve e-posta bağlantıları uygulamadan çıkar', () => {
  expect(isOpenableLink('https://madematik.com/')).toBe(true);
  expect(isOpenableLink('http://madematik.com/')).toBe(true);
  expect(isOpenableLink('mailto:a@b.co')).toBe(true);
  expect(isOpenableLink('file:///etc/passwd')).toBe(false);
  expect(isOpenableLink('javascript:alert(1)')).toBe(false);
  expect(isOpenableLink('ftp://madematik.com/')).toBe(false);
  expect(isOpenableLink('bu bir adres değil')).toBe(false);
});
