import React, { useState } from 'react';
import {
  Wifi,
  Radio,
  Cable,
  Globe,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Power,
  Activity,
  Sliders,
  Sparkles,
  Layers,
} from 'lucide-react';
import { VehicleTelemetry, MissionPlannerConfig } from '../../types';
import { playClickSound, playBeepSound } from '../../utils/audio';
import { hapticLight, hapticMedium } from '../../utils/haptics';

interface ConnectionManagerProps {
  config: MissionPlannerConfig;
  telemetry: VehicleTelemetry;
  onUpdateConfig: (cfg: Partial<MissionPlannerConfig>) => void;
  onConnect: () => void;
  onShowToast?: (msg: string) => void;
}

export const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  config,
  telemetry,
  onUpdateConfig,
  onConnect,
  onShowToast,
}) => {
  const [serialConnecting, setSerialConnecting] = useState(false);
  const [serialConnected, setSerialConnected] = useState(false);

  // Web Serial API Direct USB Connection handler (Native browser UART)
  const handleWebSerialConnect = async () => {
    playClickSound();
    if (!('serial' in navigator)) {
      if (onShowToast) onShowToast('Web Serial API is supported in Chrome, Edge, and Opera browsers.');
      return;
    }

    try {
      setSerialConnecting(true);
      // @ts-ignore - Web Serial API navigator.serial
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: config.baudRate || 115200 });

      setSerialConnected(true);
      setSerialConnecting(false);
      playBeepSound();
      hapticMedium();
      if (onShowToast) onShowToast(`Web Serial USB link established @ ${config.baudRate || 115200} baud.`);
    } catch (err) {
      console.warn('WebSerial connection cancelled or failed:', err);
      setSerialConnecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Status Card */}
      <div className="bg-white border-2 border-gray-300 rounded-2xl p-3.5 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                telemetry.isConnected ? 'bg-emerald-100 border-emerald-300' : 'bg-gray-100 border-gray-300'
              }`}
            >
              {config.protocol === 'WebSerial' ? (
                <Cable className="w-5 h-5 text-[#2D6A4F]" />
              ) : (
                <Wifi className="w-5 h-5 text-[#2D6A4F]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-black text-sm text-[#012d1d] uppercase font-['Public_Sans'] leading-tight">
                  Telemetry & Gateway Hub
                </h3>
                <span
                  className={`px-2 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider ${
                    telemetry.isConnected ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {telemetry.isConnected ? 'Connected' : 'Standby'}
                </span>
              </div>
              <p className="text-[10.5px] text-gray-500 font-mono">
                Link: <strong>{config.protocol}</strong> • Latency: <strong>0.2s</strong>
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            playClickSound();
            onConnect();
          }}
          className="w-full py-2.5 bg-[#012d1d] hover:bg-[#1b4332] active:bg-black text-white rounded-xl font-bold text-xs uppercase cursor-pointer flex items-center justify-center gap-2 transition-all shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Ping / Reconnect Link</span>
        </button>
      </div>

      {/* Protocol Selection Tabs (2x2 Grid) */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          {
            id: 'REST',
            title: 'Mission Planner',
            desc: 'HTTP REST API (port 56781)',
            icon: Globe,
            presetUrl: 'http://127.0.0.1:56781',
          },
          {
            id: 'MAVLink-UDP',
            title: 'ESP32 WiFi',
            desc: 'UDP / TCP wireless telemetry',
            icon: Wifi,
            presetUrl: 'http://192.168.4.1:80',
          },
          {
            id: 'WebSerial',
            title: 'Direct USB',
            desc: 'Web Serial UART connection',
            icon: Cable,
            presetUrl: 'COM / /dev/ttyUSB0',
          },
          {
            id: 'WebSocket',
            title: 'Cloud Gateway',
            desc: 'Remote 4G/LTE cellular proxy',
            icon: Radio,
            presetUrl: 'ws://telemetry.agricontrol.io',
          },
        ].map((proto) => {
          const isSelected = config.protocol === proto.id;
          const Icon = proto.icon;

          return (
            <div
              key={proto.id}
              onClick={() => {
                playClickSound();
                onUpdateConfig({ protocol: proto.id as any, apiUrl: proto.presetUrl });
              }}
              className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-emerald-50/80 border-[#2D6A4F] shadow-xs'
                  : 'bg-white border-gray-300 hover:border-gray-400'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-[#012d1d] text-white' : 'bg-gray-100 text-gray-700'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block ring-2 ring-emerald-200" />
                  )}
                </div>
                <h4 className="font-extrabold text-xs text-[#012d1d] mb-0.5 leading-tight">{proto.title}</h4>
                <p className="text-gray-600 text-[10.5px] leading-tight">{proto.desc}</p>
              </div>

              <div className="mt-2 pt-1.5 border-t border-gray-200/60 text-[9.5px] font-mono text-gray-500 truncate">
                {proto.presetUrl}
              </div>
            </div>
          );
        })}
      </div>

      {/* Protocol Configuration Parameters Card */}
      <div className="bg-white border-2 border-gray-300 rounded-2xl p-3.5 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-gray-200 pb-1.5">
          <h4 className="font-black text-xs text-[#012d1d] uppercase font-['Public_Sans'] flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-[#2D6A4F]" />
            <span>Interface Settings ({config.protocol})</span>
          </h4>
          <span className="text-[10px] text-gray-500 font-bold uppercase">Config</span>
        </div>

        {config.protocol === 'WebSerial' ? (
          <div className="flex flex-col gap-2.5 bg-[#f7f9ff] p-3 rounded-xl border border-gray-300">
            <div>
              <span className="font-bold text-xs text-gray-800">Browser Direct USB (Web Serial API)</span>
              <p className="text-[10.5px] text-gray-600">Connects directly to FTDI / CP2102 / CH340 adapters.</p>
            </div>

            <div className="flex flex-col gap-2">
              <select
                value={config.baudRate || 115200}
                onChange={(e) => onUpdateConfig({ baudRate: parseInt(e.target.value) })}
                className="w-full p-2 bg-white border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-800"
              >
                <option value={57600}>57600 Baud (Standard Telem)</option>
                <option value={115200}>115200 Baud (Pixhawk USB)</option>
                <option value={921600}>921600 Baud (High-Speed RTK)</option>
              </select>

              <button
                onClick={handleWebSerialConnect}
                disabled={serialConnecting}
                className="w-full py-2.5 bg-[#012d1d] hover:bg-[#1b4332] active:bg-black text-white rounded-xl font-bold text-xs uppercase cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Cable className="w-3.5 h-3.5" />
                <span>{serialConnected ? 'Port Opened ✓' : serialConnecting ? 'Requesting...' : 'Select USB COM Port'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase">Gateway API URL / Host</label>
              <input
                type="text"
                value={config.apiUrl}
                onChange={(e) => onUpdateConfig({ apiUrl: e.target.value })}
                className="w-full mt-1 p-2 bg-[#f7f9ff] border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-800"
                placeholder="http://127.0.0.1:56781"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase">MAVLink Port</label>
              <input
                type="number"
                value={config.mavlinkPort}
                onChange={(e) => onUpdateConfig({ mavlinkPort: parseInt(e.target.value) })}
                className="w-full mt-1 p-2 bg-[#f7f9ff] border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-800"
              />
            </div>
          </div>
        )}

        {/* Link Diagnostics Metrics Strip */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 text-xs bg-[#f7f9ff] p-2.5 rounded-xl">
          <div className="flex flex-col">
            <span className="text-gray-500 text-[9.5px] uppercase font-bold">Packets Recv</span>
            <span className="font-extrabold text-xs text-[#012d1d] font-mono">14,820 pkts</span>
          </div>

          <div className="flex flex-col border-l border-gray-200 pl-2">
            <span className="text-gray-500 text-[9.5px] uppercase font-bold">Packet Loss</span>
            <span className="font-extrabold text-xs text-emerald-600 font-mono">0.02%</span>
          </div>

          <div className="flex flex-col border-t border-gray-200 pt-1.5">
            <span className="text-gray-500 text-[9.5px] uppercase font-bold">ESP32 RSSI</span>
            <span className="font-extrabold text-xs text-[#012d1d] font-mono">-58 dBm</span>
          </div>

          <div className="flex flex-col border-t border-l border-gray-200 pt-1.5 pl-2">
            <span className="text-gray-500 text-[9.5px] uppercase font-bold">Firmware</span>
            <span className="font-extrabold text-[10px] text-gray-700 font-mono truncate">{telemetry.firmwareVersion}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
