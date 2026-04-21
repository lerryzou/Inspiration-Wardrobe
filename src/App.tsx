import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, Shirt, Wand2, Trash2, X, RefreshCw, UploadCloud, ChevronRight, MessageCircle, ChevronLeft, Download, Share, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { get, set } from 'idb-keyval';
import { Category, WardrobeItem, OutfitRecommendation } from './types';
import { analyzeSingleClothingItem, generateOutfit, enhanceClothingImage, generateVirtualTryOn, processSingleItemImage } from './services/ai';
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
  const [activeTab, setActiveTab] = useState<'wardrobe' | 'add' | 'inspiration'>('inspiration');
  const [previousTab, setPreviousTab] = useState<'wardrobe' | 'inspiration'>('inspiration');
  const [wardrobe, setWardrobe, isLoaded] = useIDBStorage<WardrobeItem[]>('linggan_wardrobe', []);
  
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

  return (
    <div className="max-w-md mx-auto h-[100dvh] overflow-hidden bg-surface flex flex-col relative sm:border sm:border-border-custom mt-0 sm:mt-8 sm:h-[90vh]">
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
            <InspirationTab key="inspiration" wardrobe={wardrobe} onNavAdd={() => goToAdd('inspiration')} onNavWardrobe={() => setActiveTab('wardrobe')} />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Wardrobe Tab ---
function WardrobeTab({ wardrobe, onRemove, onBack, onNavAdd }: { key?: string, wardrobe: WardrobeItem[], onRemove: (id: string) => void, onBack: () => void, onNavAdd: () => void }) {
  const categories: Category[] = ['上装', '下装', '连衣裙', '鞋子', '包包', '配饰'];

  const [filter, setFilter] = useState<Category | '全部'>('全部');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const displayedWardrobe = filter === '全部' 
    ? wardrobe 
    : wardrobe.filter(item => item.category === filter);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="pb-8"
    >
      <AnimatePresence>
        {fullscreenImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFullscreenImage(null)}
            className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 cursor-pointer"
          >
            <motion.img 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={fullscreenImage} 
              alt="Full screen clothing item" 
              className="max-w-full max-h-[85vh] object-contain rounded-lg drop-shadow-2xl" 
            />
            <p className="text-white/60 text-sm mt-6 mb-safe tracking-widest uppercase">点击任意处关闭</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-1">
        <button onClick={onBack} className="text-[#999] hover:text-primary p-1.5 -ml-1.5 rounded-full hover:bg-black/5 transition-colors">
          <ChevronLeft className="w-5 h-5"/>
        </button>
        <h2 className="text-lg font-normal tracking-tight text-primary">我的衣柜</h2>
        <button onClick={onNavAdd} className="text-[#999] hover:text-primary p-1.5 -mr-1.5 rounded-full hover:bg-black/5 transition-colors">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-10 bg-surface flex gap-1.5 overflow-x-auto pt-2 pb-2 -mx-6 px-6 mb-4 scrollbar-hide">
        <button
          onClick={() => setFilter('全部')}
          className={`shrink-0 px-3 py-1 rounded-[20px] text-[12px] transition-colors ${filter === '全部' ? 'bg-accent text-white' : 'bg-accent-light text-primary'}`}
        >
          全部
        </button>
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`shrink-0 px-3 py-1 rounded-[20px] text-[12px] transition-colors ${filter === c ? 'bg-accent text-white' : 'bg-accent-light text-primary'}`}
          >
            {c}
          </button>
        ))}
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
                className="bg-surface rounded-xl overflow-hidden flex flex-col group relative"
              >
                <div 
                  className="aspect-[3/4] relative bg-border-custom rounded-md mx-1.5 mt-1.5 flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => setFullscreenImage(item.imageUrl)}
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
                  <h4 className="text-[13px] font-medium text-primary line-clamp-1 mb-0.5" title={item.name}>{item.name.toUpperCase()}</h4>
                  <p className="text-[11px] text-[#999] mb-1.5">{item.category} / {item.color}</p>
                  {item.styleTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 justify-center">
                      {item.styleTags.slice(0, 2).map((tag, i) => (
                        <span key={i} className="text-[9px] bg-accent-pale text-accent px-1.5 py-0.5 rounded-[3px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
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
        <div className="flex flex-col gap-4 flex-1 justify-center max-w-sm mx-auto w-full">
          <div 
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.removeAttribute('capture');
                fileInputRef.current.setAttribute('capture', 'environment');
                fileInputRef.current.click();
              }
            }}
            className="flex-1 bg-white border border-border-custom rounded-3xl p-6 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-primary hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all group"
          >
            <div className="w-16 h-16 bg-[#fafafa] group-hover:bg-accent/10 rounded-full flex items-center justify-center transition-colors">
              <Camera className="w-8 h-8 text-[#555] group-hover:text-accent transition-colors" />
            </div>
            <div className="text-center">
              <p className="font-medium text-[15px] mb-1.5 text-primary">拍照</p>
              <p className="text-[11px] text-[#999]">让 AI 自动识别单品</p>
            </div>
          </div>
          
          <div 
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.removeAttribute('capture');
                fileInputRef.current.click();
              }
            }}
            className="flex-1 bg-white border border-border-custom rounded-3xl p-6 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-primary hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all group"
          >
            <div className="w-16 h-16 bg-[#fafafa] group-hover:bg-accent/10 rounded-full flex items-center justify-center transition-colors">
              <UploadCloud className="w-8 h-8 text-[#555] group-hover:text-accent transition-colors" />
            </div>
            <div className="text-center">
              <p className="font-medium text-[15px] mb-1.5 text-primary">从相册上传</p>
              <p className="text-[11px] text-[#999]">挑选已有的照片</p>
            </div>
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

              <div className="bg-white p-4 rounded-[16px] border border-border-custom relative shadow-[0_10px_30px_rgba(0,0,0,0.03)] flex items-center gap-4">
                <div className="flex-1">
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

