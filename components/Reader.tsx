import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Settings, Sun, Maximize2, Minimize2, Layers, Menu, X, Loader2 } from 'lucide-react';
import { Manga, ReaderMode, ReadingProgress, Page } from '../types';
import { saveProgress } from '../services/db';

// -- Helper Component for Lazy Loading Blob Images --
const BlobImage: React.FC<{ page: Page; className?: string; priority?: boolean }> = ({ page, className, priority }) => {
    const [src, setSrc] = useState<string>('');
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!page) return; // Guard against undefined page
        
        let objectUrl = '';
        let observer: IntersectionObserver;
        const imgElement = document.getElementById(`page-img-${page.id}`);

        const load = () => {
            if (page.file) {
                // Local Mode: Create Blob URL
                objectUrl = URL.createObjectURL(page.file as Blob);
                setSrc(objectUrl);
                setError(false);
            } else if (page.url) {
                // Server Mode: Use Remote URL directly
                setSrc(page.url);
                setError(false);
            }
        };

        const unload = () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
                objectUrl = '';
            }
            // Only clear src if we created an objectUrl or if we want to aggressively unload remote images
            // For smoother experience, we might keep remote URLs, but to save memory/connections on huge lists:
            setSrc('');
        };

        // In Priority mode (Single/Double view), load immediately and keep it
        if (priority) {
            load();
            return () => unload();
        }

        // In List mode (Vertical), use IntersectionObserver
        if (imgElement) {
            observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        load();
                    } else if (!entry.isIntersecting) {
                        // Optional: unload to save memory
                        unload(); 
                    }
                });
            }, { rootMargin: '100% 0px' }); // Preload 1 screen ahead
            observer.observe(imgElement);
        }

        return () => {
            if (observer) observer.disconnect();
            unload();
        };
    }, [page, priority]);

    if (!page) return null;

    if (error) {
        return (
            <div className={`flex items-center justify-center bg-slate-800 text-slate-500 text-xs ${className}`}>
                加载失败
            </div>
        );
    }

    return (
        <img 
            id={`page-img-${page.id}`}
            src={src || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'} 
            alt={page.name} 
            className={`${className} ${!src ? 'min-h-[300px] bg-slate-800/50 animate-pulse' : ''}`}
            draggable={false}
            onError={() => setError(true)}
            loading={priority ? "eager" : "lazy"}
        />
    );
};

interface ReaderProps {
  manga: Manga;
  initialChapterId?: string;
  initialPageIndex?: number;
  onExit: () => void;
  enableScrollTurn: boolean;
  backgroundColor?: string;
  onReadComplete?: () => void; // Triggered on mount to count read
  longPressDuration?: number; // Duration to trigger drag when zoomed
  toggleMenuKey?: string;
}

