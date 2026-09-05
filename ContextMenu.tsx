import React, { useState, useEffect, useRef } from 'react';
import { ClipboardPaste, Copy, Scissors, CheckSquare, Trash2 } from 'lucide-react';

interface ContextMenuProps {
  showToast?: (text: string, type: 'success' | 'error' | 'info') => void;
}

interface MenuPosition {
  x: number;
  y: number;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ showToast }) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const [targetElement, setTargetElement] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Helper to trigger React onChange event programmatically
  const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const insertTextAtCursor = (element: HTMLInputElement | HTMLTextAreaElement, textToInsert: string) => {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    const currentVal = element.value || '';
    const newVal = currentVal.substring(0, start) + textToInsert + currentVal.substring(end);
    setNativeValue(element, newVal);

    setTimeout(() => {
      element.focus();
      try {
        element.selectionStart = element.selectionEnd = start + textToInsert.length;
      } catch {
        // ignore for inputs that don't support selectionStart
      }
    }, 10);
  };

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Check if user is on mobile or touch device
      const isMobile =
        window.innerWidth < 768 ||
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (isMobile) {
        // On mobile version, do not open custom context menu panel. Allow native browser copy-paste.
        setVisible(false);
        return;
      }

      // On desktop computer version, show original desktop right-click copy-paste menu
      e.preventDefault();

      let inputEl: HTMLInputElement | HTMLTextAreaElement | null = null;
      const path = e.composedPath ? e.composedPath() : [];

      for (const el of path) {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          inputEl = el;
          break;
        }
      }

      if (!inputEl && (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) {
        inputEl = document.activeElement;
      }

      setTargetElement(inputEl);

      const selection = window.getSelection();
      const currentSelection = selection ? selection.toString() : '';
      setSelectedText(currentSelection);

      // Menu positioning & viewport boundary checks
      const menuWidth = 180;
      const menuHeight = 210;
      let x = e.clientX;
      let y = e.clientY;

      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 8;
      }
      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 8;
      }

      setPosition({ x: Math.max(8, x), y: Math.max(8, y) });
      setVisible(true);
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVisible(false);
      }
    };

    const handleScroll = () => {
      setVisible(false);
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  if (!visible) return null;

  const handlePaste = async () => {
    setVisible(false);
    let el = targetElement;
    if (!el && (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) {
      el = document.activeElement;
    }

    if (!el) {
      if (showToast) showToast('ইনপুট বক্সে ক্লিক করে আবার চেষ্টা করুন', 'error');
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        insertTextAtCursor(el, text);
        if (showToast) showToast('পেস্ট করা হয়েছে!', 'success');
      } else {
        if (showToast) showToast('ক্লিপবোর্ডে কোনো টেক্সট নেই', 'error');
      }
    } catch {
      // Fallback paste via prompt
      const text = prompt('লেখাটি নিচে পেস্ট (Ctrl+V) করুন:');
      if (text) {
        insertTextAtCursor(el, text);
        if (showToast) showToast('পেস্ট করা হয়েছে!', 'success');
      }
    }
  };

  const handleCopy = async () => {
    setVisible(false);
    let textToCopy = selectedText;

    if (!textToCopy && targetElement) {
      const start = targetElement.selectionStart ?? 0;
      const end = targetElement.selectionEnd ?? targetElement.value.length;
      if (start !== end) {
        textToCopy = targetElement.value.substring(start, end);
      } else {
        textToCopy = targetElement.value;
      }
    }

    if (textToCopy) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        if (showToast) showToast('কপি করা হয়েছে!', 'success');
      } catch {
        if (showToast) showToast('কপি করা সম্ভব হয়নি', 'error');
      }
    } else {
      if (showToast) showToast('কপি করার জন্য কিছু নির্বাচন করুন', 'info');
    }
  };

  const handleCut = async () => {
    setVisible(false);
    let el = targetElement;
    if (!el && (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) {
      el = document.activeElement;
    }

    if (!el) {
      if (showToast) showToast('কাট করার জন্য ইনপুট নির্বাচন করুন', 'info');
      return;
    }

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? el.value.length;
    let cutText = '';

    if (start !== end) {
      cutText = el.value.substring(start, end);
      const newVal = el.value.substring(0, start) + el.value.substring(end);
      setNativeValue(el, newVal);
    } else {
      cutText = el.value;
      setNativeValue(el, '');
    }

    if (cutText) {
      try {
        await navigator.clipboard.writeText(cutText);
        if (showToast) showToast('কাট করা হয়েছে!', 'success');
      } catch {
        if (showToast) showToast('ক্লিপবোর্ডে সেভ করা যায়নি', 'error');
      }
    }
  };

  const handleSelectAll = () => {
    setVisible(false);
    let el = targetElement;
    if (!el && (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) {
      el = document.activeElement;
    }

    if (el) {
      el.focus();
      el.select();
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(document.body);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  const handleClear = () => {
    setVisible(false);
    let el = targetElement;
    if (!el && (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) {
      el = document.activeElement;
    }

    if (el) {
      setNativeValue(el, '');
      el.focus();
      if (showToast) showToast('ক্লিয়ার করা হয়েছে!', 'info');
    }
  };

  return (
    <div
      ref={menuRef}
      style={{ top: `${position.y}px`, left: `${position.x}px` }}
      className="fixed z-[99999] w-48 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl py-1.5 text-slate-200 text-xs font-sans backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      <button
        type="button"
        onClick={handlePaste}
        className="w-full text-left px-3 py-2 hover:bg-sky-600/30 hover:text-sky-300 flex items-center justify-between transition-colors font-medium"
      >
        <span className="flex items-center gap-2">
          <ClipboardPaste className="w-4 h-4 text-sky-400" />
          পেস্ট করুন (Paste)
        </span>
        <span className="text-[10px] text-slate-400 font-mono">Ctrl+V</span>
      </button>

      <button
        type="button"
        onClick={handleCopy}
        className="w-full text-left px-3 py-2 hover:bg-emerald-600/30 hover:text-emerald-300 flex items-center justify-between transition-colors font-medium"
      >
        <span className="flex items-center gap-2">
          <Copy className="w-4 h-4 text-emerald-400" />
          কপি করুন (Copy)
        </span>
        <span className="text-[10px] text-slate-400 font-mono">Ctrl+C</span>
      </button>

      <button
        type="button"
        onClick={handleCut}
        className="w-full text-left px-3 py-2 hover:bg-amber-600/30 hover:text-amber-300 flex items-center justify-between transition-colors font-medium"
      >
        <span className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-amber-400" />
          কাট করুন (Cut)
        </span>
        <span className="text-[10px] text-slate-400 font-mono">Ctrl+X</span>
      </button>

      <div className="my-1 border-t border-slate-800" />

      <button
        type="button"
        onClick={handleSelectAll}
        className="w-full text-left px-3 py-2 hover:bg-indigo-600/30 hover:text-indigo-300 flex items-center justify-between transition-colors font-medium"
      >
        <span className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-indigo-400" />
          সব সিলেক্ট (Select All)
        </span>
        <span className="text-[10px] text-slate-400 font-mono">Ctrl+A</span>
      </button>

      {targetElement && (
        <button
          type="button"
          onClick={handleClear}
          className="w-full text-left px-3 py-2 hover:bg-rose-600/30 hover:text-rose-300 flex items-center gap-2 transition-colors font-medium text-rose-300"
        >
          <Trash2 className="w-4 h-4 text-rose-400" />
          মুছে ফেলুন (Clear)
        </button>
      )}
    </div>
  );
};
