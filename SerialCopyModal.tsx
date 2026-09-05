import React, { useState, useEffect, useRef } from 'react';
import { Copy, CheckCircle2, Loader2, X, FileSpreadsheet, Check } from 'lucide-react';
import { copyToClipboard } from '../lib/firebase';

interface SerialCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  lines: string[];
}

// Clean and sanitize each TSV line so Google Sheets never splits a single row or misaligns columns
const sanitizeTsvLine = (line: string): string => {
  if (!line) return '';
  // Split by tab to clean each cell individually, then rejoin with tab
  return line
    .split('\t')
    .map(cell => cell.replace(/[\r\n\v\f]+/g, ' ').trim())
    .join('\t');
};

export const SerialCopyModal: React.FC<SerialCopyModalProps> = ({
  isOpen,
  onClose,
  title,
  lines,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDone, setIsDone] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Cleaned and validated lines array
  const cleanLines = lines.map(sanitizeTsvLine).filter(l => l.length > 0);

  useEffect(() => {
    if (!isOpen) {
      setCurrentIndex(0);
      setIsProcessing(false);
      setIsDone(false);
      setCopied(false);
      return;
    }

    if (cleanLines.length === 0) {
      setIsProcessing(false);
      setIsDone(true);
      return;
    }

    setCurrentIndex(0);
    setIsProcessing(true);
    setIsDone(false);
    setCopied(false);

    const total = cleanLines.length;
    let current = 0;

    // Smooth step pacing (target ~2.5s total duration for any size)
    const stepDelay = Math.max(10, Math.min(80, Math.floor(2500 / Math.max(1, total))));

    const timer = setInterval(() => {
      current += 1;
      if (current >= total) {
        current = total;
        clearInterval(timer);
        setCurrentIndex(total);
        setIsProcessing(false);
        setIsDone(true);

        // Copy sanitized full TSV content to clipboard once done
        const fullTsv = cleanLines.join('\n');
        copyToClipboard(fullTsv).then(() => {
          setCopied(true);
        });
      } else {
        setCurrentIndex(current);
      }
    }, stepDelay);

    return () => {
      clearInterval(timer);
    };
  }, [isOpen, lines]);

  // Auto scroll live preview container
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [currentIndex]);

  if (!isOpen) return null;

  const totalLines = cleanLines.length;
  const progressPercent = totalLines > 0 ? Math.min(100, Math.round((currentIndex / totalLines) * 100)) : 100;

  const handleCopyAndHide = async () => {
    const fullTsv = cleanLines.join('\n');
    const success = await copyToClipboard(fullTsv);
    if (success) {
      setCopied(true);
      setTimeout(() => {
        onClose();
      }, 300);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl max-w-[280px] w-full overflow-hidden text-slate-100 flex flex-col">
        
        {/* Tiny Header */}
        <div className="px-3 py-2 bg-slate-800/90 border-b border-slate-700/70 flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <h3 className="font-bold text-slate-100 text-[12px] truncate">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-700/70 text-slate-400 hover:text-white transition shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Modal Body - Super Compact */}
        <div className="p-2.5 space-y-2">

          {/* Progress Status Box */}
          <div className={`p-2 rounded-lg border transition-all ${
            isDone 
              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' 
              : 'bg-sky-950/40 border-sky-500/50 text-sky-300'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 font-bold text-[11px]">
                {isProcessing && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-sky-400 shrink-0" />
                    <span>১টি করে সিরিয়াল কপি হচ্ছে...</span>
                  </>
                )}
                {isDone && (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>১০০% সম্পূর্ণ!</span>
                  </>
                )}
              </div>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-200 border border-slate-700">
                {currentIndex}/{totalLines}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-800/90 rounded-full h-1.5 overflow-hidden border border-slate-700/60">
              <div
                className={`h-full transition-all duration-100 rounded-full ${
                  isDone ? 'bg-emerald-400' : 'bg-sky-400'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Copied Banner */}
          {isDone && (
            <div className={`py-1 px-2 rounded text-center flex items-center justify-center gap-1 font-bold text-[10px] animate-in zoom-in-95 ${
              copied 
                ? 'bg-emerald-500/25 border border-emerald-500/60 text-emerald-300' 
                : 'bg-sky-500/20 border border-sky-500/40 text-sky-200'
            }`}>
              <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
              <span>{copied ? 'কপি সফল! বন্ধ হচ্ছে...' : 'প্রসেস শেষ! এখন "কপি করুন" বাটনে চাপুন'}</span>
            </div>
          )}

          {/* Compact Live List */}
          <div
            ref={logContainerRef}
            className="bg-slate-950 border border-slate-800 rounded-lg p-1.5 font-mono text-[10px] text-slate-300 max-h-24 overflow-y-auto space-y-0.5"
          >
            {cleanLines.slice(0, currentIndex).map((line, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 border-b border-slate-900/80 pb-0.5 hover:bg-slate-900/60 px-1 rounded transition"
              >
                <span className="text-sky-400 text-[10px] w-4 shrink-0 text-right select-none font-bold">
                  #{idx + 1}
                </span>
                <span className="text-slate-300 truncate select-all whitespace-pre">
                  {line.replace(/\t/g, ' | ')}
                </span>
              </div>
            ))}

            {cleanLines.length === 0 && (
              <div className="text-center py-2 text-slate-500 text-[10px] italic">
                কোনো তথ্য নেই
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-2.5 py-1.5 bg-slate-800/90 border-t border-slate-700/70 flex items-center justify-between gap-1.5">
          <button
            onClick={handleCopyAndHide}
            disabled={totalLines === 0}
            className={`flex-1 py-1 px-2 rounded font-bold text-[11px] flex items-center justify-center gap-1 transition ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-sky-600 hover:bg-sky-500 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Copy className="w-3 h-3" />
            <span>{copied ? 'কপি হয়েছে' : 'কপি করুন'}</span>
          </button>

          <button
            onClick={onClose}
            className="py-1 px-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-bold text-[11px] transition"
          >
            বন্ধ
          </button>
        </div>

      </div>
    </div>
  );
};
