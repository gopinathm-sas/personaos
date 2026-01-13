
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MealType, FoodEntry, UserStats } from './types';
import { ProgressRing } from './components/ProgressRing';
import { analyzeFoodImage } from './services/geminiService';

// --- Haptic Feedback Utility ---
const haptic = {
  light: () => {
    if ('vibrate' in navigator) navigator.vibrate(10);
  },
  medium: () => {
    if ('vibrate' in navigator) navigator.vibrate(20);
  },
  success: () => {
    if ('vibrate' in navigator) navigator.vibrate([15, 30, 15]);
  },
  warning: () => {
    if ('vibrate' in navigator) navigator.vibrate([30, 50, 30, 50]);
  }
};

// --- Mock Data ---
const INITIAL_STATS: UserStats = {
  dailyCalorieGoal: 2400,
  dailyStepGoal: 10000,
  currentSteps: 7432,
  waterIntakeOz: 48
};

const WATER_GOAL = 80; // Default goal in oz

const INITIAL_FOODS: FoodEntry[] = [
  { id: '1', name: 'Greek Yogurt w/ Berries', calories: 280, protein: 22, carbs: 18, fat: 4, timestamp: Date.now() - 14400000, mealType: MealType.BREAKFAST },
  { id: '2', name: 'Black Coffee', calories: 5, protein: 0, carbs: 0, fat: 0, timestamp: Date.now() - 10800000, mealType: MealType.BREAKFAST },
];

// --- Native iOS-style Components ---

const Header: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <header className="px-5 pt-14 pb-4 select-none">
    <p className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wide mb-0.5">{subtitle}</p>
    <h1 className="text-[34px] font-extrabold tracking-tight text-black">{title}</h1>
  </header>
);

