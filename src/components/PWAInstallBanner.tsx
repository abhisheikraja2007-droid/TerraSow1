import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { playClickSound } from '../utils/audio';
import { hapticLight, hapticSuccess } from '../utils/haptics';
import { PWAInstallModal } from './PWAInstallModal';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const isDismissed = sessionStorage.getItem('pwa_banner_dismissed') === 'true';
    if (isDismissed) setDismissed(true);
  }, []);

  if (isInstalled || dismissed) return null;

  const handleDismiss = () => {
    playClickSound();
    hapticLight();
    setDismissed(true);
    sessionStorage.setItem('pwa_banner_dismissed', 'true');
  };

  const handleInstallClick = async () => {
    playClickSound();
    hapticLight();
    if (isInstallable) {
      const res = await install();
      if (res) {
        hapticSuccess();
        setDismissed(true);
      }
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <div className="md:hidden fixed top-[68px] inset-x-2 z-30 bg-[#012d1d] text-white p-2.5 rounded-2xl border-2 border-[#4ade80]/60 shadow-xl flex items-center justify-between gap-2 animate-fadeIn select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-black/40 border border-[#4ade80]/40 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-[#4ade80]" />
          </div>
          <div className="flex flex-col truncate">
            <span className="font-black text-xs text-white uppercase tracking-wider truncate">
              Install AgriControl App
            </span>
            <span className="text-[10px] text-gray-300 truncate">
              Offline mode & Full-screen Cab controls
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleInstallClick}
            className="px-2.5 py-1.5 bg-[#4ade80] text-[#012d1d] font-black text-xs rounded-lg uppercase tracking-wider flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss banner"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <PWAInstallModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
};
