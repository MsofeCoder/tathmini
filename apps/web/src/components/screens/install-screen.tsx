'use client';

import { useEffect, useState } from 'react';
import { navigateTo } from '@/lib/local/shell-navigation';
import { useDeviceRows } from '@/lib/local/use-device';

// Browsers stopped auto-prompting to install a PWA years ago (Chrome
// dropped its mini-infobar in 2022); the only way a visitor sees an
// install call-to-action at all is a page that captures this event
// itself and shows its own UI. Not in lib.dom.d.ts.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SEEN_KEY = 'tathmini:install-screen-seen';

/**
 * Layout, copy and palette ported from reference/Tathmini.dc.html's
 * `install` screen (lines 70–90) — the behavioural spec, per AGENTS.md.
 *
 * Shown once per browser (skipped forever after via SEEN_KEY, and skipped
 * immediately if the app is already running installed) rather than on
 * every visit like the prototype's demo state machine does — a supervisor
 * signing in daily should not see an onboarding splash every time.
 */
export function InstallScreen() {
  // Where to go once the splash is done. Read from the device, not the
  // server: a phone that has synced before knows who is signed in without
  // asking, which is what lets "/" open with no signal at all. A device with
  // no session goes to sign-in, where the network is needed anyway.
  const rows = useDeviceRows();
  const destination = rows?.session?.userId ? '/home' : '/login';

  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari's own non-standard flag — no display-mode support there.
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      // Private browsing / storage blocked — fall through and show the
      // splash rather than fail; worst case it reappears next visit.
    }

    if (standalone || seen) {
      navigateTo(destination, { replace: true });
      return;
    }

    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setVisible(true);
    // Waits for the device read: `destination` is wrong until it resolves,
    // and sending a signed-in supervisor to the sign-in screen because
    // IndexedDB had not answered yet is the kind of bug that looks like a
    // lost session.
  }, [destination, rows]);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  function proceed() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Nothing to do — the splash just reappears next visit.
    }
    navigateTo(destination, { replace: true });
  }

  async function handleInstallClick() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    }
    proceed();
  }

  if (!rows || !visible) return null;

  return (
    <main className="from-teal-deep to-teal-mid flex min-h-dvh flex-col bg-gradient-to-b px-7 py-10 text-white">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-[132px] w-[132px] shrink-0 items-center justify-center rounded-[22px] bg-white p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.24)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed local asset, not worth next/image's runtime for a single splash screen */}
          <img
            src="/mvttc-logo.png"
            alt="Morogoro Vocational Teachers Training College"
            className="h-full w-full object-contain"
          />
        </div>
        <p className="mt-5 text-[11px] font-extrabold tracking-[1.3px] text-[#a8cbc3]">
          MOROGORO VOCATIONAL TEACHERS
          <br />
          TRAINING COLLEGE
        </p>
        <div className="bg-white/28 my-3.5 h-0.5 w-[30px]" />
        <h1 className="text-[34px] font-bold leading-none tracking-[-0.6px]">Tathmini</h1>
        <p className="mt-[7px] text-[12px] font-bold tracking-[1.6px] text-[#bfd9d3]">
          TRAINEE ASSESSMENT SYSTEM
        </p>
        <p className="mt-3.5 max-w-[270px] text-[14.5px] leading-relaxed text-[#bfd9d3]">
          Mark every trainee offline, in the field. Send when you have internet.
        </p>
      </div>

      <div className="mt-auto flex flex-col gap-2.5">
        {isIOS ? (
          <div className="rounded-xl border border-white/20 bg-white/10 px-[15px] py-[13px] text-[12.5px] leading-relaxed text-[#dcece8]">
            <strong className="text-white">On iPhone / iPad:</strong> tap{' '}
            <strong className="text-white">Share</strong> in Safari, then{' '}
            <strong className="text-white">Add to Home Screen</strong>. Installing keeps assessments
            working with no signal.
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleInstallClick}
          className="focus:outline-accent min-h-[52px] rounded-xl bg-[#1c7a5e] text-[16px] font-semibold text-white focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          Add to Home Screen
        </button>
        <button
          type="button"
          onClick={proceed}
          className="focus:outline-accent min-h-12 rounded-xl border border-white/30 text-[15px] text-[#cfe3de] focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          Continue in browser
        </button>
      </div>
    </main>
  );
}
