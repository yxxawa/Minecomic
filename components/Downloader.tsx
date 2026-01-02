import React, { useState, useEffect, useRef } from 'react';
import { Download, Server, X, Terminal, Search, List, CheckSquare, Square, Loader2, Play, Settings as SettingsIcon } from 'lucide-react';
import { Button } from './Button';

interface DownloaderProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshLibrary?: () => void;
}

interface SearchResult {
    id: string;
    title: string;
    author: string;
    category: string;
}

interface DownloadSettings {
    suffix: string;
    thread_count: number;
}

export const Downloader: React.FC<DownloaderProps> = ({ isOpen, onClose, onRefreshLibrary }) => {
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [activeTab, setActiveTab] = useState<'search' | 'ids' | 'settings'>('search');
  
  // Animation State
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Logs
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const lastProcessedLogRef = useRef<string>("");
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false); // Track if a search has happened
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ID Batch State
  const [rawIds, setRawIds] = useState('');

  // Settings State
  const [settings, setSettings] = useState<DownloadSettings>(() => {
      const saved = localStorage.getItem('manga_nexus_dl_settings');
      const defaults = { suffix: '.jpg', thread_count: 3 };
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });

  // General Loading State (for download requests)
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  useEffect(() => {
      localStorage.setItem('manga_nexus_dl_settings', JSON.stringify(settings));
  }, [settings]);

  // Handle Open/Close Animation Lifecycle
  useEffect(() => {
    if (isOpen) {
        setShouldRender(true);
        setIsClosing(false);
    } 
  }, [isOpen]);

  // Poll for logs and check server status
  useEffect(() => {
    if (!isOpen) return;

    // Check health immediately
    checkServer();

    // Poll logs every 2 seconds
    const interval = setInterval(() => {
        fetchLogs();
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen]);

  const handleClose = () => {
      setIsClosing(true);
      setTimeout(() => {
          setShouldRender(false);
          onClose();
      }, 300); // Match animation duration
  };

  const fetchLogs = async () => {
      try {
          const res = await fetch('http://localhost:8000/logs');
          if (res.ok) {
              const data = await res.json();
              if (data.logs && data.logs.length > 0) {
                  setLogs(data.logs);
                  
                  // Check for completion signal
                  const latestLog = data.logs[0];
                  if (latestLog !== lastProcessedLogRef.current && latestLog.includes("[BATCH_DONE]")) {
                      lastProcessedLogRef.current = latestLog;
                      // Trigger refresh
                      if (onRefreshLibrary) {
                          onRefreshLibrary();
                      }
                  }
              }
              setServerStatus('online');
          }
      } catch (e) {
          // Silent fail on log poll to avoid spam, but update status if needed
      }
  };

  const checkServer = async () => {
    setServerStatus('checking');
    try {
      const res = await fetch('http://localhost:8000/health');
      if (res.ok) {
        setServerStatus('online');
      } else {
        setServerStatus('offline');
      }
    } catch (e) {
      setServerStatus('offline');
    }
  };

  const handleSearch = async () => {
      if (!searchQuery.trim() || serverStatus !== 'online') return;
      setIsSearching(true);
      setHasSearched(true);
      setSearchResults([]);
      setSelectedIds(new Set());
      // Log added locally for immediate feedback, server will sync later
      setLogs(prev => [`[本地] 正在搜索: ${searchQuery}...`, ...prev]);

      try {
          const res = await fetch(`http://localhost:8000/search?q=${encodeURIComponent(searchQuery)}`);
          const data = await res.json();
          if (res.ok) {
              setSearchResults(data.results || []);
              setLogs(prev => [`[本地] 搜索完成，找到 ${data.total} 个结果。`, ...prev]);
          } else {
              setLogs(prev => [`[本地] 搜索失败: ${data.detail}`, ...prev]);
          }
      } catch (e) {
           setLogs(prev => [`[本地] 搜索错误: ${(e as Error).message}`, ...prev]);
      } finally {
          setIsSearching(false);
      }
  };

  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedIds(newSet);
  };

  const selectAll = () => {
      if (selectedIds.size === searchResults.length) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(searchResults.map(r => r.id)));
      }
  };

  const handleBatchDownload = async (idsToDownload: string[]) => {
      if (idsToDownload.length === 0) return;
      if (serverStatus !== 'online') {
          alert('错误：后端服务未连接');
          return;
      }

      setIsSendingRequest(true);
      
      try {
          const res = await fetch('http://localhost:8000/download_batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  album_ids: idsToDownload,
                  config: settings
              })
          });
          const data = await res.json();
          if (res.ok) {
              // Trigger log fetch immediately
              fetchLogs();
              if (activeTab === 'search') setSelectedIds(new Set());
              if (activeTab === 'ids') setRawIds('');
          } else {
              setLogs(prev => [`[错误] 请求失败: ${data.detail}`, ...prev]);
          }
      } catch (e) {
          setLogs(prev => [`[错误] 网络错误: ${(e as Error).message}`, ...prev]);
      } finally {
          setIsSendingRequest(false);
      }
  };

  const handleSearchTabDownload = () => {
      handleBatchDownload(Array.from(selectedIds));
  };

  const handleIdTabDownload = () => {
      // Split by newline, comma, space
      const ids = rawIds.split(/[\n, \t]+/).map(s => s.trim()).filter(s => s.length > 0);
      if (ids.length === 0) {
          alert('请输入有效的 ID');
          return;
      }
      handleBatchDownload(ids);
  };

  if (!shouldRender && !isOpen) return null;

  return (
    <div 
        className={`fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100 animate-fade-in'}`}
        onClick={handleClose}
    >
      <div 
        className={`bg-white w-full max-w-2xl h-[80vh] rounded-3xl shadow-2xl overflow-hidden ring-1 ring-white/20 flex flex-col transition-all duration-300 transform ${isClosing ? 'scale-95 translate-y-4 opacity-0' : 'scale-100 translate-y-0 opacity-100 animate-slide-up'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white flex-shrink-0">
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2.5">
             <div className="bg-pink-50 p-2 rounded-xl text-pink-500">
                <Download className="w-5 h-5" />
             </div>
             JMComic 下载中心
          </h3>
          <div className="flex items-center gap-4">
               {/* Status Badge */}
               <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${serverStatus === 'online' ? 'bg-green-50 border-green-200 text-green-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                    <Server className="w-3 h-3" />
                    {serverStatus === 'online' ? '后端在线' : '离线'}
               </div>
               <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-50 rounded-full transition-colors">
                 <X className="w-5 h-5" />
               </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
            <button 
                onClick={() => setActiveTab('search')}
                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors border-b-2 ${activeTab === 'search' ? 'border-pink-500 text-pink-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                <Search className="w-4 h-4" />
                搜索下载
            </button>
            <button 
                onClick={() => setActiveTab('ids')}
                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors border-b-2 ${activeTab === 'ids' ? 'border-pink-500 text-pink-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                <List className="w-4 h-4" />
                ID 批量下载
            </button>
             <button 
                onClick={() => setActiveTab('settings')}
                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors border-b-2 ${activeTab === 'settings' ? 'border-pink-500 text-pink-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                <SettingsIcon className="w-4 h-4" />
                下载设置
            </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/30">
            
            {activeTab === 'search' && (
                <div className="flex flex-col h-full">
                    {/* Search Bar */}
                    <div className="p-4 bg-white border-b border-slate-100 flex gap-2 shadow-sm z-10">
                        <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="输入漫画关键词 (需要后端配置好 Cookies)..."
                            className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition-all"
                        />
                        <Button 
                            onClick={handleSearch} 
                            disabled={isSearching || serverStatus !== 'online'}
                            className="bg-pink-500 hover:bg-pink-600 text-white shadow-pink-200"
                        >
                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4" />}
                        </Button>
                    </div>
                    
                    {/* Results List */}
                    <div className="flex-1 overflow-y-auto p-2 custom-scrollbar relative">
                        {isSearching ? (
                             <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-white/50 backdrop-blur-sm z-20">
                                <Loader2 className="w-10 h-10 animate-spin text-pink-400 mb-3" />
                                <p className="text-sm font-bold animate-pulse">正在搜索 JMComic...</p>
                             </div>
                        ) : searchResults.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                                <Search className="w-8 h-8 opacity-20" />
                                <p className="text-xs">{hasSearched ? "暂无搜索结果" : "请输入关键词开始搜索"}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {searchResults.map((item) => (
                                    <div 
                                        key={item.id} 
                                        onClick={() => toggleSelection(item.id)}
                                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedIds.has(item.id) ? 'bg-pink-50 border-pink-200 shadow-sm' : 'bg-white border-slate-100 hover:border-pink-100'}`}
                                    >
                                        <div className={`mt-1 ${selectedIds.has(item.id) ? 'text-pink-500' : 'text-slate-300'}`}>
                                            {selectedIds.has(item.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-bold text-slate-800 line-clamp-1">{item.title}</h4>
                                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-mono">ID: {item.id}</span>
                                                {item.author && <span className="truncate">作者: {item.author}</span>}
                                                {item.category && <span className="truncate opacity-75">| {item.category}</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Bottom Action Bar */}
                    {searchResults.length > 0 && (
                        <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between">
                            <button onClick={selectAll} className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2">
                                {selectedIds.size === searchResults.length ? '取消全选' : '全选'}
                            </button>
                            <Button 
                                onClick={handleSearchTabDownload}
                                disabled={selectedIds.size === 0 || isSendingRequest}
                                className="bg-pink-500 hover:bg-pink-600 text-white text-xs px-6 py-2"
                            >
                                {isSendingRequest ? '请求中...' : `下载选中 (${selectedIds.size})`}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'ids' && (
                <div className="flex flex-col h-full p-6">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        批量 ID 输入 (每行一个 或 逗号分隔)
                    </label>
                    <p className="text-[10px] text-slate-400 mb-2">
                        提示: 输入数字 ID 下载整本漫画，或输入 <span className="font-mono bg-slate-100 px-1 rounded text-pink-500">p</span> 开头的 ID (如 p12345) 下载特定章节。
                    </p>
                    <textarea 
                        value={rawIds}
                        onChange={(e) => setRawIds(e.target.value)}
                        placeholder={"422866\np123456\n123, 456"}
                        className="flex-1 w-full bg-white border border-slate-200 rounded-xl p-4 text-sm font-mono text-slate-700 outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300 resize-none mb-4 custom-scrollbar"
                    />
                    <div className="flex justify-end">
                        <Button 
                            onClick={handleIdTabDownload}
                            disabled={!rawIds.trim() || isSendingRequest || serverStatus !== 'online'}
                            className="bg-pink-500 hover:bg-pink-600 text-white w-full sm:w-auto"
                            icon={isSendingRequest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        >
                            {isSendingRequest ? '正在发送任务...' : '开始批量下载'}
                        </Button>
                    </div>
                </div>
            )}

             {activeTab === 'settings' && (
                <div className="flex flex-col h-full p-8 overflow-y-auto">
                    <h4 className="text-sm font-bold text-slate-700 mb-6">下载参数配置</h4>
                    
                    <div className="space-y-6">

                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                                图片保存格式
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                {['.jpg', '.png', '.webp', 'original'].map((fmt) => (
                                    <button
                                        key={fmt}
                                        onClick={() => setSettings(s => ({ ...s, suffix: fmt === 'original' ? '' : fmt }))}
                                        className={`py-2 px-3 rounded-lg text-sm font-bold border transition-all ${
                                            (settings.suffix === fmt) || (fmt === 'original' && settings.suffix === '') 
                                            ? 'bg-pink-50 border-pink-200 text-pink-600' 
                                            : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100'
                                        }`}
                                    >
                                        {fmt === 'original' ? '原图 (不转换)' : fmt}
                                    </button>
                                ))}
                            </div>
                        </div>

                         <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                                并发下载线程数: {settings.thread_count}
                            </label>
                            <input 
                                type="range" 
                                min="1" 
                                max="8" 
                                step="1" 
                                value={settings.thread_count}
                                onChange={(e) => setSettings(s => ({ ...s, thread_count: parseInt(e.target.value) }))}
                                className="w-full accent-pink-500 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-[10px] text-slate-400 mt-2">
                                <span>1 (稳定)</span>
                                <span>8 (极速)</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 p-4 bg-slate-100 rounded-xl text-xs text-slate-500 leading-relaxed">
                        <p className="font-bold mb-1">说明:</p>
                        <p>设置会自动保存在本地。更高的并发数可能会导致 IP 被临时限制。</p>
                        <p>已移除评论下载功能。</p>
                    </div>
                </div>
            )}

        </div>

        {/* Terminal / Logs (Collapsible or Small) */}
        <div className="bg-slate-900 flex-shrink-0 p-3 h-32 overflow-hidden flex flex-col border-t border-slate-800">
             <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">
                <div className="flex items-center gap-2">
                    <Terminal className="w-3 h-3" />
                    <span>Server Logs</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    <span>Live</span>
                </div>
             </div>
             <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-[10px] text-slate-300 space-y-1">
                 {logs.length === 0 ? (
                    <span className="text-slate-600 italic">...</span>
                 ) : (
                    logs.map((log, i) => (
                        <div key={i} className="break-all border-b border-slate-800/50 pb-0.5">
                            <span className="text-slate-500 mr-2">{'>'}</span>{log}
                        </div>
                    ))
                 )}
                 <div ref={logsEndRef} />
             </div>
        </div>

      </div>
    </div>
  );
};