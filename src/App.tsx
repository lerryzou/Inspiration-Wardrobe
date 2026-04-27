import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, Shirt, Wand2, Trash2, X, RefreshCw, UploadCloud, ChevronRight, MessageCircle, ChevronLeft, Download, Share, RotateCcw, ChevronDown, Heart, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { get, set } from 'idb-keyval';
import { Category, WardrobeItem, OutfitRecommendation, HistoryOutfit } from './types';
import { analyzeSingleClothingItem, generateOutfit, enhanceClothingImage, generateVirtualTryOn, processSingleItemImage, generateFaceSwap, detectFaceInImage } from './services/ai';
import { compressImage, cropImage } from './lib/imageUtils';

// --- Custom Hooks ---
function useIDBStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void, boolean] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    get(key).then((val) => {
      if (val !== undefined) {
        setStoredValue(val as T);
      } else {
        // Migrate from localStorage if the user has older data
        const localItem = window.localStorage.getItem(key);
        if (localItem) {
          try {
            const parsed = JSON.parse(localItem);
            setStoredValue(parsed);
            set(key, parsed).catch(console.error); // Save to IDB for next time
          } catch (e) {
            console.error(e);
          }
        }
      }
      setIsLoaded(true);
    }).catch(err => {
      console.error("IDB load error:", err);
      setIsLoaded(true);
    });
  }, [key]);

  const setValue = (value: T | ((val: T) => T)) => {
    setStoredValue((prev) => {
      const valueToStore = value instanceof Function ? value(prev) : value;
      set(key, valueToStore).catch((error) => {
        console.error("IDB save error:", error);
        alert("设备空间不足，无法保存衣物！");
      });
      return valueToStore;
    });
  };

  return [storedValue, setValue, isLoaded];
}

