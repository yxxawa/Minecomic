import React, { useState, useEffect } from 'react';
import { Search, Settings as SettingsIcon, ShieldAlert, Cloud, ChevronLeft, Menu, Library as LibraryIcon, BarChart3, Compass, LayoutGrid, Download, Server } from 'lucide-react';
import { Library } from './components/Library';
import { Reader } from './components/Reader';
import { MangaDetail } from './components/MangaDetail';
import { SettingsModal } from './components/SettingsModal';
import { Downloader } from './components/Downloader';
import { TitleBar } from './components/TitleBar';
import { Manga, AppSettings } from './types';
import { getProgress, updateMetadata } from './services/db';
import { Button } from './components/Button';
import { naturalCompare } from './services/mangaUtils';

// ... (Themes object omitted for brevity, keeping existing structure)
const themes = {
  gentle: {
    primary: {
      50: '#FFF5EB', 100: '#FFE6D1', 200: '#FFCC99', 300: '#FFB380', 400: '#FF9966',
      500: '#FF8040', 600: '#E66020', 700: '#CC4A10', 800: '#993300', 900: '#662200'
    },
    neutral: {
      50: '#FFFFCC', 100: '#FFFBF0', 200: '#F5E6D3', 300: '#E6D0C0', 400: '#D1BJA0',
      500: '#998A7E', 600: '#7D6E64', 700: '#63554D', 800: '#4A3E38', 900: '#332924', 950: '#1F1815'
    }
  },
  fresh: {
    primary: {
      50: '#F0FDFA', 100: '#CCFBF1', 200: '#99F6E4', 300: '#5EEAD4', 400: '#66CCCC',
      500: '#14B8A6', 600: '#0D9488', 700: '#0F766E', 800: '#115E59', 900: '#134E4A'
    },
    neutral: {
      50: '#F0F9FF', 100: '#E0F2FE', 200: '#BAE6FD', 300: '#7DD3FC', 400: '#38BDF8',
      500: '#64748B', 600: '#475569', 700: '#334155', 800: '#1E293B', 900: '#0F172A', 950: '#020617'
    }
  },
  playful: {
    primary: {
      50: '#FFF0F5', 100: '#FFE4E9', 200: '#FFCCD6', 300: '#FFA3B8', 400: '#FF6666',
      500: '#FF4D4D', 600: '#E63333', 700: '#CC1F1F', 800: '#991414', 900: '#660A0A'
    },
    neutral: {
      50: '#FFF5F7', 100: '#FCE7F3', 200: '#FBCFE8', 300: '#F9A8D4', 400: '#F472B6',
      500: '#9D8C96', 600: '#85707C', 700: '#6D5663', 800: '#553E4B', 900: '#3D2834', 950: '#2A1822'
    }
  }
};

