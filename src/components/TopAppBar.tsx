import React, { useState } from 'react';
import { Menu, Settings, Radio, Zap, Download, Smartphone, MapPin, Loader2 } from 'lucide-react';
import { EquipmentState } from '../types';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { PWAInstallModal } from './PWAInstallModal';
import { playClickSound, playBeepSound } from '../utils/audio';
import { hapticLight, hapticSuccess } from '../utils/haptics';

interface TopAppBarProps {
  onOpenMenu: () => void;
  onOpenSettings: () => void;
  equipmentState: EquipmentState;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  onOpenMenu,
  onOpenSettings,
  equipmentState,
}) => {
  const { isInstalled } = usePWAInstall();
  const [showPwaModal, setShowPwaModal] = useState(false);
  const { location, loading: geoLoading, fetchLocation } = useCurrentLocation();

  const handleGetLocation = async () => {
    playClickSound();
    hapticLight();
    try {
      const loc = await fetchLocation();
      playBeepSound(700, 0.1);
      hapticSuccess();
    } catch (e) {
      // Ignored or handled in hook
    }
  };

  return (
    <>
      <header
        id="top-app-bar"
        className="w-full top-0 sticky z-40 bg-white border-b-2 border-[#0A0A0A] min-h-14 h-auto pt-[max(env(safe-area-inset-top),0px)] pb-1 px-3.5 flex items-center justify-between shadow-xs select-none shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0 mt-1">
          <button
            id="btn-menu-toggle"
            aria-label="Menu"
            onClick={() => {
              playClickSound();
              hapticLight();
              onOpenMenu();
            }}
            className="w-8.5 h-8.5 flex items-center justify-center rounded-xl border-2 border-[#0A0A0A] bg-white hover:bg-gray-100 active:bg-gray-200 text-[#0A0A0A] transition-transform active:scale-95 cursor-pointer shrink-0"
          >
            <Menu className="w-4.5 h-4.5 stroke-[2.5]" />
          </button>

          <div className="flex items-center gap-1.5 min-w-0">
            <img
              src="/icon.svg"
              alt="AgriControl"
              className="w-6 h-6 rounded-lg border border-black/20 shrink-0"
            />
            <div className="flex flex-col min-w-0">
              <h1 className="text-[14px] font-extrabold text-[#012d1d] tracking-tight font-['Public_Sans'] leading-none truncate">
                AgriControl
              </h1>
              <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider mt-0.5 leading-none truncate">
                Precision Drill
              </span>
            </div>
          </div>
        </div>

        {/* Live Status Indicators & Settings */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Current GPS Location Indicator */}
          <button
            onClick={handleGetLocation}
            className="flex items-center gap-1 px-1.5 py-1 bg-[#f7f9ff] hover:bg-emerald-50 text-[#012d1d] text-[9.5px] font-bold rounded-lg border border-gray-300 hover:border-[#2D6A4F] transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
            title="Click to get your current GPS location"
          >
            {geoLoading ? (
              <Loader2 className="w-3 h-3 text-[#2D6A4F] animate-spin" />
            ) : (
              <MapPin className="w-3 h-3 text-[#2D6A4F]" />
            )}
            <span className="font-mono text-[9px]">
              {location
                ? `${location.lat.toFixed(2)}°`
                : 'GPS'}
            </span>
          </button>

          {equipmentState.isRunning ? (
            <div className="flex items-center gap-1 px-2 py-1 bg-[#2D6A4F] text-white text-[9px] font-bold rounded-full uppercase tracking-wider animate-pulse shrink-0">
              <Zap className="w-2.5 h-2.5 fill-current" />
              <span>ON</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-1.5 py-0.8 bg-[#1b4332]/10 text-[#012d1d] border border-[#1b4332]/30 text-[8.5px] font-bold rounded-full uppercase tracking-wider shrink-0">
              <Radio className="w-2.5 h-2.5 text-[#2D6A4F]" />
              <span>RTK</span>
            </div>
          )}

          <button
            id="btn-settings-toggle"
            aria-label="Settings"
            onClick={() => {
              playClickSound();
              hapticLight();
              onOpenSettings();
            }}
            className="w-8.5 h-8.5 flex items-center justify-center rounded-xl border-2 border-[#0A0A0A] bg-white hover:bg-gray-100 active:bg-gray-200 text-[#0A0A0A] transition-transform active:scale-95 cursor-pointer shrink-0 shadow-xs"
          >
            <Settings className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>
      </header>

      {/* PWA Install Modal */}
      <PWAInstallModal
        isOpen={showPwaModal}
        onClose={() => setShowPwaModal(false)}
      />
    </>
  );
};