export const Reader: React.FC<ReaderProps> = ({ 
    manga, 
    initialChapterId, 
    initialPageIndex = 0, 
    onExit, 
    enableScrollTurn,
    backgroundColor = '#0f172a', // Default Slate-900
    onReadComplete,
    longPressDuration = 200, // Default 200ms
    toggleMenuKey = 'm'
}) => {
  const startChapIndex = initialChapterId ? manga.chapters.findIndex(c => c.id === initialChapterId) : 0;
  
  const [currentChapterIndex, setCurrentChapterIndex] = useState(startChapIndex >= 0 ? startChapIndex : 0);
  const [currentPageIndex, setCurrentPageIndex] = useState(initialPageIndex);
  
  // Initialize Reader Mode from localStorage
  const [mode, setMode] = useState<ReaderMode>(() => {
    const saved = localStorage.getItem('manga_nexus_reader_mode');
    return (saved as ReaderMode) || ReaderMode.Single;
  });

  const hasCountedRef = useRef(false);

  // Increment Read Count once on mount
  useEffect(() => {
    if (onReadComplete && !hasCountedRef.current) {
        onReadComplete();
        hasCountedRef.current = true;
    }
  }, []);

  // Persist Reader Mode
  useEffect(() => {
    localStorage.setItem('manga_nexus_reader_mode', mode);
  }, [mode]);

  const [showControls, setShowControls] = useState(true);
  const [brightness, setBrightness] = useState(100);
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isIdle, setIsIdle] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const verticalPageRefs = useRef<(HTMLDivElement | null)[]>([]); // Refs for scrolling
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const hasMovedRef = useRef(false); // To distinguish click vs drag
  
  // Dragging Gesture Logic Refs
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const isDraggingGestureRef = useRef(false); // Explicitly track drag gesture state

  const currentChapter = manga.chapters[currentChapterIndex];
  const totalPages = currentChapter?.pages.length || 0;

  const isCoverPage = currentChapterIndex === 0 && currentPageIndex === 0;

  // --- Idle Logic ---
  useEffect(() => {
    const resetIdleTimer = () => {
        setIsIdle(false);
        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = setTimeout(() => {
            setIsIdle(true);
        }, 3000);
    };

    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('mousedown', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);

    return () => {
        window.removeEventListener('mousemove', resetIdleTimer);
        window.removeEventListener('mousedown', resetIdleTimer);
        window.removeEventListener('touchstart', resetIdleTimer);
        window.removeEventListener('keydown', resetIdleTimer);
        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, []);

  // Save Progress (Exact Page)
  useEffect(() => {
    if (currentChapter) {
      const progress: ReadingProgress = {
        mangaId: manga.id,
        chapterId: currentChapter.id,
        pageIndex: currentPageIndex
      };
      saveProgress(progress).catch(console.error);
    }
  }, [currentPageIndex, currentChapterIndex, manga.id, currentChapter]);

  // Reset zoom/pan on page change or mode change
  useEffect(() => {
    if (mode !== ReaderMode.Vertical) {
        setZoom(100);
        setPan({ x: 0, y: 0 });
    }
    // In Vertical mode, we typically want to keep zoom level if user set it
  }, [mode, currentChapterIndex, currentPageIndex]); // Added currentPageIndex to reset zoom on page turn

  // Normalize Page Index when switching modes
  useEffect(() => {
      if (mode === ReaderMode.Double) {
          if (currentChapterIndex === 0) {
             if (currentPageIndex > 0 && currentPageIndex % 2 === 0) {
                 setCurrentPageIndex(currentPageIndex - 1);
             }
          } else {
             if (currentPageIndex % 2 !== 0) {
                 setCurrentPageIndex(currentPageIndex - 1);
             }
          }
      }
  }, [mode, currentChapterIndex]);


  const navigateNext = useCallback(() => {
    if (mode === ReaderMode.Vertical) return; 
    let step = 1;
    if (mode === ReaderMode.Double) {
        if (currentChapterIndex === 0 && currentPageIndex === 0) step = 1; // Cover is single
        else step = 2;
    }
    
    if (currentPageIndex + step < totalPages) {
      setCurrentPageIndex(prev => prev + step);
    } else {
      if (currentChapterIndex < manga.chapters.length - 1) {
        setCurrentChapterIndex(prev => prev + 1);
        setCurrentPageIndex(0);
      }
    }
  }, [currentPageIndex, currentChapterIndex, totalPages, mode, manga.chapters.length]);

  const navigatePrev = useCallback(() => {
    if (mode === ReaderMode.Vertical) return;

    let step = 1;
    if (mode === ReaderMode.Double) {
         if (currentChapterIndex === 0 && currentPageIndex === 1) step = 1;
         else step = 2;
    }

    if (currentPageIndex - step >= 0) {
      setCurrentPageIndex(prev => prev - step);
    } else {
      if (currentChapterIndex > 0) {
        const prevChapter = manga.chapters[currentChapterIndex - 1];
        setCurrentChapterIndex(prev => prev - 1);
        const lastPage = prevChapter.pages.length - 1;
        if (mode === ReaderMode.Double) {
             if (currentChapterIndex - 1 === 0) {
                 // Going back to chapter 0 cover?
                 // If total pages is even, last index is odd. Cover is 0.
                 setCurrentPageIndex(lastPage);
             } else {
                 // Normal chapter
                 setCurrentPageIndex(lastPage % 2 === 0 ? lastPage : lastPage - 1);
             }
        } else {
            setCurrentPageIndex(lastPage);
        }
      }
    }
  }, [currentPageIndex, currentChapterIndex, mode, manga.chapters]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') navigateNext();
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') navigatePrev();
      if (e.key === ' ') {
          e.preventDefault();
          if (e.shiftKey) navigatePrev();
          else navigateNext();
      }
      if (e.key === 'Escape') {
          if (showSidebar) setShowSidebar(false);
          else onExit();
      }
      
      const key = e.key.toLowerCase();
      const configuredKey = toggleMenuKey.toLowerCase();
      if (key === configuredKey) setShowControls(prev => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateNext, navigatePrev, showSidebar, onExit, toggleMenuKey]);

  // Wheel Handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
        if (mode === ReaderMode.Vertical) {
            if (e.shiftKey) {
                e.preventDefault();
                const delta = e.deltaY * -0.1;
                setZoom(prev => Math.min(Math.max(prev + delta, 50), 300));
            }
            // Allow default scrolling otherwise
            return;
        }
        if (e.ctrlKey || e.metaKey || e.shiftKey || !enableScrollTurn) {
             e.preventDefault();
             const delta = e.deltaY * -0.2; 
             setZoom(prev => Math.min(Math.max(prev + delta, 50), 400));
             return;
        }
        if (enableScrollTurn) {
             e.preventDefault();
             if (scrollTimeoutRef.current) return;
             if (Math.abs(e.deltaY) > 20) {
                 if (e.deltaY > 0) navigateNext();
                 else navigatePrev();
                 scrollTimeoutRef.current = setTimeout(() => {
                     scrollTimeoutRef.current = null;
                 }, 200);
             }
        }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [mode, enableScrollTurn, navigateNext, navigatePrev]);

  // Drag & Click Handlers with Improved Zoom Logic
  const handlePointerDown = (e: React.PointerEvent) => {
    // Stop default image dragging behavior
    e.preventDefault();

    if (mode === ReaderMode.Vertical) return; 

    hasMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
    
    isLongPressRef.current = false;
    isDraggingGestureRef.current = false;
    
    // Logic:
    // 1. Zoom > 100: Long Press (custom duration) to trigger drag. Short click triggers page turn.
    // 2. Zoom <= 100: Drag Disabled. Only Click works.
    
    if (zoom > 100) {
        longPressTimerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            isDraggingGestureRef.current = true;
            setIsDragging(true);
        }, longPressDuration);
    }
    // If zoom <= 100, we do NOT start the timer, so drag never activates.

    // Capture pointer
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (mode === ReaderMode.Vertical) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // If we are logically dragging (Long press triggered)
    if (isDraggingGestureRef.current) {
        setPan({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy });
        return; 
    }

    const distance = Math.sqrt(dx * dx + dy * dy);

    // If we moved significantly (>10px) but drag hasn't started yet:
    // 1. If waiting for long press (Zoom > 100): Cancel it. This becomes a "Swipe" (ignored) or sloppy click (ignored).
    // 2. If Zoom <= 100: Drag is disabled anyway.
    if (distance > 10) {
        hasMovedRef.current = true;
        
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // Priority: If sidebar is open, clicking content closes sidebar.
    if (showSidebar) {
        setShowSidebar(false);
        // Clear timers/captures just in case
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        e.currentTarget.releasePointerCapture(e.pointerId);
        return;
    }

    if (mode === ReaderMode.Vertical) return;
    
    // Clear Timer
    if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
    }

    const wasDragging = isDraggingGestureRef.current;

    setIsDragging(false); // Stop Dragging visual
    isDraggingGestureRef.current = false;
    isLongPressRef.current = false;
    
    e.currentTarget.releasePointerCapture(e.pointerId);

    // Calculate move distance
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If we definitely moved significantly, block click.
    if (distance > 10) {
        return;
    }

    // If we didn't move much, we usually want to click.
    // BUT if it was a LONG PRESS that triggered drag mode (cursor changed, etc.), we should NOT click.
    // If delay is 0ms (instant drag mode), 'wasDragging' is true immediately. We still want static taps to click.
    // So we only block click if wasDragging is true AND the delay was significant enough to imply "Mode Switch Intention" (e.g. > 50ms).
    if (wasDragging && longPressDuration >= 50) {
         return;
    }

    // Click Logic (only if static/short tap)
    const { clientX } = e;
    const width = window.innerWidth;
    
    // Click Zones - 50/50 Split (Computer Center Line)
    if (clientX < width / 2) {
        navigatePrev();
    } else {
        navigateNext();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (mode !== ReaderMode.Vertical) return;
    const container = e.currentTarget;
    
    // Simple heuristic to find visible page
    let closestIndex = 0;
    let minDiff = Infinity;
    
    verticalPageRefs.current.forEach((ref, idx) => {
        if (!ref) return;
        const rect = ref.getBoundingClientRect();
        const diff = Math.abs(rect.top); 
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = idx;
        }
    });
    
    if (closestIndex !== currentPageIndex) {
        setCurrentPageIndex(closestIndex);
    }
  };

  // Vertical Mode "Next Chapter" handler
  const handleNextChapterVertical = () => {
      setCurrentChapterIndex(prev => prev + 1);
      setCurrentPageIndex(0);
      if(containerRef.current) {
          containerRef.current.scrollTo({ top: 0, behavior: 'instant' });
      }
  };

  // Scroll to page when using slider in Vertical Mode
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value);
      setCurrentPageIndex(val);
      
      if (mode === ReaderMode.Vertical) {
          const targetRef = verticalPageRefs.current[val];
          if (targetRef) {
              targetRef.scrollIntoView({ behavior: 'auto', block: 'start' });
          }
      }
  };

  if (!currentChapter) return <div className="text-slate-500 text-center mt-20">未找到页面。</div>;

  return (
    <div 
      className={`fixed inset-0 select-none flex flex-col overflow-hidden ${isIdle && !showControls ? 'cursor-none' : ''} ${isFullscreen ? 'z-[110]' : 'z-50'}`}
      style={{ 
        backgroundColor: backgroundColor,
      }}
    >
      <div className="absolute inset-0 pointer-events-none z-[60]" style={{ backgroundColor: `rgba(0,0,0, ${1 - brightness / 100})` }} />

      {/* Floating Menu Trigger */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowControls(true); }}
        className={`absolute bottom-5 left-4 md:left-8 p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 rounded-full text-white/80 transition-all duration-300 z-[90] hover:scale-110 active:scale-95 group shadow-lg ${showControls ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100 translate-y-0'}`}
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Top Controls */}
      <div 
        className={`absolute top-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-xl border-b border-sky-100 shadow-sm z-[70] flex items-center justify-between px-6 transition-transform duration-300 ${showControls ? 'translate-y-0' : '-translate-y-full'}`}
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="text-slate-500 hover:text-sky-600 p-2 rounded-full hover:bg-sky-50 transition-colors" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col">
             <span className="text-slate-800 font-bold text-sm truncate max-w-[200px]">{manga.title}</span>
             <span className="text-slate-500 text-xs truncate max-w-[200px] font-medium">{currentChapter.title}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
            <button onClick={(e) => { e.stopPropagation(); setMode(ReaderMode.Single); }} className={`p-2 rounded-xl transition-all ${mode === ReaderMode.Single ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'text-slate-400 hover:text-sky-600 hover:bg-sky-50'}`} title="单页模式" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <div className="w-4 h-6 border-2 border-current rounded-[1px] m-1" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setMode(ReaderMode.Double); }} className={`p-2 rounded-xl transition-all ${mode === ReaderMode.Double ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'text-slate-400 hover:text-sky-600 hover:bg-sky-50'}`} title="双页模式" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <div className="flex gap-0.5 m-1">
                    <div className="w-3 h-5 border-2 border-current rounded-[1px]" />
                    <div className="w-3 h-5 border-2 border-current rounded-[1px]" />
                </div>
            </button>
             <button onClick={(e) => { e.stopPropagation(); setMode(ReaderMode.Vertical); }} className={`p-2 rounded-xl transition-all ${mode === ReaderMode.Vertical ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'text-slate-400 hover:text-sky-600 hover:bg-sky-50'}`} title="垂直滚动" style={{ WebkitAppRegion: 'no-drag' } as any}>
                 <div className="flex flex-col gap-0.5 m-1">
                    <div className="w-5 h-3 border-2 border-current rounded-[1px]" />
                    <div className="w-5 h-3 border-2 border-current rounded-[1px]" />
                </div>
            </button>
            <div className="w-px h-6 bg-slate-200 mx-2" />
            <button onClick={(e) => { e.stopPropagation(); setShowSidebar(!showSidebar); }} className={`p-2 rounded-xl transition-all ${showSidebar ? 'bg-sky-100 text-sky-600' : 'text-slate-400 hover:text-sky-600 hover:bg-sky-50'}`} style={{ WebkitAppRegion: 'no-drag' } as any}>
                <Settings className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div 
        className={`flex-1 w-full h-full relative flex justify-center outline-none ${
            mode === ReaderMode.Vertical 
            ? 'items-start overflow-y-auto overflow-x-hidden touch-pan-y custom-scrollbar' 
            : 'items-center overflow-hidden touch-none'
        }`}
        ref={containerRef}
        onScroll={handleScroll}
        tabIndex={-1}
      >
        <div
            className={`w-full ${mode === ReaderMode.Vertical ? 'min-h-full items-start pt-20 pb-20' : 'h-full items-center'} flex justify-center origin-center will-change-transform`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{
                transform: mode === ReaderMode.Vertical ? 'none' : `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
                transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
                cursor: isDragging ? 'grabbing' : 'default'
            }}
        >
             {mode === ReaderMode.Vertical ? (
                 <div className="flex flex-col items-center py-10" style={{ width: `${zoom}%` }}>
                     {currentChapter.pages.map((page, idx) => (
                         <div 
                            key={page.id} 
                            ref={(el) => { verticalPageRefs.current[idx] = el; }} 
                            className="w-full flex justify-center"
                         >
                            <BlobImage page={page} className="w-full h-auto block mb-0.5 shadow-lg" />
                         </div>
                     ))}
                     <div className="h-32 flex items-center justify-center mt-8 w-full">
                        {currentChapterIndex < manga.chapters.length - 1 ? (
                             <button 
                                onClick={(e) => { e.stopPropagation(); handleNextChapterVertical(); }}
                                className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-full transition-all font-medium backdrop-blur-sm z-50 cursor-pointer"
                             >
                                下一章
                             </button>
                        ) : (
                            <span className="text-slate-500 font-medium">已读完</span>
                        )}
                     </div>
                 </div>
            ) : (mode === ReaderMode.Single || (mode === ReaderMode.Double && isCoverPage)) ? (
                // Single Page Mode (or Cover in Double Mode)
                currentChapter.pages[currentPageIndex] ? (
                    <BlobImage 
                        key={currentChapter.pages[currentPageIndex].id}
                        page={currentChapter.pages[currentPageIndex]} 
                        priority 
                        className="max-h-full max-w-full object-contain shadow-2xl select-none" 
                    />
                ) : (
                    <div className="text-slate-500/50 flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <span>正在加载页面...</span>
                    </div>
                )
            ) : (
                // Double Page Mode (RTL)
                // Using flex-row with explicit ordering to ensure gap-less layout.
                <div className="flex items-center justify-center h-full w-full select-none overflow-hidden">
                     
                     {/* Left Side: Page N+1. Align End (Right) to touch spine */}
                     <div className="w-1/2 h-full flex items-center justify-end overflow-hidden">
                        {currentChapter.pages[currentPageIndex + 1] && (
                            <BlobImage 
                                key={currentChapter.pages[currentPageIndex + 1].id}
                                page={currentChapter.pages[currentPageIndex + 1]} 
                                priority 
                                className="max-h-full max-w-full object-contain" 
                            />
                        )}
                     </div>

                     {/* Right Side: Page N. Align Start (Left) to touch spine */}
                     <div className="w-1/2 h-full flex items-center justify-start overflow-hidden">
                        {currentChapter.pages[currentPageIndex] && (
                            <BlobImage 
                                key={currentChapter.pages[currentPageIndex].id}
                                page={currentChapter.pages[currentPageIndex]} 
                                priority 
                                className="max-h-full max-w-full object-contain" 
                            />
                        )}
                     </div>
                </div>
            )}
        </div>
      </div>

      {/* Sidebar Settings */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className={`absolute right-0 top-0 bottom-0 w-80 bg-white/95 backdrop-blur-2xl border-l border-sky-100 shadow-2xl z-[80] transform transition-transform duration-300 p-6 flex flex-col ${showSidebar ? 'translate-x-0' : 'translate-x-full'}`}
      >
          <div className="flex justify-between items-center mb-8 flex-shrink-0">
              <h3 className="text-slate-800 font-extrabold text-lg flex items-center gap-2">
                 <Settings className="w-5 h-5 text-sky-500" />
                 阅读设置
              </h3>
              <button onClick={() => setShowSidebar(false)} className="text-slate-400 hover:text-sky-600 p-1 hover:bg-sky-50 rounded-lg transition-colors">
                  <ArrowLeft className="w-5 h-5 rotate-180" />
              </button>
          </div>
          
          <div className="space-y-8 flex-shrink-0">
              <div>
                  <label className="flex items-center gap-2 text-slate-600 text-sm mb-3 font-bold">
                      <Sun className="w-4 h-4 text-sky-400" /> 亮度 ({brightness}%)
                  </label>
                  <input type="range" min="30" max="150" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))} className="w-full accent-sky-500 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer" />
              </div>

              <div>
                  <label className="flex items-center gap-2 text-slate-600 text-sm mb-3 font-bold">
                      <Maximize2 className="w-4 h-4 text-sky-400" /> 缩放 ({Math.round(zoom)}%)
                  </label>
                  <input type="range" min="50" max="400" value={zoom} onChange={(e) => setZoom(parseInt(e.target.value))} className="w-full accent-sky-500 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer" />
                  <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium">
                      <button onClick={() => setZoom(100)} className="hover:text-sky-600 transition-colors">重置</button>
                      <button onClick={() => setZoom(200)} className="hover:text-sky-600 transition-colors">200%</button>
                  </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                  <button onClick={toggleFullscreen} className="w-full py-3 bg-sky-50 text-sky-600 hover:bg-sky-100 hover:text-sky-700 rounded-xl transition-all flex items-center justify-center gap-2 font-bold shadow-sm">
                    {isFullscreen ? <Minimize2 className="w-4 h-4"/> : <Maximize2 className="w-4 h-4"/>}
                    {isFullscreen ? '退出全屏' : '进入全屏'}
                  </button>
              </div>
          </div>
          
          {/* Chapter List */}
          <div className="mt-8 flex-1 flex flex-col min-h-0">
              <h4 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2 flex-shrink-0">
                  <Layers className="w-3 h-3" /> 章节列表
              </h4>
              <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2 space-y-1">
                  {manga.chapters.map((chap, idx) => (
                      <button 
                        key={chap.id}
                        onClick={() => { setCurrentChapterIndex(idx); setCurrentPageIndex(0); if(containerRef.current) containerRef.current.scrollTop = 0; }}
                        className={`w-full text-left px-4 py-3 text-sm rounded-xl transition-all border ${idx === currentChapterIndex ? 'bg-sky-50 text-sky-700 border-sky-100 shadow-sm font-bold' : 'text-slate-600 border-transparent hover:bg-slate-50 hover:text-slate-900'}`}
                      >
                          <div className="truncate">{chap.title}</div>
                          <div className={`text-xs mt-0.5 ${idx === currentChapterIndex ? 'text-sky-400' : 'text-slate-400'}`}>{chap.pages.length} 页</div>
                      </button>
                  ))}
              </div>
          </div>
      </div>

      {/* Bottom Progress Bar - Fixed Interaction */}
      <div className={`absolute bottom-0 left-0 right-0 h-20 bg-white/90 backdrop-blur-xl border-t border-sky-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-[70] flex items-center px-4 md:px-8 gap-4 md:gap-6 transition-transform duration-300 ${showControls ? 'translate-y-0' : 'translate-y-full'}`}>
         {/* Close Button Inside Bar */}
         <button
            onClick={(e) => { e.stopPropagation(); setShowControls(false); }}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0"
         >
            <X className="w-6 h-6" />
         </button>
         
         <div className="w-px h-8 bg-slate-200 hidden sm:block flex-shrink-0"></div>

         <span className="text-slate-600 text-sm font-bold w-12 text-right flex-shrink-0">{currentPageIndex + 1}</span>
         
         <div className="flex-1 relative h-6 group cursor-pointer flex items-center">
             <div className="absolute inset-0 top-1/2 -translate-y-1/2 h-2 bg-slate-200 rounded-full"></div>
             <div 
                className="absolute left-0 top-1/2 -translate-y-1/2 h-2 bg-sky-500 rounded-full" 
                style={{ width: `${((currentPageIndex) / (totalPages - 1 || 1)) * 100}%` }}
             >
             </div>
             {/* Thumb Visualization */}
             <div 
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-sky-500 rounded-full shadow-md transition-transform transform group-hover:scale-125 z-10 pointer-events-none"
                style={{ left: `calc(${((currentPageIndex) / (totalPages - 1 || 1)) * 100}% - 8px)` }}
             ></div>
             
             {/* Interaction Layer */}
             <input 
                type="range"
                min="0"
                max={Math.max(0, totalPages - 1)}
                value={currentPageIndex}
                onChange={handleSliderChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
             />
         </div>
         <span className="text-slate-400 text-sm font-medium w-12 flex-shrink-0">{totalPages}</span>
      </div>
    </div>
  );
};