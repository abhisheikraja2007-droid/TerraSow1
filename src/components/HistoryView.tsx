import React, { useState } from 'react';
import {
  Tractor,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  Calendar,
  Layers,
  FileText,
  Download,
  PlusCircle,
  ChevronRight,
  X,
} from 'lucide-react';
import { HistoryEntry } from '../types';
import { playClickSound } from '../utils/audio';

interface HistoryViewProps {
  historyList: HistoryEntry[];
  onAddHistoryEntry?: (entry: HistoryEntry) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  historyList,
}) => {
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Completed' | 'Interrupted'>('All');
  const [filterCrop, setFilterCrop] = useState<string>('All');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [exportedMessage, setExportedMessage] = useState<string | null>(null);

  // Available unique crop names for filter
  const uniqueCrops = ['All', ...Array.from(new Set(historyList.map((h) => h.cropName)))];

  const filteredList = historyList.filter((entry) => {
    const matchesStatus = filterStatus === 'All' || entry.status === filterStatus;
    const matchesCrop = filterCrop === 'All' || entry.cropName === filterCrop;
    return matchesStatus && matchesCrop;
  });

  const handleExport = (entry: HistoryEntry) => {
    playClickSound();
    const csvContent = `Operation ID,Crop,Date,Duration,Area (Acres),Seed Used (kg),Status,Tractor,Field\n${entry.id},${entry.cropName},${entry.date},${entry.duration},${entry.areaAcres},${entry.seedUsedKg},${entry.status},${entry.tractorName},${entry.fieldId}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `AgriControl_${entry.cropName}_${entry.date.replace(/[\s,]+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportedMessage(`Report for ${entry.cropName} downloaded!`);
    setTimeout(() => setExportedMessage(null), 3000);
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-4 animate-fadeIn pb-8">
      {/* Top Header Section */}
      <div className="flex justify-between items-center border-b-2 border-gray-200 pb-3">
        <div>
          <h2 className="text-[20px] font-extrabold text-[#012d1d] font-['Public_Sans'] leading-tight">
            Sowing History
          </h2>
          <p className="text-xs text-gray-600 font-['Atkinson_Hyperlegible']">
            Archived seeding logs and reports
          </p>
        </div>

        <button
          id="btn-filter-history"
          onClick={() => {
            playClickSound();
            setShowFilterModal(true);
          }}
          className="bg-white border-2 border-[#012d1d] text-[#012d1d] px-4 py-2 font-bold text-[16px] rounded-lg flex items-center gap-2 hover:bg-[#f1f4f9] active:scale-95 transition-all min-h-[48px] cursor-pointer shadow-xs font-['Public_Sans']"
        >
          <Filter className="w-5 h-5 stroke-[2.5]" />
          <span>Filter</span>
          {(filterStatus !== 'All' || filterCrop !== 'All') && (
            <span className="w-2 h-2 rounded-full bg-[#2D6A4F]" />
          )}
        </button>
      </div>

      {/* Export notification */}
      {exportedMessage && (
        <div className="bg-[#c1ecd4] border-2 border-[#012d1d] text-[#002114] px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-between">
          <span>✓ {exportedMessage}</span>
        </div>
      )}

      {/* Active Filter Tags */}
      {(filterStatus !== 'All' || filterCrop !== 'All') && (
        <div className="flex items-center gap-2 text-xs font-bold text-gray-600">
          <span>Active filters:</span>
          {filterStatus !== 'All' && (
            <span className="bg-gray-200 px-2.5 py-1 rounded-md text-[#0A0A0A] flex items-center gap-1">
              Status: {filterStatus}
              <button onClick={() => setFilterStatus('All')} className="hover:text-red-600">
                ✕
              </button>
            </span>
          )}
          {filterCrop !== 'All' && (
            <span className="bg-gray-200 px-2.5 py-1 rounded-md text-[#0A0A0A] flex items-center gap-1">
              Crop: {filterCrop}
              <button onClick={() => setFilterCrop('All')} className="hover:text-red-600">
                ✕
              </button>
            </span>
          )}
        </div>
      )}

      {/* History List */}
      <div className="flex flex-col gap-2.5">
        {filteredList.length === 0 ? (
          <div className="bg-white border-2 border-gray-300 rounded-xl p-6 text-center text-gray-500 font-medium text-xs">
            No sowing records match your active filter.
          </div>
        ) : (
          filteredList.map((entry) => (
            <div
              key={entry.id}
              onClick={() => setSelectedEntry(entry)}
              className="bg-white border-2 border-[#c1c8c2] p-3 rounded-xl flex flex-col gap-2 justify-between relative overflow-hidden group hover:border-[#0A0A0A] transition-all cursor-pointer shadow-xs"
            >
              {/* Left Color Bar */}
              <div
                className={`absolute top-0 left-0 w-1.5 h-full ${
                  entry.status === 'Completed' ? 'bg-[#2D6A4F]' : 'bg-[#D00000]'
                }`}
              />

              {/* Title & Info */}
              <div className="pl-2">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <div className="flex items-center gap-1 min-w-0">
                    <Tractor className="w-3.5 h-3.5 text-[#717973] shrink-0" />
                    <span className="font-extrabold text-xs text-[#414844] font-['Public_Sans'] truncate">
                      {entry.cropName}
                    </span>
                    <span className="text-[#717973] text-[10px]">•</span>
                    <span className="text-[11px] text-[#717973] font-medium truncate">
                      {entry.date}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div
                    className={`text-white px-2 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1 shrink-0 ${
                      entry.status === 'Completed' ? 'bg-[#2D6A4F]' : 'bg-[#ba1a1a]'
                    }`}
                  >
                    {entry.status === 'Completed' ? (
                      <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
                    ) : (
                      <AlertCircle className="w-3 h-3 stroke-[2.5]" />
                    )}
                    <span>{entry.status}</span>
                  </div>
                </div>

                <div className="text-[14px] font-extrabold text-[#181c20] font-['Public_Sans'] group-hover:text-[#012d1d]">
                  {entry.operationType}
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-gray-100 pl-2 text-center bg-[#f7f9ff] -mx-3 -mb-3 px-3 py-1.5">
                <div className="flex flex-col">
                  <span className="font-bold text-[#717973] uppercase tracking-wider text-[9px] font-['Public_Sans']">
                    Duration
                  </span>
                  <span className="text-xs font-bold text-[#181c20]">
                    {entry.duration}
                  </span>
                </div>

                <div className="flex flex-col border-l border-gray-200">
                  <span className="font-bold text-[#717973] uppercase tracking-wider text-[9px] font-['Public_Sans']">
                    Area
                  </span>
                  <span className="text-xs font-bold text-[#181c20]">
                    {entry.areaAcres.toFixed(1)} Ac
                  </span>
                </div>

                <div className="flex flex-col border-l border-gray-200">
                  <span className="font-bold text-[#717973] uppercase tracking-wider text-[9px] font-['Public_Sans']">
                    Seed
                  </span>
                  <span className="text-xs font-bold text-[#181c20]">
                    {entry.seedUsedKg} kg
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-4 border-[#0A0A0A] rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b-2 border-gray-200 pb-3">
              <h3 className="text-xl font-extrabold text-[#0A0A0A] uppercase font-['Public_Sans']">
                Filter Sowing History
              </h3>
              <button
                onClick={() => setShowFilterModal(false)}
                className="w-8 h-8 rounded-lg border-2 border-[#0A0A0A] flex items-center justify-center font-bold hover:bg-gray-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Filter by Status */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-700 uppercase">Status</label>
              <div className="flex gap-2">
                {(['All', 'Completed', 'Interrupted'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm border-2 transition-colors cursor-pointer ${
                      filterStatus === st
                        ? 'bg-[#012d1d] text-white border-[#012d1d]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter by Crop */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-700 uppercase">Crop Profile</label>
              <select
                value={filterCrop}
                onChange={(e) => setFilterCrop(e.target.value)}
                className="w-full h-12 px-3 border-2 border-[#0A0A0A] rounded-lg font-bold text-sm bg-white"
              >
                {uniqueCrops.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setFilterStatus('All');
                  setFilterCrop('All');
                  setShowFilterModal(false);
                }}
                className="flex-1 py-3 bg-gray-100 text-gray-800 font-bold rounded-xl border-2 border-gray-300 hover:bg-gray-200"
              >
                Reset
              </button>
              <button
                onClick={() => setShowFilterModal(false)}
                className="flex-1 py-3 bg-[#012d1d] text-white font-extrabold rounded-xl border-2 border-[#0A0A0A] hover:bg-[#1b4332]"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entry Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-4 border-[#0A0A0A] rounded-2xl w-full max-w-lg p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto animate-scaleUp">
            <div className="flex items-center justify-between border-b-2 border-gray-200 pb-3">
              <div>
                <span className="text-xs font-extrabold uppercase text-[#2D6A4F]">
                  Log ID: {selectedEntry.id}
                </span>
                <h3 className="text-2xl font-black text-[#012d1d] font-['Public_Sans']">
                  {selectedEntry.cropName} • {selectedEntry.operationType}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="w-8 h-8 rounded-lg border-2 border-[#0A0A0A] flex items-center justify-center font-bold hover:bg-gray-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-[#f7f9ff] border border-gray-200 rounded-xl p-3">
                <span className="text-xs font-bold text-gray-500 uppercase block">Date</span>
                <span className="text-base font-extrabold text-[#012d1d]">
                  {selectedEntry.date}
                </span>
              </div>
              <div className="bg-[#f7f9ff] border border-gray-200 rounded-xl p-3">
                <span className="text-xs font-bold text-gray-500 uppercase block">Duration</span>
                <span className="text-base font-extrabold text-[#012d1d]">
                  {selectedEntry.duration}
                </span>
              </div>
              <div className="bg-[#f7f9ff] border border-gray-200 rounded-xl p-3">
                <span className="text-xs font-bold text-gray-500 uppercase block">Total Area</span>
                <span className="text-base font-extrabold text-[#012d1d]">
                  {selectedEntry.areaAcres} Acres
                </span>
              </div>
              <div className="bg-[#f7f9ff] border border-gray-200 rounded-xl p-3">
                <span className="text-xs font-bold text-gray-500 uppercase block">Seed Sown</span>
                <span className="text-base font-extrabold text-[#012d1d]">
                  {selectedEntry.seedUsedKg} kg
                </span>
              </div>
              <div className="bg-[#f7f9ff] border border-gray-200 rounded-xl p-3">
                <span className="text-xs font-bold text-gray-500 uppercase block">Avg Speed</span>
                <span className="text-base font-extrabold text-[#012d1d]">
                  {selectedEntry.avgSpeedKmh} km/h
                </span>
              </div>
              <div className="bg-[#f7f9ff] border border-gray-200 rounded-xl p-3">
                <span className="text-xs font-bold text-gray-500 uppercase block">Avg Depth</span>
                <span className="text-base font-extrabold text-[#012d1d]">
                  {selectedEntry.avgDepthCm} cm
                </span>
              </div>
            </div>

            {/* Field and Tractor Details */}
            <div className="bg-[#f1f4f9] border border-gray-300 rounded-xl p-3.5 text-xs text-gray-700 flex flex-col gap-1.5">
              <div>
                <strong>Assigned Tractor:</strong> {selectedEntry.tractorName}
              </div>
              <div>
                <strong>Field Parcel:</strong> {selectedEntry.fieldId}
              </div>
              {selectedEntry.notes && (
                <div className="mt-1 text-gray-600 italic">
                  &ldquo;{selectedEntry.notes}&rdquo;
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleExport(selectedEntry)}
                className="flex-1 py-3 bg-[#012d1d] hover:bg-[#1b4332] text-white font-extrabold rounded-xl border-2 border-[#0A0A0A] flex items-center justify-center gap-2 cursor-pointer uppercase text-sm"
              >
                <Download className="w-4 h-4" />
                Export CSV Telemetry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
