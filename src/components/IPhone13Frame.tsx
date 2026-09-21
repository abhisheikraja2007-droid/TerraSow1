import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Palette,
} from 'lucide-react';
import { playClickSound } from '../utils/audio';
import { hapticLight } from '../utils/haptics';

interface IPhone13FrameProps {
  children: React.ReactNode;
}

type DeviceColor = 'midnight' | 'sierra-blue' | 'starlight' | 'product-red' | 'graphite';

export const IPhone13Frame: React.FC<IPhone13FrameProps> = ({ children }) => {
  const [scale, setScale] = useState<number>(1);
  const [deviceColor, setDeviceColor] = useState<DeviceColor>('midnight');
  const [isFitToScreen, setIsFitToScreen] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Calculate auto-fit scale on viewport change
  useEffect(() => {
    const handleResize = () => {
      if (isFitToScreen) {
        // iPhone 13 outer height is ~880px, width ~414px
        const availableHeight = window.innerHeight - 110;
        const availableWidth = window.innerWidth - 32;
        const scaleH = availableHeight / 880;
        const scaleW = availableWidth / 414;
        const bestScale = Math.min(1, Math.max(0.65, Math.min(scaleH, scaleW)));
        setScale(Number(bestScale.toFixed(2)));
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [isFitToScreen]);

  const colorStyles: Record<
    DeviceColor,
    {
      name: string;
      outerBorder: string;
      bodyBg: string;
      sideButton: string;
      accentRing: string;
      colorDot: string;
    }
  > = {
    midnight: {
      name: 'Midnight Black',
      outerBorder: 'border-[#15191e]',
      bodyBg: 'bg-[#15191e]',
      sideButton: 'bg-[#1f242c]',
      accentRing: 'ring-[#2e3744]',
      colorDot: 'bg-[#15191e]',
    },
    'sierra-blue': {
      name: 'Sierra Blue',
      outerBorder: 'border-[#9bb5ce]',
      bodyBg: 'bg-[#89a6c2]',
      sideButton: 'bg-[#7392b0]',
      accentRing: 'ring-[#b0cbdf]',
      colorDot: 'bg-[#89a6c2]',
    },
    starlight: {
      name: 'Starlight Silver',
      outerBorder: 'border-[#e4ded6]',
      bodyBg: 'bg-[#f4efe8]',
      sideButton: 'bg-[#dad2c7]',
      accentRing: 'ring-[#ffffff]',
      colorDot: 'bg-[#f4efe8]',
    },
    'product-red': {
      name: 'Product (RED)',
      outerBorder: 'border-[#b91c1c]',
      bodyBg: 'bg-[#991b1b]',
      sideButton: 'bg-[#7f1d1d]',
      accentRing: 'ring-[#ef4444]',
      colorDot: 'bg-[#dc2626]',
    },
    graphite: {
      name: 'Titanium Graphite',
      outerBorder: 'border-[#383d44]',
      bodyBg: 'bg-[#292d32]',
      sideButton: 'bg-[#22252a]',
      accentRing: 'ring-[#4d535d]',
      colorDot: 'bg-[#383d44]',
    },
  };

  const currentColor = colorStyles[deviceColor];

  const handleZoom = (delta: number) => {
    playClickSound();
    hapticLight();
    setIsFitToScreen(false);
    setScale((prev) => Math.max(0.6, Math.min(1.2, Number((prev + delta).toFixed(2)))));
  };

  const toggleFit = () => {
    playClickSound();
    hapticLight();
    if (isFitToScreen) {
      setIsFitToScreen(false);
      setScale(1);
    } else {
      setIsFitToScreen(true);
      const availableHeight = window.innerHeight - 110;
      const availableWidth = window.innerWidth - 32;
      const scaleH = availableHeight / 880;
      const scaleW = availableWidth / 414;
      const bestScale = Math.min(1, Math.max(0.65, Math.min(scaleH, scaleW)));
      setScale(Number(bestScale.toFixed(2)));
    }
  };

  return (
    <div className="min-h-[100dvh] sm:min-h-screen w-full bg-gradient-to-br from-[#0c1219] via-[#121c24] to-[#070b0e] flex flex-col items-center justify-start sm:justify-center p-0 sm:p-4 md:p-6 overflow-hidden sm:overflow-x-hidden select-none">
      {/* Top Desktop Frame Controls Floating Toolbar */}
      <div className="hidden sm:flex items-center justify-between w-full max-w-xl mb-3 px-4 py-2 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 text-white shadow-xl z-50 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#4ade80] animate-pulse" />
          <span className="font-extrabold text-sm tracking-tight text-white flex items-center gap-1.5 font-['Public_Sans']">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            iPhone 13 Frame
          </span>
          <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/70 font-mono text-[11px]">
            390 × 844 pt
          </span>
        </div>

        {/* Controls: Scale & Color */}
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center bg-white/10 rounded-xl p-0.5 border border-white/10">
            <button
              onClick={() => handleZoom(-0.05)}
              className="p-1 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono text-[11px] text-white/90">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => handleZoom(0.05)}
              className="p-1 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={toggleFit}
            className={`px-2 py-1 rounded-xl font-bold flex items-center gap-1 border transition-all cursor-pointer ${
              isFitToScreen
                ? 'bg-emerald-600 text-white border-emerald-400'
                : 'bg-white/10 text-white/80 border-white/10 hover:bg-white/20'
            }`}
            title="Auto-fit frame to browser window"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fit</span>
          </button>

          {/* Color Switcher Dropdown Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white/90 flex items-center gap-1 cursor-pointer"
              title="Change iPhone Case Finish"
            >
              <span className={`w-3.5 h-3.5 rounded-full border border-white/40 ${currentColor.colorDot}`} />
              <Palette className="w-3 h-3 text-white/60" />
            </button>

            {showColorPicker && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-[#1a202c] border border-white/20 rounded-xl p-2 shadow-2xl z-50 flex flex-col gap-1 text-xs">
                {(Object.keys(colorStyles) as DeviceColor[]).map((key) => {
                  const item = colorStyles[key];
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setDeviceColor(key);
                        setShowColorPicker(false);
                      }}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                        deviceColor === key ? 'bg-emerald-600 text-white font-bold' : 'text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full border border-white/40 ${item.colorDot}`} />
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main iPhone 13 Mockup Chassis Container */}
      <div
        className="transition-transform duration-200 ease-out origin-top sm:my-auto w-full sm:w-auto max-sm:!transform-none"
        style={{
          transform: `scale(${scale})`,
        }}
      >
        <div
          id="iphone-13-chassis"
          className={`relative w-full sm:w-[414px] h-[100dvh] sm:h-[870px] ${currentColor.bodyBg} sm:p-[12px] sm:rounded-[54px] sm:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.1),0_0_40px_rgba(45,106,79,0.15)] flex flex-col items-center justify-between border-0 sm:border-2 ${currentColor.outerBorder}`}
        >
          {/* Hardware Hardware Left Buttons (Silent switch, Vol+, Vol-) */}
          <div className="hidden sm:block absolute -left-[7px] top-[115px] w-[5px] h-[26px] bg-[#22252a] rounded-l-md border border-white/10" />
          <div className="hidden sm:block absolute -left-[7px] top-[165px] w-[5px] h-[48px] bg-[#22252a] rounded-l-md border border-white/10" />
          <div className="hidden sm:block absolute -left-[7px] top-[225px] w-[5px] h-[48px] bg-[#22252a] rounded-l-md border border-white/10" />

          {/* Hardware Right Button (Power / Siri) */}
          <div className="hidden sm:block absolute -right-[7px] top-[175px] w-[5px] h-[72px] bg-[#22252a] rounded-r-md border border-white/10" />

          {/* Inner Screen Display (Exact 390px × 844px iPhone 13 logical resolution) */}
          <div
            id="iphone-13-screen"
            className="relative w-full sm:w-[390px] h-full sm:h-[844px] bg-[#f7f9ff] text-[#181c20] sm:rounded-[44px] overflow-hidden flex flex-col shadow-inner border-0 sm:border border-black/80"
          >
            {/* Application Scrollable Body Area */}
            <div
              id="iphone-13-app-viewport"
              className="flex-1 w-full h-full flex flex-col relative bg-[#f7f9ff] overflow-hidden"
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
