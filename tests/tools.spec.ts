import { expect, test } from '@playwright/test';
import { LARGE_FILE_WARNING_BYTES, formatMegabytes, needsLargeFileWarning } from '../src/core/open-policy';
import { isOpenableLink } from '../src/core/links';
import { foldTurkish } from '../src/core/turkish-search';
import { fromBase64, toBase64 } from '../src/core/base64';
import { RecentFiles } from '../src/core/recent-files';
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

test('dosya parçası Android köprüsünden bozulmadan geçer', () => {
  const bytes = Uint8Array.from({ length: 200_000 }, (_, index) => (index * 31) % 256);
  expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  expect(fromBase64('')).toEqual(new Uint8Array());
});

test.describe('son dosyalar', () => {
  const memory = () => {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  };

  test('son açılan başa gelir, liste sınırlıdır, sayfa ve yer korunur', () => {
    const recent = new RecentFiles(memory());
    for (let index = 0; index < 25; index += 1) recent.remember(`belge${index}`, `${index}.pdf`, undefined);
    expect(recent.list).toHaveLength(20);
    expect(recent.list[0].name).toBe('24.pdf');
    recent.setPage('belge10', 7);
    recent.remember('belge10', 'yeni-ad.pdf', undefined);
    expect(recent.list[0]).toMatchObject({ fingerprint: 'belge10', name: 'yeni-ad.pdf', page: 7 });
    expect(recent.pageOf('tanınmayan')).toBe(1);
  });

  test('kayıt yeniden yüklenir; bozuk kayıt ve dolu depo uygulamayı durdurmaz', () => {
    const store = memory();
    const first = new RecentFiles(store);
    first.remember('belge', 'a.pdf', 'yer');
    expect(new RecentFiles(store).list[0]).toMatchObject({ name: 'a.pdf', source: 'yer' });
    store.setItem('awPDF.recent', '{bozuk');
    expect(new RecentFiles(store).list).toEqual([]);
    const full = new RecentFiles({ getItem: () => null, setItem: () => { throw new Error('dolu'); } });
    full.remember('belge', 'a.pdf', undefined);
    expect(full.list).toHaveLength(1);
  });
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
