import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = () => Capacitor.isNativePlatform();

export interface NativeOptions {
  /** Return true when the back press was handled (e.g. an overlay was closed). */
  onBack?: () => boolean;
  /** Called when the app goes to background; save state here. */
  onPause?: () => void;
  /** Whether the game background is dark (light status-bar icons) or light. Default: dark. */
  darkBackground?: boolean;
}

/** One-call native chrome setup shared by all games: status bar, splash, back button, lifecycle. */
export async function setupNative({ onBack, onPause, darkBackground = true }: NativeOptions = {}) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onPause?.();
  });
  if (!isNative()) return;
  try {
    // Style.Dark = light icons for dark backgrounds.
    await StatusBar.setStyle({ style: darkBackground ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() === 'android') await StatusBar.setOverlaysWebView({ overlay: true });
  } catch {
    /* plugin missing on this platform */
  }
  void App.addListener('backButton', () => {
    if (!onBack?.()) void App.minimizeApp();
  });
  void App.addListener('pause', () => onPause?.());
  // Hide the native splash once the first frame is on screen.
  requestAnimationFrame(() => void SplashScreen.hide({ fadeOutDuration: 250 }));
}
