import React from 'react';
import {
  X,
  Tractor,
  Sliders,
  Radio,
  FileSpreadsheet,
  HelpCircle,
  ShieldCheck,
  User,
  Power,
  Layers,
  Compass,
} from 'lucide-react';
import { ActiveTab, CropProfile, EquipmentState } from '../types';
import { playClickSound } from '../utils/audio';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: ActiveTab) => void;
  onOpenSettings: () => void;
  selectedCrop: CropProfile;
  equipmentState: EquipmentState;
}

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenSettings,
  selectedCrop,
  equipmentState,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex">
      <div className="w-80 max-w-[85vw] h-full bg-white border-r-4 border-[#0A0A0A] p-6 shadow-2xl flex flex-col justify-between animate-slideRight">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b-2 border-gray-200 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#012d1d] text-white flex items-center justify-center font-bold">
                <Tractor className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-extrabold text-lg text-[#012d1d] font-['Public_Sans']">
                  AgriControl Pro
                </h2>
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Industrial Edition
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

          {/* Navigation Links */}
          <div className="flex flex-col gap-1.5 py-2">
            <button
              onClick={() => {
                onNavigate('control');
                onClose();
              }}
              className="flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-gray-100 text-left font-bold text-[#181c20] cursor-pointer"
            >
              <Sliders className="w-5 h-5 text-[#2D6A4F]" />
              <span>Equipment Control (D-Pad)</span>
            </button>

            <button
              onClick={() => {
                onNavigate('dashboard');
                onClose();
              }}
              className="flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-gray-100 text-left font-bold text-[#181c20] cursor-pointer"
            >
              <Radio className="w-5 h-5 text-[#2D6A4F]" />
              <span>Telemetry Dashboard</span>
            </button>

            <button
              onClick={() => {
                onNavigate('mission-planner');
                onClose();
              }}
              className="flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-gray-100 text-left font-bold text-[#181c20] cursor-pointer"
            >
              <Compass className="w-5 h-5 text-[#2D6A4F]" />
              <span>Mission Planner API Link</span>
            </button>

            <button
              onClick={() => {
                onNavigate('crops');
                onClose();
              }}
              className="flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-gray-100 text-left font-bold text-[#181c20] cursor-pointer"
            >
              <Layers className="w-5 h-5 text-[#2D6A4F]" />
              <span>35 Crops Library</span>
            </button>

            <button
              onClick={() => {
                onNavigate('history');
                onClose();
              }}
              className="flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-gray-100 text-left font-bold text-[#181c20] cursor-pointer"
            >
              <FileSpreadsheet className="w-5 h-5 text-[#2D6A4F]" />
              <span>Sowing Logs & Reports</span>
            </button>
          </div>
        </div>

        {/* Operator Profile & Machine Health */}
        <div className="flex flex-col gap-3 pt-4 border-t-2 border-gray-200">
          <div className="bg-[#f7f9ff] border-2 border-gray-300 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#012d1d] text-white flex items-center justify-center font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-[#012d1d]">Farmer Operator</div>
              <div className="text-[11px] text-gray-500">Field Unit: Punjab Farm North-4</div>
            </div>
          </div>

          <button
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="w-full py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl border border-gray-300 text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            Open Hardware Settings
          </button>
        </div>
      </div>
    </div>
  );
};
