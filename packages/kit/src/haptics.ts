import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

let enabled = true;

export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

const native = () => Capacitor.isNativePlatform();

function webVibrate(ms: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
}

/** Thin, fire-and-forget haptic vocabulary shared by every game. */
export const haptic = {
  light() {
    if (!enabled) return;
    if (native()) void Haptics.impact({ style: ImpactStyle.Light });
    else webVibrate(8);
  },
  medium() {
    if (!enabled) return;
    if (native()) void Haptics.impact({ style: ImpactStyle.Medium });
    else webVibrate(16);
  },
  heavy() {
    if (!enabled) return;
    if (native()) void Haptics.impact({ style: ImpactStyle.Heavy });
    else webVibrate(28);
  },
  success() {
    if (!enabled) return;
    if (native()) void Haptics.notification({ type: NotificationType.Success });
    else webVibrate([12, 40, 18]);
  },
  error() {
    if (!enabled) return;
    if (native()) void Haptics.notification({ type: NotificationType.Error });
    else webVibrate([30, 50, 30]);
  },
};
