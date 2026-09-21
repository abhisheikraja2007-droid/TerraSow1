import React, { useState, useMemo } from 'react';
import {
  Sliders,
  Search,
  Save,
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Info,
  Filter,
  Check,
  Undo2,
} from 'lucide-react';
import { ArduPilotParam } from '../../types';
import { ARDUPILOT_DEFAULT_PARAMS } from '../../data/missionPlannerParams';
import { playClickSound, playBeepSound } from '../../utils/audio';
import { hapticLight, hapticMedium } from '../../utils/haptics';

interface ParametersEditorProps {
  onShowToast?: (msg: string) => void;
}

export const ParametersEditor: React.FC<ParametersEditorProps> = ({ onShowToast }) => {
  const [params, setParams] = useState<ArduPilotParam[]>(ARDUPILOT_DEFAULT_PARAMS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [modifiedParams, setModifiedParams] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  const categories = ['All', 'Steering & PID', 'Speed & Nav', 'Seeder & Actuator', 'GNSS & RTK', 'Battery & Safety', 'Chassis & Motors'];

  const filteredParams = useMemo(() => {
    return params.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [params, searchQuery, selectedCategory]);

  const handleValueChange = (name: string, valStr: string) => {
    const val = parseFloat(valStr);
    if (!isNaN(val)) {
      setModifiedParams((prev) => ({ ...prev, [name]: val }));
    }
  };

  const handleRevert = (name: string) => {
    playClickSound();
    setModifiedParams((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleWriteToVehicle = () => {
    const count = Object.keys(modifiedParams).length;
    if (count === 0) {
      if (onShowToast) onShowToast('No parameters have been modified.');
      return;
    }

    playBeepSound();
    hapticMedium();
    setIsSaving(true);

    setTimeout(() => {
      setParams((prev) =>
        prev.map((p) => {
          if (modifiedParams[p.name] !== undefined) {
            return { ...p, value: modifiedParams[p.name], isModified: false };
          }
          return p;
        })
      );
      setModifiedParams({});
      setIsSaving(false);
      if (onShowToast) onShowToast(`Successfully written ${count} parameters to Autopilot EEPROM.`);
    }, 600);
  };

  const handleExportParams = () => {
    playClickSound();
    let content = '# ArduRover AgriControl Pro Parameters Export\n';
    content += `# Exported: ${new Date().toISOString()}\n\n`;
    params.forEach((p) => {
      const val = modifiedParams[p.name] !== undefined ? modifiedParams[p.name] : p.value;
      content += `${p.name.padEnd(20, ' ')}\t${val}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ardurover_agricontrol_${Date.now()}.param`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (onShowToast) onShowToast('Parameters file (.param) exported successfully.');
  };

  const handleImportParams = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const loaded: Record<string, number> = {};

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const parts = trimmed.split(/[\s,\t]+/);
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parseFloat(parts[1].trim());
            if (!isNaN(val)) loaded[key] = val;
          }
        }
      });

      if (Object.keys(loaded).length > 0) {
        setModifiedParams(loaded);
        playBeepSound();
        if (onShowToast) onShowToast(`Loaded ${Object.keys(loaded).length} parameters from file. Click Write to commit.`);
      }
    };
    reader.readAsText(file);
  };

  const modifiedCount = Object.keys(modifiedParams).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header & Action Toolbar */}
      <div className="flex flex-col gap-3 bg-white p-3.5 rounded-2xl border-2 border-gray-300 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center border border-emerald-300 shrink-0">
            <Sliders className="w-5 h-5 text-[#2D6A4F]" />
          </div>
          <div>
            <h3 className="font-black text-sm text-[#012d1d] uppercase font-['Public_Sans'] leading-tight">
              ArduPilot Parameters Tree
            </h3>
            <p className="text-[10.5px] text-gray-500 font-medium">
              Tuning for steering PID, speeds, RTK GNSS, & seeder motors
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {/* Hidden File Input for import */}
            <input
              type="file"
              id="param-file-import"
              accept=".param,.txt"
              className="hidden"
              onChange={handleImportParams}
            />
            <button
              onClick={() => {
                playClickSound();
                document.getElementById('param-file-import')?.click();
              }}
              className="py-2.5 px-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 flex items-center justify-center gap-1.5 cursor-pointer"
              title="Load .param file"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Load .param</span>
            </button>

            <button
              onClick={handleExportParams}
              className="py-2.5 px-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 flex items-center justify-center gap-1.5 cursor-pointer"
              title="Export .param file"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Save to File</span>
            </button>
          </div>

          <button
            onClick={handleWriteToVehicle}
            disabled={isSaving || modifiedCount === 0}
            className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              modifiedCount > 0
                ? 'bg-[#2D6A4F] hover:bg-[#1b4332] text-white shadow-md'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Write to Vehicle {modifiedCount > 0 && `(${modifiedCount})`}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar & Search */}
      <div className="flex flex-col gap-2 bg-[#f7f9ff] p-3 rounded-xl border border-gray-300">
        <div className="w-full relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search parameter (e.g., ATC_STR, CRUISE)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                playClickSound();
                setSelectedCategory(cat);
              }}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition-all shrink-0 ${
                selectedCategory === cat
                  ? 'bg-[#012d1d] text-white shadow-xs'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Parameters Table */}
      <div className="bg-white border-2 border-gray-300 rounded-2xl overflow-hidden shadow-sm">
        <div className="max-h-[480px] overflow-x-auto overflow-y-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-[#f1f4f9] border-b-2 border-gray-300 text-gray-700 font-black uppercase sticky top-0 z-10">
              <tr>
                <th className="p-2.5">Parameter Name</th>
                <th className="p-2.5 w-32">Value</th>
                <th className="p-2.5 w-20">Default</th>
                <th className="p-2.5 w-24">Category</th>
                <th className="p-2.5">Description & Tuning Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-mono">
              {filteredParams.map((p) => {
                const isEdited = modifiedParams[p.name] !== undefined;
                const displayVal = isEdited ? modifiedParams[p.name] : p.value;

                return (
                  <tr key={p.name} className={`hover:bg-[#f7f9ff] transition-colors ${isEdited ? 'bg-amber-50/70' : ''}`}>
                    <td className="p-2.5 font-bold text-[#012d1d] flex items-center gap-2">
                      <span>{p.name}</span>
                      {isEdited && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 inline-block animate-ping" />
                      )}
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="any"
                          min={p.min}
                          max={p.max}
                          value={displayVal}
                          onChange={(e) => handleValueChange(p.name, e.target.value)}
                          className={`w-24 px-2 py-1 bg-white border rounded font-mono font-bold text-xs ${
                            isEdited ? 'border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-400' : 'border-gray-300 text-gray-900'
                          }`}
                        />
                        {p.unit && <span className="text-gray-500 text-[10px] font-sans">{p.unit}</span>}
                        {isEdited && (
                          <button
                            onClick={() => handleRevert(p.name)}
                            className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                            title="Revert to original"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-2.5 text-gray-500 text-[11px]">{p.defaultValue}</td>
                    <td className="p-2.5 font-sans">
                      <span className="px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] font-bold text-gray-700">
                        {p.category}
                      </span>
                    </td>
                    <td className="p-2.5 font-sans text-gray-600 text-xs leading-relaxed">
                      {p.description}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="p-3 bg-[#f7f9ff] border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
          <span>Showing {filteredParams.length} of {params.length} parameters</span>
          {modifiedCount > 0 ? (
            <span className="text-amber-700 font-bold">
              ⚠ {modifiedCount} modified parameter(s) waiting to be written to EEPROM.
            </span>
          ) : (
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Synchronized with Autopilot
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
