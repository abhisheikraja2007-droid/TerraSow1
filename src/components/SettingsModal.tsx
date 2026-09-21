import React, { useState } from 'react';
import {
  Settings,
  Radio,
  Tractor,
  Volume2,
  VolumeX,
  Smartphone,
  Maximize2,
  Minimize2,
  Vibrate,
  Download,
  Cpu,
  CheckCircle2,
  X,
  HardDrive,
} from 'lucide-react';
import { playClickSound } from '../utils/audio';
import { hapticLight, triggerHaptic } from '../utils/haptics';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PWAInstallModal } from './PWAInstallModal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  units: 'metric' | 'imperial';
  onToggleUnits: (unit: 'metric' | 'imperial') => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  tractorModel: string;
  onSelectTractorModel: (model: string) => void;
  rtkBaseIp: string;
  onSetRtkBaseIp: (ip: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  units,
  onToggleUnits,
  soundEnabled,
  onToggleSound,
  tractorModel,
  onSelectTractorModel,
  rtkBaseIp,
  onSetRtkBaseIp,
}) => {
  const { isInstalled } = usePWAInstall();
  const [showPwaModal, setShowPwaModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  if (!isOpen) return null;

  const toggleFullscreen = () => {
    playClickSound();
    hapticLight();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  const handleTestHaptic = () => {
    playClickSound();
    triggerHaptic([40, 60, 40]);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white border-4 border-[#0A0A0A] rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto animate-scaleUp">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-gray-200 pb-3">
            <div className="flex items-center gap-2">
              <Settings className="w-6 h-6 text-[#012d1d]" />
              <h3 className="text-xl sm:text-2xl font-black text-[#012d1d] font-['Public_Sans'] uppercase tracking-wider">
                System & Mobile Settings
              </h3>
            </div>
            <button
              onClick={() => {
                playClickSound();
                hapticLight();
                onClose();
              }}
              className="w-8 h-8 rounded-lg border-2 border-[#0A0A0A] flex items-center justify-center font-bold hover:bg-gray-100 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Mobile App Install Card */}
          <div className="bg-[#f7f9ff] border-2 border-[#2D6A4F]/40 rounded-xl p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#012d1d] text-[#4ade80] flex items-center justify-center font-black">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-extrabold text-sm text-[#012d1d]">
                    Progressive Mobile App (PWA)
                  </div>
                  <div className="text-xs text-gray-600">
                    {isInstalled ? 'Installed as native app' : 'Ready for home screen installation'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  playClickSound();
                  hapticLight();
                  setShowPwaModal(true);
                }}
                className="px-3 py-1.5 bg-[#012d1d] hover:bg-[#1b4332] text-white text-xs font-bold rounded-lg border border-[#0A0A0A] flex items-center gap-1.5 cursor-pointer uppercase"
              >
                <Download className="w-3.5 h-3.5 text-[#4ade80]" />
                <span>{isInstalled ? 'View App Info' : 'Install'}</span>
              </button>
            </div>
          </div>

          {/* Machine & Implement Setup */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Active Tractor & Implement
            </label>
            <select
              value={tractorModel}
              onChange={(e) => onSelectTractorModel(e.target.value)}
              className="w-full h-11 px-3 border-2 border-[#0A0A0A] rounded-xl font-bold text-sm bg-white"
            >
              <option value="Tractor Alpha (4-Row Precision Drill)">
                Tractor Alpha (4-Row Precision Seed Drill)
              </option>
              <option value="Tractor Beta (8-Row Pneumatic Wide Drill)">
                Tractor Beta (8-Row Pneumatic Wide Drill)
              </option>
              <option value="Autonomous AgriRover Gen 3">
                Autonomous AgriRover Gen 3 (AI Swarm)
              </option>
            </select>
          </div>

          {/* Fullscreen & Mobile Mode */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={toggleFullscreen}
              className="py-2.5 px-3 bg-white hover:bg-gray-50 border-2 border-gray-300 rounded-xl font-bold text-xs text-gray-800 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span>{isFullscreen ? 'Exit Fullscreen' : 'Cab Fullscreen'}</span>
            </button>

            <button
              onClick={handleTestHaptic}
              className="py-2.5 px-3 bg-white hover:bg-gray-50 border-2 border-gray-300 rounded-xl font-bold text-xs text-gray-800 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Vibrate className="w-4 h-4 text-[#2D6A4F]" />
              <span>Test Haptics</span>
            </button>
          </div>

          {/* Measurement Unit System */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Units of Measurement
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => onToggleUnits('metric')}
                className={`py-2.5 rounded-xl font-extrabold text-xs sm:text-sm border-2 flex items-center justify-center gap-2 cursor-pointer ${
                  units === 'metric'
                    ? 'bg-[#012d1d] text-white border-[#012d1d]'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                <span>Metric (km/h, cm)</span>
              </button>
              <button
                onClick={() => onToggleUnits('imperial')}
                className={`py-2.5 rounded-xl font-extrabold text-xs sm:text-sm border-2 flex items-center justify-center gap-2 cursor-pointer ${
                  units === 'imperial'
                    ? 'bg-[#012d1d] text-white border-[#012d1d]'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                <span>Imperial (mph, in)</span>
              </button>
            </div>
          </div>

          {/* RTK Base Station NTRIP */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-[#2D6A4F]" />
              RTK GPS Base Station NTRIP
            </label>
            <input
              type="text"
              value={rtkBaseIp}
              onChange={(e) => onSetRtkBaseIp(e.target.value)}
              placeholder="e.g. 192.168.1.120:2101/RTK_BASE"
              className="w-full h-10 px-3 border-2 border-gray-400 rounded-xl font-mono text-xs sm:text-sm bg-[#f7f9ff]"
            />
          </div>

          {/* Audio / Feedback */}
          <div className="flex items-center justify-between p-3 bg-[#f1f4f9] rounded-xl border border-gray-300">
            <div className="flex items-center gap-2.5">
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-[#2D6A4F]" />
              ) : (
                <VolumeX className="w-5 h-5 text-gray-500" />
              )}
              <div>
                <div className="text-xs sm:text-sm font-bold text-gray-800">Tactile Audio & Alarms</div>
                <div className="text-[11px] text-gray-500">Emergency sirens and clicks</div>
              </div>
            </div>
            <button
              onClick={onToggleSound}
              className={`w-11 h-6 rounded-full p-0.5 transition-colors border cursor-pointer ${
                soundEnabled ? 'bg-[#2D6A4F] border-[#012d1d]' : 'bg-gray-300 border-gray-400'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  soundEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Offline & Cache Status */}
          <div className="bg-[#c1ecd4]/40 border border-[#012d1d]/30 rounded-xl p-3 text-xs text-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#012d1d]" />
              <span>Offline Database: <strong>IndexedDB + ServiceWorker Active</strong></span>
            </div>
            <span className="text-xs font-bold text-[#2D6A4F]">✓ Synchronized</span>
          </div>

          {/* Close Button */}
          <button
            onClick={() => {
              playClickSound();
              hapticLight();
              onClose();
            }}
            className="w-full py-3.5 bg-[#012d1d] hover:bg-[#1b4332] text-white font-extrabold rounded-xl border-2 border-[#0A0A0A] uppercase tracking-wider font-['Public_Sans'] cursor-pointer"
          >
            Save & Return to App
          </button>
        </div>
      </div>

      <PWAInstallModal
        isOpen={showPwaModal}
        onClose={() => setShowPwaModal(false)}
      />
    </>
  );
};