// --- Inspiration Tab ---
function InspirationTab({ wardrobe, onNavAdd, onNavWardrobe }: { key?: string, wardrobe: WardrobeItem[], onNavAdd: () => void, onNavWardrobe: () => void }) {
  const [scenario, setScenario] = useState('日常通勤上课');
  const [weather, setWeather] = useState('晴，18～25 度');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCanceled, setIsCanceled] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ title: string, description: string, itemIds: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReason, setShowReason] = useState(false);

  const [tryOnImage, setTryOnImage] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const getBase64FromImage = (imgEl: HTMLImageElement): string | null => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = imgEl.naturalWidth || imgEl.width;
      canvas.height = imgEl.naturalHeight || imgEl.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(imgEl, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.95);
    } catch (e) {
      console.error("Canvas draw error:", e);
      return null;
    }
  };

  const handleReset = () => {
    setResult(null);
    setTryOnImage(null);
    setShowReason(false);
    setError(null);
  };

  const handleDownload = () => {
    if (!tryOnImage) return;
    const a = document.createElement("a");
    a.href = tryOnImage;
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
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsGenerating(false);
      setIsCanceled(true);
      return;
    }

    try {
      setIsGenerating(true);
      setIsCanceled(false);
      setError(null);
      setTryOnImage(null);
      setShowReason(false);
      
      const res = await generateOutfit(wardrobe, scenario, weather);
      if (isCanceled) return;

      setResult(res);

      if (res.itemIds && res.itemIds.length > 0 && imgRef.current) {
        const base64Data = getBase64FromImage(imgRef.current);
        if (base64Data) {
          const selectedItems = res.itemIds
            .map(id => wardrobe.find(w => w.id === id))
            .filter(Boolean) as WardrobeItem[];
          
          const outfitDesc = selectedItems
            .map(item => `${item.color}颜色的${item.styleTags.join('')}${item.name}`)
            .join('，搭配');
            
          const garmentUrls = selectedItems.map(item => item.imageUrl);
          const tryOnB64 = await generateVirtualTryOn(base64Data, outfitDesc, garmentUrls);
          if (isCanceled) return;
          setTryOnImage(tryOnB64);
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        setError(err instanceof Error ? err.message : "生成失败，可能是衣柜衣服不够多或网络问题");
      }
    } finally {
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
        src={tryOnImage || "/model_uploaded.jpg"}
        alt="Asian Girl Display Model"
        className="absolute inset-0 w-full h-full object-cover transition-all duration-700 z-0"
        crossOrigin="anonymous"
        onError={(e) => {
          if (!tryOnImage) {
            e.currentTarget.src = "https://image.pollinations.ai/prompt/A%20short-haired%20Asian%20girl%20standing%20full%20body,%20wearing%20a%20basic%20white%20short-sleeve%20t-shirt,%20white%20shorts,%20and%20white%20sneakers.%20Simple%20studio%20lighting,%20pure%20white%20background,%20clean,%20fashion%20display%20model?width=400&height=700&seed=152&nologo=true";
          }
        }}
      />
      
      {/* Optional Top Gradient for better text readability */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/10 to-transparent z-0 pointer-events-none" />

      {/* Floating Content wrapper */}
      <div className="relative z-10 flex flex-col h-full">

        {/* Top: Inputs floating over image */}
        <div className="flex space-x-3 px-6 pt-6 shrink-0 z-20 pointer-events-none">
          <div className="flex-1 pointer-events-auto">
            <input 
              type="text" 
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="场景：日常通勤上课"
              className="w-full bg-white/20 backdrop-blur-[6px] border border-white/40 text-center py-2 px-3 rounded-full text-xs text-[#222] font-medium shadow-[0_4px_15px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-[#555] transition-all focus:bg-white/40 hover:bg-white/30"
            />
          </div>
          <div className="flex-1 pointer-events-auto">
            <input 
              type="text" 
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              placeholder="天气：晴，18～25度"
              className="w-full bg-white/20 backdrop-blur-[6px] border border-white/40 text-center py-2 px-3 rounded-full text-xs text-[#222] font-medium shadow-[0_4px_15px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-[#555] transition-all focus:bg-white/40 hover:bg-white/30"
            />
          </div>
        </div>

        {error && !isCanceled && (
          <div className="mx-6 mt-3 bg-red-50/90 backdrop-blur-md text-red-600 p-2 rounded-lg text-xs text-center shrink-0 shadow-sm border border-red-100">
            {error}
          </div>
        )}

        {/* Middle Space (Empty, Model visible) */}
        <div className="flex-1 relative" />

        {isGenerating && (
          <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-primary animate-spin drop-shadow-md" />
            <p className="text-sm font-medium text-primary tracking-widest uppercase drop-shadow-md">
              {result ? '正在生成试穿效果图...' : '寻找穿搭灵感中...'}
            </p>
          </div>
        )}

        {result && resultItems && resultItems.length > 0 && !isGenerating && (
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
                  className="absolute top-[12%] left-6 right-6 bg-white/95 backdrop-blur-md p-6 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.12)] border border-white pointer-events-auto z-30"
                >
                  <button 
                    onClick={() => setShowReason(false)}
                    className="absolute top-4 right-4 text-[#999] hover:text-[#333] transition-colors p-1 bg-black/5 rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <h3 className="text-base font-bold text-primary mb-2 pr-6">{result.title}</h3>
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
                    className="relative bg-white/95 backdrop-blur shadow-[0_4px_20px_rgba(0,0,0,0.15)] p-3 rounded-full text-primary hover:bg-white transition-all hover:scale-110"
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
        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-5 z-20 pointer-events-none">
          <button onClick={onNavWardrobe} className="w-12 h-12 bg-white/70 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.15)] rounded-full flex items-center justify-center text-primary hover:bg-white/90 transition-all hover:scale-105 pointer-events-auto border border-white/30" title="我的衣柜">
            <Shirt className="w-5 h-5 stroke-[1.5]" />
          </button>
          <button onClick={onNavAdd} className="w-12 h-12 bg-black/70 backdrop-blur-md text-white shadow-[0_4px_20px_rgba(0,0,0,0.25)] rounded-full flex items-center justify-center hover:bg-black/90 transition-all hover:scale-105 pointer-events-auto border border-white/20" title="添加单品">
            <Plus className="w-6 h-6 stroke-[2]" />
          </button>
        </div>

        {/* Generate Button floating at the bottom */}
        <div className="shrink-0 mb-8 mt-2 flex flex-col items-center px-6 z-20 w-full">
          {result && !isGenerating ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-around w-[90%] max-w-[320px] pointer-events-auto"
            >
              <div className="flex flex-col items-center gap-1.5">
                <button 
                  onClick={handleDownload}
                  className="w-14 h-14 bg-white/30 backdrop-blur-[6px] border border-white/50 text-[#222] rounded-full flex items-center justify-center hover:bg-white/50 transition-all hover:scale-105 shadow-[0_4px_15px_rgba(0,0,0,0.08)]"
                >
                  <Download className="w-6 h-6 stroke-[1.5]" />
                </button>
                <span className="text-[12px] text-[#444] font-medium drop-shadow-lg">下载</span>
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

