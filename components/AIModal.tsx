import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, MessageSquare, BrainCircuit, Send, Loader2, Info } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { Manga, AIAnalysisResult } from '../types';
import { Button } from './Button';

interface AIModalProps {
  isOpen: boolean;
  onClose: () => void;
  manga: Manga;
}

// Helper to convert blob URL to base64
const blobUrlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data:image/png;base64, prefix
      resolve(base64String.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const AIModal: React.FC<AIModalProps> = ({ isOpen, onClose, manga }) => {
  const [activeTab, setActiveTab] = useState<'analysis' | 'chat'>('analysis');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  
  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !analysis) {
        performAnalysis();
    }
    // Reset state when manga changes or opens fresh
    if (isOpen) {
        setMessages([{ role: 'model', text: `你好！我是你的 AI 漫画助手。关于《${manga.title}》，你想了解什么？` }]);
    }
  }, [isOpen, manga.id]);

  useEffect(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const performAnalysis = async () => {
    if (!process.env.API_KEY) {
        setAnalysis({
            summary: "未配置 API Key，无法使用 AI 功能。",
            genres: [],
            demographic: "未知",
            artStyle: "未知",
            rating: 0
        });
        return;
    }

    setLoading(true);
    try {
        const base64Image = await blobUrlToBase64(manga.coverUrl);
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Updated to gemini-3-flash-preview which supports JSON output schema with images
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: 'image/jpeg', 
                            data: base64Image
                        }
                    },
                    {
                        text: `Analyze this manga cover. The title is "${manga.title}". 
                        Provide a JSON response with the following fields:
                        - summary: A 2-sentence engaging summary of what this manga is likely about based on the cover and title (in Chinese).
                        - genres: Array of strings (3-4 genres, in Chinese).
                        - demographic: Target audience (e.g., Shonen, Seinen, Shoujo, etc., in Chinese).
                        - artStyle: A short phrase describing the art style (in Chinese).
                        - rating: An estimated rating out of 10 based on visual appeal and popularity context.`
                    }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        summary: { type: Type.STRING },
                        genres: { type: Type.ARRAY, items: { type: Type.STRING } },
                        demographic: { type: Type.STRING },
                        artStyle: { type: Type.STRING },
                        rating: { type: Type.NUMBER }
                    }
                }
            }
        });

        if (response.text) {
            setAnalysis(JSON.parse(response.text));
        }
    } catch (error) {
        console.error("Analysis failed:", error);
        setAnalysis({
            summary: "AI 分析失败，请检查网络或 API 设置。",
            genres: ["错误"],
            demographic: "未知",
            artStyle: "未知",
            rating: 0
        });
    } finally {
        setLoading(false);
    }
  };

  const handleSendMessage = async () => {
      if (!chatInput.trim() || !process.env.API_KEY) return;
      
      const userMsg = chatInput;
      setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
      setChatInput('');
      setChatLoading(true);

      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          
          // Construct chat history for context
          // Note: In a real app, we would use ai.chats.create() for persistent history
          // But here we just build a prompt chain for simplicity in this stateless component
          const historyText = messages.map(m => `${m.role === 'user' ? 'User' : 'Model'}: ${m.text}`).join('\n');
          
          const prompt = `Context: The user is reading a manga titled "${manga.title}".
          System: You are an expert manga assistant. Answer the user's question about this manga. 
          Be helpful, enthusiastic, and provide accurate lore or details if you know them. Answer in Chinese.
          
          History:
          ${historyText}
          
          User: ${userMsg}
          Model:`;

          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: prompt
          });

          if (response.text) {
              setMessages(prev => [...prev, { role: 'model', text: response.text }]);
          }
      } catch (error) {
          console.error(error);
          setMessages(prev => [...prev, { role: 'model', text: "抱歉，我现在无法回答，请稍后再试。" }]);
      } finally {
          setChatLoading(false);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-4xl h-[600px] rounded-3xl shadow-2xl overflow-hidden flex flex-col relative ring-1 ring-white/20 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-white/50 backdrop-blur-xl">
            <div className="flex items-center gap-2">
                <div className="bg-gradient-to-br from-violet-500 to-fuchsia-500 p-1.5 rounded-lg text-white">
                    <Sparkles className="w-5 h-5" />
                </div>
                <span className="font-extrabold text-slate-700">AI 智能分析</span>
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-2">Beta</span>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                    onClick={() => setActiveTab('analysis')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'analysis' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    深度分析
                </button>
                <button 
                    onClick={() => setActiveTab('chat')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'chat' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    助手对话
                </button>
            </div>

            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                <X className="w-5 h-5" />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative bg-slate-50/30">
            {activeTab === 'analysis' && (
                <div className="h-full flex gap-6 p-8 overflow-y-auto custom-scrollbar">
                    {/* Cover Preview */}
                    <div className="w-1/3 flex-shrink-0 hidden md:block">
                        <div className="relative aspect-[2/3] rounded-2xl overflow-hidden shadow-lg border border-slate-200 group">
                            <img src={manga.coverUrl} className="w-full h-full object-cover" alt="cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <div className="absolute bottom-4 left-4 text-white">
                                <p className="text-xs font-medium opacity-80">当前分析对象</p>
                                <p className="font-bold text-lg leading-tight line-clamp-2">{manga.title}</p>
                            </div>
                        </div>
                    </div>

                    {/* Analysis Results */}
                    <div className="flex-1 space-y-6">
                        {loading ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                                <p className="text-sm font-medium">Gemini 正在阅读漫画封面...</p>
                            </div>
                        ) : analysis ? (
                            <div className="space-y-6 animate-fade-in">
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                                    <div className="flex items-center gap-2 mb-3 text-violet-600 font-bold text-sm uppercase tracking-wider">
                                        <Info className="w-4 h-4" /> 剧情概要
                                    </div>
                                    <p className="text-slate-600 leading-relaxed text-sm">
                                        {analysis.summary}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                        <p className="text-xs text-slate-400 font-bold mb-1">受众群体</p>
                                        <p className="text-slate-700 font-bold">{analysis.demographic}</p>
                                    </div>
                                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                        <p className="text-xs text-slate-400 font-bold mb-1">画风评分</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl font-black text-violet-500">{analysis.rating}</span>
                                            <span className="text-xs text-slate-300">/ 10</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                                    <p className="text-xs text-slate-400 font-bold mb-3">风格标签</p>
                                    <div className="flex flex-wrap gap-2">
                                        {analysis.genres.map((g, i) => (
                                            <span key={i} className="px-3 py-1 bg-violet-50 text-violet-600 text-xs font-bold rounded-lg border border-violet-100">
                                                {g}
                                            </span>
                                        ))}
                                        <span className="px-3 py-1 bg-slate-50 text-slate-500 text-xs font-bold rounded-lg border border-slate-100">
                                            {analysis.artStyle}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                             <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <Button onClick={performAnalysis} icon={<Sparkles className="w-4 h-4"/>}>
                                    开始分析
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'chat' && (
                <div className="h-full flex flex-col">
                    {/* Chat Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                    msg.role === 'user' 
                                    ? 'bg-violet-500 text-white rounded-br-none shadow-md shadow-violet-200' 
                                    : 'bg-white border border-slate-100 text-slate-700 rounded-bl-none shadow-sm'
                                }`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {chatLoading && (
                             <div className="flex justify-start">
                                <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3 rounded-bl-none shadow-sm">
                                    <div className="flex gap-1">
                                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-100"></div>
                                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-200"></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef}></div>
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-white border-t border-slate-100">
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-2 py-2 focus-within:ring-2 focus-within:ring-violet-100 focus-within:border-violet-300 transition-all">
                             <div className="p-2 text-slate-400">
                                 <BrainCircuit className="w-5 h-5" />
                             </div>
                             <input 
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder="询问关于这本漫画的问题..."
                                className="flex-1 bg-transparent border-none outline-none text-sm text-slate-700 placeholder:text-slate-400"
                                disabled={chatLoading}
                             />
                             <button 
                                onClick={handleSendMessage}
                                disabled={!chatInput.trim() || chatLoading}
                                className="p-2 bg-violet-500 hover:bg-violet-600 disabled:bg-slate-300 text-white rounded-xl transition-colors shadow-sm"
                             >
                                 <Send className="w-4 h-4" />
                             </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
