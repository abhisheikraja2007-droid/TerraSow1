import React from 'react';
import { Download, Smartphone, Apple, CheckCircle2, X, Sparkles, Share } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { playClickSound } from '../utils/audio';
import { hapticLight, hapticSuccess } from '../utils/haptics';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  if (!isOpen) return null;

  const handleInstall = async () => {
    playClickSound();
    hapticLight();
    const success = await install();
    if (success) {
      hapticSuccess();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border-4 border-[#0A0A0A] rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4 animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-gray-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#012d1d] text-[#4ade80] flex items-center justify-center font-black">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-lg text-[#012d1d] font-['Public_Sans'] uppercase tracking-wider">
                Install Mobile App
              </h3>
              <span className="text-[11px] font-bold text-gray-500">
                AgriControl Pro Standalone
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="w-8 h-8 rounded-lg border-2 border-[#0A0A0A] flex items-center justify-center font-bold hover:bg-gray-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* App Preview Card */}
        <div className="flex items-center gap-3.5 p-3.5 bg-[#f7f9ff] border-2 border-gray-200 rounded-xl">
          <img
            src="/icon.svg"
            alt="AgriControl Pro Icon"
            className="w-14 h-14 rounded-xl border border-black/20 shadow-xs"
          />
          <div className="flex flex-col">
            <span className="font-extrabold text-sm text-[#012d1d]">AgriControl Pro</span>
            <span className="text-xs text-gray-600">Industrial Tractor & Drill Controller</span>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-[#2D6A4F]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Offline Ready • 35 Crops • Real-Time D-Pad</span>
            </div>
          </div>
        </div>

        {/* Installation Instructions */}
        {isInstalled ? (
          <div className="p-4 bg-[#c1ecd4]/50 border-2 border-[#2D6A4F] rounded-xl flex items-center gap-3 text-[#012d1d]">
            <CheckCircle2 className="w-6 h-6 text-[#2D6A4F] shrink-0" />
            <div className="text-sm font-bold">
              AgriControl Pro is already installed on your device as a standalone mobile app!
            </div>
          </div>
        ) : isIOS ? (
          <div className="flex flex-col gap-3 text-sm text-gray-700 bg-[#f1f4f9] p-4 rounded-xl border border-gray-300">
            <div className="flex items-center gap-2 font-bold text-[#012d1d]">
              <Apple className="w-5 h-5" />
              <span>Install on iPhone / iPad (Safari)</span>
            </div>
            <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm font-medium leading-relaxed">
              <li>
                Tap the <strong className="text-black inline-flex items-center gap-1"><Share className="w-3.5 h-3.5 inline" /> Share</strong> button in your Safari browser bar.
              </li>
              <li>
                Scroll down in the share sheet and tap <strong className="text-black">Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong className="text-black">Add</strong> in the top-right corner to launch full-screen.
              </li>
            </ol>
          </div>
        ) : isInstallable ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-600 leading-relaxed">
              Install AgriControl Pro directly to your home screen or desktop for an ultra-fast, fullscreen tractor cab experience with zero browser bars and full offline support.
            </p>
            <button
              onClick={handleInstall}
              className="w-full py-3.5 bg-[#012d1d] hover:bg-[#1b4332] text-white font-extrabold rounded-xl border-2 border-[#0A0A0A] flex items-center justify-center gap-2 uppercase tracking-wider font-['Public_Sans'] cursor-pointer shadow-md active:scale-98 transition-transform"
            >
              <Download className="w-5 h-5 text-[#4ade80]" />
              <span>Install App to Device</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 text-xs text-gray-600 bg-[#f1f4f9] p-4 rounded-xl border border-gray-300">
            <div className="font-bold text-sm text-[#012d1d] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#2D6A4F]" />
              <span>Mobile App Capabilities</span>
            </div>
            <p>
              Open this URL directly in Chrome, Edge, Safari, or Samsung Internet to install as a native home-screen app.
            </p>
            <div className="text-[11px] text-gray-500 font-mono mt-1">
              Supports Android, iOS, iPadOS, macOS & Windows PWA engines.
            </div>
          </div>
        )}

        <button
          onClick={() => {
            playClickSound();
            onClose();
          }}
          className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl border border-gray-300 text-xs uppercase tracking-wider cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
