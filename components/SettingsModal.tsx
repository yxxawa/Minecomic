import React, { useState, useEffect } from 'react';
import { X, Settings, MousePointer2, Palette, ShieldAlert, Keyboard, Check, PaintBucket, Timer, MenuSquare } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdateSettings }) => {
  const [listeningTarget, setListeningTarget] = useState<'panicKey' | 'toggleMenuKey' | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
        setShouldRender(true);
        setIsClosing(false);
    }
  }, [isOpen]);

  const handleClose = () => {
      setIsClosing(true);
      setTimeout(() => {
          setShouldRender(false);
          onClose();
      }, 300);
  };

  // Key Listener for binding
  useEffect(() => {
    if (!listeningTarget) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Ignore modifier keys alone
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      onUpdateSettings({ ...settings, [listeningTarget]: e.key });
      setListeningTarget(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listeningTarget, settings, onUpdateSettings]);

  if (!shouldRender && !isOpen) return null;

  const toggleScrollTurn = () => {
    onUpdateSettings({ ...settings, enableScrollTurn: !settings.enableScrollTurn });
  };

  const themes = [
    { id: 'fresh', name: '清爽', color: '#66CCCC', bg: '#F0F9FF', desc: '柔和、洁净、爽朗' },
    { id: 'gentle', name: '柔和', color: '#FF9966', bg: '#FFFFCC', desc: '明亮、温和、暖阳' },
    { id: 'playful', name: '可爱', color: '#FF6666', bg: '#FFF0F5', desc: '快乐、有趣、活力' },
  ];

  const readerColors = [
      { id: '#000000', name: '纯黑' },
      { id: '#0f172a', name: '深蓝' }, // Slate 900
      { id: '#334155', name: '灰色' }, // Slate 700
      { id: '#ffffff', name: '白色' },
  ];

  return (
    <div 
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100 animate-fade-in'}`}
        onClick={handleClose}
    >
      <div 
        className={`bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-white/20 transition-all duration-300 transform ${isClosing ? 'scale-95 translate-y-4 opacity-0' : 'scale-100 translate-y-0 opacity-100 animate-slide-up'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-white">
          <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-3">
             <div className="bg-slate-100 p-2 rounded-xl text-slate-600">
                <Settings className="w-6 h-6" />
             </div>
            系统设置
          </h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-50 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          
           {/* Theme Section */}
          <div>
             <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ml-1 flex items-center gap-2">
               <Palette className="w-3 h-3" /> 主题外观
             </h4>
             <div className="grid grid-cols-1 gap-3">
                {themes.map(t => (
                  <button
                    key={t.id}
                    onClick={() => onUpdateSettings({ ...settings, theme: t.id as any })}
                    className={`relative flex items-center gap-4 p-3 rounded-2xl border-2 transition-all duration-300 text-left group overflow-hidden ${settings.theme === t.id ? 'border-sky-400 bg-sky-50/50 shadow-md' : 'border-slate-100 bg-white hover:border-sky-200'}`}
                  >
                    <div 
                      className="w-12 h-12 rounded-xl shadow-inner flex-shrink-0 border border-black/5"
                      style={{ backgroundColor: t.bg }}
                    >
                       <div className="w-full h-1/2 rounded-t-xl" style={{ backgroundColor: t.color }}></div>
                    </div>
                    
                    <div className="flex-1 z-10">
                      <p className={`font-bold text-sm ${settings.theme === t.id ? 'text-sky-700' : 'text-slate-700'}`}>{t.name}</p>
                      <p className="text-xs text-slate-400 font-medium">{t.desc}</p>
                    </div>

                    {settings.theme === t.id && (
                      <div className="bg-sky-500 rounded-full p-1 text-white shadow-sm">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                ))}
             </div>
          </div>

          {/* Reader Settings Section */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ml-1">阅读器偏好</h4>
            
            <div className="space-y-3">
                {/* Scroll Turn */}
                <div className="flex items-center justify-between bg-slate-50/50 p-4 rounded-2xl border border-slate-100 hover:border-sky-100 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-sky-500">
                      <MousePointer2 className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">滚轮翻页</p>
                      <p className="text-xs font-medium text-slate-400 mt-0.5">鼠标滚轮切换页面</p>
                    </div>
                  </div>
                  <button 
                    onClick={toggleScrollTurn}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 ${settings.enableScrollTurn ? 'bg-sky-500' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${settings.enableScrollTurn ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Long Press Duration */}
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 hover:border-sky-100 transition-colors">
                     <div className="flex items-center gap-4 mb-3">
                         <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-sky-500">
                             <Timer className="w-5 h-5" />
                         </div>
                         <div>
                             <p className="text-sm font-bold text-slate-700">长按拖动延时</p>
                             <p className="text-xs font-medium text-slate-400 mt-0.5">放大后按住多久触发拖动 ({settings.longPressDuration ?? 200}ms)</p>
                         </div>
                     </div>
                     <input 
                        type="range" 
                        min="0" 
                        max="200" 
                        step="10" 
                        value={settings.longPressDuration ?? 200} 
                        onChange={(e) => onUpdateSettings({ ...settings, longPressDuration: parseInt(e.target.value) })}
                        className="w-full accent-sky-500 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                     />
                     <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-bold px-1">
                         <span>即时 (0ms)</span>
                         <span>默认 (200ms)</span>
                     </div>
                </div>

                {/* Reader Background */}
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 hover:border-sky-100 transition-colors">
                     <div className="flex items-center gap-4 mb-3">
                         <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-sky-500">
                             <PaintBucket className="w-5 h-5" />
                         </div>
                         <div>
                             <p className="text-sm font-bold text-slate-700">阅读背景</p>
                             <p className="text-xs font-medium text-slate-400 mt-0.5">设置阅读时的背景填充色</p>
                         </div>
                     </div>
                     <div className="flex gap-2">
                         {readerColors.map(c => (
                             <button
                                key={c.id}
                                onClick={() => onUpdateSettings({ ...settings, readerBackgroundColor: c.id })}
                                className={`flex-1 h-10 rounded-lg border-2 transition-all flex items-center justify-center shadow-sm ${settings.readerBackgroundColor === c.id ? 'border-sky-500 ring-2 ring-sky-200' : 'border-slate-200 hover:border-slate-300'}`}
                                style={{ backgroundColor: c.id }}
                                title={c.name}
                             >
                                 {settings.readerBackgroundColor === c.id && (
                                     <Check className={`w-4 h-4 ${c.id === '#ffffff' ? 'text-black' : 'text-white'}`} />
                                 )}
                             </button>
                         ))}
                     </div>
                </div>
            </div>
          </div>

          {/* Shortcuts & Security Section */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ml-1">快捷键与安全</h4>
            
             <div className="space-y-3">
                {/* Menu Toggle Key */}
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-sky-500">
                            <MenuSquare className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-700">菜单开关快捷键</p>
                            <p className="text-xs text-slate-400 mt-0.5">阅读时开启/关闭菜单</p>
                        </div>
                    </div>
                    
                    <button
                        onClick={() => setListeningTarget('toggleMenuKey')}
                        className={`relative px-4 py-2 rounded-lg text-xs font-bold border transition-all ${listeningTarget === 'toggleMenuKey' ? 'bg-sky-500 text-white border-sky-600 animate-pulse' : 'bg-white text-slate-600 border-slate-200 hover:border-sky-200 hover:text-sky-500'}`}
                    >
                        {listeningTarget === 'toggleMenuKey' ? '请按键...' : (
                            <span className="flex items-center gap-2">
                                <Keyboard className="w-3 h-3" />
                                {settings.toggleMenuKey ? settings.toggleMenuKey.toUpperCase() : 'M'}
                            </span>
                        )}
                    </button>
                </div>

                {/* Panic Key */}
                <div className="bg-red-50/50 p-4 rounded-2xl border border-red-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-red-100 flex items-center justify-center text-red-500">
                            <ShieldAlert className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-700">安全键快捷设置</p>
                            <p className="text-xs text-slate-400 mt-0.5">紧急情况下按下触发伪装</p>
                        </div>
                    </div>
                    
                    <button
                        onClick={() => setListeningTarget('panicKey')}
                        className={`relative px-4 py-2 rounded-lg text-xs font-bold border transition-all ${listeningTarget === 'panicKey' ? 'bg-red-500 text-white border-red-600 animate-pulse' : 'bg-white text-slate-600 border-slate-200 hover:border-red-200 hover:text-red-500'}`}
                    >
                        {listeningTarget === 'panicKey' ? '请按键...' : (
                            <span className="flex items-center gap-2">
                                <Keyboard className="w-3 h-3" />
                                {settings.panicKey.toUpperCase()}
                            </span>
                        )}
                    </button>
                </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};