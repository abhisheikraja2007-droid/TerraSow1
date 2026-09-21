import React, { useState } from 'react';
import {
  Compass,
  Gauge,
  Activity,
  Radio,
  Zap,
  Power,
  RotateCcw,
  Navigation,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Play,
  Square,
  Crosshair,
  Volume2,
  VolumeX,
  RefreshCw,
  Tractor,
  Layers,
} from 'lucide-react';
import { VehicleTelemetry, VehicleMode, CropProfile } from '../../types';
import { playClickSound, playBeepSound, playEmergencyStopSound } from '../../utils/audio';
import { hapticLight, hapticMedium, hapticHeavy } from '../../utils/haptics';

interface FlightDataHUDProps {
  telemetry: VehicleTelemetry;
  selectedCrop: CropProfile;
  onSetMode: (mode: VehicleMode) => void;
  onToggleArm: (arm: boolean) => void;
  onTriggerRTL: () => void;
  onOverrideServo: (active: boolean) => void;
  onSendGuidedTarget?: (lat: number, lng: number) => void;
}

export const FlightDataHUD: React.FC<FlightDataHUDProps> = ({
  telemetry,
  selectedCrop,
  onSetMode,
  onToggleArm,
  onTriggerRTL,
  onOverrideServo,
}) => {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [guidedSpeedKmh, setGuidedSpeedKmh] = useState(7.5);
  const [servoPwmValue, setServoPwmValue] = useState(1800);

  // Approximate pitch & roll angles from heading/speed simulation if not provided
  const pitchDeg = telemetry.pitchDeg ?? (telemetry.groundspeedKmh > 0 ? -1.8 : 0);
  const rollDeg = telemetry.rollDeg ?? (telemetry.groundspeedKmh > 0 ? 0.9 : 0);
  const heading = telemetry.headingDeg;

  // Speak announcement helper
  const speakStatus = (text: string) => {
    if (voiceEnabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleModeChange = (newMode: VehicleMode) => {
    playClickSound();
    hapticMedium();
    onSetMode(newMode);
    speakStatus(`Mode changed to ${newMode}`);
  };

  const handleArmToggle = () => {
    const nextState = !telemetry.armed;
    if (nextState) {
      playBeepSound();
      hapticHeavy();
      speakStatus('Warning: Tractor motors armed');
    } else {
      playClickSound();
      hapticMedium();
      speakStatus('Motors disarmed');
    }
    onToggleArm(nextState);
  };

  const handleRTLClick = () => {
    playEmergencyStopSound();
    hapticHeavy();
    speakStatus('Return to launch activated');
    onTriggerRTL();
  };

  const handleServoToggle = (active: boolean) => {
    playClickSound();
    hapticLight();
    onOverrideServo(active);
    speakStatus(active ? 'Seeder metering motor active' : 'Seeder motor stopped');
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner with Flight Status & Voice Controls */}
      <div className="flex flex-col gap-2.5 bg-[#012d1d] text-white p-3.5 rounded-2xl border-2 border-black shadow-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
              <Tractor className="w-5 h-5 text-[#4ade80]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-extrabold text-[13.5px] tracking-wide uppercase font-['Public_Sans'] leading-tight">
                  ArduRover PFD HUD
                </span>
                <span
                  className={`px-2 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider ${
                    telemetry.armed ? 'bg-red-500 text-white animate-pulse' : 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/40'
                  }`}
                >
                  {telemetry.armed ? 'ARMED' : 'DISARMED'}
                </span>
              </div>
              <div className="text-[10.5px] text-white/70 font-mono flex items-center gap-1.5 mt-0.5">
                <span>Mode: <strong className="text-emerald-400">{telemetry.mode}</strong></span>
                <span>•</span>
                <span>GPS: <strong className="text-emerald-300">{telemetry.gpsFixType}</strong> ({telemetry.satellitesCount}s)</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setVoiceEnabled(!voiceEnabled);
              playClickSound();
            }}
            className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center cursor-pointer transition-all shrink-0 ${
              voiceEnabled
                ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                : 'bg-white/10 border-white/20 text-white/60'
            }`}
            title="Toggle Voice HUD"
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>

        <button
          onClick={handleArmToggle}
          className={`w-full py-2.5 rounded-xl border-2 font-black text-xs uppercase cursor-pointer tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm ${
            telemetry.armed
              ? 'bg-red-600 hover:bg-red-700 text-white border-red-900 shadow-red-900/30'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-900'
          }`}
        >
          <Power className="w-4 h-4" />
          <span>{telemetry.armed ? 'DISARM TRACTOR MOTORS' : 'ARM TRACTOR MOTORS'}</span>
        </button>
      </div>

      {/* Main HUD Layout: Vertical Mobile Flow */}
      <div className="flex flex-col gap-4">
        {/* PFD Artificial Horizon & Compass Tape */}
        <div className="bg-[#0f1d15] border-4 border-black rounded-2xl p-3 flex flex-col items-center justify-between text-white shadow-lg relative overflow-hidden min-h-[320px]">
          {/* Top Tape: Compass Rose Heading */}
          <div className="w-full flex flex-col items-center pb-1.5 border-b border-white/10">
            <div className="flex items-center justify-between w-full px-3 text-[11px] font-mono text-white/60">
              <span>{(heading - 30 + 360) % 360}°</span>
              <span className="text-emerald-400 font-extrabold text-xs bg-black/60 px-2.5 py-0.5 rounded-md border border-emerald-500/40">
                HDG {heading.toFixed(0)}°
              </span>
              <span>{(heading + 30) % 360}°</span>
            </div>
            {/* Compass Scale ticks */}
            <div className="w-full h-3 flex items-center justify-center gap-1.5 text-[8.5px] font-mono text-white/50 pt-0.5">
              <span>NW</span>
              <span>•</span>
              <span className="text-white font-bold">N</span>
              <span>•</span>
              <span>NE</span>
              <span>•</span>
              <span className="text-white font-bold">E</span>
              <span>•</span>
              <span>SE</span>
            </div>
          </div>

          {/* Artificial Horizon Circle */}
          <div className="relative w-52 h-52 my-auto flex items-center justify-center">
            {/* Outer Horizon Ring */}
            <div className="w-48 h-48 rounded-full border-4 border-white/30 overflow-hidden relative shadow-inner bg-[#1f3f2d]">
              {/* Sky / Ground Horizon Divider with pitch offset */}
              <div
                className="absolute inset-0 transition-transform duration-300"
                style={{
                  transform: `rotate(${-rollDeg}deg) translateY(${pitchDeg * 3}px)`,
                }}
              >
                {/* Sky (Blue/Teal gradient) */}
                <div className="w-full h-1/2 bg-gradient-to-b from-sky-800 to-sky-600" />
                {/* Ground (Agri Earth/Green gradient) */}
                <div className="w-full h-1/2 bg-gradient-to-b from-[#2d5a27] to-[#173014] border-t-2 border-white/80" />
              </div>

              {/* Pitch Ladder Marks */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-[8px] font-mono text-white/70">
                <div className="w-10 border-t border-white/50 -translate-y-6 flex justify-between px-1">
                  <span>+10</span>
                  <span>+10</span>
                </div>
                <div className="w-6 border-t border-white/40 -translate-y-3" />
                <div className="w-12 border-t-2 border-emerald-400" />
                <div className="w-6 border-t border-white/40 translate-y-3" />
                <div className="w-10 border-t border-white/50 translate-y-6 flex justify-between px-1">
                  <span>-10</span>
                  <span>-10</span>
                </div>
              </div>
            </div>

            {/* Fixed Center Bore Sight Reticle (Tractor reference) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-1">
                <div className="w-8 h-1 bg-amber-400 rounded-sm shadow-md" />
                <div className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 bg-black/40" />
                <div className="w-8 h-1 bg-amber-400 rounded-sm shadow-md" />
              </div>
            </div>

            {/* Left Speed Tape Overlay */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 bg-black/80 border border-white/20 rounded-r-lg px-1.5 py-2 flex flex-col items-center text-[10px] font-mono">
              <span className="text-[8px] text-white/50 font-bold">SPD</span>
              <span className="text-emerald-400 font-extrabold text-xs">{telemetry.groundspeedKmh.toFixed(1)}</span>
              <span className="text-[8px] text-white/50">km/h</span>
            </div>

            {/* Right Altitude Tape Overlay */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 bg-black/80 border border-white/20 rounded-l-lg px-1.5 py-2 flex flex-col items-center text-[10px] font-mono">
              <span className="text-[8px] text-white/50 font-bold">ALT</span>
              <span className="text-sky-400 font-extrabold text-xs">{telemetry.altitudeMeters.toFixed(1)}</span>
              <span className="text-[8px] text-white/50">m</span>
            </div>
          </div>

          {/* Bottom Telemetry HUD Ribbon */}
          <div className="w-full grid grid-cols-4 gap-1.5 pt-2 border-t border-white/10 text-center text-[10px] font-mono">
            <div className="flex flex-col">
              <span className="text-white/50 text-[8.5px] uppercase">Throttle</span>
              <span className="text-amber-400 font-bold">{telemetry.throttlePercent}%</span>
            </div>
            <div className="flex flex-col">
              <span className="text-white/50 text-[8.5px] uppercase">Battery</span>
              <span className="text-emerald-400 font-bold">{telemetry.batteryVoltage.toFixed(1)}V</span>
            </div>
            <div className="flex flex-col">
              <span className="text-white/50 text-[8.5px] uppercase">WP Target</span>
              <span className="text-white font-bold">#{telemetry.currentWaypointIndex}/{telemetry.totalWaypointsCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-white/50 text-[8.5px] uppercase">RTK</span>
              <span className="text-emerald-400 font-bold">±{telemetry.rtkAccuracyCm}cm</span>
            </div>
          </div>
        </div>

        {/* Live Controls & Telemetry Dashboard */}
        <div className="flex flex-col gap-3.5">
          {/* Flight Modes Selection Grid */}
          <div className="bg-white border-2 border-gray-300 rounded-2xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-gray-200">
              <div className="flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-[#2D6A4F]" />
                <h4 className="font-extrabold text-xs text-[#012d1d] uppercase font-['Public_Sans']">
                  Drive Mode Selector
                </h4>
              </div>
              <span className="text-[10.5px] font-mono text-gray-500">Active: <strong className="text-emerald-800">{telemetry.mode}</strong></span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {(['MANUAL', 'AUTO', 'GUIDED', 'STEERING', 'HOLD', 'RTL', 'ACRO', 'LEARNING'] as VehicleMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  className={`py-2 px-1 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer border text-center ${
                    telemetry.mode === m
                      ? 'bg-[#012d1d] text-white border-black shadow-xs ring-1 ring-[#4ade80]/60'
                      : 'bg-[#f7f9ff] text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Precision Seeder Motor Manual Override & PWM Output */}
          <div className="bg-white border-2 border-gray-300 rounded-2xl p-3.5 shadow-sm flex flex-col gap-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-gray-200">
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-600" />
                <h4 className="font-extrabold text-xs text-[#012d1d] uppercase font-['Public_Sans']">
                  Seeder Actuator Override
                </h4>
              </div>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                  telemetry.seederActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {telemetry.seederActive ? 'DISPENSING' : 'STOPPED'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleServoToggle(true)}
                className={`py-2.5 px-2 rounded-xl font-extrabold text-xs uppercase border cursor-pointer flex items-center justify-center gap-1.5 transition-all ${
                  telemetry.seederActive
                    ? 'bg-emerald-600 text-white border-emerald-800 shadow-xs'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}
              >
                <Play className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Sow (ON)</span>
              </button>

              <button
                onClick={() => handleServoToggle(false)}
                className="py-2.5 px-2 rounded-xl font-extrabold text-xs uppercase border border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-800 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Halt (OFF)</span>
              </button>
            </div>

            <div className="flex items-center justify-between text-[10.5px] text-gray-600 font-mono pt-1 border-t border-gray-200">
              <span>Target: <strong>{selectedCrop.name.split(' ')[0]}</strong></span>
              <span>Motor: <strong>{telemetry.seederActive ? '120 RPM' : '0 RPM'}</strong></span>
            </div>
          </div>

          {/* Quick Mission Actions (RTL, Reboot) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleRTLClick}
              className="py-2.5 px-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs uppercase rounded-xl border border-amber-800 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Return (RTL)</span>
            </button>

            <button
              onClick={() => {
                playClickSound();
                hapticLight();
                speakStatus('Autopilot flight controller rebooting');
              }}
              className="py-2.5 px-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs uppercase rounded-xl border border-gray-300 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-gray-600 shrink-0" />
              <span className="truncate">Reboot</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
