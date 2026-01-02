import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Grid, Clock, ChevronDown, Flame } from 'lucide-react';
import { Manga, SortOption, ViewMode } from '../types';
import { ContextMenu } from './ContextMenu';

// -- Lazy Cover Component --
const LazyCover: React.FC<{ src: string; alt: string; className: string }> = ({ src, alt, className }) => {
    const [isVisible, setIsVisible] = useState(false);
    const imgRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!imgRef.current) return;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            });
        }, { rootMargin: '100px' });
        observer.observe(imgRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={imgRef} className="w-full h-full">
            {isVisible ? (
                <img src={src} alt={alt} className={className} />
            ) : (
                <div className="w-full h-full bg-slate-100 animate-pulse" />
            )}
        </div>
    );
};

interface LibraryProps {
  mangas: Manga[];
  onOpenManga: (manga: Manga) => void;
  onOpenImport: () => void; // Deprecated but kept to avoid breaking existing usages in App.tsx briefly if any
  onUpdateManga: (updatedManga: Manga) => void;
  onDeleteManga: (id: string) => void;
  onRenameManga: (id: string, newName: string) => void;
  onToggleRead: (id: string) => void;
}

export const Library: React.FC<LibraryProps> = ({ mangas, onOpenManga, onUpdateManga, onDeleteManga, onRenameManga, onToggleRead }) => {
  // Always default to Grid, no toggle needed anymore
  const viewMode = ViewMode.Grid;
  
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const saved = localStorage.getItem('manga_nexus_sort_by');
    return (saved as SortOption) || 'DATE_ADDED';
  });

  useEffect(() => {
    localStorage.setItem('manga_nexus_sort_by', sortBy);
  }, [sortBy]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; mangaId: string } | null>(null);

  const filteredMangas = useMemo(() => {
    let result = [...mangas];
    result.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      switch (sortBy) {
        case 'NAME': return a.title.localeCompare(b.title, undefined, { numeric: true });
        case 'RECENTLY_READ': return (b.lastReadAt || 0) - (a.lastReadAt || 0);
        case 'MOST_READ': return (b.readCount || 0) - (a.readCount || 0);
        case 'DATE_ADDED': default: return b.addedAt - a.addedAt;
      }
    });
    return result;
  }, [mangas, sortBy]);

  const handleContextMenu = (e: React.MouseEvent, mangaId: string) => {
    e.preventDefault();
    e.stopPropagation(); // Ensure explicit right click works even if global is disabled
    setContextMenu({ x: e.clientX, y: e.clientY, mangaId });
  };

  const handlePin = (mangaId: string) => {
    const manga = mangas.find(m => m.id === mangaId);
    if (manga) onUpdateManga({ ...manga, isPinned: !manga.isPinned });
  };

  const handleDelete = (mangaId: string) => {
    if (window.confirm("确定要将此漫画从书架移除吗？")) onDeleteManga(mangaId);
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-8 pb-32">
      {/* Header / Filter Bar */}
      <div className="flex justify-between items-center mb-10 sticky top-0 z-30 bg-white/40 backdrop-blur-xl py-6 -mt-8 px-4 rounded-b-3xl transition-all border-b border-white/40 shadow-sm animate-fade-in">
         <div className="flex items-center gap-4">
             <div className="bg-white/60 px-4 py-2 rounded-2xl shadow-sm border border-white/50 text-xs font-bold text-sky-700 tracking-wide">
                 藏书 • {filteredMangas.length}
             </div>
             
             <div className="flex gap-1 bg-white/40 p-1.5 rounded-2xl border border-white/40 backdrop-blur-md">
                {(['DATE_ADDED', 'NAME', 'RECENTLY_READ', 'MOST_READ'] as SortOption[]).map(opt => (
                    <button 
                        key={opt}
                        onClick={() => setSortBy(opt)}
                        className={`text-[10px] font-bold px-3 py-1.5 rounded-xl transition-all uppercase tracking-wider ${sortBy === opt ? 'text-sky-700 bg-white shadow-sm scale-105' : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'}`}
                    >
                        {opt === 'DATE_ADDED' && '时间'}
                        {opt === 'NAME' && '名称'}
                        {opt === 'RECENTLY_READ' && '最近'}
                        {opt === 'MOST_READ' && '常看'}
                    </button>
                ))}
             </div>
         </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-x-8 gap-y-12 px-4">
        
        {filteredMangas.map((manga, index) => (
          <div 
            key={manga.id}
            className="group relative flex flex-col gap-4 cursor-pointer perspective-1000 animate-slide-up"
            style={{ animationDelay: `${index * 50}ms`, opacity: 0 }} // Staggered delay
            onClick={() => onOpenManga(manga)}
            onContextMenu={(e) => handleContextMenu(e, manga.id)}
          >
            {/* Added style with WebkitMaskImage to fix border-radius glitch during transform animations on Chrome/Safari */}
            <div 
                className="aspect-[2/3] w-full relative rounded-[2rem] overflow-hidden shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)] bg-white transition-all duration-500 ease-out group-hover:-translate-y-3 group-hover:shadow-[0_25px_50px_-12px_rgba(var(--c-pri-500),0.3)] group-hover:rotate-1 ring-1 ring-black/5 transform-gpu"
                style={{ WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
            >
               <LazyCover src={manga.coverUrl} alt={manga.title} className="w-full h-full object-cover transform transition-transform duration-700 ease-in-out group-hover:scale-110" />
               
               <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
               
               {manga.isPinned && (
                  <div className="absolute top-3 right-3 bg-white/90 text-sky-500 p-2 rounded-xl shadow-lg z-10 animate-bounce-soft backdrop-blur-sm">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 2H8C6.89543 2 6 2.89543 6 4V22L12 18L18 22V4C18 2.89543 17.1046 2 16 2Z"></path></svg>
                  </div>
               )}

               {/* Hover Action */}
               <div className="absolute inset-x-0 bottom-6 flex justify-center opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-75">
                  <button className="bg-white/90 backdrop-blur-md text-slate-800 text-xs font-bold py-2.5 px-6 rounded-full shadow-xl hover:bg-sky-500 hover:text-white transition-colors">
                      立即阅读
                  </button>
               </div>
               
               {manga.lastReadAt > 0 && (
                   <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-900/10 backdrop-blur-sm">
                      <div className="h-full bg-sky-400 shadow-[0_0_15px_rgba(56,189,248,1)] rounded-r-full" style={{ width: '45%' }}></div>
                   </div>
               )}
            </div>

            <div className="px-2">
                <h3 className="font-bold text-slate-700 leading-tight group-hover:text-sky-600 transition-colors text-sm line-clamp-2 mb-1">
                    {manga.title}
                </h3>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{manga.totalChapters} 话</span>
                    {manga.readCount > 0 && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-orange-400 bg-orange-50 px-2 py-0.5 rounded-md">
                           <Flame className="w-3 h-3" /> {manga.readCount}
                        </div>
                    )}
                    {manga.lastReadAt > 0 && <Clock className="w-3 h-3 text-sky-300" />}
                </div>
            </div>
          </div>
        ))}
      </div>

      {contextMenu && (
        <ContextMenu 
            {...contextMenu} 
            onClose={() => setContextMenu(null)}
            onPin={() => handlePin(contextMenu.mangaId)}
            onDelete={() => handleDelete(contextMenu.mangaId)}
            onRename={() => {
                const manga = mangas.find(m => m.id === contextMenu.mangaId);
                const newName = window.prompt("重命名漫画", manga?.title);
                if (newName) onRenameManga(contextMenu.mangaId, newName);
            }}
            onToggleRead={() => onToggleRead(contextMenu.mangaId)}
            isPinned={mangas.find(m => m.id === contextMenu.mangaId)?.isPinned || false}
            isRead={(mangas.find(m => m.id === contextMenu.mangaId)?.lastReadAt || 0) > 0}
            mangaTitle={mangas.find(m => m.id === contextMenu.mangaId)?.title || ''}
        />
      )}
    </div>
  );
};
