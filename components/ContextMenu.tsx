import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Pin, Edit3, CheckCircle, Circle, PinOff, FolderPlus, Folder, ChevronRight, CheckSquare, MousePointer2, FolderMinus } from 'lucide-react';
import { Collection } from '../types';

interface ContextMenuProps {
  x: number;
  y: number;
  selectedCount: number;
  onClose: () => void;
  onPin: () => void;
  onDelete: () => void;
  onRename: () => void;
  onToggleRead: () => void;
  onAddToCollection: (collectionId: string) => void;
  onRemoveFromCollection: () => void; // New Prop
  onStartMultiSelect: () => void; 
  collections: Collection[];
  activeCollectionId: string | null; // New Prop
  
  // Single item context (used for display when only 1 item selected)
  isPinned: boolean;
  isRead: boolean;
  mangaTitle: string;
  currentCollectionIds?: string[];
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ 
  x, y, selectedCount, onClose, onPin, onDelete, onRename, onToggleRead, onAddToCollection, onRemoveFromCollection, onStartMultiSelect, collections, activeCollectionId,
  isPinned, isRead, mangaTitle, currentCollectionIds = []
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showCollections, setShowCollections] = useState(false);

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
    top: Math.min(y, window.innerHeight - (selectedCount > 1 ? 280 : 450)),
    left: Math.min(x, window.innerWidth - 240),
  };

  const isMulti = selectedCount > 1;
  const activeCollectionName = activeCollectionId ? collections.find(c => c.id === activeCollectionId)?.name : null;

  return (
    <div 
      ref={menuRef}
      style={style}
      className="fixed z-[150] w-64 bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-white/50 ring-1 ring-black/5 py-1.5 flex flex-col animate-fade-in origin-top-left font-sans select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-slate-100 mb-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
            {isMulti ? `已选中 ${selectedCount} 项` : '选中项目'}
        </p>
        <p className="text-sm font-medium text-slate-800 truncate" title={isMulti ? '批量操作' : mangaTitle}>
            {isMulti ? '批量操作' : mangaTitle}
        </p>
      </div>
      
      {/* Multi-Select Toggle (Only show when single item selected) */}
      {!isMulti && (
        <button onClick={() => { onStartMultiSelect(); onClose(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 hover:bg-sky-50 hover:text-sky-600 transition-colors mx-1 rounded-lg group">
           <CheckSquare className="w-4 h-4 text-slate-400 group-hover:text-sky-500" />
           多选模式
        </button>
      )}

      <button onClick={() => { onPin(); onClose(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 hover:bg-sky-50 hover:text-sky-600 transition-colors mx-1 rounded-lg group">
        {isPinned && !isMulti ? <PinOff className="w-4 h-4 text-slate-400 group-hover:text-sky-500" /> : <Pin className="w-4 h-4 text-slate-400 group-hover:text-sky-500" />}
        {isMulti ? '批量置顶 / 取消' : (isPinned ? '取消置顶' : '置顶漫画')}
      </button>

      {/* Add to Collection Submenu */}
      <div 
        className="relative"
        onMouseEnter={() => setShowCollections(true)}
        onMouseLeave={() => setShowCollections(false)}
      >
          <button className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-slate-600 hover:bg-sky-50 hover:text-sky-600 transition-colors mx-1 rounded-lg group mb-1">
             <div className="flex items-center gap-3">
                 <FolderPlus className="w-4 h-4 text-slate-400 group-hover:text-sky-500" />
                 <span>{isMulti ? '批量加入收藏夹' : '加入收藏夹'}</span>
             </div>
             <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          </button>

          {/* Submenu Dropdown */}
          {showCollections && (
              <div className="absolute left-full top-0 ml-2 w-48 bg-white/95 backdrop-blur-xl rounded-xl shadow-xl border border-white/50 ring-1 ring-black/5 py-1.5 flex flex-col animate-slide-in-right">
                  {collections.length === 0 ? (
                      <div className="px-4 py-2 text-xs text-slate-400">暂无收藏夹</div>
                  ) : (
                      collections.map(col => (
                          <button
                            key={col.id}
                            onClick={() => { onAddToCollection(col.id); onClose(); }}
                            className="flex items-center justify-between px-3 py-2 text-sm text-slate-600 hover:bg-sky-50 hover:text-sky-600 transition-colors mx-1 rounded-lg text-left"
                          >
                              <div className="flex items-center gap-2 truncate">
                                  <Folder className="w-3.5 h-3.5 text-slate-400" />
                                  <span className="truncate">{col.name}</span>
                              </div>
                              {!isMulti && currentCollectionIds.includes(col.id) && (
                                  <CheckSquare className="w-3.5 h-3.5 text-sky-500" />
                              )}
                          </button>
                      ))
                  )}
              </div>
          )}
      </div>

      {/* Remove from current collection (Only if inside a collection) */}
      {activeCollectionId && (
        <button onClick={() => { onRemoveFromCollection(); onClose(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-amber-600 hover:bg-amber-50 hover:text-amber-700 transition-colors mx-1 rounded-lg group">
           <FolderMinus className="w-4 h-4 text-amber-400 group-hover:text-amber-600" />
           <span className="truncate">从 "{activeCollectionName}" 移除</span>
        </button>
      )}

      {!isMulti && (
        <button onClick={() => { onRename(); onClose(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 hover:bg-sky-50 hover:text-sky-600 transition-colors mx-1 rounded-lg group">
            <Edit3 className="w-4 h-4 text-slate-400 group-hover:text-sky-500" />
            重命名
        </button>
      )}

      <button onClick={() => { onToggleRead(); onClose(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 hover:bg-sky-50 hover:text-sky-600 transition-colors mx-1 rounded-lg group">
        {isRead && !isMulti ? <Circle className="w-4 h-4 text-slate-400 group-hover:text-sky-500" /> : <CheckCircle className="w-4 h-4 text-slate-400 group-hover:text-sky-500" />}
        {isMulti ? '标记为已读 / 未读' : (isRead ? '标记为未读' : '标记为已读')}
      </button>

      {/* Only show 'Delete' (Destructive) if NOT inside a collection view. 
          Inside a collection, user should use 'Remove from Collection' instead. */}
      {!activeCollectionId && (
        <>
            <div className="h-px bg-slate-100 my-1 mx-2" />
            <button onClick={() => { onDelete(); onClose(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors mx-1 rounded-lg font-bold group">
                <Trash2 className="w-4 h-4 text-red-400 group-hover:text-red-500" />
                {isMulti ? `移除 ${selectedCount} 项` : '移除漫画'}
            </button>
        </>
      )}
    </div>
  );
};