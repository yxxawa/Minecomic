import React, { useState, useEffect, useRef } from 'react';
import { Download, Server, X, Search, List, CheckSquare, Square, Loader2, Play, Settings as SettingsIcon, ChevronUp, ChevronDown, Activity, Trash2, Plus, ListChecks, Bell } from 'lucide-react';
import { Button } from './Button';
import { AppSettings } from '../types';

interface DownloaderProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshLibrary?: () => void;
  appSettings: AppSettings;
  onUpdateAppSettings: (newSettings: AppSettings) => void;
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

interface QueueItem {
    id: string;
    title: string;
    status: 'pending' | 'downloading';
}

export const Downloader: React.FC<DownloaderProps> = ({ isOpen, onClose, onRefreshLibrary, appSettings, onUpdateAppSettings }) => {
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [activeTab, setActiveTab] = useState<'search' | 'list' | 'ids' | 'settings'>('search');
  
  // Animation State - Explicit visibility control
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Logs
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const lastProcessedLogRef = useRef<string>("");
  const [isLogExpanded, setIsLogExpanded] = useState(false); 
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false); 
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Download Queue State
  const [downloadQueue, setDownloadQueue] = useState<QueueItem[]>([]);

  // ID Batch State
  const [rawIds, setRawIds] = useState('');

  // Settings State - Default until loaded
  const [settings, setSettings] = useState<DownloadSettings>({ suffix: '.jpg', thread_count: 3 });

  // General Loading State (for download requests)
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // Load Settings from API on Mount
  useEffect(() => {
    fetch('http://localhost:8000/settings')
        .then(res => res.json())
        .then(data => {
            if (data.download) {
                setSettings(data.download);
            }
        })
        .catch(err => console.error("Failed to load download settings", err));
  }, []);

  // Save Settings to API on Change (Debounced ideally, but direct for now)
  const handleUpdateSettings = (newSettings: DownloadSettings) => {
      setSettings(newSettings);
      fetch('http://localhost:8000/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ download: newSettings })
      }).catch(console.error);
  };

  // Handle Open/Close Animation Lifecycle
  useEffect(() => {
    if (isOpen) {
        setShouldRender(true);
        // Use setTimeout to ensure the initial render (opacity-0) happens before switching to opacity-100
        const timer = setTimeout(() => setIsVisible(true), 50);
        return () => clearTimeout(timer);
    } else {
        setIsVisible(false);
        // Wait for transition duration (300ms) before unmounting
        const timer = setTimeout(() => setShouldRender(false), 300);
        return () => clearTimeout(timer);
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

  // The actual close trigger from UI
  const handleClose = () => {
      onClose(); // Parent sets isOpen = false, triggering the effect above
  };

  const fetchLogs = async () => {
      try {
          const res = await fetch('http://localhost:8000/logs');
          if (res.ok) {
              const data = await res.json();
              if (data.logs && data.logs.length > 0) {
                  setLogs(data.logs);
                  
                  // Parse logs to update queue status
                  updateQueueFromLogs(data.logs);

                  // Check for completion signal
                  const latestLog = data.logs[0];
                  if (latestLog !== lastProcessedLogRef.current && latestLog.includes("[BATCH_DONE]")) {
                      lastProcessedLogRef.current = latestLog;
                      if (onRefreshLibrary) {
                          onRefreshLibrary();
                      }
                  }
              }
              setServerStatus('online');
          }
      } catch (e) {
          // Silent fail
      }
  };

  const updateQueueFromLogs = (logs: string[]) => {
      setDownloadQueue(prevQueue => {
          let newQueue = [...prevQueue];
          let changed = false;

          for (const log of logs) {
              if (log.includes("开始处理 ID:")) {
                  const idMatch = log.match(/开始处理 ID: (\S+)/);
                  if (idMatch) {
                      const processingId = idMatch[1];
                      const idx = newQueue.findIndex(item => item.id === processingId);
                      if (idx !== -1 && newQueue[idx].status !== 'downloading') {
                          newQueue[idx] = { ...newQueue[idx], status: 'downloading' };
                          changed = true;
                      }
                  }
              }
              
              if (log.includes("图片下载完成") || log.includes("Failed")) {
                   const parts = log.split(' ');
                   if (parts.length >= 3) {
                       const finishedId = parts[2];
                       const idx = newQueue.findIndex(item => item.id === finishedId);
                       if (idx !== -1) {
                           newQueue.splice(idx, 1);
                           changed = true;
                       }
                   }
              }
          }
          return changed ? newQueue : prevQueue;
      });
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

  const handleAddSelectionToQueue = () => {
      const selectedItems = searchResults.filter(r => selectedIds.has(r.id));
      setDownloadQueue(prev => {
          const newItems = selectedItems
            .filter(item => !prev.some(p => p.id === item.id))
            .map(item => ({
              id: item.id,
              title: item.title,
              status: 'pending' as const
            }));
          return [...prev, ...newItems];
      });
      setSelectedIds(new Set());
      setLogs(prev => [`[本地] 已添加 ${selectedItems.length} 个项目到下载列表。`, ...prev]);
  };

  const handleRemoveFromQueue = (id: string) => {
      setDownloadQueue(prev => prev.filter(item => item.id !== id));
  };

  const handleStartQueueDownload = () => {
      const ids = downloadQueue.map(item => item.id);
      if (ids.length === 0) return;
      handleBatchDownload(ids);
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
      const ids = rawIds.split(/[\n, \t]+/).map(s => s.trim()).filter(s => s.length > 0);
      if (ids.length === 0) {
          alert('请输入有效的 ID');
          return;
      }
      handleBatchDownload(ids);
  };

  const formatLog = (log: string) => log;

  if (!shouldRender) return null;

  return (
    <div 
        className={`fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-opacity duration-300 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
    >
      <div 
        className={`bg-white w-full max-w-2xl h-[80vh] rounded-3xl shadow-2xl overflow-hidden ring-1 ring-white/20 flex flex-col relative transition-all duration-300 ease-in-out transform ${isVisible ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white flex-shrink-0 z-10">
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2.5">
             <div className="bg-sky-50 p-2 rounded-xl text-sky-500">
                <Download className="w-5 h-5" />
             </div>
             JMComic 下载中心
          </h3>
          <div className="flex items-center gap-4">
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
        <div className="flex border-b border-slate-100 bg-slate-50/50 flex-shrink-0 z-10">
            <button 
                onClick={() => setActiveTab('search')}
                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors border-b-2 ${activeTab === 'search' ? 'border-sky-500 text-sky-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                <Search className="w-4 h-4" />
                搜索
            </button>
            <button 
                onClick={() => setActiveTab('list')}
                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors border-b-2 ${activeTab === 'list' ? 'border-sky-500 text-sky-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                <ListChecks className="w-4 h-4" />
                列表 ({downloadQueue.length})
            </button>
            <button 
                onClick={() => setActiveTab('ids')}
                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors border-b-2 ${activeTab === 'ids' ? 'border-sky-500 text-sky-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                <List className="w-4 h-4" />
                ID 导入
            </button>
             <button 
                onClick={() => setActiveTab('settings')}
                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors border-b-2 ${activeTab === 'settings' ? 'border-sky-500 text-sky-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                <SettingsIcon className="w-4 h-4" />
                设置
            </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/30 pb-12 relative">
            
            {activeTab === 'search' && (
                <div className="flex flex-col h-full">
                    {/* Search Bar */}
                    <div className="p-4 bg-white border-b border-slate-100 flex gap-2 shadow-sm z-10">
                        <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="输入漫画关键词..."
                            className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
                        />
                        <Button 
                            onClick={handleSearch} 
                            disabled={isSearching || serverStatus !== 'online'}
                            className="bg-sky-500 hover:bg-sky-600 text-white shadow-sky-200"
                        >
                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4" />}
                        </Button>
                    </div>
                    
                    {/* Results List */}
                    <div className="flex-1 overflow-y-auto p-2 custom-scrollbar relative">
                        {isSearching ? (
                             <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-white/50 backdrop-blur-sm z-20">
                                <Loader2 className="w-10 h-10 animate-spin text-sky-400 mb-3" />
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
                                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedIds.has(item.id) ? 'bg-sky-50 border-sky-200 shadow-sm' : 'bg-white border-slate-100 hover:border-sky-100'}`}
                                    >
                                        <div className={`mt-1 ${selectedIds.has(item.id) ? 'text-sky-500' : 'text-slate-300'}`}>
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
                            <div className="flex gap-2">
                                <Button 
                                    onClick={handleAddSelectionToQueue}
                                    disabled={selectedIds.size === 0}
                                    variant="secondary"
                                    className="text-xs px-4 py-2"
                                    icon={<Plus className="w-3.5 h-3.5"/>}
                                >
                                    加入列表
                                </Button>
                                <Button 
                                    onClick={handleSearchTabDownload}
                                    disabled={selectedIds.size === 0 || isSendingRequest}
                                    className="bg-sky-500 hover:bg-sky-600 text-white text-xs px-6 py-2"
                                >
                                    {isSendingRequest ? '请求中...' : `下载选中 (${selectedIds.size})`}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* NEW QUEUE LIST TAB */}
            {activeTab === 'list' && (
                <div className="flex flex-col h-full">
                     <div className="p-4 bg-white border-b border-slate-100 shadow-sm z-10 flex justify-between items-center">
                         <span className="text-sm font-bold text-slate-600">待下载项目 ({downloadQueue.length})</span>
                         <Button 
                            onClick={handleStartQueueDownload}
                            disabled={downloadQueue.length === 0 || isSendingRequest || serverStatus !== 'online'}
                            className="bg-sky-500 hover:bg-sky-600 text-white text-xs px-4 py-2"
                            icon={isSendingRequest ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Play className="w-3.5 h-3.5"/>}
                        >
                            {isSendingRequest ? '请求中...' : '一键下载所有'}
                        </Button>
                     </div>

                     <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                         {downloadQueue.length === 0 ? (
                             <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                                 <ListChecks className="w-8 h-8 opacity-20" />
                                 <p className="text-xs">列表为空，请从搜索结果添加</p>
                             </div>
                         ) : (
                             <div className="space-y-2">
                                 {downloadQueue.map((item) => (
                                     <div key={item.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:border-sky-100 transition-colors">
                                         <div className="flex-1 min-w-0 pr-4">
                                             <h4 className="text-sm font-bold text-slate-800 line-clamp-1">{item.title}</h4>
                                             <div className="flex items-center gap-2 mt-1">
                                                 <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 rounded">ID: {item.id}</span>
                                                 {item.status === 'downloading' && (
                                                     <span className="text-[10px] font-bold text-green-500 flex items-center gap-1">
                                                         <Loader2 className="w-3 h-3 animate-spin" />
                                                         下载中
                                                     </span>
                                                 )}
                                                 {item.status === 'pending' && <span className="text-[10px] text-slate-400">等待中</span>}
                                             </div>
                                         </div>
                                         <button 
                                            onClick={() => handleRemoveFromQueue(item.id)}
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            title="移除"
                                         >
                                             <Trash2 className="w-4 h-4" />
                                         </button>
                                     </div>
                                 ))}
                             </div>
                         )}
                     </div>
                </div>
            )}

            {activeTab === 'ids' && (
                <div className="flex flex-col h-full p-6">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        批量 ID 输入 (每行一个 或 逗号分隔)
                    </label>
                    <p className="text-[10px] text-slate-400 mb-2">
                        提示: 输入数字 ID 下载整本漫画，或输入 <span className="font-mono bg-slate-100 px-1 rounded text-sky-500">p</span> 开头的 ID (如 p12345) 下载特定章节。
                    </p>
                    <textarea 
                        value={rawIds}
                        onChange={(e) => setRawIds(e.target.value)}
                        placeholder={"422866\np123456\n123, 456"}
                        className="flex-1 w-full bg-white border border-slate-200 rounded-xl p-4 text-sm font-mono text-slate-700 outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 resize-none mb-4 custom-scrollbar"
                    />
                    <div className="flex justify-end">
                        <Button 
                            onClick={handleIdTabDownload}
                            disabled={!rawIds.trim() || isSendingRequest || serverStatus !== 'online'}
                            className="bg-sky-500 hover:bg-sky-600 text-white w-full sm:w-auto"
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
                    
                    <div className="space-y-4">

                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                                图片保存格式
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                {['.jpg', '.png', '.webp', '.gif', 'original'].map((fmt) => (
                                    <button
                                        key={fmt}
                                        onClick={() => handleUpdateSettings({ ...settings, suffix: fmt === 'original' ? '' : fmt })}
                                        className={`py-2 px-3 rounded-lg text-sm font-bold border transition-all ${
                                            (settings.suffix === fmt) || (fmt === 'original' && settings.suffix === '') 
                                            ? 'bg-sky-50 border-sky-200 text-sky-600' 
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
                                onChange={(e) => handleUpdateSettings({ ...settings, thread_count: parseInt(e.target.value) })}
                                className="w-full accent-sky-500 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-[10px] text-slate-400 mt-2">
                                <span>1 (稳定)</span>
                                <span>8 (极速)</span>
                            </div>
                        </div>

                        {/* Moved Home Page Notification Toggle Here */}
                        <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-sky-200 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center text-sky-500">
                              <Bell className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-700">下载通知提示</p>
                              <p className="text-xs font-medium text-slate-400 mt-0.5">下载时在右下角显示提示框</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => onUpdateAppSettings({ ...appSettings, enableDownloadPopup: !appSettings.enableDownloadPopup })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 ${appSettings.enableDownloadPopup ? 'bg-sky-500' : 'bg-slate-200'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${appSettings.enableDownloadPopup ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                    </div>

                    <div className="mt-8 p-4 bg-slate-100 rounded-xl text-xs text-slate-500 leading-relaxed">
                        <p className="font-bold mb-1">说明:</p>
                        <p>设置会自动保存在本地。更高的并发数可能会导致 IP 被临时限制。</p>
                    </div>
                </div>
            )}

        </div>

        {/* Collapsible Activity/Log Panel - Redesigned */}
        <div 
            className={`absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] z-30 transition-all duration-300 ease-in-out flex flex-col ${isLogExpanded ? 'h-64' : 'h-10'}`}
        >
             {/* Header / Toggle Bar */}
             <div 
                className="h-10 flex items-center justify-between px-4 cursor-pointer hover:bg-slate-50 transition-colors group select-none"
                onClick={() => setIsLogExpanded(!isLogExpanded)}
             >
                <div className="flex items-center gap-3 overflow-hidden">
                     <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${isSendingRequest ? 'text-sky-500' : 'text-slate-400'}`}>
                         {isSendingRequest ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                         <span>Activity</span>
                     </div>
                     <div className="h-3 w-px bg-slate-200 mx-1"></div>
                     <div className="flex-1 truncate text-xs font-mono text-slate-500 group-hover:text-slate-700 transition-colors">
                         {logs.length > 0 ? formatLog(logs[0]) : "Ready"}
                     </div>
                </div>
                
                <div className="text-slate-400 group-hover:text-sky-500 transition-colors">
                    {isLogExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </div>
             </div>

             {/* Expanded Content */}
             <div className={`flex-1 overflow-hidden flex flex-col bg-slate-50/50 ${isLogExpanded ? 'opacity-100' : 'opacity-0'}`}>
                 <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                     {logs.length === 0 ? (
                        <div className="text-center text-slate-400 text-xs py-4">暂无活动日志</div>
                     ) : (
                        logs.map((log, i) => (
                            <div key={i} className="flex items-start gap-3 text-xs group/log">
                                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 group-hover/log:bg-sky-400 transition-colors flex-shrink-0"></div>
                                <span className={`font-mono break-all leading-relaxed ${log.includes("失败") || log.includes("Error") ? 'text-red-500' : log.includes("完成") || log.includes("✅") ? 'text-green-600' : 'text-slate-600'}`}>
                                    {formatLog(log)}
                                </span>
                            </div>
                        ))
                     )}
                     <div ref={logsEndRef} />
                 </div>
                 
                 {/* Footer Actions for Log */}
                 <div className="px-4 py-2 border-t border-slate-100 flex justify-between items-center bg-white">
                     <span className="text-[10px] text-slate-400 font-bold">{logs.length} 条记录</span>
                     <button 
                        onClick={(e) => { e.stopPropagation(); setLogs([]); }}
                        className="text-[10px] font-bold text-slate-400 hover:text-sky-500 transition-colors"
                     >
                         清空日志
                     </button>
                 </div>
             </div>
        </div>

      </div>
    </div>
  );
};