const App: React.FC = () => {
  const [isPanic, setIsPanic] = useState(() => localStorage.getItem('manga_nexus_panic') === 'true');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Settings State
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('manga_nexus_settings');
    const defaults: AppSettings = {
      theme: 'fresh',
      enableScrollTurn: false,
      panicKey: 'F12',
      readerBackgroundColor: '#0f172a',
      longPressDuration: 200,
      toggleMenuKey: 'm'
    };
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });

  useEffect(() => {
    const root = document.documentElement;
    const theme = themes[settings.theme] || themes.fresh;
    Object.entries(theme.primary).forEach(([key, value]) => root.style.setProperty(`--c-pri-${key}`, value as string));
    Object.entries(theme.neutral).forEach(([key, value]) => root.style.setProperty(`--c-neu-${key}`, value as string));
  }, [settings.theme]);

  useEffect(() => {
    localStorage.setItem('manga_nexus_settings', JSON.stringify(settings));
  }, [settings]);

  const triggerPanic = () => {
      localStorage.setItem('manga_nexus_panic', 'true');
      setIsPanic(true);
      window.location.reload();
  };

  const handleTriggerPanicClick = () => {
      if (window.confirm(`确定启用安全锁定模式？\n快捷键: ${settings.panicKey}\n这将立即伪装应用，且无法通过刷新恢复。`)) {
        triggerPanic();
      }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === settings.panicKey) {
        if (isPanic) {
            localStorage.setItem('manga_nexus_panic', 'false');
            setIsPanic(false);
            window.location.reload();
        } else {
            triggerPanic();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [settings.panicKey, isPanic]);

  const [screen, setScreen] = useState<'library' | 'reader'>('library');
  const [activeManga, setActiveManga] = useState<Manga | null>(null);
  const [initialChapter, setInitialChapter] = useState<string | undefined>(undefined);
  const [initialPage, setInitialPage] = useState<number>(0);
  const [selectedMangaForDetail, setSelectedMangaForDetail] = useState<Manga | null>(null);
  const [mangas, setMangas] = useState<Manga[]>([]);
  const [showDownloaderModal, setShowDownloaderModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [serverLoading, setServerLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false); 

  const handleFetchServerLibrary = async () => {
      setServerLoading(true);
      try {
          // Always refresh to see new files
          const res = await fetch('http://localhost:8000/library?refresh=true');
          if (!res.ok) throw new Error("Server response error");
          
          const data = await res.json();
          const serverMangas: Manga[] = (data.mangas || []).map((sm: any) => ({
              id: sm.id,
              sourceId: sm.sourceId,
              title: sm.title,
              coverUrl: sm.coverUrl,
              addedAt: Date.now(),
              lastReadAt: sm.lastReadAt || 0,
              readCount: sm.readCount || 0,
              isPinned: sm.isPinned || false,
              totalChapters: sm.chapters.length,
              totalPages: sm.totalPages, // May be 0 if summary
              author: sm.author,
              keywords: sm.keywords,
              path: 'SERVER',
              isServer: true,
              chapters: sm.chapters
                  .sort((a: any, b: any) => naturalCompare(a.title, b.title))
                  .map((sc: any, idx: number) => ({
                      id: sc.id || sc.title, 
                      title: sc.title,
                      order: idx,
                      pages: sc.pages.map((sp: any) => ({
                          id: sp.name,
                          name: sp.name,
                          url: sp.url
                      }))
                  }))
          }));

          setMangas(serverMangas);
          
      } catch (e) {
          console.error(e);
      } finally {
          setServerLoading(false);
      }
  };

  // Keep Connection Alive Logic
  useEffect(() => {
      const pingServer = () => {
          fetch('http://localhost:8000/health').catch(() => {});
      };
      // Ping immediately
      pingServer();
      // Ping every 30s
      const timer = setInterval(pingServer, 30000);
      return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Init App: Just fetch the server library
    handleFetchServerLibrary();
  }, []);

  // Helper to lazily fetch details if missing
  const ensureMangaDetails = async (manga: Manga): Promise<Manga> => {
      const needsFetch = manga.isServer && manga.chapters.length > 0 && manga.chapters[0].pages.length === 0;

      if (!needsFetch) return manga;

      setDetailLoading(true);
      try {
          const res = await fetch(`http://localhost:8000/manga_detail?id=${encodeURIComponent(manga.sourceId || '')}`);
          if (!res.ok) throw new Error("Failed to fetch details");
          const data = await res.json();
          
          const detailedManga: Manga = {
              ...manga,
              readCount: data.readCount || manga.readCount, // Sync meta
              isPinned: data.isPinned || manga.isPinned,
              lastReadAt: data.lastReadAt || manga.lastReadAt,
              totalPages: data.totalPages,
              author: data.author || manga.author,
              keywords: data.keywords || manga.keywords,
              chapters: data.chapters
                  .sort((a: any, b: any) => naturalCompare(a.title, b.title))
                  .map((sc: any, idx: number) => ({
                      id: sc.id || sc.title,
                      title: sc.title,
                      order: idx,
                      pages: sc.pages.map((sp: any) => ({
                          id: sp.name,
                          name: sp.name,
                          url: sp.url
                      }))
                  }))
          };
          
          setMangas(prev => prev.map(m => m.id === manga.id ? detailedManga : m));
          return detailedManga;

      } catch (e) {
          console.error(e);
          alert("加载章节详情失败");
          return manga;
      } finally {
          setDetailLoading(false);
      }
  };

  const handleOpenMangaDetail = async (manga: Manga) => {
    if (manga.isServer) {
        setSelectedMangaForDetail(manga);
        const fullManga = await ensureMangaDetails(manga);
        setSelectedMangaForDetail(fullManga); 
    } else {
        setSelectedMangaForDetail(manga);
    }
  };

  const handleStartReading = async (manga: Manga, chapterId?: string) => {
    let targetManga = manga;
    if (manga.isServer) {
        targetManga = await ensureMangaDetails(manga);
    }

    setSelectedMangaForDetail(null);
    setActiveManga(targetManga);
    
    let startPage = 0;
    if (!chapterId) {
        const progress = await getProgress(targetManga.id);
        if (progress) {
            chapterId = progress.chapterId;
            startPage = progress.pageIndex;
        }
    }

    setInitialChapter(chapterId);
    setInitialPage(startPage);
    setScreen('reader');
    window.history.pushState({ screen: 'reader', mangaId: targetManga.id }, '');
  };

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (screen === 'reader') {
         handleExitReader(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [screen]);

  const handleExitReader = (shouldGoBack = true) => {
     if (activeManga) {
        const updated = { ...activeManga, lastReadAt: Date.now() };
        // Sync last read time
        updateMetadata(updated.id, { lastReadAt: updated.lastReadAt });
        setMangas(prev => prev.map(m => m.id === activeManga.id ? updated : m));
    }
    setScreen('library');
    setInitialChapter(undefined);
    setInitialPage(0);
    setActiveManga(null);
    if (shouldGoBack) window.history.back();
  };

  const handleReadComplete = (mangaId: string) => {
      setMangas(prev => prev.map(m => {
          if (m.id === mangaId) {
              const updated = { ...m, readCount: (m.readCount || 0) + 1, lastReadAt: Date.now() };
              // Call API to persist
              updateMetadata(m.id, { readCount: updated.readCount, lastReadAt: updated.lastReadAt });
              return updated;
          }
          return m;
      }));
  };

  const handleUpdateManga = (updated: Manga) => {
    // Only used for Pinning essentially now
    setMangas(prev => prev.map(m => m.id === updated.id ? updated : m));
    updateMetadata(updated.id, { isPinned: updated.isPinned });
  };

  const handleDeleteManga = async (id: string) => {
      const manga = mangas.find(m => m.id === id);
      if (manga?.isServer && manga.sourceId) {
           try {
               await fetch('http://localhost:8000/delete_manga', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ manga_name: manga.sourceId })
               });
           } catch (e) {
               console.error("Failed to delete from server", e);
               alert("服务器文件删除失败，仅移除本地记录。");
           }
      }
      setMangas(prev => prev.filter(m => m.id !== id));
  };

  const handleRenameManga = (id: string, newName: string) => {
      // Renaming only supported locally in memory for now as server relies on folder names
      if (!newName.trim()) return;
      setMangas(prev => prev.map(m => m.id === id ? { ...m, title: newName.trim() } : m));
  };

  const handleToggleRead = (id: string) => {
      setMangas(prev => prev.map(m => {
          if (m.id === id) {
              const newVal = m.lastReadAt > 0 ? 0 : Date.now();
              const updated = { ...m, lastReadAt: newVal };
              updateMetadata(m.id, { lastReadAt: newVal });
              return updated;
          }
          return m;
      }));
  };

  const displayMangas = mangas.filter(m => 
      m.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isPanic) {
    return (
      <div className="w-full h-screen bg-white flex flex-col items-center justify-center text-center p-4 font-sans text-slate-800">
          <h1 className="text-6xl font-bold mb-4 select-none" onClick={(e) => { if (e.detail === 3) { localStorage.setItem('manga_nexus_panic', 'false'); window.location.reload(); }}}>404</h1>
          <h2 className="text-2xl font-medium mb-2">Not Found</h2>
          <p className="text-slate-500">The requested resource could not be found on this server.</p>
          <hr className="w-64 my-8 border-slate-200" />
          <p className="text-xs text-slate-400">nginx/1.18.0 (Ubuntu)</p>
      </div>
    );
  }

  return (
    <div 
        className="relative w-full h-screen bg-slate-50 flex overflow-hidden font-sans selection:bg-sky-200 selection:text-sky-900 transition-colors duration-500"
        onContextMenu={(e) => e.preventDefault()}
    >
      {screen !== 'reader' && <TitleBar />}

      {(serverLoading || detailLoading) && (
          <div className="fixed inset-0 z-[100] bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center">
               <div className="w-16 h-16 border-4 border-sky-100 border-t-sky-500 rounded-full animate-spin mb-4"></div>
               <p className="font-bold text-slate-600">
                   {detailLoading ? '正在加载章节详情...' : '正在连接服务器...'}
               </p>
          </div>
      )}

      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-[20%] -right-[10%] w-[60%] h-[60%] bg-sky-100/30 rounded-full blur-[100px] animate-float"></div>
          <div className="absolute bottom-[10%] left-[5%] w-[40%] h-[40%] bg-white/40 rounded-full blur-[100px] animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      {screen === 'library' && (
        <>
            <aside className={`fixed inset-y-0 left-0 h-full bg-white/60 backdrop-blur-2xl border-r border-white/40 z-40 flex flex-col transition-transform duration-500 cubic-bezier(0.32,0.72,0,1) w-72 shadow-[20px_0_40px_-20px_rgba(0,0,0,0.05)] pt-6 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="h-28 flex flex-col justify-center px-8 select-none">
                    <span className="text-2xl font-black bg-gradient-to-br from-slate-800 to-slate-500 bg-clip-text text-transparent tracking-tighter">Minecomic</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">本地漫画管理</span>
                </div>
                <div className="px-6 space-y-8 flex-1 overflow-y-auto no-scrollbar py-2">
                    <div className="relative group">
                        <Search className="absolute left-4 top-3 w-4 h-4 text-slate-400 group-focus-within:text-sky-500 transition-colors" />
                        <input type="text" placeholder="搜索漫画..." className="w-full bg-white/50 border border-slate-100/50 text-slate-700 text-sm rounded-2xl py-2.5 pl-11 pr-4 outline-none focus:ring-2 focus:ring-sky-200 focus:bg-white transition-all shadow-sm placeholder:text-slate-400/80" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <div className="px-2 text-[10px] font-bold text-slate-400/80 uppercase tracking-widest mb-3">书架</div>
                        <button className="relative w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-sky-900 bg-sky-50/80 rounded-2xl transition-all hover:bg-sky-100 group overflow-hidden shadow-sm">
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-sky-500 rounded-r-full"></div>
                            <LayoutGrid className="w-4 h-4 text-sky-600" />
                            <span>我的收藏</span>
                            <span className="ml-auto text-[10px] font-bold bg-white/60 text-sky-600 px-2 py-0.5 rounded-full">{mangas.length}</span>
                        </button>
                         <button onClick={handleFetchServerLibrary} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50 rounded-2xl transition-all group">
                            <Server className="w-4 h-4 group-hover:text-indigo-500 transition-colors" />
                            <span>刷新服务器库</span>
                        </button>
                    </div>
                    <div className="space-y-2">
                        <div className="px-2 text-[10px] font-bold text-slate-400/80 uppercase tracking-widest mb-3">管理</div>
                        {/* Importer Button Removed */}
                         <button onClick={() => setShowDownloaderModal(true)} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-pink-500 hover:text-pink-700 hover:bg-pink-50/50 rounded-2xl transition-all group">
                            <Download className="w-4 h-4 group-hover:text-pink-600 transition-colors" />
                            JMComic 下载
                        </button>
                    </div>
                </div>
                <div className="p-6 space-y-2">
                    <button onClick={() => setShowSettingsModal(true)} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-white/60 rounded-2xl transition-all">
                        <SettingsIcon className="w-4 h-4" />
                        设置
                    </button>
                    <button onClick={handleTriggerPanicClick} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-400 hover:text-red-500 hover:bg-red-50/50 rounded-2xl transition-all group">
                        <ShieldAlert className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        安全模式
                    </button>
                    <button onClick={() => setIsSidebarOpen(false)} className="w-full flex items-center justify-center mt-2 p-2 text-slate-300 hover:text-sky-500 transition-colors">
                         <ChevronLeft className="w-5 h-5" />
                    </button>
                </div>
            </aside>
            <div className={`fixed bottom-8 left-8 z-50 transition-all duration-500 cubic-bezier(0.32,0.72,0,1) ${isSidebarOpen ? 'opacity-0 translate-x-[-40px] pointer-events-none' : 'opacity-100 translate-x-0'}`}>
                <button onClick={() => setIsSidebarOpen(true)} className="p-4 bg-white/70 backdrop-blur-xl border border-white/50 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] text-slate-600 hover:text-sky-600 transition-all hover:scale-110 hover:shadow-sky-100 active:scale-95 group">
                    <Menu className="w-6 h-6" />
                </button>
            </div>
            <main className={`flex-1 h-full relative z-10 overflow-hidden flex flex-col transition-all duration-500 cubic-bezier(0.32,0.72,0,1) ${isSidebarOpen ? 'pl-72' : 'pl-0'}`}>
                <div className="flex-1 h-full overflow-hidden animate-fade-in pt-8">
                    <Library 
                        mangas={displayMangas} 
                        onOpenManga={handleOpenMangaDetail}
                        onOpenImport={() => {}}
                        onUpdateManga={handleUpdateManga}
                        onDeleteManga={handleDeleteManga}
                        onRenameManga={handleRenameManga}
                        onToggleRead={handleToggleRead}
                    />
                </div>
            </main>
        </>
      )}

      {screen === 'reader' && activeManga && (
        <div className="animate-fade-in h-full">
            <Reader 
                manga={activeManga} 
                initialChapterId={initialChapter}
                initialPageIndex={initialPage}
                onExit={() => handleExitReader(true)}
                enableScrollTurn={settings.enableScrollTurn}
                backgroundColor={settings.readerBackgroundColor}
                onReadComplete={() => handleReadComplete(activeManga.id)}
                longPressDuration={settings.longPressDuration}
                toggleMenuKey={settings.toggleMenuKey}
            />
        </div>
      )}

      <Downloader 
          isOpen={showDownloaderModal} 
          onClose={() => setShowDownloaderModal(false)} 
          onRefreshLibrary={handleFetchServerLibrary} // Pass refresh callback
      />
      <MangaDetail manga={selectedMangaForDetail} isOpen={!!selectedMangaForDetail} onClose={() => setSelectedMangaForDetail(null)} onStartReading={handleStartReading} />
      <SettingsModal 
          isOpen={showSettingsModal} 
          onClose={() => setShowSettingsModal(false)} 
          settings={settings} 
          onUpdateSettings={setSettings} 
          onSyncLibrary={handleFetchServerLibrary}
      />
    </div>
  );
};

export default App;