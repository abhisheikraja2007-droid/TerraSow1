import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Activity,
  Send,
  Trash2,
  Filter,
  Play,
  Pause,
  Copy,
  Check,
  Radio,
  Zap,
  Cpu,
  AlertCircle,
} from 'lucide-react';
import { MAVLinkMessage, VehicleTelemetry } from '../../types';
import { playClickSound, playBeepSound } from '../../utils/audio';

interface MavlinkConsoleProps {
  telemetry: VehicleTelemetry;
  onShowToast?: (msg: string) => void;
}

export const MavlinkConsole: React.FC<MavlinkConsoleProps> = ({ telemetry, onShowToast }) => {
  const [messages, setMessages] = useState<MAVLinkMessage[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [customCommand, setCustomCommand] = useState('MAV_CMD_DO_SET_SERVO');
  const [param1, setParam1] = useState('9');
  const [param2, setParam2] = useState('1800');
  const [copied, setCopied] = useState(false);
  const terminalBottomRef = useRef<HTMLDivElement | null>(null);

  // Stream simulated real MAVLink v2 packets based on telemetry
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;
      const seq = Math.floor(Math.random() * 255);

      const packetTypes = [
        {
          name: 'HEARTBEAT',
          msgId: 0,
          payload: { type: 10, autopilot: 3, base_mode: telemetry.armed ? 209 : 81, custom_mode: telemetry.mode, system_status: 4 },
        },
        {
          name: 'GLOBAL_POSITION_INT',
          msgId: 33,
          payload: {
            time_boot_ms: Date.now() % 1000000,
            lat: Math.round(telemetry.lat * 1e7),
            lon: Math.round(telemetry.lng * 1e7),
            alt: Math.round(telemetry.altitudeMeters * 1000),
            relative_alt: 0,
            vx: Math.round(telemetry.groundspeedKmh * 27.7),
            vy: 0,
            vz: 0,
            hdg: Math.round(telemetry.headingDeg * 100),
          },
        },
        {
          name: 'ATTITUDE',
          msgId: 30,
          payload: { roll: 0.015, pitch: -0.03, yaw: (telemetry.headingDeg * Math.PI) / 180, rollspeed: 0, pitchspeed: 0, yawspeed: 0 },
        },
        {
          name: 'SYS_STATUS',
          msgId: 1,
          payload: {
            voltage_battery: Math.round(telemetry.batteryVoltage * 1000),
            current_battery: telemetry.armed ? 850 : 120, // cA
            battery_remaining: telemetry.batteryRemainingPercent,
            drop_rate_comm: 0,
            errors_comm: 0,
          },
        },
        {
          name: 'GPS_RAW_INT',
          msgId: 24,
          payload: { fix_type: 6, satellites_visible: telemetry.satellitesCount, eph: Math.round(telemetry.hdop * 100), epv: 85 },
        },
        {
          name: 'SERVO_OUTPUT_RAW',
          msgId: 36,
          payload: { servo1_raw: 1500, servo2_raw: 1500, servo3_raw: 1500, servo9_raw: telemetry.seederActive ? 1800 : 1000 },
        },
        {
          name: 'STATUSTEXT',
          msgId: 253,
          payload: { severity: 6, text: telemetry.armed ? 'Rover active in AUTO row tracking' : 'EKF3 IMU0 healthy - RTK Fixed' },
        },
      ];

      // Pick 1-2 random packets to add
      const sample = packetTypes[Math.floor(Math.random() * packetTypes.length)];
      const newMsg: MAVLinkMessage = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: timeStr,
        msgId: sample.msgId,
        name: sample.name,
        sysId: telemetry.sysId,
        compId: 1,
        seq,
        payload: sample.payload,
      };

      setMessages((prev) => [...prev.slice(-80), newMsg]);
    }, 450);

    return () => clearInterval(interval);
  }, [isPaused, telemetry]);

  useEffect(() => {
    if (!isPaused && terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isPaused]);

  const filteredMessages = messages.filter((m) => {
    if (filterType === 'ALL') return true;
    return m.name === filterType;
  });

  const handleSendCommand = () => {
    playBeepSound();
    const now = new Date();
    const timeStr = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;

    const cmdMsg: MAVLinkMessage = {
      id: `${Date.now()}-cmd`,
      timestamp: timeStr,
      msgId: 76,
      name: 'COMMAND_LONG',
      sysId: 255, // GCS SysID
      compId: 190,
      seq: 1,
      payload: {
        command: customCommand,
        param1: parseFloat(param1) || 0,
        param2: parseFloat(param2) || 0,
        target_system: telemetry.sysId,
        target_component: 1,
      },
    };

    const ackMsg: MAVLinkMessage = {
      id: `${Date.now()}-ack`,
      timestamp: timeStr,
      msgId: 77,
      name: 'COMMAND_ACK',
      sysId: telemetry.sysId,
      compId: 1,
      seq: 2,
      payload: { command: customCommand, result: 'MAV_RESULT_ACCEPTED (0)' },
    };

    setMessages((prev) => [...prev, cmdMsg, ackMsg]);
    if (onShowToast) onShowToast(`Sent ${customCommand} (Param1: ${param1}, Param2: ${param2}) -> ACK OK`);
  };

  const handleCopyLogs = () => {
    const text = messages
      .map((m) => `[${m.timestamp}] Sys:${m.sysId} Msg:${m.name} (${m.msgId}) -> ${JSON.stringify(m.payload)}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (onShowToast) onShowToast('MAVLink packet log copied to clipboard.');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Header & Packet Stream Controls */}
      <div className="flex flex-col gap-3 bg-[#012d1d] text-white p-3.5 rounded-2xl border-2 border-black shadow-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
              <Terminal className="w-4 h-4 text-[#4ade80]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-extrabold text-[13.5px] tracking-wide uppercase font-['Public_Sans'] leading-tight">
                  MAVLink Live Packets
                </h3>
                <span className="px-2 py-0.2 rounded-full text-[9px] font-black bg-emerald-500/30 text-emerald-300 border border-emerald-400/40">
                  10.2 Hz
                </span>
              </div>
              <p className="text-[10.5px] text-white/70 font-mono">
                SysID: <strong>{telemetry.sysId}</strong> • Comp: <strong>1 (Autopilot)</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/10">
          <button
            onClick={() => {
              playClickSound();
              setIsPaused(!isPaused);
            }}
            className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all ${
              isPaused
                ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
            }`}
          >
            {isPaused ? <Play className="w-3 h-3 shrink-0" /> : <Pause className="w-3 h-3 shrink-0" />}
            <span className="truncate">{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          <button
            onClick={handleCopyLogs}
            className="py-1.5 px-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-[11px] font-bold text-white flex items-center justify-center gap-1 cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <Copy className="w-3 h-3 shrink-0" />}
            <span className="truncate">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={() => setMessages([])}
            className="py-1.5 px-2 bg-white/10 hover:bg-red-500/30 border border-white/20 text-red-200 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3 h-3 shrink-0" />
            <span className="truncate">Clear</span>
          </button>
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex items-center gap-1.5 bg-[#f7f9ff] p-2.5 rounded-xl border border-gray-300 overflow-x-auto text-xs font-mono no-scrollbar">
        {['ALL', 'HEARTBEAT', 'GLOBAL_POSITION_INT', 'ATTITUDE', 'SYS_STATUS', 'GPS_RAW_INT', 'SERVO_OUTPUT_RAW', 'STATUSTEXT'].map((f) => (
          <button
            key={f}
            onClick={() => {
              playClickSound();
              setFilterType(f);
            }}
            className={`px-2 py-1 rounded-lg text-[10.5px] font-bold cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              filterType === f
                ? 'bg-[#012d1d] text-white shadow-xs'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Terminal Display Canvas */}
      <div className="bg-[#0c140f] border-4 border-black rounded-2xl p-3 shadow-inner text-emerald-400 font-mono text-xs max-h-[300px] overflow-y-auto flex flex-col gap-1">
        {filteredMessages.length === 0 ? (
          <div className="py-10 text-center text-emerald-600/70 flex flex-col items-center gap-2">
            <Radio className="w-7 h-7 animate-pulse" />
            <span className="text-xs">Listening for MAVLink telemetry frames...</span>
          </div>
        ) : (
          filteredMessages.map((m) => (
            <div
              key={m.id}
              className={`p-1.5 rounded flex items-start gap-1.5 hover:bg-white/5 transition-colors border-l-2 text-[11px] ${
                m.name === 'COMMAND_ACK'
                  ? 'border-emerald-400 bg-emerald-950/40 text-emerald-200'
                  : m.name === 'COMMAND_LONG'
                  ? 'border-sky-400 bg-sky-950/40 text-sky-200'
                  : m.name === 'STATUSTEXT'
                  ? 'border-amber-400 bg-amber-950/30 text-amber-200'
                  : 'border-emerald-700 text-emerald-300'
              }`}
            >
              <span className="text-gray-500 text-[9.5px] shrink-0 font-sans">[{m.timestamp.split('.')[0]}]</span>
              <span className="font-bold text-white shrink-0">#{m.seq}</span>
              <span className="font-extrabold text-emerald-400 shrink-0">{m.name}</span>
              <span className="text-gray-300 break-all text-[10.5px]">{JSON.stringify(m.payload)}</span>
            </div>
          ))
        )}
        <div ref={terminalBottomRef} />
      </div>

      {/* Command Injection Console */}
      <div className="bg-white border-2 border-gray-300 rounded-2xl p-3.5 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[#012d1d] border-b border-gray-200 pb-1.5">
          <Zap className="w-4 h-4 text-amber-600 shrink-0" />
          <h4 className="font-extrabold text-xs uppercase font-['Public_Sans']">
            MAVLink Command Injection
          </h4>
        </div>

        <div className="flex flex-col gap-2.5">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">Command</label>
            <select
              value={customCommand}
              onChange={(e) => setCustomCommand(e.target.value)}
              className="w-full mt-1 p-2 bg-[#f7f9ff] border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-800"
            >
              <option value="MAV_CMD_DO_SET_SERVO">MAV_CMD_DO_SET_SERVO (Ch 9 Sower)</option>
              <option value="MAV_CMD_NAV_RETURN_TO_LAUNCH">MAV_CMD_NAV_RETURN_TO_LAUNCH (RTL)</option>
              <option value="MAV_CMD_DO_SET_MODE">MAV_CMD_DO_SET_MODE (Change Mode)</option>
              <option value="MAV_CMD_COMPONENT_ARM_DISARM">MAV_CMD_ARM_DISARM (Safety)</option>
              <option value="MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN">MAV_CMD_REBOOT (Reboot)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase">Param 1 (Ch / Val)</label>
              <input
                type="text"
                value={param1}
                onChange={(e) => setParam1(e.target.value)}
                className="w-full mt-1 p-2 bg-[#f7f9ff] border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-800"
                placeholder="e.g. 9"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase">Param 2 (PWM / Rate)</label>
              <input
                type="text"
                value={param2}
                onChange={(e) => setParam2(e.target.value)}
                className="w-full mt-1 p-2 bg-[#f7f9ff] border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-800"
                placeholder="e.g. 1800"
              />
            </div>
          </div>

          <button
            onClick={handleSendCommand}
            className="w-full py-2.5 bg-[#012d1d] hover:bg-[#1b4332] active:bg-black text-white font-black rounded-xl text-xs uppercase cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send MAVLink Command</span>
          </button>
        </div>
      </div>
    </div>
  );
};
