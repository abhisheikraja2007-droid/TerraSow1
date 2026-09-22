import React, { useState } from 'react';
import {
  Tractor,
  BatteryCharging,
  Sliders,
  AlertOctagon,
  Radio,
  Clock,
  Layers,
  Sparkles,
  MapPin,
  RefreshCw,
  LocateFixed,
} from 'lucide-react';
import { CropProfile, EquipmentState, HourlyCoverage } from '../types';
import { playClickSound, playEmergencyStopSound } from '../utils/audio';
import { useCurrentLocation } from '../hooks/useCurrentLocation';

interface DashboardViewProps {
  equipmentState: EquipmentState;
  selectedCrop: CropProfile;
  onUpdateEquipment: (updater: (prev: EquipmentState) => EquipmentState) => void;
  onNavigateToControl: () => void;
  onNavigateToCrops: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  equipmentState,
  selectedCrop,
  onUpdateEquipment,
  onNavigateToControl,
  onNavigateToCrops,
}) => {
  const [activeHourlyFilter, setActiveHourlyFilter] = useState<'today' | 'week'>('today');
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const { location: gpsLocation, fetchLocation: refreshGps, loading: gpsLoading } = useCurrentLocation();

  // Hourly coverage data (real metrics only)
  const hourlyData: HourlyCoverage[] = [
    { hourLabel: '8 AM', acres: 0, ratePerHr: 0, percentage: 0 },
    { hourLabel: '10 AM', acres: 0, ratePerHr: 0, percentage: 0 },
    { hourLabel: '12 PM', acres: 0, ratePerHr: 0, percentage: 0 },
    { hourLabel: '2 PM', acres: 0, ratePerHr: 0, percentage: 0 },
    {
      hourLabel: 'NOW',
      acres: Number(equipmentState.totalAreaCoveredAcres.toFixed(3)),
      ratePerHr: equipmentState.isRunning ? equipmentState.speedKmh * 0.247 : 0, // rough conversion for UI 
      percentage: Math.min(100, Math.round((equipmentState.totalAreaCoveredAcres / 50.0) * 100)),
    },
  ];

  const totalAcresToday = hourlyData[hourlyData.length - 1].acres;
  const targetAcresToday = 50.0;
  const progressPercent = Math.min(100, Math.round((totalAcresToday / targetAcresToday) * 100));

  const handleEmergencyStop = () => {
    playEmergencyStopSound();
    onUpdateEquipment((prev) => ({
      ...prev,
      isRunning: false,
      isEmergencyStopped: true,
      speedKmh: 0,
    }));
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-4 animate-fadeIn pb-6">
      {/* Header Section */}
      <div className="flex items-center justify-between gap-2 border-b-2 border-gray-200 pb-3">
        <div>
          <h2 className="text-[20px] font-extrabold text-[#012d1d] font-['Public_Sans'] leading-tight">
            Telemetry Dashboard
          </h2>
          <p className="text-xs text-gray-600 font-['Atkinson_Hyperlegible']">
            Machine diagnostics & field metrics
          </p>
        </div>

        <div className="flex items-center gap-1">
          <div className="px-2.5 py-1 bg-[#1b4332] text-[#86af99] font-bold text-[11px] rounded-full border border-[#012d1d] flex items-center gap-1.5 shadow-xs shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#48cae4] animate-ping" />
            <span className="text-white">Online</span>
          </div>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="flex flex-col gap-3">
        {/* Active Equipment Card */}
        <div className="bg-white border-2 border-[#717973] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs hover:border-[#0A0A0A] transition-colors relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#2D6A4F]" />

          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1 pl-1.5">
              <div className="flex items-center gap-1.5 text-gray-600 font-bold text-xs uppercase tracking-wider truncate">
                <Tractor className="w-3.5 h-3.5 text-[#2D6A4F] shrink-0" />
                <span className="truncate">Tractor Alpha • 4-Row Drill</span>
              </div>
              <span
                className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                  equipmentState.isRunning
                    ? 'bg-[#2D6A4F] text-white animate-pulse'
                    : 'bg-gray-100 text-gray-700 border border-gray-300'
                }`}
              >
                {equipmentState.isRunning ? 'Active' : 'Standby'}
              </span>
            </div>

            <h3 className="text-[16px] font-extrabold text-[#181c20] pl-1.5 font-['Public_Sans']">
              {equipmentState.isRunning ? 'Precision Seeding Operation' : 'Ready for Operation'}
            </h3>

            {/* Metrics Row */}
            <div className="mt-2.5 pl-1.5 grid grid-cols-2 gap-2 bg-[#f7f9ff] border border-gray-200 rounded-xl p-2.5">
              <div className="flex flex-col">
                <span className="text-gray-500 text-[9.5px] font-bold uppercase tracking-wider">
                  Current Crop
                </span>
                <span
                  onClick={onNavigateToCrops}
                  className="text-[13px] font-black text-[#012d1d] hover:text-[#2D6A4F] hover:underline cursor-pointer truncate"
                >
                  {selectedCrop.name}
                </span>
              </div>

              <div className="flex flex-col border-l border-gray-200 pl-2">
                <span className="text-gray-500 text-[9.5px] font-bold uppercase tracking-wider">
                  Speed
                </span>
                <span className="text-[13px] font-black text-[#012d1d]">
                  {equipmentState.speedKmh.toFixed(1)} km/h
                </span>
              </div>

              <div className="flex flex-col border-t border-gray-200 pt-1.5">
                <span className="text-gray-500 text-[9.5px] font-bold uppercase tracking-wider">
                  Target Depth
                </span>
                <span className="text-[13px] font-black text-[#012d1d]">
                  {selectedCrop.sowingDepth}
                </span>
              </div>

              <div className="flex flex-col border-t border-l border-gray-200 pt-1.5 pl-2">
                <span className="text-gray-500 text-[9.5px] font-bold uppercase tracking-wider">
                  Seed Spacing
                </span>
                <span className="text-[13px] font-black text-[#2D6A4F]">
                  {selectedCrop.seedSpacing}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2 mt-3 pl-1.5">
            <button
              onClick={handleEmergencyStop}
              className="h-[42px] bg-[#D00000] hover:bg-[#b00000] text-white font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-1 border-2 border-[#930000] active:scale-[0.98] transition-transform cursor-pointer uppercase tracking-wider font-['Public_Sans']"
            >
              <AlertOctagon className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>STOP</span>
            </button>

            <button
              onClick={() => setShowAdjustModal(true)}
              className="h-[42px] bg-white text-[#396093] hover:bg-gray-50 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1 border border-[#396093] active:scale-[0.98] transition-all cursor-pointer font-['Public_Sans']"
            >
              <Sliders className="w-3.5 h-3.5 shrink-0" />
              <span>Adjust</span>
            </button>

            <button
              onClick={onNavigateToControl}
              className="h-[42px] bg-[#1b4332] text-white hover:bg-[#012d1d] font-bold text-[11px] rounded-xl flex items-center justify-center gap-1 border border-[#0A0A0A] active:scale-[0.98] transition-all cursor-pointer font-['Public_Sans']"
            >
              <span>D-Pad</span>
            </button>
          </div>
        </div>

        {/* Resource Levels */}
        <div className="flex flex-col gap-2.5">
          {/* Battery Level Card */}
          <div className="bg-white border-2 border-[#717973] rounded-2xl p-2.5 flex items-center gap-3 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-[#c1ecd4] border border-[#012d1d] flex items-center justify-center text-[#012d1d] shrink-0">
              <BatteryCharging className="w-4 h-4" />
            </div>
            <div className="flex-grow">
              <div className="flex justify-between items-end mb-1">
                <span className="font-bold text-[11px] text-gray-700 uppercase tracking-wide">
                  Battery (48V)
                </span>
                <span className="text-sm font-black text-[#012d1d]">
                  {equipmentState.batteryPercent}%
                </span>
              </div>
              <div className="w-full h-2 bg-[#e0e3e8] rounded-full border border-gray-300 overflow-hidden">
                <div
                  className="h-full bg-[#2D6A4F] transition-all duration-500 rounded-full"
                  style={{ width: `${equipmentState.batteryPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Seed Hopper Level Card */}
          <div className="bg-white border-2 border-[#717973] rounded-2xl p-2.5 flex items-center gap-3 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-[#ffe5d9] border border-[#d97706] flex items-center justify-center text-[#9c6644] shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex-grow">
              <div className="flex justify-between items-end mb-1">
                <span className="font-bold text-[11px] text-gray-700 uppercase tracking-wide">
                  Hopper Bin
                </span>
                <span className="text-sm font-black text-[#9c6644]">
                  {equipmentState.hopperLevelPercent}%
                </span>
              </div>
              <div className="w-full h-2 bg-[#e0e3e8] rounded-full border border-gray-300 overflow-hidden">
                <div
                  className="h-full bg-[#d97706] transition-all duration-500 rounded-full"
                  style={{ width: `${equipmentState.hopperLevelPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* RTK Positioning & Hydraulic Pressure */}
          <div className="bg-[#f1f4f9] border border-gray-300 rounded-2xl p-2.5 flex items-center justify-between gap-2 text-xs font-bold text-gray-800">
            <div className="flex items-center gap-1.5 min-w-0">
              <Radio className="w-3.5 h-3.5 text-[#2D6A4F] shrink-0" />
              <div className="min-w-0">
                <div className="text-gray-500 uppercase text-[9px]">GPS RTK Base</div>
                <div className="text-[#012d1d] text-[10.5px] font-mono truncate">
                  {gpsLocation
                    ? `${gpsLocation.lat.toFixed(3)}°, ${gpsLocation.lng.toFixed(3)}°`
                    : '±1.2 cm Accuracy'}
                </div>
              </div>
            </div>
            <div className="border-l border-gray-300 pl-2 shrink-0">
              <div className="text-gray-500 uppercase text-[9px]">Hydraulics</div>
              <div className="text-[#012d1d] text-[10.5px]">{equipmentState.hydraulicPressureBar} Bar OK</div>
            </div>
          </div>
        </div>

        {/* Area Covered Today Chart */}
        <div className="bg-white border-2 border-[#717973] rounded-2xl p-3.5 shadow-xs">
          <div className="flex justify-between items-center gap-2 mb-2">
            <div>
              <h3 className="text-[15px] font-extrabold text-[#181c20] font-['Public_Sans']">
                Area Covered Today
              </h3>
              <p className="text-[11px] text-gray-500">
                Target: {targetAcresToday} Ac ({progressPercent}%)
              </p>
            </div>
            <span className="text-lg font-black text-[#012d1d]">
              {totalAcresToday} <span className="text-xs text-gray-500 font-bold">Ac</span>
            </span>
          </div>

          {/* Bar Chart */}
          <div className="h-28 w-full border-b-2 border-l-2 border-[#717973] flex items-end justify-around pb-1 pt-3 px-1 gap-1.5 bg-[#f7f9ff] rounded-t-lg">
            {hourlyData.map((item, idx) => {
              const isNow = item.hourLabel === 'NOW';
              return (
                <div key={item.hourLabel} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                  <div
                    className={`w-full max-w-[28px] border border-[#012d1d] rounded-t transition-all duration-300 ${
                      isNow
                        ? 'bg-[#012d1d]'
                        : idx === 2
                        ? 'bg-[#1b4332]'
                        : 'bg-[#c1ecd4]'
                    }`}
                    style={{ height: `${Math.max(14, item.percentage)}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* X Axis Labels */}
          <div className="flex justify-around text-gray-700 font-bold text-[10.5px] mt-1.5 font-['Public_Sans']">
            {hourlyData.map((item) => (
              <span key={item.hourLabel} className={item.hourLabel === 'NOW' ? 'text-[#012d1d] font-black' : ''}>
                {item.hourLabel}
              </span>
            ))}
          </div>
        </div>

        {/* Live Field GPS Simulation Canvas & Swath Grid */}
        <div className="md:col-span-12 bg-white border-2 border-[#717973] rounded-2xl p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#2D6A4F]" />
              <h3 className="text-[18px] sm:text-[22px] font-extrabold text-[#181c20] font-['Public_Sans']">
                Field Swath & GPS Telemetry Map (Field North-B4)
              </h3>
            </div>
            <div className="text-xs font-bold text-gray-600 bg-gray-100 px-3 py-1 rounded-md border border-gray-300">
              Guidance: A-B Line Auto-Steer active
            </div>
          </div>

          {/* Visual Field Grid */}
          <div className="relative w-full bg-[#f1f4f9] border-2 border-gray-300 rounded-xl overflow-hidden flex flex-col gap-1.5 p-3 shadow-inner">
            {/* Field Rows */}
            {[1, 2, 3, 4, 5, 6].map((row) => (
              <div
                key={row}
                className="w-full h-7 border-b border-dashed border-gray-300/80 last:border-b-0 flex items-center relative"
              >
                {row <= 3 && (
                  <div className="h-6 w-full bg-[#2D6A4F]/85 rounded-lg text-[11px] text-white font-bold flex items-center px-2.5 shadow-xs whitespace-nowrap">
                    <span>Row {row} • Sown ({selectedCrop.name})</span>
                  </div>
                )}
                {row === 4 && (
                  <div className="relative h-6 w-full bg-amber-100/70 rounded-lg overflow-hidden border border-[#012d1d]/40 flex items-center shadow-xs">
                    {/* Dynamic In-Progress Fill */}
                    <div
                      className="absolute top-0 left-0 bottom-0 bg-[#e9c46a] border-r border-[#012d1d]/30 transition-all duration-300"
                      style={{ width: equipmentState.isRunning ? '75%' : '45%' }}
                    />
                    {/* Text & Icon overlay */}
                    <div className="relative z-10 w-full flex items-center justify-between px-2.5 text-[11px] text-[#012d1d] font-black whitespace-nowrap">
                      <span className="leading-none flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#012d1d] animate-ping" />
                        Row 4 • In Progress
                      </span>
                      <span className="animate-bounce text-xs leading-none">🚜</span>
                    </div>
                  </div>
                )}
                {row > 4 && (
                  <div className="h-6 w-full bg-gray-100/80 border border-gray-200 rounded-lg text-[11px] text-gray-400 font-semibold flex items-center px-2.5 whitespace-nowrap">
                    <span>Row {row} • Pending Furrow</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Adjust Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-4 border-[#0A0A0A] rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto animate-scaleUp">
            <div className="flex items-center justify-between border-b-2 border-gray-200 pb-3">
              <h3 className="text-xl font-black text-[#0A0A0A] uppercase font-['Public_Sans']">
                Drill Calibration
              </h3>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="w-8 h-8 rounded-lg border-2 border-[#0A0A0A] flex items-center justify-center font-bold hover:bg-gray-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="text-sm font-bold text-gray-700 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                Active Crop: <strong className="text-[#012d1d]">{selectedCrop.name} ({selectedCrop.botanicalName})</strong>
              </div>

              {/* Manual Seed Spacing */}
              <div className="flex flex-col gap-1.5 p-3 bg-[#f7f9ff] border-2 border-[#2D6A4F]/40 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-sm text-[#012d1d] uppercase">
                    Manual Seed Spacing:
                  </span>
                  <span className="font-black text-base text-[#2D6A4F]">
                    {equipmentState.targetSpacingCm.toFixed(1)} cm
                  </span>
                </div>

                <input
                  type="range"
                  min="2.0"
                  max="60.0"
                  step="0.5"
                  value={equipmentState.targetSpacingCm}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onUpdateEquipment((prev) => ({
                      ...prev,
                      targetSpacingCm: val,
                      actualSpacingCm: val,
                    }));
                  }}
                  className="w-full h-3 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-[#2D6A4F]"
                />

                <div className="flex flex-wrap gap-1 mt-1">
                  {[5, 10, 15, 18, 20, 25, 30, 45].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        onUpdateEquipment((prev) => ({
                          ...prev,
                          targetSpacingCm: preset,
                          actualSpacingCm: preset,
                        }))
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer ${
                        Math.abs(equipmentState.targetSpacingCm - preset) < 0.2
                          ? 'bg-[#012d1d] text-white border-[#012d1d]'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {preset} cm
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => {
                  playClickSound();
                  setShowAdjustModal(false);
                }}
                className="flex-1 py-3.5 bg-[#012d1d] text-white font-extrabold rounded-xl border-2 border-[#0A0A0A] hover:bg-[#1b4332] uppercase tracking-wider cursor-pointer"
              >
                Apply Spacing
              </button>

              <button
                onClick={() => {
                  playClickSound();
                  setShowAdjustModal(false);
                  onNavigateToControl();
                }}
                className="py-3.5 px-4 bg-gray-100 text-gray-800 font-bold rounded-xl border-2 border-gray-300 hover:bg-gray-200 uppercase tracking-wider cursor-pointer text-xs"
              >
                D-Pad View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
