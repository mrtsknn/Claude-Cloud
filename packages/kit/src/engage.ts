/**
 * Re-engagement helpers: local reminder notifications and native sharing. Both are
 * fire-and-forget and degrade quietly on the web or when a game hasn't installed the
 * native plugins (calls reject → caught).
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { track } from './analytics';

const native = () => Capacitor.isNativePlatform();

export interface Reminder {
  /** Stable id per reminder kind, so rescheduling replaces the old one. */
  id: number;
  title: string;
  body: string;
  /** Fire at this time… */
  at?: Date;
  /** …or every day at this local hour (0–23). */
  dailyHour?: number;
}

let permission: boolean | null = null;

async function allowed(): Promise<boolean> {
  if (!native()) return false;
  if (permission !== null) return permission;
  try {
    const cur = await LocalNotifications.checkPermissions();
    const res = cur.display === 'granted' ? cur : await LocalNotifications.requestPermissions();
    permission = res.display === 'granted';
  } catch {
    permission = false;
  }
  return permission;
}

/**
 * Schedules (or replaces) reminders. Ask at a good moment — e.g. after the first win —
 * never on the first screen. Missing permission is respected silently.
 */
export async function scheduleReminders(reminders: Reminder[]) {
  if (!(await allowed())) return;
  try {
    await LocalNotifications.cancel({ notifications: reminders.map((r) => ({ id: r.id })) });
    await LocalNotifications.schedule({
      notifications: reminders.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        schedule: r.dailyHour !== undefined ? { on: { hour: r.dailyHour, minute: 0 }, allowWhileIdle: true } : { at: r.at!, allowWhileIdle: true },
      })),
    });
    track('reminders_scheduled', { count: reminders.length });
  } catch {
    /* plugin missing or OS refused: no reminders */
  }
}

export async function cancelReminders(ids: number[]) {
  if (!native()) return;
  try {
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch {
    /* ignore */
  }
}

/**
 * Shares a result (text + optional store link / image data URL). Uses the native share
 * sheet on devices and the Web Share API in browsers; falls back to copying the text.
 * Returns true when something was shared or copied.
 */
export async function shareResult(o: { title: string; text: string; url?: string; imageDataUrl?: string }): Promise<boolean> {
  track('share', { title: o.title });
  try {
    if (native()) {
      let files: string[] | undefined;
      if (o.imageDataUrl) {
        // The share sheet needs a file: write the image to the cache directory first.
        const data = o.imageDataUrl.slice(o.imageDataUrl.indexOf(',') + 1);
        const ext = o.imageDataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
        const saved = await Filesystem.writeFile({ path: `share-${Date.now()}.${ext}`, data, directory: Directory.Cache }).catch(() => null);
        if (saved) files = [saved.uri];
      }
      await Share.share({ title: o.title, text: o.text, url: o.url, files, dialogTitle: o.title });
      return true;
    }
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      await nav.share({ title: o.title, text: o.text, url: o.url });
      return true;
    }
    await navigator.clipboard.writeText([o.text, o.url].filter(Boolean).join(' '));
    return true;
  } catch {
    return false;
  }
}
