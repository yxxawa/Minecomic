import React, { useEffect, useState } from 'react';
import { Play, ArrowLeft, Hash, BookOpen, Layers, Calendar, RotateCcw, User, Tag } from 'lucide-react';
import { Manga, ReadingProgress } from '../types';
import { Button } from './Button';
import { getProgress } from '../services/db';
import { naturalCompare } from '../services/mangaUtils';

interface MangaDetailProps {
  manga: Manga | null;
  isOpen: boolean;
  onClose: () => void;
  onStartReading: (manga: Manga, chapterId?: string) => void;
}

export const MangaDetail: React.FC<MangaDetailProps> = ({ manga, isOpen, onClose, onStartReading }) => {
  // isVisible controls the CSS transition classes
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState<ReadingProgress | undefined>(undefined);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (isOpen && manga) {
      getProgress(manga.id).then(setProgress);
      // Reset expansion state when opening a new manga
      setIsExpanded(false);
      // Trigger enter animation after mount
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen, manga]);

  // Intercept the close action to play the exit animation first
  const handleClose = () => {
    setIsVisible(false);
    // Wait for animation (300ms) before actually unmounting via parent
    setTimeout(() => {
        onClose();
    }, 300); 
  };

  if (!isOpen || !manga) return null;

  const isStarted = manga.lastReadAt > 0;
  
  // FORCE NATURAL SORT: Ensure chapters like "Chapter 10" come after "Chapter 9", not before "Chapter 2"
  const sortedChapters = [...manga.chapters].sort((a, b) => naturalCompare(a.title, b.title));

  const displayedChapters = isExpanded ? sortedChapters : sortedChapters.slice(0, 8);

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 transition-all duration-300 ease-out ${isVisible ? 'bg-slate-900/40 backdrop-blur-md opacity-100' : 'bg-slate-900/0 backdrop-blur-none opacity-0'}`}
      onClick={handleClose}
    >
      {/* Main Card Container */}
      <div 
        className={`
            relative w-full max-w-5xl h-[80vh] max-h-[650px] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row
            transform transition-all duration-500 cubic-bezier(0.32, 0.72, 0, 1)
            ${isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 scale-95'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Side: Full Height Image */}
        <div className="relative w-full md:w-[42%] h-64 md:h-full shrink-0 bg-slate-100">
           <img 
              src={manga.coverUrl} 
              alt={manga.title}
              className="w-full h-full object-cover"
           />
           {/* Subtle gradient overlay for depth */}
           <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-30"></div>
        </div>

        {/* Right Side: Content */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-white relative">
           
           {/* Scrollable Content Area */}
           <div className="flex-1 overflow-y-auto custom-scrollbar p-8 md:p-10 md:pb-6">
               
               {/* ID Badge & Author */}
               <div className="flex flex-wrap items-center gap-3 mb-5">
                 <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-100 rounded-full text-[11px] font-bold text-slate-500 tracking-wider">
                     <Hash className="w-3 h-3 text-sky-500" />
                     <span>ID: <span className="text-slate-700">{manga.sourceId || manga.id}</span></span>
                 </div>
                 {manga.author && manga.author !== "Unknown" && (
                     <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-[11px] font-bold text-indigo-500 tracking-wider">
                        <User className="w-3 h-3" />
                        <span>{manga.author}</span>
                     </div>
                 )}
               </div>
              
               {/* Title */}
               <h1 className="text-2xl md:text-3xl font-black text-slate-800 leading-[1.3] mb-4 tracking-tight" title={manga.title}>
                  {manga.title}
               </h1>

               {/* Tags / Keywords */}
               {manga.keywords && manga.keywords.length > 0 && (
                   <div className="flex flex-wrap gap-2 mb-8">
                       {manga.keywords.map((tag, i) => (
                           <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-pink-50 text-pink-500 text-[10px] font-bold rounded-lg border border-pink-100">
                               <Tag className="w-2.5 h-2.5" />
                               {tag}
                           </span>
                       ))}
                   </div>
               )}
               
               {/* Stats Grid */}
               <div className="grid grid-cols-2 gap-8 mb-8 border-b border-slate-50 pb-8">
                  <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-extrabold text-sky-500/80 uppercase tracking-widest">章节总数</span>
                      <div className="flex items-center gap-2 text-slate-700 font-bold text-base">
                          <BookOpen className="w-4 h-4 text-sky-500" />
                          <span>{manga.totalChapters} 卷/话</span>
                      </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-extrabold text-sky-500/80 uppercase tracking-widest">归档日期</span>
                      <div className="flex items-center gap-2 text-slate-700 font-bold text-base">
                          <Calendar className="w-4 h-4 text-sky-500" />
                          <span>{new Date(manga.addedAt).toLocaleDateString()}</span>
                      </div>
                  </div>
               </div>

                {/* Chapter List Preview */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                        <Layers className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">章节列表</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                         {displayedChapters.map((chapter) => (
                            <button
                                key={chapter.id}
                                onClick={() => onStartReading(manga, chapter.id)}
                                className="text-left px-3.5 py-3 rounded-xl bg-slate-50 hover:bg-sky-50 text-slate-600 hover:text-sky-600 text-xs font-bold truncate transition-all border border-transparent hover:border-sky-100 active:scale-95"
                                title={chapter.title}
                            >
                                {chapter.title}
                            </button>
                        ))}
                        {!isExpanded && manga.chapters.length > 8 && (
                            <div className="col-span-2 text-center py-2">
                                <button 
                                    onClick={() => setIsExpanded(true)}
                                    className="text-xs text-slate-400 hover:text-sky-600 font-bold bg-slate-50 hover:bg-sky-50 px-4 py-1.5 rounded-full transition-colors"
                                >
                                    ↓ 还有 {manga.chapters.length - 8} 个章节
                                </button>
                            </div>
                        )}
                    </div>
                </div>

           </div>

           {/* Footer: Fixed Buttons */}
           <div className="flex-shrink-0 p-8 md:p-10 pt-4 md:pt-4 bg-white/95 backdrop-blur-sm border-t border-slate-50 flex items-center gap-4 z-10">
              <Button 
                onClick={() => onStartReading(manga)}
                className="flex-1 py-4 text-base shadow-xl shadow-sky-200/50 hover:shadow-sky-300/50 rounded-2xl transition-all hover:-translate-y-1 bg-sky-500 hover:bg-sky-600 text-white font-bold"
                icon={isStarted ? <RotateCcw className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              >
                 {isStarted ? "继续阅读" : "开始阅读"}
              </Button>

              <button 
                onClick={handleClose}
                className="px-6 py-4 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all font-bold text-sm flex items-center gap-2 active:scale-95"
              >
                 <ArrowLeft className="w-4 h-4" />
                 回到书架
              </button>
           </div>
           
        </div>
      </div>
    </div>
  );
};