// --- Main App Component ---
export default function App() {
  const [activeTab, setActiveTab] = useState<'wardrobe' | 'add' | 'inspiration' | 'history'>('inspiration');
  const [previousTab, setPreviousTab] = useState<'wardrobe' | 'inspiration' | 'history'>('inspiration');
  const [wardrobe, setWardrobe, isLoaded] = useIDBStorage<WardrobeItem[]>('linggan_wardrobe', []);
  const [history, setHistory] = useIDBStorage<HistoryOutfit[]>('linggan_history', []);
  
  const addToWardrobe = (items: WardrobeItem | WardrobeItem[]) => {
    const itemsToAdd = Array.isArray(items) ? items : [items];
    setWardrobe(prev => [...itemsToAdd, ...prev]);
    setActiveTab('wardrobe');
  };

  const removeFromWardrobe = (id: string) => {
    setWardrobe(wardrobe.filter(w => w.id !== id));
  };

  const goToAdd = (from: 'wardrobe' | 'inspiration') => {
    setPreviousTab(from);
    setActiveTab('add');
  };

  if (!isLoaded) {
    return (
      <div className="max-w-md mx-auto h-[100dvh] bg-surface flex flex-col items-center justify-center p-6 text-[#999]">
        <RefreshCw className="w-8 h-8 animate-spin mb-4 text-[#ddd]" />
        <p className="text-sm">正在加载你的数字衣橱...</p>
      </div>
    );
  }

  const handleSaveToHistory = (outfit: HistoryOutfit) => {
    setHistory(prev => [outfit, ...prev]);
  };

  const handleRemoveHistory = (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  return (
    <div className={`max-w-md mx-auto h-[100dvh] overflow-hidden flex flex-col relative sm:border sm:border-border-custom mt-0 sm:mt-8 sm:h-[90vh] ${activeTab === 'add' ? 'bg-white' : 'bg-surface'}`}>
      {/* Main Content Area */}
      <main className={`flex-1 overflow-y-auto custom-scrollbar relative z-0 flex flex-col ${activeTab === 'inspiration' ? '' : 'px-6 pt-6'}`}>
        <AnimatePresence mode="wait">
          {activeTab === 'wardrobe' && (
            <WardrobeTab key="wardrobe" wardrobe={wardrobe} onRemove={removeFromWardrobe} onBack={() => setActiveTab('inspiration')} onNavAdd={() => goToAdd('wardrobe')} />
          )}
          {activeTab === 'add' && (
            <AddTab key="add" onAdd={addToWardrobe} onCancel={() => setActiveTab(previousTab)} />
          )}
          {activeTab === 'inspiration' && (
            <InspirationTab key="inspiration" wardrobe={wardrobe} history={history} onNavAdd={() => goToAdd('inspiration')} onNavWardrobe={() => setActiveTab('wardrobe')} onNavHistory={() => setActiveTab('history')} historyCount={history.length} onSaveHistory={handleSaveToHistory} />
          )}
          {activeTab === 'history' && (
            <HistoryTab key="history" history={history} onBack={() => setActiveTab('inspiration')} onRemove={handleRemoveHistory} />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Wardrobe Tab ---
function WardrobeTab({ wardrobe, onRemove, onBack, onNavAdd }: { key?: string, wardrobe: WardrobeItem[], onRemove: (id: string) => void, onBack: () => void, onNavAdd: () => void }) {
  const [filter, setFilter] = useState<string>('全部');
  const [fullscreenItem, setFullscreenItem] = useState<WardrobeItem | null>(null);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current !== null && touchStartY.current !== null) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX.current;
        const deltaY = touchEndY - touchStartY.current;

        if (deltaX > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
          if (!fullscreenItem) {
            onBack();
          }
        }
        touchStartX.current = null;
        touchStartY.current = null;
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onBack, fullscreenItem]);

  // Dynamically generate all unique tags from current wardrobe
  const availableCategories = Array.from(new Set(wardrobe.map(item => item.category))).filter(Boolean);
  const availableColors = Array.from(new Set(wardrobe.map(item => item.color))).filter(Boolean);
  const availableStyleTags = Array.from(new Set(wardrobe.flatMap(item => item.styleTags))).filter(Boolean);
  
  const uniqueTags = Array.from(new Set([...availableCategories, ...availableStyleTags, ...availableColors]));

  // Auto-reset filter if the current filter is no longer available (e.g. after deletion)
  useEffect(() => {
    if (filter !== '全部' && !uniqueTags.includes(filter)) {
      setFilter('全部');
    }
  }, [filter, uniqueTags]);

  // Lock scroll when fullscreen
  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (fullscreenItem) {
      document.body.style.overflow = 'hidden';
      if (mainEl) mainEl.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (mainEl) mainEl.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      if (mainEl) mainEl.style.overflow = '';
    };
  }, [fullscreenItem]);

  const displayedWardrobe = filter === '全部' 
    ? wardrobe 
    : wardrobe.filter(item => 
        item.category === filter || 
        item.color === filter || 
        item.styleTags.includes(filter)
      );

  const currentIndex = fullscreenItem ? displayedWardrobe.findIndex(i => i.id === fullscreenItem.id) : -1;

  const dragHandlers = {
    onDragEnd: (e: any, { offset, velocity }: any) => {
      const swipe = offset.x;
      if (swipe < -50 && currentIndex !== -1 && currentIndex < displayedWardrobe.length - 1) {
        setFullscreenItem(displayedWardrobe[currentIndex + 1]);
      } else if (swipe > 50 && currentIndex > 0) {
        setFullscreenItem(displayedWardrobe[currentIndex - 1]);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="pb-8"
    >
      <AnimatePresence>
        {fullscreenItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFullscreenItem(null)}
            className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 cursor-pointer"
          >
            <motion.img 
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={1}
              {...dragHandlers}
              key={fullscreenItem.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              src={fullscreenItem.imageUrl} 
              alt={fullscreenItem.name}
              className="max-w-full max-h-[75vh] object-contain rounded-lg drop-shadow-2xl" 
            />
            
            <div className="mt-8 mb-safe text-center flex flex-col items-center pointer-events-none">
              <h3 className="text-white text-lg font-medium tracking-wide mb-2">{fullscreenItem.name}</h3>
              <p className="text-white/60 text-sm mb-3">{fullscreenItem.category} / {fullscreenItem.color}</p>
              
              {fullscreenItem.styleTags.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {fullscreenItem.styleTags.map((tag, i) => (
                    <span key={i} className="text-xs bg-white/10 text-white/80 px-2.5 py-1 rounded-md backdrop-blur-sm border border-white/10">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Navigation Arrows */}
            {currentIndex > 0 && (
              <button 
                onClick={(e) => { e.stopPropagation(); setFullscreenItem(displayedWardrobe[currentIndex - 1]); }}
                className="absolute left-0 top-1/2 -translate-y-1/2 p-2 px-1 sm:px-2 text-white/80 hover:text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] transition-colors z-50"
              >
                <ChevronLeft className="w-10 h-10 sm:w-12 sm:h-12 stroke-[2]" />
              </button>
            )}
            
            {currentIndex !== -1 && currentIndex < displayedWardrobe.length - 1 && (
              <button 
                onClick={(e) => { e.stopPropagation(); setFullscreenItem(displayedWardrobe[currentIndex + 1]); }}
                className="absolute right-0 top-1/2 -translate-y-1/2 p-2 px-1 sm:px-2 text-white/80 hover:text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] transition-colors z-50"
              >
                <ChevronRight className="w-10 h-10 sm:w-12 sm:h-12 stroke-[2]" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-1">
        <button onClick={onBack} className="text-[#999] hover:text-primary p-1.5 -ml-1.5 rounded-full hover:bg-black/5 transition-colors">
          <ChevronLeft className="w-5 h-5"/>
        </button>
        <h2 className="text-lg font-normal tracking-tight text-primary">我的衣柜</h2>
        <button 
          onClick={onNavAdd} 
          className="w-8 h-8 bg-[#222] text-white shadow-md rounded-full flex items-center justify-center hover:bg-black transition-all hover:scale-105 border border-white/20"
        >
          <Plus className="w-5 h-5 stroke-[2]" />
        </button>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-10 bg-surface/75 backdrop-blur-md flex gap-1.5 overflow-x-auto pt-2 pb-2 -mx-6 px-6 mb-4 scrollbar-hide">
        <button
          onClick={() => setFilter('全部')}
          className={`shrink-0 px-3 py-1 rounded-[20px] text-[12px] transition-colors ${filter === '全部' ? 'bg-accent text-white' : 'bg-accent-light text-primary'}`}
        >
          {filter === '全部' ? `全部 ${wardrobe.length}` : '全部'}
        </button>
        {uniqueTags.map(tag => {
          const count = wardrobe.filter(item => 
            item.category === tag || 
            item.color === tag || 
            item.styleTags.includes(tag)
          ).length;
          return (
            <button
              key={tag}
              onClick={() => setFilter(tag)}
              className={`shrink-0 px-3 py-1 rounded-[20px] text-[12px] transition-colors ${filter === tag ? 'bg-accent text-white' : 'bg-accent-light text-primary'}`}
            >
              {filter === tag ? `${tag} ${count}` : tag}
            </button>
          );
        })}
      </div>

      {wardrobe.length === 0 ? (
        <div 
          onClick={onNavAdd}
          className="pt-20 flex flex-col items-center justify-center text-center px-4 cursor-pointer group"
        >
          <div className="w-24 h-24 bg-accent-light rounded-full flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
            <Plus className="w-10 h-10 text-[#999] group-hover:text-accent transition-colors" />
          </div>
          <p className="text-sm text-[#999]">点击此处或右上角的加号来添加你的第一件单品吧</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <AnimatePresence>
            {displayedWardrobe.map((item) => (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                key={item.id} 
                className="bg-white rounded-xl overflow-hidden flex flex-col group relative shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-black/5 hover:shadow-md transition-shadow"
              >
                <div 
                  className="aspect-[3/4] relative bg-border-custom rounded-md mx-1.5 mt-1.5 flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => setFullscreenItem(item)}
                >
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  <button 
                    onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-2 text-center flex flex-col items-center">
                  <h4 className="text-xs text-[#666] line-clamp-1 mb-0.5" title={item.name}>{item.name}</h4>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

// --- Add Tab ---
function AddTab({ onAdd, onCancel }: { key?: string, onAdd: (items: WardrobeItem | WardrobeItem[]) => void, onCancel: () => void }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  
  // Update state to hold multiple items
  type ParsedState = { id: string, name: string, category: Category, color: string, styleTags: string[], thumbnailUrl: string, selected: boolean };
  const [parsedItem, setParsedItem] = useState<ParsedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const [isEditingCard, setIsEditingCard] = useState(false);
  const editCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editCardRef.current && !editCardRef.current.contains(event.target as Node)) {
        setIsEditingCard(false);
      }
    };
    if (isEditingCard) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditingCard]);

  const [saveProgress, setSaveProgress] = useState<{current: number, total: number} | null>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsAnalyzing(true);
      setIsGeneratingImage(true);
      setError(null);
      setParsedItem(null);
      
      // 进一步将图片压缩分辨率从 800 降低到 512。
      const compressedBase64 = await compressImage(file, 512); 
      setPhotoUrl(compressedBase64); // Show original temporarily while processing

      // Separate the promises. Semantic parsing is fast (1-2s), Image gen is slow (4-8s).
      // We do not want the UI to block on the image gen.
      const imageGenPromise = processSingleItemImage(compressedBase64).catch(e => {
         console.error("Image generation failed silently", e);
         return compressedBase64; // fallback
      });
      
      // Wait for the fast metadata parsing
      const parsedData = await analyzeSingleClothingItem(compressedBase64);
      
      if (!parsedData || !parsedData.name) {
        throw new Error("没识别出物品，换张照片试试吧");
      }

      // Immediately display card results to give user fast perceived performance
      setParsedItem({
        id: Math.random().toString(36).substring(2, 9),
        name: parsedData.name || '未知单品',
        category: (parsedData.category as Category) || '配饰',
        color: parsedData.color || '默认色',
        styleTags: parsedData.styleTags || [],
        thumbnailUrl: compressedBase64, // Temporary thumbnail
        selected: true
      });
      
      // Hide the full-screen blocking overlay so user can read the text
      setIsAnalyzing(false);

      // Now continue to wait for the heavy image background removal in the background
      const enhancedBase64 = await imageGenPromise;
      if (enhancedBase64) {
         setPhotoUrl(enhancedBase64); // Updates the big preview image
         setParsedItem(prev => prev ? { ...prev, thumbnailUrl: enhancedBase64 } : null); // Updates the thumbnail for save
      }
      setIsGeneratingImage(false);

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "哎呀，解析失败了");
      setIsAnalyzing(false);
      setIsGeneratingImage(false);
    }
  };

  const handleSaveAll = async () => {
    if (!parsedItem) return;
    
    setIsSaving(true);
    
    try {
      const wardrobleItem: WardrobeItem = {
        id: parsedItem.id,
        name: parsedItem.name,
        category: parsedItem.category,
        color: parsedItem.color,
        styleTags: parsedItem.styleTags,
        imageUrl: parsedItem.thumbnailUrl,
        createdAt: Date.now()
      };

      onAdd([wardrobleItem]);
    } catch (err) {
      console.error("Save error", err);
    } finally {
      setIsSaving(false);
      setSaveProgress(null);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: 20 }}
      className="space-y-6 flex flex-col h-full relative"
    >
      <AnimatePresence>
        {isSaving && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-surface/90 backdrop-blur flex flex-col items-center justify-center gap-4 rounded-[20px]"
          >
            <RefreshCw className="w-10 h-10 text-primary animate-spin" />
            <p className="text-primary font-medium text-[13px] tracking-widest uppercase">
              保存中...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-normal tracking-tight text-primary">添加到衣柜</h2>
        <button onClick={onCancel} className="text-[#999] hover:text-primary p-2 -mr-2 rounded-full hover:bg-black/5 transition-colors"><X className="w-6 h-6"/></button>
      </div>

      {!photoUrl ? (
        <div className="flex flex-col gap-4 flex-1 justify-center max-w-sm mx-auto w-full pt-4 pb-8">
          
          <div 
            className="flex-1 flex items-center justify-center cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.removeAttribute('capture');
                fileInputRef.current.setAttribute('capture', 'environment');
                fileInputRef.current.click();
              }
            }}
          >
            <img src="/add-background.png" alt="拍摄示意图" className="w-full h-auto object-contain mix-blend-darken pointer-events-none" />
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute('capture');
                  fileInputRef.current.setAttribute('capture', 'environment');
                  fileInputRef.current.click();
                }
              }}
              className="bg-primary text-white rounded-2xl py-4 flex flex-col items-center justify-center hover:bg-black/80 transition-all shadow-md active:scale-[0.98]"
            >
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5" />
                <span className="font-medium text-[16px]">拍照</span>
              </div>
            </button>
            
            <button 
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute('capture');
                  fileInputRef.current.click();
                }
              }}
              className="bg-white border border-border-custom text-primary rounded-2xl py-4 flex flex-col items-center justify-center hover:border-primary transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-[#666]" />
                <span className="font-medium text-[16px]">从相册上传</span>
              </div>
            </button>
          </div>

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handlePhotoUpload} 
            accept="image/*" 
            className="hidden" 
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col space-y-6">
          <div className="relative w-full rounded-[20px] overflow-hidden shadow-sm bg-[#fafafa]">
            <img src={photoUrl} className={`w-full h-auto max-h-[40vh] object-contain transition-all duration-700`} alt="Preview" />
            
            <AnimatePresence>
              {isAnalyzing && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 z-10"
                >
                  <RefreshCw className="w-6 h-6 text-white animate-spin" />
                  <p className="text-white font-bold text-xs tracking-widest uppercase">AI 识别数据中...</p>
                </motion.div>
              )}
              
              {!isAnalyzing && isGeneratingImage && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 z-10"
                >
                  <RefreshCw className="w-6 h-6 text-white animate-spin" />
                  <p className="text-white font-bold text-xs tracking-widest uppercase">图像优化处理中...</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!isAnalyzing && error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm text-center">
              {error}
              <button 
                onClick={() => { setPhotoUrl(null); setParsedItem(null); }} 
                className="mt-2 text-red-700 font-medium underline block mx-auto"
              >
                重新选择图片
              </button>
            </div>
          )}

          {!isAnalyzing && parsedItem && !error && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }} 
              className="flex-1 flex flex-col space-y-4"
            >
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase tracking-widest text-[#999]">识别结果</span>
                <button 
                  onClick={() => { setPhotoUrl(null); setParsedItem(null); }} 
                  className="text-xs text-primary underline"
                >
                  重选图片
                </button>
              </div>

              <div 
                ref={editCardRef}
                onClick={() => !isEditingCard && setIsEditingCard(true)}
                className={`bg-white p-4 rounded-[16px] border border-border-custom relative shadow-[0_10px_30px_rgba(0,0,0,0.03)] flex items-center gap-4 ${!isEditingCard ? 'cursor-pointer hover:border-black/20 transition-colors' : ''}`}
              >
                <div className="flex-1">
                  {!isEditingCard ? (
                    <>
                      <h3 className="text-lg font-medium text-primary mb-1">{parsedItem.name}</h3>
                      <p className="text-sm text-[#999] mb-3">{parsedItem.category} / {parsedItem.color}</p>
                      
                      {parsedItem.styleTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {parsedItem.styleTags.map((tag, i) => (
                            <span key={i} className="text-xs bg-accent-pale text-accent px-2 py-1 rounded-md">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      <div className="absolute top-4 right-4 text-xs text-[#999] flex items-center gap-1 opacity-60">
                        <Edit2 className="w-3.5 h-3.5" /> 点击修改
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col gap-3">
                       <input 
                         type="text" 
                         value={parsedItem.name} 
                         onChange={e => setParsedItem({...parsedItem, name: e.target.value})}
                         className="w-full text-lg font-medium text-primary border-b border-border-custom px-1 py-1 focus:outline-none focus:border-primary placeholder:text-[#999]"
                         placeholder="单品名称"
                         autoFocus
                       />
                       <div className="flex gap-2">
                         <select 
                           value={parsedItem.category}
                           onChange={e => setParsedItem({...parsedItem, category: e.target.value as Category})}
                           className="flex-1 text-sm bg-black/5 rounded-md px-2 py-1.5 focus:outline-none text-[#333]"
                         >
                           {['上装', '下装', '连衣裙', '鞋子', '包包', '配饰'].map(c => <option key={c} value={c}>{c}</option>)}
                         </select>
                         <input 
                           type="text"
                           value={parsedItem.color}
                           onChange={e => setParsedItem({...parsedItem, color: e.target.value})}
                           className="flex-1 text-sm bg-black/5 rounded-md px-2 py-1.5 focus:outline-none placeholder:text-[#999]"
                           placeholder="颜色"
                         />
                       </div>
                       <input 
                         type="text"
                         value={parsedItem.styleTags.join(' ')}
                         onChange={e => setParsedItem({...parsedItem, styleTags: e.target.value.split(/\s+/).filter(Boolean)})}
                         className="w-full text-xs bg-black/5 rounded-md px-2 py-2 focus:outline-none placeholder:text-[#999]"
                         placeholder="风格标签（用空格分隔，如：甜美 复古）"
                       />
                       <button 
                         onClick={(e) => { e.stopPropagation(); setIsEditingCard(false); }}
                         className="self-end mt-1 text-xs bg-primary text-white px-5 py-2 rounded-full font-medium active:scale-95 transition-transform"
                       >
                         完成
                       </button>
                    </div>
                  )}
                </div>
              </div>

              <button 
                onClick={handleSaveAll}
                disabled={isGeneratingImage}
                className="w-full bg-primary text-white rounded-[30px] py-3.5 font-medium shadow-[0_10px_30px_rgba(0,0,0,0.03)] hover:bg-[#333] transition-colors mt-auto mb-6 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
              >
                {isGeneratingImage ? '等待图片处理完成...' : '保存到衣柜'}
              </button>
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// --- Global State for Inspiration Tab to persist across tab navigation ---
let globalInspirationSession: {
  result: { title: string, description: string, itemIds: string[] } | null;
  tryOnImage: string | null;
  isSaved: boolean;
  showReason: boolean;
} | null = null;

// --- Inspiration Tab ---
function InspirationTab({ wardrobe, history, onNavAdd, onNavWardrobe, onNavHistory, historyCount, onSaveHistory }: { key?: string, wardrobe: WardrobeItem[], history: HistoryOutfit[], onNavAdd: () => void, onNavWardrobe: () => void, onNavHistory: () => void, historyCount: number, onSaveHistory: (outfit: HistoryOutfit) => void }) {
  const DEFAULT_SCENARIOS = ['日常通勤上课', '与闺蜜一起逛街', '去郊区远足'];
  const [scenario, setScenario] = useState(() => {
    const saved = localStorage.getItem('wardrobe_scenario_current');
    return saved || '日常通勤上课';
  });
  
  const [historyScenarios, setHistoryScenarios] = useState<string[]>(() => {
    const saved = localStorage.getItem('wardrobe_scenario_history');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return DEFAULT_SCENARIOS;
  });
  const [showScenarioDropdown, setShowScenarioDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowScenarioDropdown(false);
      }
    };
    if (showScenarioDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showScenarioDropdown]);

  const saveScenarioToHistory = (newScenario: string) => {
    if (!newScenario.trim()) return;
    setHistoryScenarios(prev => {
      const updated = [newScenario, ...prev.filter(s => s !== newScenario)].slice(0, 10);
      localStorage.setItem('wardrobe_scenario_history', JSON.stringify(updated));
      return updated;
    });
  };

  const handleScenarioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScenario(e.target.value);
    localStorage.setItem('wardrobe_scenario_current', e.target.value);
  };

  const handleScenarioBlur = () => {
    // Delay to allow dropdown click to register
    setTimeout(() => {
      saveScenarioToHistory(scenario);
    }, 200);
  };

  const handleDeleteScenario = (e: React.MouseEvent, s: string) => {
    e.stopPropagation();
    setHistoryScenarios(prev => {
      const updated = prev.filter(item => item !== s);
      localStorage.setItem('wardrobe_scenario_history', JSON.stringify(updated));
      return updated;
    });
  };

  const handleSelectScenario = (s: string) => {
    setScenario(s);
    localStorage.setItem('wardrobe_scenario_current', s);
    saveScenarioToHistory(s);
    setShowScenarioDropdown(false);
  };
  
  const [city, setCity] = useState(() => {
    const saved = localStorage.getItem('wardrobe_weather_data');
    if (saved) {
      try { return JSON.parse(saved).city || '同城'; } catch (e) {}
    }
    return '同城';
  });
  
  const [weather, setWeather] = useState(() => {
    const saved = localStorage.getItem('wardrobe_weather_data');
    if (saved) {
      try { return JSON.parse(saved).weatherString || '☀︎晴，18℃'; } catch (e) {}
    }
    return '☀︎晴，18℃';
  });
  const [isWeatherUpdating, setIsWeatherUpdating] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isCanceled, setIsCanceled] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ title: string, description: string, itemIds: string[] } | null>(globalInspirationSession?.result || null);
  const [error, setError] = useState<string | null>(null);
  const [showReason, setShowReason] = useState(globalInspirationSession?.showReason || false);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const [tryOnImage, setTryOnImage] = useState<string | null>(globalInspirationSession?.tryOnImage || null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isSaved, setIsSaved] = useState(globalInspirationSession?.isSaved || false);
  const [plusOneAnim, setPlusOneAnim] = useState(0);

  // Sync state to global variable whenever it changes so it survives unmounts
  useEffect(() => {
    globalInspirationSession = {
      result,
      tryOnImage,
      isSaved,
      showReason
    };
  }, [result, tryOnImage, isSaved, showReason]);

  // Face swap states
  const [customModelImage, setCustomModelImage] = useIDBStorage<string | null>('linggan_custom_model', null);
  const [isFaceSwapping, setIsFaceSwapping] = useState(false);
  const [previewFaceSwapImage, setPreviewFaceSwapImage] = useState<string | null>(null);
  const faceSwapInputRef = useRef<HTMLInputElement>(null);

  const [showFaceSwapHint, setShowFaceSwapHint] = useState(false);

  useEffect(() => {
    if (error || tryOnImage) {
      setShowFaceSwapHint(false);
      return;
    }
    if (!customModelImage) {
      setShowFaceSwapHint(true);
      const timer = setTimeout(() => setShowFaceSwapHint(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowFaceSwapHint(false);
    }
  }, [customModelImage, error, tryOnImage]);

  useEffect(() => {
    const checkAndFetchWeather = async () => {
      const saved = localStorage.getItem('wardrobe_weather_data');
      let needsUpdate = true;
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Date.now() - parsed.lastUpdated < 8 * 60 * 60 * 1000) {
            needsUpdate = false;
          }
        } catch(e) {}
      }
      
      if (needsUpdate) {
        handleSyncWeather();
      }
    };
    
    checkAndFetchWeather();
  }, []);

  const fetchWeather = async (): Promise<{ weather: string, city: string }> => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('no_geolocation'));
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
                const [weatherRes, geoRes] = await Promise.all([
                    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`),
                    fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh`)
                ]);
                
                if (!weatherRes.ok) throw new Error('network_error');
                const data = await weatherRes.json();
                const t = Math.round(data.current_weather.temperature);
                const code = data.current_weather.weathercode;
                let desc = "☀︎晴";
                if (code === 1 || code === 2) desc = "⛅多云";
                else if (code === 3) desc = "☁️阴";
                else if (code >= 45 && code <= 48) desc = "🌫️雾";
                else if (code >= 51 && code <= 69) desc = "🌧️雨";
                else if (code >= 71 && code <= 79) desc = "❄️雪";
                else if (code >= 80 && code <= 99) desc = "⛈️雷阵雨";
                
                let cityName = "同城";
                if (geoRes.ok) {
                    const geoData = await geoRes.json();
                    cityName = geoData.city || geoData.locality || geoData.principalSubdivision || "同城";
                }
                
                resolve({ weather: `${desc}，${t}℃`, city: cityName });
            } catch (e) {
                reject(e);
            }
        }, (err) => {
            // Geolocation permissions denied or timeout
            reject(err);
        }, { timeout: 10000 });
    });
  };

  const handleSyncWeather = async () => {
    if (isWeatherUpdating) return;
    setIsWeatherUpdating(true);
    try {
        const { weather: weatherStr, city: cityName } = await fetchWeather();
        setWeather(weatherStr);
        setCity(cityName);
        localStorage.setItem('wardrobe_weather_data', JSON.stringify({
            weatherString: weatherStr,
            city: cityName,
            lastUpdated: Date.now()
        }));
    } catch (err: any) {
        console.warn("Failed to get geolocation or weather", err);
        // Show the error on screen to let the user know what happened
        if (err.message === 'no_geolocation' || err.code === 1) { // 1 is PERMISSION_DENIED
           setError("获取位置权限被拒绝，请在浏览器或设备中允许定位权限以同步天气。");
        } else {
           setError("天气同步失败，请检查网络或稍后手动修改。");
        }
    } finally {
        setIsWeatherUpdating(false);
    }
  };

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = () => {
    if (tryOnImage) return;
    pressTimer.current = setTimeout(() => {
      setShowActionSheet(true);
    }, 600);
  };

  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleImageClick = () => {
    // Treat long-press trigger cancellation slightly differently:
    // If action sheet is up, just close it, don't toggle fullscreen
    if (showActionSheet) {
      setShowActionSheet(false);
      return;
    }
    // Only toggle fullscreen if we weren't long-pressing
    setIsFullscreen(!isFullscreen);
  };

  const handleFaceSwapClick = () => {
    setShowActionSheet(false);
    setIsFullscreen(false);
    faceSwapInputRef.current?.click();
  };

  const getBase64FromImageAsync = async (imgEl: HTMLImageElement): Promise<string | null> => {
    try {
      if (imgEl.src.startsWith('data:')) {
        return imgEl.src;
      }
      
      try {
        const canvas = document.createElement("canvas");
        canvas.width = imgEl.naturalWidth || imgEl.width;
        canvas.height = imgEl.naturalHeight || imgEl.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(imgEl, 0, 0);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
          if (dataUrl && dataUrl !== "data:,") return dataUrl;
        }
      } catch (err) {
        console.warn("Canvas cross-origin tainted, falling back to fetch", err);
      }
      
      const res = await fetch(imgEl.src);
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("getBase64FromImage error:", e);
      return null;
    }
  };

  const abortControllerFaceSwapRef = useRef<AbortController | null>(null);

  const handleCancelFaceSwap = () => {
    if (abortControllerFaceSwapRef.current) {
      abortControllerFaceSwapRef.current.abort(new Error("Canceled"));
      abortControllerFaceSwapRef.current = null;
    }
    setIsFaceSwapping(false);
  };

  const onFaceSwapFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const abortController = new AbortController();
    abortControllerFaceSwapRef.current = abortController;

    const makeAbortable = <T,>(promise: Promise<T>): Promise<T> => {
        return new Promise((resolve, reject) => {
            const onAbort = () => reject(abortController.signal.reason || new Error("Canceled"));
            if (abortController.signal.aborted) return onAbort();
            abortController.signal.addEventListener('abort', onAbort);
            promise.then(resolve).catch(reject).finally(() => {
                abortController.signal.removeEventListener('abort', onAbort);
            });
        });
    };

    try {
      setIsFaceSwapping(true);
      setError(null);
      const userFaceB64 = await makeAbortable(compressImage(file, 800));
      
      const hasFace = await makeAbortable(detectFaceInImage(userFaceB64));
      if (!hasFace) {
        setError("未能在图片中识别到清晰的人脸，请重新选择一张包含正脸的照片。");
        return;
      }
      
      const baseModelB64 = imgRef.current ? await getBase64FromImageAsync(imgRef.current) : null;
      if (!baseModelB64) throw new Error('无法读取基础模特图像数据');

      const resultB64 = await makeAbortable(generateFaceSwap(baseModelB64, userFaceB64));
      setPreviewFaceSwapImage(resultB64);
    } catch(err) {
      console.error(err);
      if (err instanceof Error && err.message === "Canceled") {
        return; // handle silent cancellation
      }
      setError(err instanceof Error ? err.message : "换脸失败，请重试");
    } finally {
      setIsFaceSwapping(false);
      if (faceSwapInputRef.current) faceSwapInputRef.current.value = '';
    }
  };

  const handleReset = () => {
    setResult(null);
    setTryOnImage(null);
    setShowReason(false);
    setError(null);
    setIsSaved(false);
    globalInspirationSession = null;
  };

  const handleSaveToHistoryAction = () => {
    if (!tryOnImage || isSaved) return;
    
    // Save to History (IDB)
    onSaveHistory({
        id: Date.now().toString(),
        imageUrl: tryOnImage,
        scenario,
        weather,
        createdAt: Date.now(),
        itemIds: result?.itemIds || []
    });
    
    // Trigger animation & toggle 
    setIsSaved(true);
    setPlusOneAnim(prev => prev + 1);
  };

  const handleSaveToAlbum = () => {
    if (!tryOnImage && !imgRef.current) return;
    const targetUrl = tryOnImage || imgRef.current?.src;
    if (!targetUrl) return;

    // Save to local device album / download
    const a = document.createElement("a");
    a.href = targetUrl;
    a.download = "灵感穿搭.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async () => {
    if (!tryOnImage) return;
    try {
      const response = await fetch(tryOnImage);
      const blob = await response.blob();
      const file = new File([blob], 'outfit.jpg', { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: '我的灵感穿搭',
          files: [file]
        });
      } else {
        alert("当前设备/浏览器不支持直接分享图片，请点击下载保存后分享~");
      }
    } catch(err: any) {
      if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
        console.error("分享失败", err);
      }
    }
  };

  const handleGenerate = async () => {
    if (isGenerating) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort(new Error("Canceled"));
        abortControllerRef.current = null;
      }
      setIsGenerating(false);
      setIsCanceled(true);
      return;
    }

    // Prepare a fresh abort controller and timeout for this generation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const timeoutId = setTimeout(() => {
        if (!abortController.signal.aborted) {
            abortController.abort(new Error("请求超时，请检查网络或稍后重试。"));
        }
    }, 300000); // 300 seconds timeout

    try {
      setIsGenerating(true);
      setIsCanceled(false);
      setError(null);
      setTryOnImage(null);
      setShowReason(false);

      const makeAbortable = <T,>(promise: Promise<T>): Promise<T> => {
          return new Promise((resolve, reject) => {
              const onAbort = () => reject(abortController.signal.reason || new Error("Canceled"));
              if (abortController.signal.aborted) return onAbort();
              abortController.signal.addEventListener('abort', onAbort);
              promise.then(resolve).catch(reject).finally(() => {
                  abortController.signal.removeEventListener('abort', onAbort);
              });
          });
      };
      
      // Calculate today's worn items to avoid repetition
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const recentlyWornItemIds = history
        .filter(h => h.createdAt > todayStart.getTime())
        .flatMap(h => h.itemIds || []);
      
      const res = await makeAbortable(generateOutfit(wardrobe, scenario, weather, recentlyWornItemIds));

      setResult(res);

      if (res.itemIds && res.itemIds.length > 0 && imgRef.current) {
        const base64Data = await getBase64FromImageAsync(imgRef.current);
        if (base64Data) {
          const selectedItems = res.itemIds
            .map(id => wardrobe.find(w => w.id === id))
            .filter(Boolean) as WardrobeItem[];
          
          const outfitDesc = selectedItems
            .map(item => `${item.color}颜色的${item.styleTags.join('')}${item.name}`)
            .join('，搭配');
            
          const garmentUrls = selectedItems.map(item => item.imageUrl);
          const tryOnB64 = await makeAbortable(generateVirtualTryOn(base64Data, outfitDesc, garmentUrls));
          setTryOnImage(tryOnB64);
        }
      }
    } catch (err: any) {
      const isManualCancel = err.message === 'Canceled' || err.name === 'AbortError' || (abortController.signal.aborted && abortController.signal.reason?.message === 'Canceled');
      if (!isManualCancel) {
        console.error(err);
        setError(err instanceof Error ? err.message : "生成失败，可能是衣柜衣服不够多或网络问题");
      }
    } finally {
      clearTimeout(timeoutId);
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setIsGenerating(false);
    }
  };

  const resultItems = result?.itemIds
    .map(id => wardrobe.find(w => w.id === id))
    .filter(Boolean) as WardrobeItem[];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 1.05 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="flex flex-col h-[100dvh] sm:h-full w-full relative"
    >
      {/* Background Image (Full Fill) */}
      <img 
        ref={imgRef}
        src={tryOnImage || customModelImage || "/model_uploaded.jpg"}
        alt="Asian Girl Display Model"
        onClick={handleImageClick}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerMove={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none'
        }}
        className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${isFullscreen ? 'z-50' : 'z-0'}`}
        crossOrigin="anonymous"
        onError={(e) => {
          if (!tryOnImage && !customModelImage) {
            e.currentTarget.src = "https://image.pollinations.ai/prompt/A%20short-haired%20Asian%20girl%20standing%20full%20body,%20wearing%20a%20basic%20white%20short-sleeve%20t-shirt,%20white%20shorts,%20and%20white%20sneakers.%20Simple%20studio%20lighting,%20pure%20white%20background,%20clean,%20fashion%20display%20model?width=400&height=700&seed=152&nologo=true";
          }
        }}
      />
      
      <input type="file" accept="image/*" ref={faceSwapInputRef} onChange={onFaceSwapFileSelected} className="hidden" />

      {/* Action Sheet for Long Press */}
      <AnimatePresence>
        {showActionSheet && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowActionSheet(false)}
            className="absolute inset-0 z-[60] bg-black/50 backdrop-blur-sm flex flex-col justify-end p-4"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl overflow-hidden flex flex-col mb-4 pt-1"
            >
              {tryOnImage || (resultItems && resultItems.length > 0) ? (
                 <button 
                   onClick={(e) => {
                     e.stopPropagation();
                     handleSaveToAlbum();
                     setShowActionSheet(false);
                   }}
                   className="w-full py-4 px-6 text-[15px] font-medium text-[#222] border-b border-[#eee] active:bg-[#f5f5f5] transition-colors"
                 >
                   保存到相册
                 </button>
              ) : (
                <>
                 <button 
                   onClick={(e) => {
                     e.stopPropagation();
                     handleFaceSwapClick();
                   }}
                   className="w-full py-4 px-6 text-[15px] font-medium text-[#222] border-b border-[#eee] active:bg-[#f5f5f5] transition-colors"
                 >
                   换脸 (拍照/相册)
                 </button>
                 {customModelImage && (
                   <button 
                     onClick={(e) => {
                       e.stopPropagation();
                       setCustomModelImage(null);
                       setShowActionSheet(false);
                     }}
                     className="w-full py-4 px-6 text-[15px] font-medium text-red-500 border-b border-[#eee] active:bg-[#f5f5f5] transition-colors"
                   >
                     还原默认模特
                   </button>
                 )}
                </>
              )}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActionSheet(false);
                }}
                className="w-full py-4 px-6 text-[15px] font-medium text-[#999] active:bg-[#f5f5f5] transition-colors"
              >
                取消
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Optional Top Gradient for better text readability */}
      <div className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/10 to-transparent z-0 pointer-events-none transition-opacity duration-300 ${isFullscreen ? 'opacity-0' : 'opacity-100'}`} />

      {/* Floating Content wrapper */}
      <div className={`relative z-10 flex flex-col h-full pointer-events-none transition-opacity duration-300 ${isFullscreen ? 'opacity-0' : 'opacity-100'}`}>

        {/* Date and City Indicator */}
        <div className="pt-safe sm:pt-4 w-full flex justify-center pb-1 z-20 pointer-events-none">
            <span className="text-xs text-gray-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] font-medium tracking-wide">
                {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })} · {city}
            </span>
        </div>

        {/* Top: Inputs floating over image */}
        <div className="flex space-x-3 px-6 pt-1 shrink-0 z-20 pointer-events-none">
          <div className="flex-1 pointer-events-auto relative" ref={dropdownRef}>
            <input 
              type="text" 
              value={scenario}
              onChange={handleScenarioChange}
              onBlur={handleScenarioBlur}
              placeholder="场景：日常通勤上课"
              className="w-full bg-white/20 backdrop-blur-[6px] border border-white/40 text-center py-2 pl-3 pr-8 rounded-full text-xs text-[#222] font-medium shadow-[0_4px_15px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-[#555] transition-all focus:bg-white/40 hover:bg-white/30"
            />
            <button 
              onClick={() => setShowScenarioDropdown(!showScenarioDropdown)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-[#555] hover:text-[#222] transition-colors rounded-full hover:bg-black/5"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showScenarioDropdown ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showScenarioDropdown && historyScenarios.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-white/40 shadow-[0_10px_30px_rgba(0,0,0,0.15)] rounded-2xl overflow-hidden z-50 py-1.5 max-h-48 overflow-y-auto custom-scrollbar"
                >
                  {historyScenarios.map(s => (
                    <div 
                      key={s} 
                      onClick={() => handleSelectScenario(s)}
                      className="px-4 py-2.5 text-xs text-[#333] hover:bg-black/5 cursor-pointer flex justify-between items-center transition-colors border-b border-black/5 last:border-0"
                    >
                      <span className="truncate pr-2">{s}</span>
                      <button 
                        onClick={(e) => handleDeleteScenario(e, s)}
                        className="p-1 hover:bg-red-50 text-[#999] hover:text-red-500 rounded-full transition-colors flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex-1 pointer-events-auto relative">
            <input 
              type="text" 
              value={weather}
              onChange={(e) => {
                setWeather(e.target.value);
                localStorage.setItem('wardrobe_weather_data', JSON.stringify({
                    weatherString: e.target.value,
                    city,
                    lastUpdated: Date.now()
                }));
              }}
              placeholder="天气：☀︎晴，18℃"
              className="w-full bg-white/20 backdrop-blur-[6px] border border-white/40 text-center py-2 pl-3 pr-8 rounded-full text-xs text-[#222] font-medium shadow-[0_4px_15px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-[#555] transition-all focus:bg-white/40 hover:bg-white/30"
            />
            <button 
              onClick={handleSyncWeather}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-[#555] hover:text-[#222] transition-colors rounded-full hover:bg-black/5"
              title="同城天气同步"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isWeatherUpdating ? 'animate-spin text-primary' : ''}`} />
            </button>
          </div>
        </div>

        {error && !isCanceled && (
          <div className="mx-6 mt-3 bg-red-50/90 backdrop-blur-md text-red-600 p-2 rounded-lg text-xs text-center shrink-0 shadow-sm border border-red-100">
            {error}
          </div>
        )}

        {/* Middle Space (Empty, Model visible) */}
        <div className="flex-1 relative flex items-center justify-center pointer-events-none">
          <AnimatePresence>
            {showFaceSwapHint && !isGenerating && !isFaceSwapping && !showActionSheet && !isFullscreen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                className="bg-black/60 backdrop-blur-md text-white px-5 py-2.5 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.2)] text-sm font-medium tracking-wide border border-white/20 pointer-events-auto"
              >
                长按照片可给模特换脸
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {isGenerating && (
          <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center gap-3 pointer-events-auto">
            <RefreshCw className="w-8 h-8 text-primary animate-spin drop-shadow-md" />
            <p className="text-sm font-medium text-primary tracking-widest uppercase drop-shadow-md">
              {result ? '正在生成试穿效果图...' : '寻找穿搭灵感中...'}
            </p>
          </div>
        )}

        {isFaceSwapping && (
          <div className="absolute inset-0 bg-white/30 backdrop-blur-[4px] z-30 flex flex-col items-center justify-center gap-3 pointer-events-auto">
            <RefreshCw className="w-8 h-8 text-primary animate-spin drop-shadow-md" />
            <p className="text-sm font-medium text-primary tracking-widest uppercase drop-shadow-md">
              正在提取面部并融合生成换脸...
            </p>
          </div>
        )}

        {previewFaceSwapImage && (
          <div className="absolute inset-0 z-50 flex flex-col pointer-events-auto">
            <img src={previewFaceSwapImage} className="w-full h-full object-cover" alt="Preview Face Swap" />
            <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-6 px-6">
                 <button onClick={() => setPreviewFaceSwapImage(null)} className="px-8 py-3 bg-white/20 backdrop-blur-md rounded-full text-white font-medium shadow-[0_4px_20px_rgba(0,0,0,0.15)] border border-white/30 active:scale-95 transition-transform" >取消换脸</button>
                 <button onClick={() => { setCustomModelImage(previewFaceSwapImage); setPreviewFaceSwapImage(null); }} className="px-8 py-3 bg-primary rounded-full text-white font-medium shadow-[0_4px_20px_rgba(0,0,0,0.3)] border border-black/10 active:scale-95 transition-transform" >确认保存</button>
            </div>
          </div>
        )}

        {result && resultItems && resultItems.length > 0 && !isGenerating && !previewFaceSwapImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-20 pointer-events-none"
          >
            <AnimatePresence>
              {showReason ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className="absolute top-[12%] left-6 right-6 bg-white/60 backdrop-blur-xl p-6 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.12)] border border-white/40 pointer-events-auto z-30"
                >
                  <button 
                    onClick={() => setShowReason(false)}
                    className="absolute top-4 right-4 text-[#999] hover:text-[#333] transition-colors p-1 bg-black/5 rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <h3 className="text-base font-bold text-primary mb-2 pr-6 flex items-start justify-between">
                    <span>{result.title}</span>
                  </h3>
                  <p className="text-sm text-[#555] leading-relaxed">{result.description}</p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute top-[15%] right-6 z-30 pointer-events-auto"
                >
                  <button
                    onClick={() => setShowReason(true)}
                    className="relative bg-white/60 backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.15)] p-3 rounded-full text-primary border border-white/40 hover:bg-white/80 transition-all hover:scale-110"
                    aria-label="查看穿搭理由"
                  >
                    <MessageCircle className="w-5 h-5 stroke-[1.5]" />
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Floating Nav Buttons on the Right */}
        <div className="absolute right-6 bottom-[240px] flex flex-col gap-5 z-20 pointer-events-none">
          <div className="relative flex flex-col items-center pointer-events-auto">
            <AnimatePresence>
                {plusOneAnim > 0 && (
                <motion.div
                    key={plusOneAnim}
                    initial={{ opacity: 0, y: -20, scale: 0.8 }}
                    animate={{ opacity: [0, 1, 0], y: [-20, 0, 15], scale: [0.8, 1.2, 1] }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="absolute -top-6 text-accent font-black text-sm drop-shadow-md z-30"
                >
                    +1
                </motion.div>
                )}
            </AnimatePresence>
            <motion.button 
              disabled={isGenerating} 
              onClick={onNavHistory} 
              animate={plusOneAnim > 0 ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 0.4 }}
              className="w-12 h-12 bg-white/70 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.15)] rounded-full flex flex-col items-center justify-center text-primary hover:bg-white/90 transition-all hover:scale-105 disabled:opacity-50 border border-white/30" 
              title="我的收藏"
            >
              <Heart className="w-[18px] h-[18px] stroke-[1.5] -mt-0.5" />
              <span className="text-[9px] text-[#555] font-normal leading-none mt-1">{historyCount}</span>
            </motion.button>
          </div>
          <button disabled={isGenerating} onClick={onNavWardrobe} className="w-12 h-12 bg-white/70 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.15)] rounded-full flex flex-col items-center justify-center text-primary hover:bg-white/90 transition-all hover:scale-105 disabled:opacity-50 pointer-events-auto border border-white/30" title="我的衣柜">
            <Shirt className="w-[18px] h-[18px] stroke-[1.5] -mt-0.5" />
            <span className="text-[9px] text-[#555] font-normal leading-none mt-1">{wardrobe.length}</span>
          </button>
          <button disabled={isGenerating} onClick={onNavAdd} className="w-12 h-12 bg-black/70 backdrop-blur-md text-white shadow-[0_4px_20px_rgba(0,0,0,0.25)] rounded-full flex items-center justify-center hover:bg-black/90 transition-all hover:scale-105 disabled:opacity-50 pointer-events-auto border border-white/20" title="添加单品">
            <Plus className="w-6 h-6 stroke-[2]" />
          </button>
        </div>

        {/* Generate Button floating at the bottom */}
        <div className="shrink-0 mb-8 mt-2 flex flex-col items-center px-6 z-40 w-full pointer-events-none">
          {result && !isGenerating ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-around w-[90%] max-w-[320px] pointer-events-auto"
            >
              <div className="flex flex-col items-center gap-1.5">
                <button 
                  onClick={handleSaveToHistoryAction}
                  disabled={isSaved}
                  className={`w-14 h-14 backdrop-blur-[6px] border rounded-full flex items-center justify-center transition-all shadow-[0_4px_15px_rgba(0,0,0,0.08)] ${isSaved ? 'bg-black/10 border-white/20 text-[#888] cursor-not-allowed' : 'bg-white/30 border-white/50 text-[#222] hover:bg-white/50 hover:scale-105'}`}
                >
                  <Heart className={`w-6 h-6 stroke-[1.5] ${isSaved ? 'fill-current' : ''}`} />
                </button>
                <span className={`text-[12px] font-medium drop-shadow-lg ${isSaved ? 'text-[#888]' : 'text-[#444]'}`}>{isSaved ? '已收藏' : '收藏'}</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <button 
                  onClick={handleShare}
                  className="w-14 h-14 bg-white/30 backdrop-blur-[6px] border border-white/50 text-[#222] rounded-full flex items-center justify-center hover:bg-white/50 transition-all hover:scale-105 shadow-[0_4px_15px_rgba(0,0,0,0.08)]"
                >
                  <Share className="w-6 h-6 stroke-[1.5]" />
                </button>
                <span className="text-[12px] text-[#444] font-medium drop-shadow-lg">分享</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <button 
                  onClick={handleReset}
                  className="w-14 h-14 bg-white/30 backdrop-blur-[6px] border border-white/50 text-[#222] rounded-full flex items-center justify-center hover:bg-white/50 transition-all hover:scale-105 shadow-[0_4px_15px_rgba(0,0,0,0.08)]"
                >
                  <RotateCcw className="w-6 h-6 stroke-[1.5]" />
                </button>
                <span className="text-[12px] text-[#444] font-medium drop-shadow-lg">重来</span>
              </div>
            </motion.div>
          ) : isFaceSwapping ? (
            <button 
                onClick={handleCancelFaceSwap}
                className="w-[90%] max-w-[280px] rounded-full py-4 text-sm font-medium shadow-[0_8px_30px_rgba(0,0,0,0.1)] flex justify-center items-center gap-2 transition-all pointer-events-auto backdrop-blur-[6px] border bg-red-500/20 border-red-500/30 text-red-600 hover:bg-red-600/30"
              >
                <X className="w-4 h-4" />
                取消
            </button>
          ) : (
            <>
              <button 
                disabled={!isGenerating && wardrobe.length === 0}
                onClick={handleGenerate}
                className={`w-[90%] max-w-[280px] rounded-full py-4 text-sm font-medium shadow-[0_8px_30px_rgba(0,0,0,0.1)] flex justify-center items-center gap-2 disabled:opacity-80 transition-all pointer-events-auto backdrop-blur-[6px] border ${isGenerating ? 'bg-red-500/20 border-red-500/30 text-red-600 hover:bg-red-600/30' : 'bg-white/30 border-white/50 text-[#222] hover:bg-white/50 hover:-translate-y-1 disabled:cursor-not-allowed disabled:hover:translate-y-0'}`}
              >
                {isGenerating ? <X className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
                {isGenerating ? '取消' : '灵感穿搭'}
              </button>
              
              <AnimatePresence>
                {wardrobe.length === 0 && !isGenerating && (
                  <motion.p 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="text-[10px] text-accent text-center mt-3 px-4 py-1.5 bg-white/90 backdrop-blur rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.05)] pointer-events-auto"
                  >
                    你需要先去衣柜添加些衣服才能搭配哦
                  </motion.p>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

      </div>
    </motion.div>
  );
}

// --- History Tab ---
function HistoryTab({ history, onBack, onRemove }: { key?: string, history: HistoryOutfit[], onBack: () => void, onRemove: (id: string) => void }) {
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [isImmersive, setIsImmersive] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [initScrollDone, setInitScrollDone] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current !== null && touchStartY.current !== null) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX.current;
        const deltaY = touchEndY - touchStartY.current;

        if (deltaX > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
          if (fullscreenIndex === null) {
            onBack();
          }
        }
        touchStartX.current = null;
        touchStartY.current = null;
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onBack, fullscreenIndex]);

  // Lock scroll when fullscreen
  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (fullscreenIndex !== null) {
      document.body.style.overflow = 'hidden';
      if (mainEl) mainEl.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (mainEl) mainEl.style.overflow = '';
      setIsImmersive(false); // Reset immersive when closing
      setInitScrollDone(false); // Reset init flag so next time it opens, it snaps to correct spot
    }
    return () => {
      document.body.style.overflow = '';
      if (mainEl) mainEl.style.overflow = '';
    };
  }, [fullscreenIndex]);

  // Initial scroll to the selected item MUST be instant
  useEffect(() => {
    if (fullscreenIndex !== null && scrollRef.current && !initScrollDone) {
      const el = scrollRef.current;
      
      // Temporarily remove snapping classes to avoid the slow snap animation
      el.classList.remove('snap-x', 'snap-mandatory');
      el.style.scrollBehavior = 'auto';
      
      el.scrollLeft = fullscreenIndex * el.clientWidth;
      
      // Force repaint
      void el.offsetHeight;
      
      // Restore snapping and smooth behavior for user interactions
      el.classList.add('snap-x', 'snap-mandatory');
      el.style.scrollBehavior = '';
      
      setInitScrollDone(true);
    }
  }, [fullscreenIndex, initScrollDone]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!scrollRef.current || !initScrollDone) return;
    const clientWidth = scrollRef.current.clientWidth;
    const scrollLeft = scrollRef.current.scrollLeft;
    const newIdx = Math.round(scrollLeft / clientWidth);
    if (newIdx !== fullscreenIndex && newIdx >= 0 && newIdx < history.length) {
      setFullscreenIndex(newIdx);
    }
  };

  const handleArrowClick = (e: React.MouseEvent, direction: 'prev' | 'next') => {
    e.stopPropagation();
    if (!scrollRef.current || fullscreenIndex === null) return;
    
    const newIdx = direction === 'next' ? fullscreenIndex + 1 : fullscreenIndex - 1;
    if (newIdx >= 0 && newIdx < history.length) {
       setFullscreenIndex(newIdx); // State update
       scrollRef.current.scrollTo({ left: newIdx * scrollRef.current.clientWidth, behavior: 'smooth' }); // Visual update
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col h-full bg-surface"
    >
      <AnimatePresence>
        {fullscreenIndex !== null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={1}
            onDragEnd={(e, { offset }) => {
              if (offset.y > 50) {
                setFullscreenIndex(null);
              }
            }}
          >
            <div 
              ref={scrollRef}
              onScroll={handleScroll}
              className="snap-slider flex w-full h-[100dvh] overflow-x-auto overflow-y-hidden snap-x snap-mandatory custom-scrollbar"
              style={{ touchAction: 'pan-x', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <style dangerouslySetInnerHTML={{__html: `.snap-slider::-webkit-scrollbar { display: none; }`}} />
              
              {history.map((item) => (
                <div key={item.id} className="w-screen h-full shrink-0 snap-center relative pointer-events-auto">
                  <img 
                    src={item.imageUrl} 
                    alt="History Outfit Fullscreen" 
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setIsImmersive(!isImmersive)}
                    draggable={false}
                  />
                </div>
              ))}
            </div>

            {/* Header: Back Button & Status Overlay */}
            <AnimatePresence>
              {!isImmersive && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-[calc(env(safe-area-inset-top,0px)+24px)] left-0 right-0 z-50 px-4 flex items-center justify-center pointer-events-none"
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); setFullscreenIndex(null); }}
                    className="absolute left-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md text-white/90 hover:bg-black/40 transition-colors pointer-events-auto"
                  >
                    <ChevronLeft className="w-6 h-6 mr-0.5" />
                  </button>

                  <div className="flex flex-col items-center justify-center gap-0.5 bg-black/20 backdrop-blur-md px-5 py-1.5 rounded-2xl relative mt-2">
                    <div className="text-white/90 text-[10px] font-medium tracking-widest flex items-center justify-center gap-1.5">
                       <span>{new Date(history[fullscreenIndex].createdAt).toLocaleDateString().replace(/\//g, '-')}</span>
                       <span>·</span>
                       <span>{history[fullscreenIndex].weather}</span>
                    </div>
                    <div className="text-white text-[13px] font-medium tracking-wide">
                       {history[fullscreenIndex].scenario}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation Arrows */}
            <AnimatePresence>
            {!isImmersive && fullscreenIndex > 0 && (
              <motion.button 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={(e) => handleArrowClick(e, 'prev')}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 text-white/60 hover:text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] transition-colors z-50 pointer-events-auto"
              >
                <ChevronLeft className="w-10 h-10 stroke-[1.5]" />
              </motion.button>
            )}
            </AnimatePresence>
            
            <AnimatePresence>
            {!isImmersive && fullscreenIndex < history.length - 1 && (
              <motion.button 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={(e) => handleArrowClick(e, 'next')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-white/60 hover:text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] transition-colors z-50 pointer-events-auto"
              >
                <ChevronRight className="w-10 h-10 stroke-[1.5]" />
              </motion.button>
            )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-4 shrink-0">
        <button onClick={onBack} className="text-[#999] hover:text-primary p-1.5 -ml-1.5 rounded-full hover:bg-black/5 transition-colors shrink-0">
          <ChevronLeft className="w-5 h-5"/>
        </button>
        <h2 className="text-lg font-normal tracking-tight text-primary">我的收藏</h2>
        <div className="w-8 shrink-0" /> {/* Spacer */}
      </div>

      <div className="flex-1 overflow-y-auto pb-8 custom-scrollbar">
        {history.length === 0 ? (
            <div className="pt-20 flex flex-col items-center justify-center text-center px-6">
              <div className="w-24 h-24 bg-accent-light rounded-full flex items-center justify-center mb-4">
                <Heart className="w-10 h-10 text-[#999]" />
              </div>
              <p className="text-sm text-[#999]">暂无收藏穿搭<br/><span className="text-xs text-[#bbb] mt-1 block">在灵感界面点击收藏即可收集</span></p>
            </div>
        ) : (
            <div className="grid grid-cols-2 gap-3 pb-safe">
              <AnimatePresence mode="popLayout">
                {history.map((item, index) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                    key={item.id} 
                    className="bg-white rounded-xl overflow-hidden flex flex-col group shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-black/5 cursor-pointer hover:shadow-md transition-shadow relative"
                    onClick={() => setFullscreenIndex(index)}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(item.id);
                        if (fullscreenIndex !== null && fullscreenIndex === index) {
                           setFullscreenIndex(null);
                        }
                      }}
                      className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-auto drop-shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none z-10">
                      <span className="text-[9px] font-medium tracking-wider text-white">{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="aspect-[9/16] relative bg-gray-100 overflow-hidden">
                      <img src={item.imageUrl} alt="Outfit" className="w-full h-full object-cover" />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
        )}
      </div>
    </motion.div>
  );
}

