import type { Page } from '@playwright/test';

/**
 * Stands in for Capacitor's native side, so the Android platform runs in Chromium. Plugin calls
 * are recorded, by name in `androidCalls` and with their options in `androidCallOptions`; `window.androidFile` answers `readFile`, and `sendNative` fires a native event.
 */
export async function pretendAndroid(page: Page, files: Record<number, number[]> = {}) {
  await page.addInitScript(contents => {
    const listeners: Record<string, (data: unknown) => void> = {};
    const calls: string[] = [];
    const callOptions: { method: string; options: unknown }[] = [];
    const methods = ['print', 'setFullscreen', 'setSystemBars', 'appendShareFile', 'shareFile', 'pickFile', 'reopenFile', 'readFile', 'leaveApp', 'removeListener'];
    Object.assign(window, {
      androidBridge: { postMessage: () => undefined },
      androidCalls: calls,
      androidCallOptions: callOptions,
      sendNative: (event: string, data: unknown) => listeners[event]?.(data),
      Capacitor: {
        PluginHeaders: [{
          name: 'AwPdfNative',
          methods: [...methods.map(name => ({ name, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }],
        }],
        nativePromise: async (_plugin: string, method: string, options: { id: number; begin: number; end: number }) => {
          calls.push(method);
          callOptions.push({ method, options });
          if (method === 'reopenFile') return { id: 1, name: 'gelen.pdf', size: contents[1]?.length ?? 0, source: 'content://belge/1' };
          if (method !== 'readFile') return undefined;
          const part = (contents[options.id] ?? []).slice(options.begin, options.end);
          return { data: btoa(String.fromCharCode(...part)) };
        },
        nativeCallback: (_plugin: string, _method: string, options: { eventName: string }, callback: (data: unknown) => void) => {
          listeners[options.eventName] = callback;
          return Promise.resolve('callback');
        },
      },
    });
  }, files);
}
