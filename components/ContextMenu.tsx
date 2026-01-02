import React, { useEffect, useRef } from 'react';
import { Trash2, Pin, Edit3, CheckCircle, Circle, PinOff } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onPin: () => void;
  onDelete: () => void;
  onRename: () => void;
  onToggleRead: () => void;
  isPinned: boolean;
  isRead: boolean;
  mangaTitle: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ 
  x, y, onClose, onPin, onDelete, onRename, onToggleRead, 
  isPinned, isRead, mangaTitle 
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('scroll', onClose);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', onClose);
    };
  }, [onClose]);

  // Prevent menu from going off-screen
  const style = {
    top: Math.min(y, window.innerHeight - 250),
    left: Math.min(x, window.innerWidth - 220),
  };

  return (
    <div 
      ref={menuRef}
      style={style}
      className="fixed z-50 w-56 bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-white/50 ring-1 ring-black/5 py-1.5 flex flex-col animate-fade-in origin-top-left"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-slate-100 mb-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">选中项目</p>
        <p className="text-sm font-medium text-slate-800 truncate" title={mangaTitle}>{mangaTitle}</p>
      </div>
      
      <button onClick={() => { onPin(); onClose(); }} className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-600 hover:bg-sky-50 hover:text-sky-600 transition-colors mx-1 rounded-lg">
        {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
        {isPinned ? '取消置顶' : '置顶漫画'}
      </button>

      <button onClick={() => { onRename(); onClose(); }} className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-600 hover:bg-sky-50 hover:text-sky-600 transition-colors mx-1 rounded-lg">
        <Edit3 className="w-4 h-4" />
        重命名
      </button>

      <button onClick={() => { onToggleRead(); onClose(); }} className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-600 hover:bg-sky-50 hover:text-sky-600 transition-colors mx-1 rounded-lg">
        {isRead ? <Circle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
        {isRead ? '标记为未读' : '标记为已读'}
      </button>

      <div className="h-px bg-slate-100 my-1 mx-2" />

      <button onClick={() => { onDelete(); onClose(); }} className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors mx-1 rounded-lg font-medium">
        <Trash2 className="w-4 h-4" />
        移除漫画
      </button>
    </div>
  );
};