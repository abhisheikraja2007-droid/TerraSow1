import React, { useState } from 'react';
import {
  Tractor,
  Sliders,
  CheckCircle2,
  Search,
  Check,
  ChevronDown,
  Layers,
  Thermometer,
  Droplets,
  Calendar,
  Sparkles,
  Minus,
  Plus,
  RotateCcw,
  Edit3,
  LayoutList,
  LayoutGrid,
} from 'lucide-react';
import { CropCategory, CropProfile, EquipmentState } from '../types';
import { CROPS_DATA } from '../data/cropsData';
import { playClickSound, playBeepSound } from '../utils/audio';

interface CropsViewProps {
  selectedCrop: CropProfile;
  onSelectCrop: (crop: CropProfile) => void;
  onUpdateEquipment: (updater: (prev: EquipmentState) => EquipmentState) => void;
  onNavigateToControl: () => void;
}

function parseSpacingNumber(str: string): number {
  const matches = str.match(/(\d+(\.\d+)?)/g);
  if (!matches) return 15;
  if (matches.length >= 2) {
    const min = parseFloat(matches[0]);
    const max = parseFloat(matches[1]);
    return Math.round(((min + max) / 2) * 10) / 10;
  }
  return parseFloat(matches[0]);
}

export const CropsView: React.FC<CropsViewProps> = ({
  selectedCrop,
  onSelectCrop,
  onUpdateEquipment,
  onNavigateToControl,
}) => {
  const [activeCategory, setActiveCategory] = useState<CropCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeProfileApplied, setActiveProfileApplied] = useState(false);
  const [isCustomManualSpacing, setIsCustomManualSpacing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const categories: { id: CropCategory; label: string }[] = [
    { id: 'all', label: 'All 35 Crops' },
    { id: 'cereals', label: 'Cereals' },
    { id: 'pulses', label: 'Pulses & Legumes' },
    { id: 'oilseeds', label: 'Oilseeds' },
    { id: 'millets', label: 'Millets' },
    { id: 'superfoods', label: 'Superfoods & Herbs' },
  ];

  const currentSpacingNum = parseSpacingNumber(selectedCrop.seedSpacing);

  const handleManualSpacingChange = (newVal: number) => {
    playClickSound();
    const clamped = Math.max(1, Math.min(100, Math.round(newVal * 10) / 10));
    setIsCustomManualSpacing(true);
    onSelectCrop({
      ...selectedCrop,
      seedSpacing: `${clamped} cm`,
    });
    onUpdateEquipment((prev) => ({
      ...prev,
      targetSpacingCm: clamped,
      actualSpacingCm: clamped,
    }));
  };

  const handleResetSpacingToDefault = () => {
    playClickSound();
    const original = CROPS_DATA.find((c) => c.id === selectedCrop.id);
    if (original) {
      setIsCustomManualSpacing(false);
      onSelectCrop({
        ...selectedCrop,
        seedSpacing: original.seedSpacing,
      });
      const origNum = parseSpacingNumber(original.seedSpacing);
      onUpdateEquipment((prev) => ({
        ...prev,
        targetSpacingCm: origNum,
        actualSpacingCm: origNum,
      }));
    }
  };

  const spacingPresets = [5, 8, 10, 12, 15, 18, 20, 25, 30, 45, 60];

  const filteredCrops = CROPS_DATA.filter((crop) => {
    const matchesCat = activeCategory === 'all' || crop.category === activeCategory;
    const matchesSearch =
      crop.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      crop.botanicalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      crop.id.toString() === searchQuery.trim();
    return matchesCat && matchesSearch;
  });

  const handleApplyActiveProfile = (crop: CropProfile) => {
    playBeepSound(700, 0.15);
    onSelectCrop(crop);
    onUpdateEquipment((prev) => ({
      ...prev,
      activeCropId: crop.id,
    }));
    setActiveProfileApplied(true);
    setTimeout(() => setActiveProfileApplied(false), 2500);
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-4 animate-fadeIn pb-6">
      {/* Header Section */}
      <div className="flex items-center justify-between gap-2 border-b-2 border-gray-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[20px] font-extrabold text-[#012d1d] font-['Public_Sans'] leading-tight">
              Crop Profiles
            </h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#2D6A4F] text-white text-[10px] font-extrabold rounded-md uppercase tracking-wider">
              35 Ready
            </span>
          </div>
          <p className="text-xs text-gray-600 font-['Atkinson_Hyperlegible'] mt-0.5">
            Calibrate seed depth and spacing
          </p>
        </div>
      </div>

      {/* Top Dropdown Selector Container */}
      <div className="bg-white border-2 border-[#717973] rounded-2xl p-3.5 shadow-xs flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase tracking-wide">
          <Tractor className="w-3.5 h-3.5 text-[#2D6A4F]" />
          <span>Choose Active Crop</span>
        </div>

        <div className="relative">
          <select
            value={selectedCrop.id}
            onChange={(e) => {
              const id = parseInt(e.target.value, 10);
              const found = CROPS_DATA.find((c) => c.id === id);
              if (found) handleApplyActiveProfile(found);
            }}
            className="w-full h-[48px] pl-3 pr-10 bg-white border-2 border-[#0A0A0A] rounded-xl appearance-none text-[15px] font-bold text-[#0A0A0A] focus:outline-none focus:ring-3 focus:ring-[#2D6A4F]/30 cursor-pointer font-['Public_Sans']"
          >
            {CROPS_DATA.map((crop) => (
              <option key={crop.id} value={crop.id}>
                {crop.id}. {crop.name} ({crop.botanicalName})
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#0A0A0A]">
            <ChevronDown className="w-5 h-5 stroke-[2.5]" />
          </div>
        </div>
      </div>

      {/* Active Selected Crop Calibration Card */}
      <div className="bg-white border-2 border-[#717973] rounded-2xl p-4 shadow-sm flex flex-col gap-3.5">
        {/* Card Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm border-2 border-[#012d1d] shadow-xs shrink-0"
              style={{ backgroundColor: selectedCrop.seedColor || '#2D6A4F' }}
            >
              #{selectedCrop.id}
            </div>
            <div className="min-w-0">
              <h3 className="text-[16px] font-extrabold text-[#181c20] font-['Public_Sans'] truncate leading-tight">
                {selectedCrop.name}
              </h3>
              <p className="text-xs font-semibold text-gray-500 font-['Atkinson_Hyperlegible'] truncate">
                {selectedCrop.botanicalName} • {selectedCrop.badge}
              </p>
            </div>
          </div>

          <div className="px-2 py-1 bg-[#2D6A4F] text-white font-extrabold text-[10.5px] rounded-lg uppercase tracking-wider flex items-center gap-1 shadow-xs shrink-0">
            <CheckCircle2 className="w-3 h-3" />
            <span>Ready</span>
          </div>
        </div>

        {/* 3 Metrics Boxes */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#f1f4f9] border border-gray-300 rounded-xl p-2 text-center flex flex-col justify-center">
            <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-0.5">
              Depth
            </span>
            <span className="text-[14px] font-black text-[#012d1d] font-['Public_Sans']">
              {selectedCrop.sowingDepth}
            </span>
          </div>

          {/* Seed Spacing Box */}
          <div className="bg-[#f1f4f9] border-2 border-[#2D6A4F]/40 rounded-xl p-2 text-center flex flex-col justify-center relative shadow-xs">
            <span className="text-gray-600 text-[10px] font-bold uppercase tracking-wider mb-0.5">
              Spacing
            </span>
            <span className="text-[14px] font-black text-[#012d1d] font-['Public_Sans']">
              {selectedCrop.seedSpacing}
            </span>
          </div>

          <div className="bg-[#f1f4f9] border border-gray-300 rounded-xl p-2 text-center flex flex-col justify-center">
            <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-0.5">
              Telemetry
            </span>
            <span className="text-[14px] font-black text-[#2D6A4F] flex items-center justify-center gap-0.5 font-['Public_Sans']">
              <Check className="w-3.5 h-3.5 stroke-[3]" /> 100%
            </span>
          </div>
        </div>

        {/* Manual Seed Spacing Control Panel */}
        <div className="bg-[#f7f9ff] border border-[#2D6A4F]/30 rounded-xl p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-1 border-b border-gray-200 pb-2">
            <div className="flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-[#2D6A4F]" />
              <h4 className="font-extrabold text-[12px] text-[#012d1d] font-['Public_Sans'] uppercase tracking-wide">
                Spacing Adjust
              </h4>
            </div>

            {isCustomManualSpacing && (
              <button
                onClick={handleResetSpacingToDefault}
                className="text-[10px] font-bold text-gray-600 hover:text-[#012d1d] flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-50 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>

          {/* Stepper + Direct Input */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleManualSpacingChange(currentSpacingNum - 1)}
              className="w-9 h-9 rounded-lg bg-white border-2 border-[#0A0A0A] font-black text-base hover:bg-gray-100 active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
              title="Decrease 1 cm"
            >
              <Minus className="w-4 h-4" />
            </button>

            <div className="flex-1 relative">
              <input
                type="number"
                min="1"
                max="100"
                step="0.5"
                value={currentSpacingNum}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) handleManualSpacingChange(val);
                }}
                className="w-full h-9 px-2 border-2 border-[#0A0A0A] rounded-lg font-black text-center text-sm text-[#012d1d] bg-white focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-500 pointer-events-none">
                cm
              </span>
            </div>

            <button
              onClick={() => handleManualSpacingChange(currentSpacingNum + 1)}
              className="w-9 h-9 rounded-lg bg-white border-2 border-[#0A0A0A] font-black text-base hover:bg-gray-100 active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
              title="Increase 1 cm"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Preset Chips */}
          <div className="flex flex-wrap gap-1 mt-0.5">
            {spacingPresets.map((preset) => (
              <button
                key={preset}
                onClick={() => handleManualSpacingChange(preset)}
                className={`px-2 py-0.5 rounded text-[10.5px] font-extrabold border cursor-pointer transition-colors ${
                  Math.abs(currentSpacingNum - preset) < 0.2
                    ? 'bg-[#012d1d] text-white border-[#012d1d]'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                {preset} cm
              </button>
            ))}
          </div>
        </div>

        {/* Action Button: Set as Active Sowing Profile */}
        <button
          onClick={() => handleApplyActiveProfile(selectedCrop)}
          className={`w-full h-[50px] rounded-xl flex items-center justify-center gap-2 font-extrabold text-[15px] tracking-wide uppercase transition-all duration-150 border-2 border-[#0A0A0A] shadow-xs cursor-pointer font-['Public_Sans'] ${
            activeProfileApplied
              ? 'bg-[#2D6A4F] text-white scale-98 ring-4 ring-[#2D6A4F]/30'
              : 'bg-[#012d1d] hover:bg-[#1b4332] text-white active:scale-98'
          }`}
        >
          {activeProfileApplied ? (
            <>
              <Check className="w-4 h-4 stroke-[3]" />
              Profile Active in Machine!
            </>
          ) : (
            <>
              <Sliders className="w-4 h-4" />
              Set as Active Sowing Profile
            </>
          )}
        </button>
      </div>

      {/* 35 Crops Supported Catalog Header */}
      <div className="mt-2 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[17px] font-black text-[#012d1d] font-['Public_Sans'] uppercase tracking-wider">
              35 Supported Crops
            </h3>
            <p className="text-[11px] text-gray-500">
              Calibrated agricultural database
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-200/80 p-0.5 rounded-xl border border-gray-300 shrink-0">
            <button
              onClick={() => {
                playClickSound();
                setViewMode('list');
              }}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-[#012d1d] shadow-xs'
                  : 'text-gray-600 hover:text-black'
              }`}
              title="Horizontal List View"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                playClickSound();
                setViewMode('grid');
              }}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-[#012d1d] shadow-xs'
                  : 'text-gray-600 hover:text-black'
              }`}
              title="2-Column Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search Box */}
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search crop by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-white border-2 border-gray-300 rounded-xl focus:outline-none focus:border-[#012d1d]"
          />
        </div>

        {/* Category Filter Pills (Horizontal Scroll) */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                playClickSound();
                setActiveCategory(cat.id);
              }}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap border transition-colors cursor-pointer shrink-0 ${
                activeCategory === cat.id
                  ? 'bg-[#012d1d] text-white border-[#012d1d] shadow-xs'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Crop Catalog: Horizontal Card List (Default) or 2-Column Grid */}
        {viewMode === 'list' ? (
          <div className="flex flex-col gap-2">
            {filteredCrops.map((crop) => {
              const isCurrent = selectedCrop.id === crop.id;
              return (
                <div
                  key={crop.id}
                  onClick={() => handleApplyActiveProfile(crop)}
                  className={`bg-white rounded-2xl p-3 border-2 transition-all flex items-center justify-between gap-2.5 cursor-pointer relative shadow-xs hover:border-[#012d1d] active:scale-[0.99] ${
                    isCurrent
                      ? 'border-[#2D6A4F] bg-emerald-50/70 ring-2 ring-[#2D6A4F]/20'
                      : 'border-gray-200'
                  }`}
                >
                  {/* Left: Seed Avatar & Crop Names */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border border-black/20 shadow-xs text-white shrink-0"
                      style={{ backgroundColor: crop.seedColor }}
                    >
                      #{crop.id}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-extrabold text-[14px] text-[#181c20] font-['Public_Sans'] leading-tight truncate">
                          {crop.id}. {crop.name}
                        </h4>
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 rounded-full text-[8.5px] font-black uppercase bg-emerald-600 text-white shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 italic truncate font-medium">
                        {crop.botanicalName}
                      </p>
                    </div>
                  </div>

                  {/* Right: Depth & Spacing Parameters */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex flex-col items-end text-right">
                      <span className="text-[8.5px] font-bold uppercase text-gray-500">Depth</span>
                      <span className="text-[10.5px] font-black text-[#012d1d] bg-gray-100 px-2 py-0.5 rounded border border-gray-200 whitespace-nowrap">
                        {crop.sowingDepth}
                      </span>
                    </div>
                    <div className="flex flex-col items-end text-right">
                      <span className="text-[8.5px] font-bold uppercase text-gray-500">Spacing</span>
                      <span className="text-[10.5px] font-black text-[#2D6A4F] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 whitespace-nowrap">
                        {crop.seedSpacing}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredCrops.map((crop) => {
              const isCurrent = selectedCrop.id === crop.id;
              return (
                <div
                  key={crop.id}
                  onClick={() => handleApplyActiveProfile(crop)}
                  className={`bg-white rounded-2xl p-3 border-2 transition-all flex flex-col justify-between cursor-pointer relative shadow-xs hover:border-[#012d1d] ${
                    isCurrent
                      ? 'border-[#2D6A4F] ring-2 ring-[#2D6A4F]/20 bg-emerald-50/70'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs border border-black/20 text-white shadow-xs"
                      style={{ backgroundColor: crop.seedColor }}
                    >
                      #{crop.id}
                    </div>
                    {isCurrent ? (
                      <span className="px-1.5 py-0.2 rounded-full text-[8.5px] font-black uppercase bg-emerald-600 text-white">
                        Active
                      </span>
                    ) : (
                      <span className="text-[9.5px] font-bold text-gray-500 uppercase">
                        {crop.category}
                      </span>
                    )}
                  </div>

                  <h4 className="font-extrabold text-[13.5px] text-[#181c20] font-['Public_Sans'] leading-tight truncate">
                    {crop.id}. {crop.name}
                  </h4>
                  <p className="text-[10.5px] text-gray-500 italic truncate font-medium mb-2">
                    {crop.botanicalName}
                  </p>

                  <div className="mt-auto pt-2 border-t border-gray-100 flex items-center justify-between text-[10px]">
                    <span className="text-gray-500 font-bold">Depth:</span>
                    <span className="font-black text-[#012d1d]">{crop.sowingDepth}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
