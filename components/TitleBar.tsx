import React, { useState } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Helper to handle window controls based on environment
  // Note: These usually require the wrapper (Electron/PyWebview) to bind window.close(), etc.
  const handleMinimize = () => {
    // Try standard API (works in some wrappers)
    if ((window as any).pywebview) {
        (window as any).pywebview.api.minimize();
    } else {
        // Fallback/Electron specific mocks usually injected in window
        console.log("Minimize requested");
    }
  };

  const handleMaximize = () => {
    setIsMaximized(!isMaximized);
    if ((window as any).pywebview) {
        (window as any).pywebview.api.toggle_maximize();
    } else {
        // Fallback logic
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }
  };

  const handleClose = async () => {
    try {
        // 1. Tell Backend to shutdown (for Python EXE)
        await fetch('http://localhost:8000/shutdown', { method: 'POST' }).catch(() => {});
        
        // 2. Close Window
        if ((window as any).pywebview) {
            (window as any).pywebview.api.destroy();
        } else {
            window.close();
        }
    } catch (e) {
        window.close();
    }
  };

  return (
    <div 
        className="fixed top-0 left-0 right-0 h-10 z-[100] flex justify-between items-center px-4 select-none transition-all duration-300 group hover:bg-white/40"
        style={{ WebkitAppRegion: 'drag' } as any} 
    >
      {/* Invisible/Empty Left side for balance or Drag area */}
      <div className="flex-1 h-full"></div>

      {/* Title/Branding (Optional, usually hidden for clean look or centered) */}
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
        Minecomic
      </div>

      {/* Controls Area */}
      <div className="flex-1 flex justify-end items-center gap-2 h-full pl-4">
        
        {/* Minimize */}
        <button 
            onClick={handleMinimize}
            className="w-4 h-4 rounded-full bg-yellow-400 hover:bg-yellow-500 border border-yellow-500/30 flex items-center justify-center text-yellow-900/0 hover:text-yellow-900 transition-all shadow-sm active:scale-90"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            title="最小化"
        >
            <Minus className="w-2.5 h-2.5" />
        </button>

        {/* Maximize */}
        <button 
            onClick={handleMaximize}
            className="w-4 h-4 rounded-full bg-green-400 hover:bg-green-500 border border-green-500/30 flex items-center justify-center text-green-900/0 hover:text-green-900 transition-all shadow-sm active:scale-90"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            title="最大化"
        >
             {isMaximized ? <Copy className="w-2.5 h-2.5" /> : <Square className="w-2.5 h-2.5" />}
        </button>

        {/* Close */}
        <button 
            onClick={handleClose}
            className="w-4 h-4 rounded-full bg-red-400 hover:bg-red-500 border border-red-500/30 flex items-center justify-center text-red-900/0 hover:text-white transition-all shadow-sm active:scale-90 ml-1"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            title="关闭应用"
        >
            <X className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
};