const SummaryCard: React.FC<{ icon: string; title: string; value: string; color: string; onClick?: () => void }> = ({ icon, title, value, color, onClick }) => (
  <div 
    onClick={() => {
      haptic.light();
      onClick?.();
    }}
    className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-black/5 flex items-center gap-4 active:scale-95 transition-transform duration-200 cursor-pointer"
  >
    <div className={`w-11 h-11 rounded-[10px] flex items-center justify-center text-white text-lg`} style={{ backgroundColor: color }}>
      <i className={`fa-solid ${icon}`}></i>
    </div>
    <div>
      <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-tight leading-none mb-1">{title}</p>
      <p className="text-[19px] font-bold tracking-tight">{value}</p>
    </div>
  </div>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'health' | 'food' | 'stats'>('health');
  const [foods, setFoods] = useState<FoodEntry[]>(INITIAL_FOODS);
  const [stats, setStats] = useState<UserStats>(INITIAL_STATS);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingFood, setPendingFood] = useState<Partial<FoodEntry> | null>(null);
  const [isWaterModalOpen, setIsWaterModalOpen] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const totalCalories = foods.reduce((acc, f) => acc + f.calories, 0);
  const calorieProgress = Math.min(totalCalories / stats.dailyCalorieGoal, 1);
  const waterProgress = Math.min(stats.waterIntakeOz / WATER_GOAL, 1);
  const getMealTotal = (type: MealType) => foods.filter(f => f.mealType === type).reduce((acc, f) => acc + f.calories, 0);

  const startCamera = async () => {
    haptic.medium();
    setIsScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error("Camera access denied", err);
      setIsScanning(false);
      haptic.warning();
    }
  };

  const stopCamera = () => {
    haptic.light();
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
    setIsScanning(false);
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    haptic.medium();
    setIsProcessing(true);
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg').split(',')[1];
    
    const result = await analyzeFoodImage(base64);
    if (result) {
      haptic.success();
      setPendingFood({
        name: result.name,
        calories: result.calories,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
      });
      stopCamera();
    } else {
      haptic.warning();
    }
    setIsProcessing(false);
  };

  const finalizeEntry = (selectedMealType: MealType) => {
    if (!pendingFood) return;
    haptic.success();
    const newEntry: FoodEntry = {
      id: Math.random().toString(36).substring(2, 11),
      name: pendingFood.name || 'Unknown Item',
      calories: pendingFood.calories || 0,
      protein: pendingFood.protein || 0,
      carbs: pendingFood.carbs || 0,
      fat: pendingFood.fat || 0,
      timestamp: Date.now(),
      mealType: selectedMealType
    };
    setFoods(prev => [newEntry, ...prev]);
    setPendingFood(null);
    setActiveTab('food');
  };

  const logWater = (oz: number) => {
    haptic.medium();
    setStats(prev => ({
      ...prev,
      waterIntakeOz: prev.waterIntakeOz + oz
    }));
    if (stats.waterIntakeOz + oz >= WATER_GOAL && stats.waterIntakeOz < WATER_GOAL) {
      haptic.success();
    }
  };

  const handleTabChange = (tab: 'health' | 'food' | 'stats') => {
    if (tab !== activeTab) {
      haptic.light();
      setActiveTab(tab);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-[#F2F2F7] relative overflow-hidden select-none">
      <div className="flex-1 overflow-y-auto hide-scrollbar pb-32">
        {activeTab === 'health' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <Header title="Health" subtitle="Thursday, May 15" />
            <div className="px-5 space-y-6">
              <div className="bg-white rounded-[28px] p-8 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-black/5 flex flex-col items-center">
                <ProgressRing 
                  progress={calorieProgress} 
                  label={totalCalories.toString()} 
                  subLabel="Calories" 
                  size={190}
                />
                <div className="mt-8 grid grid-cols-3 gap-8 w-full">
                   <div className="text-center">
                     <p className="text-[11px] font-bold text-[#8E8E93] uppercase mb-1">Move</p>
                     <p className="text-xl font-black text-[#FF2D55]">{stats.currentSteps}</p>
                   </div>
                   <div className="text-center">
                     <p className="text-[11px] font-bold text-[#8E8E93] uppercase mb-1">Exercise</p>
                     <p className="text-xl font-black text-[#32D74B]">42m</p>
                   </div>
                   <div className="text-center">
                     <p className="text-[11px] font-bold text-[#8E8E93] uppercase mb-1">Stand</p>
                     <p className="text-xl font-black text-[#007AFF]">11h</p>
                   </div>
                </div>
              </div>

              <div className="bg-white rounded-[24px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-black/5">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-[20px] font-bold tracking-tight">Daily Energy</h3>
                  <span className="text-[14px] font-semibold text-[#8E8E93]">{totalCalories} kcal</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {Object.values(MealType).map(type => (
                        <div key={type} className="p-3.5 bg-[#F9F9F9] rounded-[18px] border border-black/[0.02]">
                            <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-0.5">{type}</p>
                            <p className="text-[17px] font-bold text-black">{getMealTotal(type)} <span className="text-[12px] font-medium text-[#8E8E93]">cal</span></p>
                        </div>
                    ))}
                </div>
                <button 
                  onClick={() => { haptic.light(); setActiveTab('food'); }}
                  className="w-full mt-5 py-3.5 bg-[#007AFF]/10 rounded-[16px] text-[#007AFF] font-bold text-[15px] active:scale-[0.98] transition-all"
                >
                  Show Nutritional Details
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-4">
                <SummaryCard icon="fa-shoe-prints" title="Steps" value={stats.currentSteps.toLocaleString()} color="#FF9500" />
                <SummaryCard 
                  icon="fa-droplet" 
                  title="Hydration" 
                  value={`${stats.waterIntakeOz} / ${WATER_GOAL} oz`} 
                  color="#64D2FF" 
                  onClick={() => setIsWaterModalOpen(true)}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'food' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <Header title="Log" subtitle="Today" />
            <div className="px-5 space-y-4">
              <div className="flex gap-2.5 overflow-x-auto hide-scrollbar pb-1">
                {['All', 'Breakfast', 'Lunch', 'Dinner', 'Snacks'].map(tab => (
                  <button 
                    key={tab} 
                    onClick={() => haptic.light()}
                    className="px-5 py-2 bg-white rounded-full text-[14px] font-bold shadow-[0_2px_4px_rgba(0,0,0,0.02)] border border-black/5 active:bg-gray-100 transition-colors whitespace-nowrap"
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="space-y-3.5">
                {foods.length === 0 ? (
                    <div className="py-20 text-center text-[#C7C7CC]">
                        <i className="fa-solid fa-cookie-bite text-5xl mb-5 opacity-30"></i>
                        <p className="text-[17px] font-medium">Your food log is empty</p>
                    </div>
                ) : (
                    foods.map(food => (
                        <div 
                          key={food.id} 
                          onClick={() => haptic.light()}
                          className="bg-white rounded-[22px] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-black/5 flex justify-between items-center active:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <div className="flex gap-4 items-center">
                            <div className="w-11 h-11 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#8E8E93] text-lg">
                                <i className={`fa-solid ${food.mealType === MealType.BREAKFAST ? 'fa-sun' : food.mealType === MealType.LUNCH ? 'fa-cloud-sun' : food.mealType === MealType.DINNER ? 'fa-moon' : 'fa-cookie-bite'}`}></i>
                            </div>
                            <div>
                                <p className="font-bold text-[17px] tracking-tight leading-none mb-1.5">{food.name}</p>
                                <p className="text-[13px] text-[#8E8E93] font-semibold">{food.mealType} • {new Date(food.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-[19px] tracking-tight leading-none text-black">{food.calories}</p>
                            <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-tighter">kcal</p>
                          </div>
                        </div>
                      ))
                )}
              </div>

              <button 
                onClick={startCamera}
                className="w-full mt-8 py-5 bg-[#007AFF] text-white rounded-[20px] font-bold text-[17px] shadow-[0_8px_24px_rgba(0,122,255,0.25)] active:scale-95 transition-all"
              >
                <i className="fa-solid fa-camera mr-2.5"></i> Scan with Gemini AI
              </button>
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <Header title="Summary" subtitle="Insights" />
            <div className="px-5">
              <div className="bg-white rounded-[24px] p-8 shadow-sm border border-black/5 text-center">
                 <div className="w-16 h-16 bg-[#F2F2F7] rounded-full flex items-center justify-center mx-auto mb-5">
                    <i className="fa-solid fa-chart-bar text-2xl text-[#C7C7CC]"></i>
                 </div>
                 <h3 className="text-[20px] font-bold mb-2 tracking-tight">Trends Coming Soon</h3>
                 <p className="text-[#8E8E93] text-[15px] font-medium leading-relaxed">PersonaOS is building a deep analytics engine for your long-term health trends.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Water Intake Modal */}
      {isWaterModalOpen && (
          <div className="fixed inset-0 z-[160] flex items-end justify-center px-2 pb-10 sm:pb-5">
              <div className="fixed inset-0 bg-black/40 backdrop-blur-md animate-in fade-in duration-300" onClick={() => { haptic.light(); setIsWaterModalOpen(false); }}></div>
              <div className="w-full max-w-md bg-white/95 backdrop-blur-2xl rounded-[32px] p-6 shadow-2xl border border-white/20 animate-in slide-in-from-bottom-[100%] duration-500 cubic-bezier(0.175, 0.885, 0.32, 1.275)">
                  <div className="w-10 h-1.5 bg-black/10 rounded-full mx-auto mb-6"></div>
                  
                  <div className="flex flex-col items-center mb-8">
                      <div className="relative mb-6">
                        <ProgressRing 
                          progress={waterProgress} 
                          label={stats.waterIntakeOz.toString()} 
                          subLabel="oz" 
                          size={160}
                          color="#007AFF"
                        />
                        <div className="absolute -top-2 -right-2 bg-[#007AFF] text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                           <i className="fa-solid fa-droplet text-xs"></i>
                        </div>
                      </div>
                      <h2 className="text-[24px] font-extrabold tracking-tight">Hydration Log</h2>
                      <p className="text-[#8E8E93] text-[14px] font-semibold mt-1">Goal: {WATER_GOAL} oz daily</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-6">
                      {[8, 12, 16, 24, 32].map((oz) => (
                          <button
                            key={oz}
                            onClick={() => logWater(oz)}
                            className="py-4 rounded-[20px] bg-[#F2F2F7] border border-black/[0.03] font-bold text-black active:scale-[0.94] active:bg-[#E5E5EA] transition-all flex flex-col items-center gap-1 group"
                          >
                              <span className="text-[18px] text-[#007AFF] group-active:scale-125 transition-transform">+{oz}</span>
                              <span className="text-[10px] font-bold text-[#8E8E93] uppercase">oz</span>
                          </button>
                      ))}
                      <button
                        onClick={() => { haptic.warning(); setStats(prev => ({...prev, waterIntakeOz: 0})) }}
                        className="py-4 rounded-[20px] bg-red-50 border border-red-100 font-bold text-[#FF3B30] active:scale-[0.94] transition-all flex flex-col items-center justify-center"
                      >
                          <i className="fa-solid fa-rotate-left text-sm mb-1"></i>
                          <span className="text-[10px] font-bold uppercase">Reset</span>
                      </button>
                  </div>

                  <button 
                    onClick={() => { haptic.light(); setIsWaterModalOpen(false); }}
                    className="w-full py-4.5 bg-[#007AFF] text-white font-bold text-[17px] rounded-[18px] shadow-lg shadow-blue-500/20 active:scale-95 transition-transform"
                  >
                      Done
                  </button>
              </div>
          </div>
      )}

      {/* iOS-Style Bottom Sheet Action Sheet */}
      {pendingFood && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center px-2 pb-10 sm:pb-5">
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => { haptic.light(); setPendingFood(null); }}></div>
              <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-[30px] p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border border-white/20 animate-in slide-in-from-bottom-[100%] duration-500 cubic-bezier(0.175, 0.885, 0.32, 1.275)">
                  <div className="w-10 h-1.5 bg-black/10 rounded-full mx-auto mb-5"></div>
                  <div className="text-center mb-6">
                    <h2 className="text-[22px] font-bold tracking-tight mb-1">Categorize Food</h2>
                    <p className="text-[#8E8E93] text-[14px] font-semibold">Gemini identified: <span className="text-black">{pendingFood.name}</span></p>
                  </div>
                  
                  <div className="bg-black/5 rounded-[22px] p-4 mb-6 flex justify-between items-center border border-black/[0.03]">
                      <div className="flex items-center gap-3">
                         <div className="w-1.5 h-10 bg-[#FF2D55] rounded-full"></div>
                         <div>
                            <p className="font-bold text-[17px]">{pendingFood.name}</p>
                            <p className="text-[12px] font-bold text-[#8E8E93] uppercase">Nutrition Estimate</p>
                         </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-[24px] text-black tracking-tighter leading-none">{pendingFood.calories}</p>
                        <p className="text-[11px] font-bold text-[#8E8E93] uppercase">kcal</p>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      {Object.values(MealType).map((type) => (
                          <button
                            key={type}
                            onClick={() => finalizeEntry(type)}
                            className="py-4.5 rounded-[18px] bg-white border border-black/5 shadow-sm font-bold text-black active:scale-[0.96] active:bg-gray-50 transition-all flex flex-col items-center gap-2 group"
                          >
                              <i className={`fa-solid ${type === MealType.BREAKFAST ? 'fa-sun text-[#FF9500]' : type === MealType.LUNCH ? 'fa-cloud-sun text-[#5856D6]' : type === MealType.DINNER ? 'fa-moon text-[#007AFF]' : 'fa-cookie-bite text-[#FF2D55]'} text-xl group-active:scale-125 transition-transform`}></i>
                              <span className="text-[15px]">{type}</span>
                          </button>
                      ))}
                  </div>

                  <button 
                    onClick={() => { haptic.light(); setPendingFood(null); }}
                    className="w-full mt-6 py-4 text-[#FF3B30] font-bold text-[17px] active:scale-95 transition-transform"
                  >
                      Discard
                  </button>
              </div>
          </div>
      )}

      {/* Camera Fullscreen Overlay */}
      {isScanning && (
        <div className="fixed inset-0 z-[150] bg-black animate-in fade-in duration-300">
          <div className="h-full relative flex flex-col">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent pointer-events-none"></div>
            <div className="absolute inset-x-0 bottom-0 h-60 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>

            <div className="absolute top-14 left-0 right-0 px-5 flex justify-between items-center">
              <button onClick={stopCamera} className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center active:scale-90 transition-transform">
                <i className="fa-solid fa-chevron-down"></i>
              </button>
              <div className="px-5 py-2 bg-white/10 backdrop-blur-md text-white rounded-full text-[13px] font-bold uppercase tracking-wider border border-white/20">
                Visual Analysis
              </div>
              <div className="w-11" />
            </div>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 border border-white/40 rounded-[40px] flex items-center justify-center pointer-events-none">
                <div className="w-full h-0.5 bg-white/20 animate-pulse"></div>
            </div>

            {isProcessing && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] flex flex-col items-center justify-center text-white p-10 text-center animate-in fade-in zoom-in duration-300">
                <div className="w-14 h-14 border-[5px] border-[#007AFF] border-t-transparent rounded-full animate-spin mb-6" />
                <h3 className="text-2xl font-black italic tracking-tight mb-2">Gemini AI Engine</h3>
                <p className="text-white/60 text-[15px] font-medium">Extracting nutritional data from frame...</p>
              </div>
            )}

            <div className="absolute bottom-16 left-0 right-0 flex items-center justify-center">
              <button 
                disabled={isProcessing}
                onClick={captureAndAnalyze}
                className="group relative flex items-center justify-center disabled:opacity-50"
              >
                <div className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform">
                  <div className="w-[66px] h-[66px] rounded-full bg-white group-active:scale-95 transition-transform" />
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Tab Bar (Glassmorphism) */}
      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/85 backdrop-blur-xl border-t border-black/[0.05] flex items-center justify-around px-6 pb-6 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
        {[
          { id: 'health', icon: 'fa-heart-pulse', label: 'Summary' },
          { id: 'food', icon: 'fa-plate-wheat', label: 'Nutrients' },
          { id: 'stats', icon: 'fa-chart-pie', label: 'Trends' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => handleTabChange(tab.id as any)}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === tab.id ? 'text-[#007AFF] scale-105' : 'text-[#8E8E93] active:scale-95'}`}
          >
            <i className={`fa-solid ${tab.icon} text-[22px]`}></i>
            <span className="text-[10px] font-bold uppercase tracking-tight">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
