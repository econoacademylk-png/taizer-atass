import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTrading } from '../stores/useTradingStore';

export const NotesModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { activeSymbol } = useTrading();
  const [notes, setNotes] = useState('');
  
  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('notes_' + activeSymbol);
      setNotes(saved || '');
    }
  }, [isOpen, activeSymbol]);

  const handleSave = () => {
    localStorage.setItem('notes_' + activeSymbol, notes);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0b0e14] border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-900/50">
          <h2 className="text-sm font-bold text-slate-200 font-mono flex items-center gap-2">
            <span className="text-cyan-400">{activeSymbol}</span> CHARACTER NOTES
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full h-64 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 font-mono focus:outline-none focus:border-cyan-500/50 resize-none"
            placeholder={`Save behavior, characteristics, or analysis notes for ${activeSymbol}...`}
          />
        </div>
        <div className="p-4 border-t border-slate-800/80 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors">
            CANCEL
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold rounded shadow-[0_0_10px_rgba(34,211,238,0.3)] transition-all">
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
};
