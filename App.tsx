
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

const WATER_GOAL = 80;

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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error("Camera access denied", err);
      setIsScanning(false);
      haptic.warning();
      alert("Camera access is required for scanning food.");
    }
  };

  const stopCamera = () => {
    haptic.light();
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    haptic.medium();
    setIsProcessing(true);
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // Set canvas dimensions to video actual size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      
      const result = await analyzeFoodImage(base64);
      if (result && result.name) {
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
        alert("Could not identify food. Please try again with a clearer shot.");
      }
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
              </div>

              <div className="grid grid-cols-2 gap-4 pb-4">
                <SummaryCard icon="fa-shoe-prints" title="Steps" value={stats.currentSteps.toLocaleString()} color="#FF9500" />
                <SummaryCard 
                  icon="fa-droplet" 
                  title="Hydration" 
                  value={`${stats.waterIntakeOz} oz`} 
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
                  <button key={tab} className="px-5 py-2 bg-white rounded-full text-[14px] font-bold shadow-sm border border-black/5 active:bg-gray-100 transition-colors whitespace-nowrap">
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
                        <div key={food.id} className="bg-white rounded-[22px] p-4 shadow-sm border border-black/5 flex justify-between items-center active:bg-gray-50 transition-colors">
                          <div className="flex gap-4 items-center">
                            <div className="w-11 h-11 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#8E8E93] text-lg">
                                <i className={`fa-solid ${food.mealType === MealType.BREAKFAST ? 'fa-sun' : food.mealType === MealType.LUNCH ? 'fa-cloud-sun' : food.mealType === MealType.DINNER ? 'fa-moon' : 'fa-cookie-bite'}`}></i>
                            </div>
                            <div>
                                <p className="font-bold text-[17px] tracking-tight mb-1">{food.name}</p>
                                <p className="text-[13px] text-[#8E8E93] font-semibold">{food.mealType} • {new Date(food.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-[19px] text-black">{food.calories}</p>
                            <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-tighter">kcal</p>
                          </div>
                        </div>
                    ))
                )}
              </div>

              <button 
                onClick={startCamera}
                className="w-full mt-8 py-5 bg-[#007AFF] text-white rounded-[20px] font-bold text-[17px] shadow-lg active:scale-95 transition-all"
              >
                <i className="fa-solid fa-camera mr-2.5"></i> Scan Food
              </button>
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <Header title="Summary" subtitle="Insights" />
            <div className="px-5">
              <div className="bg-white rounded-[24px] p-8 shadow-sm border border-black/5 text-center">
                 <div className="w-16 h-16 bg-[#F2F2F7] rounded-full flex items-center justify-center mx-auto mb-5 text-[#C7C7CC]">
                    <i className="fa-solid fa-chart-bar text-2xl"></i>
                 </div>
                 <h3 className="text-[20px] font-bold mb-2 tracking-tight">Trends</h3>
                 <p className="text-[#8E8E93] text-[15px] font-medium leading-relaxed">Personalized daily insights will appear here as you log more data.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Water Modal */}
      {isWaterModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center px-2 pb-5">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsWaterModalOpen(false)}></div>
          <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl relative animate-in slide-in-from-bottom-full duration-300">
             <div className="w-10 h-1.5 bg-black/10 rounded-full mx-auto mb-6"></div>
             <div className="flex flex-col items-center mb-8">
                <ProgressRing progress={waterProgress} label={stats.waterIntakeOz.toString()} subLabel="oz" size={160} color="#007AFF" />
                <h2 className="text-2xl font-bold mt-4">Water Intake</h2>
                <p className="text-gray-400 font-semibold">Goal: {WATER_GOAL} oz</p>
             </div>
             <div className="grid grid-cols-3 gap-3 mb-6">
                {[8, 12, 16, 24, 32].map(oz => (
                  <button key={oz} onClick={() => logWater(oz)} className="bg-[#F2F2F7] py-4 rounded-2xl font-bold text-[#007AFF] active:bg-[#E5E5EA]">+{oz}oz</button>
                ))}
                <button onClick={() => setStats(prev => ({...prev, waterIntakeOz: 0}))} className="bg-red-50 py-4 rounded-2xl font-bold text-red-500 active:bg-red-100">Reset</button>
             </div>
             <button onClick={() => setIsWaterModalOpen(false)} className="w-full py-4 bg-[#007AFF] text-white rounded-2xl font-bold">Done</button>
          </div>
        </div>
      )}

      {/* Food Category Selection Sheet */}
      {pendingFood && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center px-2 pb-5">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPendingFood(null)}></div>
          <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl relative animate-in slide-in-from-bottom-full duration-300">
            <div className="w-10 h-1.5 bg-black/10 rounded-full mx-auto mb-6"></div>
            <div className="text-center mb-6">
               <h2 className="text-2xl font-bold">Add {pendingFood.name}</h2>
               <p className="text-gray-400 font-semibold">{pendingFood.calories} kcal estimated</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-6">
               {Object.values(MealType).map(type => (
                 <button key={type} onClick={() => finalizeEntry(type)} className="bg-[#F2F2F7] py-5 rounded-2xl font-bold flex flex-col items-center gap-1 active:bg-[#E5E5EA]">
                    <span className="text-lg">{type}</span>
                 </button>
               ))}
            </div>
            <button onClick={() => setPendingFood(null)} className="w-full py-4 text-red-500 font-bold">Cancel</button>
          </div>
        </div>
      )}

      {/* Fullscreen Camera Overlay */}
      {isScanning && (
        <div className="fixed inset-0 z-[300] bg-black">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute top-14 left-5">
             <button onClick={stopCamera} className="w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-md">
                <i className="fa-solid fa-xmark"></i>
             </button>
          </div>
          <div className="absolute bottom-16 left-0 right-0 flex justify-center">
             <button onClick={captureAndAnalyze} disabled={isProcessing} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform">
                <div className={`w-16 h-16 rounded-full ${isProcessing ? 'bg-gray-400' : 'bg-white'}`}></div>
             </button>
          </div>
          {isProcessing && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white">
               <div className="w-12 h-12 border-4 border-[#007AFF] border-t-transparent rounded-full animate-spin mb-4" />
               <p className="text-lg font-bold">Analyzing nutritional data...</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-xl border-t border-black/5 flex items-center justify-around px-6 pb-6 shadow-lg">
        {[
          { id: 'health', icon: 'fa-heart-pulse', label: 'Summary' },
          { id: 'food', icon: 'fa-plate-wheat', label: 'Nutrients' },
          { id: 'stats', icon: 'fa-chart-pie', label: 'Trends' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => handleTabChange(tab.id as any)}
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === tab.id ? 'text-[#007AFF] scale-110' : 'text-[#8E8E93]'}`}
          >
            <i className={`fa-solid ${tab.icon} text-xl`}></i>
            <span className="text-[10px] font-bold uppercase">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
