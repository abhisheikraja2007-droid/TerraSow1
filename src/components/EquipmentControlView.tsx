import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Play,
  Square,
  AlertTriangle,
  RotateCcw,
  Gauge,
  Compass,
  CheckCircle2,
  Sliders,
  Sparkles,
  Zap,
  RotateCw,
} from 'lucide-react';
import { CropProfile, EquipmentState } from '../types';
import { CROPS_DATA } from '../data/cropsData';
import { MissionPlannerService } from '../services/missionPlannerApi';
import { playClickSound, playBeepSound, playEmergencyStopSound } from '../utils/audio';
import {
  hapticLight,
  hapticMedium,
  hapticHeavy,
  hapticWarning,
  hapticSuccess,
} from '../utils/haptics';

interface EquipmentControlViewProps {
  equipmentState: EquipmentState;
  onUpdateEquipment: (updater: (prev: EquipmentState) => EquipmentState) => void;
  onSelectCrop: (crop: CropProfile) => void;
  selectedCrop: CropProfile;
  onLogOperation: (entry: {
    cropName: string;
    cropId: number;
    durationMinutes: number;
    areaAcres: number;
    status: 'Completed' | 'Interrupted';
  }) => void;
}

export const EquipmentControlView: React.FC<EquipmentControlViewProps> = ({
  equipmentState,
  onUpdateEquipment,
  onSelectCrop,
  selectedCrop,
  onLogOperation,
}) => {
  const [activeDirectionKey, setActiveDirectionKey] = useState<string | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [speedSetting, setSpeedSetting] = useState(8.5);
  const [depthSetting, setDepthSetting] = useState(4.0);
  const [spacingSetting, setSpacingSetting] = useState(equipmentState.targetSpacingCm || 18.0);

  // ESP32 Rover Mechanism States
  const [drillActive, setDrillActive] = useState(false);
  const [hopperMode, setHopperMode] = useState<'CENTER' | 'LEFT' | 'RIGHT' | 'MULTI'>('CENTER');
  const [actuatorState, setActuatorState] = useState<'STOP' | 'DOWN' | 'UP'>('STOP');
  const [npkState, setNpkState] = useState<'UP' | 'DOWN'>('UP');
  const [motorPwmSpeed, setMotorPwmSpeed] = useState(255);

  const handleToggleDrill = async () => {
    playClickSound();
    hapticMedium();
    const next = !drillActive;
    setDrillActive(next);
    await MissionPlannerService.sendRoverCommand(next ? 'DRILL_ON' : 'DRILL_OFF');
  };

  const handleHopperAction = async (mode: 'CENTER' | 'LEFT' | 'RIGHT' | 'MULTI') => {
    playClickSound();
    hapticMedium();
    setHopperMode(mode);
    const cmdMap: Record<string, string> = {
      CENTER: 'HOPPER_CENTER',
      LEFT: 'HOPPER_LEFT',
      RIGHT: 'HOPPER_RIGHT',
      MULTI: 'HOPPER_MULTI_START',
    };
    await MissionPlannerService.sendRoverCommand(cmdMap[mode]);
  };

  const handleActuatorCommand = async (action: 'ACT_DOWN' | 'ACT_UP' | 'ACT_STOP') => {
    playClickSound();
    hapticMedium();
    setActuatorState(action === 'ACT_DOWN' ? 'DOWN' : action === 'ACT_UP' ? 'UP' : 'STOP');
    await MissionPlannerService.sendRoverCommand(action);
  };

  const handleToggleNpk = async () => {
    playClickSound();
    hapticMedium();
    const next = npkState === 'UP' ? 'DOWN' : 'UP';
    setNpkState(next);
    await MissionPlannerService.sendRoverCommand(next === 'DOWN' ? 'NPK_DOWN' : 'NPK_UP');
  };

  const handlePwmSpeedChange = async (val: number) => {
    const clamped = Math.max(80, Math.min(255, val));
    setMotorPwmSpeed(clamped);
    await MissionPlannerService.sendRoverCommand(`SPEED:${clamped}`);
  };

  // Keep spacing setting in sync with equipmentState
  useEffect(() => {
    if (equipmentState.targetSpacingCm) {
      setSpacingSetting(equipmentState.targetSpacingCm);
    }
  }, [equipmentState.targetSpacingCm]);

  const handleSpacingStep = (delta: number) => {
    playClickSound();
    const newSpacing = Math.max(1, Math.min(100, Math.round((spacingSetting + delta) * 10) / 10));
    setSpacingSetting(newSpacing);
    onUpdateEquipment((prev) => ({
      ...prev,
      targetSpacingCm: newSpacing,
      actualSpacingCm: newSpacing,
    }));
    onSelectCrop({
      ...selectedCrop,
      seedSpacing: `${newSpacing} cm`,
    });
  };

  // Direction handler
  const handleDirectionPress = useCallback(
    (dir: 'forward' | 'backward' | 'left' | 'right') => {
      playClickSound();
      hapticMedium();
      setActiveDirectionKey(dir);

      const cmdMap: Record<string, string> = {
        forward: 'FORWARD',
        backward: 'BACKWARD',
        left: 'LEFT',
        right: 'RIGHT',
      };
      if (cmdMap[dir]) {
        void MissionPlannerService.sendRoverCommand(cmdMap[dir]);
      }

      onUpdateEquipment((prev) => {
        let steering = prev.steeringAngleDeg;
        if (dir === 'left') steering = Math.max(-30, steering - 10);
        if (dir === 'right') steering = Math.min(30, steering + 10);
        if (dir === 'forward' || dir === 'backward') steering = 0;

        return {
          ...prev,
          activeDirection: dir,
          steeringAngleDeg: steering,
          speedKmh: prev.isRunning ? speedSetting : 2.5,
        };
      });
    },
    [onUpdateEquipment, speedSetting]
  );

  const handleDirectionRelease = useCallback(() => {
    setActiveDirectionKey(null);
    void MissionPlannerService.sendRoverCommand('STOP');
    onUpdateEquipment((prev) => ({
      ...prev,
      activeDirection: 'idle',
      speedKmh: prev.isRunning ? speedSetting : 0,
    }));
  }, [onUpdateEquipment, speedSetting]);

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) {
        e.preventDefault();
        handleDirectionPress('forward');
      } else if (['ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault();
        handleDirectionPress('backward');
      } else if (['ArrowLeft', 'KeyA'].includes(e.code)) {
        e.preventDefault();
        handleDirectionPress('left');
      } else if (['ArrowRight', 'KeyD'].includes(e.code)) {
        e.preventDefault();
        handleDirectionPress('right');
      } else if (e.code === 'Space') {
        e.preventDefault();
        handleEmergencyStop();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) {
        handleDirectionRelease();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleDirectionPress, handleDirectionRelease]);

  // Emergency Stop Handler
  const handleEmergencyStop = () => {
    playEmergencyStopSound();
    hapticWarning();
    void MissionPlannerService.sendRoverCommand('ESTOP');
    setDrillActive(false);
    setHopperMode('CENTER');
    setActuatorState('STOP');
    void MissionPlannerService.setArmed(false);
    void MissionPlannerService.setMode('HOLD');
    onUpdateEquipment((prev) => ({
      ...prev,
      isRunning: false,
      isEmergencyStopped: true,
      speedKmh: 0,
      activeDirection: 'stopped',
    }));
  };

  const handleResetEmergency = () => {
    playBeepSound(440, 0.1);
    hapticLight();
    void MissionPlannerService.setMode('MANUAL');
    onUpdateEquipment((prev) => ({
      ...prev,
      isEmergencyStopped: false,
      activeDirection: 'idle',
    }));
  };

  const handleToggleRun = () => {
    if (equipmentState.isEmergencyStopped) {
      handleResetEmergency();
      return;
    }

    playBeepSound(equipmentState.isRunning ? 500 : 880, 0.15);
    if (!equipmentState.isRunning) {
      hapticSuccess();
      void MissionPlannerService.setArmed(true);
      void MissionPlannerService.setMode('AUTO');
      onUpdateEquipment((prev) => ({
        ...prev,
        isRunning: true,
        isEmergencyStopped: false,
        speedKmh: speedSetting,
      }));
    } else {
      hapticMedium();
      void MissionPlannerService.setArmed(false);
      void MissionPlannerService.setMode('MANUAL');
      onUpdateEquipment((prev) => ({
        ...prev,
        isRunning: false,
        speedKmh: 0,
        activeDirection: 'idle',
      }));

      // If finished session, can log
      if (equipmentState.sessionDurationSeconds > 10) {
        onLogOperation({
          cropName: selectedCrop.name,
          cropId: selectedCrop.id,
          durationMinutes: Math.round(equipmentState.sessionDurationSeconds / 60),
          areaAcres: Number(equipmentState.totalAreaCoveredAcres.toFixed(1)),
          status: 'Completed',
        });
      }
    }
  };

  const handleCropChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cropId = parseInt(e.target.value, 10);
    const found = CROPS_DATA.find((c) => c.id === cropId);
    if (found) {
      playClickSound();
      onSelectCrop(found);
      onUpdateEquipment((prev) => ({
        ...prev,
        activeCropId: found.id,
      }));
    }
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-4 sm:gap-5 pb-6 animate-fadeIn">
      {/* Header Section */}
      <section className="text-center pt-1">
        <h2 className="text-[22px] sm:text-[26px] font-extrabold text-[#0A0A0A] uppercase tracking-wider font-['Public_Sans']">
          Equipment Control
        </h2>
        <p className="text-[13px] text-[#414844] font-medium mt-0.5 font-['Atkinson_Hyperlegible']">
          Manual override and drill configuration
        </p>
      </section>

      {/* Emergency Stop Banner if active */}
      {equipmentState.isEmergencyStopped && (
        <div className="bg-[#ffdad6] border-[3px] border-[#ba1a1a] rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 animate-bounce">
          <div className="flex items-center gap-3 text-[#93000a]">
            <AlertTriangle className="w-8 h-8 flex-shrink-0" />
            <div>
              <div className="font-extrabold text-[18px] uppercase tracking-wide">
                Emergency Stop Engaged
              </div>
              <div className="text-sm font-semibold text-[#7e0000]">
                All seeder drill motors and hydraulic drives are locked down.
              </div>
            </div>
          </div>
          <button
            onClick={handleResetEmergency}
            className="w-full sm:w-auto px-5 py-2.5 bg-[#ba1a1a] text-white font-extrabold rounded-lg border-2 border-[#0A0A0A] hover:bg-[#93000a] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer uppercase text-sm tracking-wider"
          >
            <RotateCcw className="w-4 h-4" />
            Clear & Reset Lockout
          </button>
        </div>
      )}

      {/* Directional Controls D-Pad */}
      <section className="flex flex-col items-center justify-center py-1">
        <div
          id="dpad-container"
          className="relative w-[280px] xs:w-[300px] h-[280px] xs:h-[300px] bg-[#EEEEEE] rounded-3xl flex items-center justify-center border-[4px] border-[#0A0A0A] shadow-md select-none touch-none"
        >
          {/* Active Direction Pulse Ring */}
          {activeDirectionKey && (
            <div className="absolute inset-2 rounded-2xl border-4 border-[#2D6A4F] animate-ping opacity-25 pointer-events-none" />
          )}

          {/* Up (Forward) */}
          <button
            id="btn-dpad-up"
            aria-label="Move Forward"
            onPointerDown={() => handleDirectionPress('forward')}
            onPointerUp={handleDirectionRelease}
            onPointerLeave={handleDirectionRelease}
            className={`absolute top-2.5 left-1/2 -translate-x-1/2 w-[70px] xs:w-[76px] h-[70px] xs:h-[76px] rounded-xl border-4 border-[#0A0A0A] flex flex-col items-center justify-center shadow-xs transition-all active:scale-95 cursor-pointer ${
              activeDirectionKey === 'forward'
                ? 'bg-[#c1ecd4] border-[#012d1d] scale-95 ring-4 ring-[#2D6A4F]/40'
                : 'bg-white hover:bg-gray-100'
            }`}
          >
            <ArrowUp
              className={`w-9 h-9 stroke-[3] ${
                activeDirectionKey === 'forward' ? 'text-[#012d1d]' : 'text-[#0A0A0A]'
              }`}
            />
          </button>

          {/* Left */}
          <button
            id="btn-dpad-left"
            aria-label="Move Left"
            onPointerDown={() => handleDirectionPress('left')}
            onPointerUp={handleDirectionRelease}
            onPointerLeave={handleDirectionRelease}
            className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-[70px] xs:w-[76px] h-[70px] xs:h-[76px] rounded-xl border-4 border-[#0A0A0A] flex flex-col items-center justify-center shadow-xs transition-all active:scale-95 cursor-pointer ${
              activeDirectionKey === 'left'
                ? 'bg-[#c1ecd4] border-[#012d1d] scale-95 ring-4 ring-[#2D6A4F]/40'
                : 'bg-white hover:bg-gray-100'
            }`}
          >
            <ArrowLeft
              className={`w-9 h-9 stroke-[3] ${
                activeDirectionKey === 'left' ? 'text-[#012d1d]' : 'text-[#0A0A0A]'
              }`}
            />
          </button>

          {/* Center STOP Button */}
          <button
            id="btn-dpad-stop"
            aria-label="Emergency Stop"
            onClick={handleEmergencyStop}
            className="w-[110px] xs:w-[120px] h-[110px] xs:h-[120px] bg-[#DD0000] hover:bg-[#C00000] active:bg-[#990000] rounded-2xl flex flex-col items-center justify-center border-[4px] border-[#0A0A0A] shadow-lg active:scale-90 transition-all focus:outline-none focus:ring-4 focus:ring-red-400 z-10 cursor-pointer"
          >
            <span className="text-[24px] xs:text-[28px] font-black text-white tracking-widest uppercase font-['Public_Sans'] drop-shadow-sm">
              STOP
            </span>
          </button>

          {/* Right */}
          <button
            id="btn-dpad-right"
            aria-label="Move Right"
            onPointerDown={() => handleDirectionPress('right')}
            onPointerUp={handleDirectionRelease}
            onPointerLeave={handleDirectionRelease}
            className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-[70px] xs:w-[76px] h-[70px] xs:h-[76px] rounded-xl border-4 border-[#0A0A0A] flex flex-col items-center justify-center shadow-xs transition-all active:scale-95 cursor-pointer ${
              activeDirectionKey === 'right'
                ? 'bg-[#c1ecd4] border-[#012d1d] scale-95 ring-4 ring-[#2D6A4F]/40'
                : 'bg-white hover:bg-gray-100'
            }`}
          >
            <ArrowRight
              className={`w-9 h-9 stroke-[3] ${
                activeDirectionKey === 'right' ? 'text-[#012d1d]' : 'text-[#0A0A0A]'
              }`}
            />
          </button>

          {/* Down (Backward) */}
          <button
            id="btn-dpad-down"
            aria-label="Move Backward"
            onPointerDown={() => handleDirectionPress('backward')}
            onPointerUp={handleDirectionRelease}
            onPointerLeave={handleDirectionRelease}
            className={`absolute bottom-2.5 left-1/2 -translate-x-1/2 w-[70px] xs:w-[76px] h-[70px] xs:h-[76px] rounded-xl border-4 border-[#0A0A0A] flex flex-col items-center justify-center shadow-xs transition-all active:scale-95 cursor-pointer ${
              activeDirectionKey === 'backward'
                ? 'bg-[#c1ecd4] border-[#012d1d] scale-95 ring-4 ring-[#2D6A4F]/40'
                : 'bg-white hover:bg-gray-100'
            }`}
          >
            <ArrowDown
              className={`w-9 h-9 stroke-[3] ${
                activeDirectionKey === 'backward' ? 'text-[#012d1d]' : 'text-[#0A0A0A]'
              }`}
            />
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-2 font-medium">
          Use D-Pad or Arrow Keys (W, A, S, D) • Spacebar for STOP
        </p>
      </section>

      {/* Live Driving Feedback HUD when Running */}
      {equipmentState.isRunning && (
        <div className="bg-[#c1ecd4] border-2 border-[#012d1d] rounded-2xl p-3 grid grid-cols-3 gap-2 shadow-xs animate-fadeIn">
          <div className="flex flex-col items-center justify-center bg-white/70 rounded-xl p-2 border border-[#012d1d]/20 text-center">
            <span className="text-[10px] font-bold uppercase text-[#002114] flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-[#2D6A4F] animate-spin" /> Speed
            </span>
            <span className="text-[16px] font-black text-[#012d1d] leading-tight mt-0.5">
              {equipmentState.speedKmh.toFixed(1)} <span className="text-[11px] font-bold">km/h</span>
            </span>
          </div>

          <div className="flex flex-col items-center justify-center bg-white/70 rounded-xl p-2 border border-[#012d1d]/20 text-center">
            <span className="text-[10px] font-bold uppercase text-[#002114] flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-[#2D6A4F]" /> Heading
            </span>
            <span className="text-[16px] font-black text-[#012d1d] leading-tight mt-0.5">
              {equipmentState.steeringAngleDeg > 0
                ? `+${equipmentState.steeringAngleDeg}°`
                : `${equipmentState.steeringAngleDeg}°`}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center bg-white/70 rounded-xl p-2 border border-[#012d1d]/20 text-center">
            <span className="text-[10px] font-bold uppercase text-[#002114]">Area Run</span>
            <span className="text-[16px] font-black text-[#2D6A4F] leading-tight mt-0.5">
              {equipmentState.totalAreaCoveredAcres.toFixed(2)} <span className="text-[11px] font-bold">Ac</span>
            </span>
          </div>
        </div>
      )}

      {/* ESP32 Hardware Mechanisms Card (Machinist & Navigator Direct Controls) */}
      <div className="bg-white border-2 border-[#0A0A0A] rounded-2xl p-4 shadow-sm flex flex-col gap-3.5">
        <div className="flex items-center justify-between border-b border-gray-200 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-[15px] font-extrabold text-[#0A0A0A] uppercase tracking-wide font-['Public_Sans']">
              Rover Hardware & Tools
            </h3>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded border border-emerald-300">
            ESP32 UART / HTTP
          </span>
        </div>

        {/* Speed Slider (PWM 80-255) */}
        <div className="flex flex-col gap-1.5 p-2.5 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-gray-700 flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-[#2D6A4F]" /> Motor Speed PWM:
            </span>
            <span className="font-mono text-emerald-800 font-extrabold">{motorPwmSpeed} / 255</span>
          </div>
          <input
            type="range"
            min="80"
            max="255"
            value={motorPwmSpeed}
            onChange={(e) => handlePwmSpeedChange(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-gray-300 rounded appearance-none cursor-pointer accent-[#2D6A4F]"
          />
        </div>

        {/* Tool Action Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Seed Drill */}
          <div className="flex flex-col gap-1.5 p-2.5 bg-gray-50 rounded-xl border border-gray-200">
            <span className="font-extrabold text-gray-800 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-600" /> Seed Drill Motor
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={handleToggleDrill}
                className={`py-2 px-1 rounded-lg font-bold text-center cursor-pointer transition-all ${
                  drillActive ? 'bg-emerald-600 text-white shadow-xs' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {drillActive ? 'DRILL ON' : 'START'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrillActive(false);
                  void MissionPlannerService.sendRoverCommand('DRILL_OFF');
                }}
                className="py-2 px-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-bold text-center cursor-pointer"
              >
                STOP
              </button>
            </div>
          </div>

          {/* Hopper Servo (0° to ±45° Dual-Side Seeding) */}
          <div className="flex flex-col gap-1.5 p-2.5 bg-gray-50 rounded-xl border border-gray-200 col-span-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-gray-800 flex items-center gap-1 text-xs">
                <RotateCw className="w-3.5 h-3.5 text-blue-600" /> Precision Hopper Seeder (0° to ±45°)
              </span>
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                {hopperMode === 'LEFT' ? '+45° (LEFT)' : hopperMode === 'RIGHT' ? '-45° (RIGHT)' : hopperMode === 'MULTI' ? 'MULTI-SEED' : '0° (CENTER)'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => handleHopperAction('LEFT')}
                className={`py-2 px-1 rounded-lg font-bold text-center cursor-pointer transition-all ${
                  hopperMode === 'LEFT' ? 'bg-blue-600 text-white shadow-xs' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                LEFT +45°
              </button>
              <button
                type="button"
                onClick={() => handleHopperAction('CENTER')}
                className={`py-2 px-1 rounded-lg font-bold text-center cursor-pointer transition-all ${
                  hopperMode === 'CENTER' ? 'bg-gray-800 text-white shadow-xs' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                CENTER 0°
              </button>
              <button
                type="button"
                onClick={() => handleHopperAction('RIGHT')}
                className={`py-2 px-1 rounded-lg font-bold text-center cursor-pointer transition-all ${
                  hopperMode === 'RIGHT' ? 'bg-blue-600 text-white shadow-xs' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                RIGHT -45°
              </button>
              <button
                type="button"
                onClick={() => handleHopperAction('MULTI')}
                className={`py-2 px-1 rounded-lg font-bold text-center cursor-pointer transition-all ${
                  hopperMode === 'MULTI' ? 'bg-emerald-600 text-white animate-pulse shadow-xs' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                }`}
              >
                MULTI ±45°
              </button>
            </div>
          </div>

          {/* Depth Linear Actuator */}
          <div className="flex flex-col gap-1.5 p-2.5 bg-gray-50 rounded-xl border border-gray-200">
            <span className="font-extrabold text-gray-800 flex items-center justify-between">
              <span>Depth Actuator</span>
              <span className="font-mono text-[10px] text-gray-500">{actuatorState}</span>
            </span>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => handleActuatorCommand('ACT_DOWN')}
                className={`py-1.5 rounded-lg font-bold text-[11px] cursor-pointer ${
                  actuatorState === 'DOWN' ? 'bg-emerald-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                DOWN
              </button>
              <button
                type="button"
                onClick={() => handleActuatorCommand('ACT_STOP')}
                className="py-1.5 rounded-lg font-bold text-[11px] bg-red-100 text-red-800 hover:bg-red-200 cursor-pointer"
              >
                HOLD
              </button>
              <button
                type="button"
                onClick={() => handleActuatorCommand('ACT_UP')}
                className={`py-1.5 rounded-lg font-bold text-[11px] cursor-pointer ${
                  actuatorState === 'UP' ? 'bg-emerald-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                UP
              </button>
            </div>
          </div>

          {/* NPK Fertilizer Servo */}
          <div className="flex flex-col gap-1.5 p-2.5 bg-gray-50 rounded-xl border border-gray-200">
            <span className="font-extrabold text-gray-800 flex items-center justify-between">
              <span>NPK Dispenser</span>
              <span className="font-mono text-[10px] text-gray-500">{npkState}</span>
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setNpkState('DOWN');
                  void MissionPlannerService.sendRoverCommand('NPK_DOWN');
                }}
                className={`py-2 px-1 rounded-lg font-bold text-center cursor-pointer ${
                  npkState === 'DOWN' ? 'bg-purple-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                DEPLOY
              </button>
              <button
                type="button"
                onClick={() => {
                  setNpkState('UP');
                  void MissionPlannerService.sendRoverCommand('NPK_UP');
                }}
                className={`py-2 px-1 rounded-lg font-bold text-center cursor-pointer ${
                  npkState === 'UP' ? 'bg-gray-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                RETRACT
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Preparation Container (Step 1 & Step 2) */}
      <div className="bg-white border-2 border-[#0A0A0A] rounded-2xl p-4 shadow-sm flex flex-col gap-4">
        {/* Step 1: Seed/Crop Selection */}
        <section className="flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <label
              htmlFor="crop-select"
              className="text-[15px] font-extrabold text-[#0A0A0A] uppercase tracking-wide font-['Public_Sans']"
            >
              1. Select Seed/Crop
            </label>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-[#f1f4f9] border border-gray-300 rounded-md text-[#0A0A0A]">
              35 CALIBRATED
            </span>
          </div>

          <div className="relative">
            <select
              id="crop-select"
              value={selectedCrop.id}
              onChange={handleCropChange}
              className="w-full h-[52px] pl-3.5 pr-10 bg-white border-2 border-[#0A0A0A] rounded-xl appearance-none text-[16px] font-extrabold text-[#0A0A0A] focus:outline-none focus:ring-3 focus:ring-[#2D6A4F]/30 cursor-pointer font-['Public_Sans']"
            >
              <option disabled value="">
                Choose a crop profile
              </option>
              {CROPS_DATA.map((crop) => (
                <option key={crop.id} value={crop.id}>
                  {crop.id}. {crop.name} ({crop.botanicalName})
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#0A0A0A]">
              <svg
                className="w-5 h-5 stroke-[2.5]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Active Crop Quick Parameter Pill */}
          <div className="bg-[#f7f9ff] border border-gray-300 rounded-xl p-2.5 flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full inline-block border border-black/30 shrink-0"
                  style={{ backgroundColor: selectedCrop.seedColor }}
                />
                <span className="font-extrabold text-[#0A0A0A] truncate">{selectedCrop.name}</span>
                <span className="text-gray-500 font-medium text-[11px] truncate">({selectedCrop.botanicalName})</span>
              </div>
              <span className="text-[11px] font-bold text-[#012d1d] shrink-0 bg-white px-2 py-0.5 rounded border border-gray-200">
                Depth: {selectedCrop.sowingDepth}
              </span>
            </div>

            <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-gray-200">
              <span className="text-gray-500 font-bold uppercase text-[10.5px]">Seed Spacing:</span>
              <div className="flex items-center gap-2">
                <span className="font-black text-[#012d1d] text-sm">{spacingSetting.toFixed(1)} cm</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleSpacingStep(-1)}
                    className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-900 font-black text-xs flex items-center justify-center border border-gray-300 cursor-pointer"
                    title="Decrease spacing 1 cm"
                  >
                    -
                  </button>
                  <button
                    onClick={() => handleSpacingStep(1)}
                    className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-900 font-black text-xs flex items-center justify-center border border-gray-300 cursor-pointer"
                    title="Increase spacing 1 cm"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Step 2: Start Operation Action Area */}
        <section className="flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <label className="text-[15px] font-extrabold text-[#0A0A0A] uppercase tracking-wide font-['Public_Sans']">
              2. Start Operation
            </label>
            <button
              onClick={() => setShowAdjustModal(true)}
              className="text-[11px] font-bold flex items-center gap-1 text-[#396093] hover:underline cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              Adjust Drill
            </button>
          </div>

          <button
            id="btn-run-equipment"
            onClick={handleToggleRun}
            className={`w-full h-[58px] rounded-xl flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all border-2 border-[#0A0A0A] shadow-sm cursor-pointer ${
              equipmentState.isRunning
                ? 'bg-[#D00000] hover:bg-[#B00000] text-white'
                : 'bg-[#116633] hover:bg-[#0E542A] text-white'
            }`}
          >
            {equipmentState.isRunning ? (
              <>
                <Square className="w-6 h-6 fill-current" />
                <span className="text-[18px] font-black tracking-wider uppercase font-['Public_Sans']">
                  PAUSE
                </span>
              </>
            ) : (
              <>
                <Play className="w-6 h-6 fill-current" />
                <span className="text-[18px] font-black tracking-wider uppercase font-['Public_Sans']">
                  START
                </span>
              </>
            )}
          </button>
        </section>
      </div>

      {/* Adjust Parameters Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-4 border-[#0A0A0A] rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-5 animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-gray-200 pb-3">
              <h3 className="text-xl font-black text-[#0A0A0A] uppercase font-['Public_Sans']">
                Calibration Adjustments
              </h3>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="w-8 h-8 rounded-lg border-2 border-[#0A0A0A] flex items-center justify-center font-bold hover:bg-gray-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Manual Seed Spacing Slider & Input */}
            <div className="flex flex-col gap-2 p-3 bg-[#f7f9ff] border-2 border-[#2D6A4F]/30 rounded-xl">
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-sm text-[#012d1d] uppercase">
                  Manual Seed Spacing (Interval):
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="0.5"
                    value={spacingSetting}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) setSpacingSetting(val);
                    }}
                    className="w-20 h-8 px-2 border-2 border-[#0A0A0A] rounded-lg text-center font-black text-sm text-[#012d1d] bg-white"
                  />
                  <span className="text-xs font-bold text-gray-600">cm</span>
                </div>
              </div>

              <input
                type="range"
                min="2.0"
                max="60.0"
                step="0.5"
                value={spacingSetting}
                onChange={(e) => setSpacingSetting(parseFloat(e.target.value))}
                className="w-full h-3 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-[#2D6A4F]"
              />

              {/* Quick Spacing Preset Chips */}
              <div className="flex flex-wrap gap-1 mt-1">
                {[5, 10, 15, 18, 20, 25, 30, 45].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSpacingSetting(preset)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer ${
                      Math.abs(spacingSetting - preset) < 0.2
                        ? 'bg-[#012d1d] text-white border-[#012d1d]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {preset} cm
                  </button>
                ))}
              </div>
            </div>

            {/* Target Speed Slider */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between font-bold text-sm">
                <span>Working Ground Speed:</span>
                <span className="text-[#116633] text-base font-extrabold">{speedSetting.toFixed(1)} km/h</span>
              </div>
              <input
                type="range"
                min="2.0"
                max="14.0"
                step="0.5"
                value={speedSetting}
                onChange={(e) => setSpeedSetting(parseFloat(e.target.value))}
                className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#116633]"
              />
              <div className="flex justify-between text-xs text-gray-500 font-medium">
                <span>2.0 km/h (Precision)</span>
                <span>14.0 km/h (Fast)</span>
              </div>
            </div>

            {/* Sowing Depth Slider */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between font-bold text-sm">
                <span>Sowing Furrow Depth:</span>
                <span className="text-[#116633] text-base font-extrabold">{depthSetting.toFixed(1)} cm</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="8.0"
                step="0.5"
                value={depthSetting}
                onChange={(e) => setDepthSetting(parseFloat(e.target.value))}
                className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#116633]"
              />
              <div className="flex justify-between text-xs text-gray-500 font-medium">
                <span>1.0 cm (Shallow)</span>
                <span>8.0 cm (Deep)</span>
              </div>
            </div>

            <button
              onClick={() => {
                playClickSound();
                onUpdateEquipment((prev) => ({
                  ...prev,
                  targetSpeedKmh: speedSetting,
                  targetDepthCm: depthSetting,
                  targetSpacingCm: spacingSetting,
                  actualSpacingCm: spacingSetting,
                  speedKmh: prev.isRunning ? speedSetting : prev.speedKmh,
                }));
                onSelectCrop({
                  ...selectedCrop,
                  seedSpacing: `${spacingSetting} cm`,
                });
                setShowAdjustModal(false);
              }}
              className="w-full py-3.5 bg-[#116633] text-white font-extrabold rounded-xl border-2 border-[#0A0A0A] hover:bg-[#0E542A] uppercase tracking-wider cursor-pointer font-['Public_Sans']"
            >
              Save & Apply Calibration
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
