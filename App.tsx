
import React, { useState, useRef } from 'react';
import { MealType, FoodEntry, UserStats } from './types';
import { ProgressRing } from './components/ProgressRing';
import { analyzeFoodImage } from './services/geminiService';

// Safely handle haptics
const haptic = {
  light: () => navigator?.vibrate?.(10),
  medium: () => navigator?.vibrate?.(20),
  success: () => navigator?.vibrate?.([15, 30, 15]),
  warning: () => navigator?.vibrate?.([30, 50, 30, 50])
};

const INITIAL_STATS: UserStats = {
  dailyCalorieGoal: 2400,
  dailyStepGoal: 10000,
  currentSteps: 7432,
  waterIntakeMl: 1200 // Initial 1.2 Liters
};

const WATER_GOAL_ML = 2500; // 2.5 Liters daily goal (common in India)

const INITIAL_FOODS: FoodEntry[] = [
  { id: '1', name: 'Poha with Sprouts', calories: 320, protein: 12, carbs: 45, fat: 8, timestamp: Date.now() - 14400000, mealType: MealType.BREAKFAST },
  { id: '2', name: 'Masala Chai (No Sugar)', calories: 45, protein: 2, carbs: 5, fat: 2, timestamp: Date.now() - 10800000, mealType: MealType.BREAKFAST },
];

const Header: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <header className="px-5 pt-14 pb-4 select-none">
    <p className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wide mb-0.5">{subtitle}</p>
    <h1 className="text-[34px] font-extrabold tracking-tight text-black">{title}</h1>
  </header>
);

const SummaryCard: React.FC<{ icon: string; title: string; value: string; color: string; onClick?: () => void }> = ({ icon, title, value, color, onClick }) => (
  <div 
    onClick={() => { haptic.light(); onClick?.(); }}
    className="bg-white rounded-2xl p-4 shadow-sm border border-black/5 flex items-center gap-4 active:scale-95 transition-transform cursor-pointer"
  >
    <div className="w-11 h-11 rounded-[10px] flex items-center justify-center text-white text-lg" style={{ backgroundColor: color }}>
      <i className={`fa-solid ${icon}`}></i>
    </div>
    <div>
      <p className="text-[11px] font-bold text-[#8E8E93] uppercase mb-1">{title}</p>
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
  const waterProgress = Math.min(stats.waterIntakeMl / WATER_GOAL_ML, 1);
  const getMealTotal = (type: MealType) => foods.filter(f => f.mealType === type).reduce((acc, f) => acc + f.calories, 0);

  const startCamera = async () => {
    haptic.medium();
    setIsScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 } } 
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setIsScanning(false);
      haptic.warning();
      alert("Camera error. Please ensure permissions are granted.");
    }
  };

  const stopCamera = () => {
    haptic.light();
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
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
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
    
    const result = await analyzeFoodImage(base64);
    if (result?.name) {
      haptic.success();
      setPendingFood(result);
      stopCamera();
    } else {
      haptic.warning();
      alert("Analysis failed. Try again.");
    }
    setIsProcessing(false);
  };

  const finalizeEntry = (type: MealType) => {
    if (!pendingFood) return;
    haptic.success();
    const entry: FoodEntry = {
      id: Date.now().toString(),
      name: pendingFood.name || 'Food',
      calories: pendingFood.calories || 0,
      protein: pendingFood.protein || 0,
      carbs: pendingFood.carbs || 0,
      fat: pendingFood.fat || 0,
      timestamp: Date.now(),
      mealType: type
    };
    setFoods([entry, ...foods]);
    setPendingFood(null);
    setActiveTab('food');
  };

  const logWater = (ml: number) => {
    haptic.medium();
    setStats(prev => ({ ...prev, waterIntakeMl: prev.waterIntakeMl + ml }));
  };

  const formatWater = (ml: number) => {
    if (ml >= 1000) return `${(ml / 1000).toFixed(1)} L`;
    return `${ml} ml`;
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-[#F2F2F7] relative overflow-hidden">
      <div className="flex-1 overflow-y-auto hide-scrollbar pb-32">
        {activeTab === 'health' && (
          <div className="p-5 space-y-6">
            <Header title="Health" subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} />
            <div className="bg-white rounded-[28px] p-8 shadow-sm border border-black/5 flex flex-col items-center">
              <ProgressRing progress={calorieProgress} label={totalCalories.toString()} subLabel="kcal" size={180} />
              <div className="mt-8 grid grid-cols-3 gap-6 w-full text-center">
                <div><p className="text-[10px] font-bold text-gray-400 uppercase">Steps</p><p className="text-lg font-bold">{stats.currentSteps}</p></div>
                <div><p className="text-[10px] font-bold text-gray-400 uppercase">Goal</p><p className="text-lg font-bold">10k</p></div>
                <div><p className="text-[10px] font-bold text-gray-400 uppercase">Active</p><p className="text-lg font-bold">45m</p></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SummaryCard icon="fa-shoe-prints" title="Steps" value={stats.currentSteps.toLocaleString('en-IN')} color="#FF9500" />
              <SummaryCard icon="fa-droplet" title="Hydration" value={formatWater(stats.waterIntakeMl)} color="#007AFF" onClick={() => setIsWaterModalOpen(true)} />
            </div>
          </div>
        )}

        {activeTab === 'food' && (
          <div className="p-5 space-y-4">
            <Header title="Food Log" subtitle="Nutrients" />
            {foods.length === 0 ? (
              <div className="text-center py-20 opacity-30">
                <i className="fa-solid fa-plate-wheat text-6xl mb-4"></i>
                <p className="font-medium">No meals logged today</p>
              </div>
            ) : (
              foods.map(food => (
                <div key={food.id} className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-[17px]">{food.name}</p>
                    <div className="flex gap-2">
                      <p className="text-[10px] text-gray-400 uppercase font-bold">{food.mealType}</p>
                      <p className="text-[10px] text-gray-500 font-medium">P: {food.protein}g • C: {food.carbs}g • F: {food.fat}g</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-xl">{food.calories}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">kcal</p>
                  </div>
                </div>
              ))
            )}
            <button onClick={startCamera} className="w-full mt-6 py-5 bg-[#007AFF] text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform">
              <i className="fa-solid fa-camera mr-2"></i> Scan Food with AI
            </button>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="p-5 text-center pt-20">
            <Header title="Trends" />
            <div className="bg-white p-10 rounded-3xl border border-black/5 shadow-sm">
              <i className="fa-solid fa-chart-line text-4xl text-gray-200 mb-4"></i>
              <p className="text-gray-500 font-medium leading-relaxed">Daily insights for your health journey in India will appear here.</p>
            </div>
          </div>
        )}
      </div>

      {isWaterModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center px-2 pb-5">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsWaterModalOpen(false)}></div>
          <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl relative animate-in slide-in-from-bottom-full duration-300">
             <div className="w-10 h-1 bg-black/10 rounded-full mx-auto mb-6"></div>
             <div className="flex flex-col items-center mb-6">
                <ProgressRing progress={waterProgress} label={formatWater(stats.waterIntakeMl)} subLabel="Logged" size={140} color="#007AFF" />
                <p className="text-gray-400 font-bold text-xs mt-4 uppercase">Goal: {formatWater(WATER_GOAL_ML)}</p>
             </div>
             <div className="grid grid-cols-4 gap-2 mb-6">
                {[200, 300, 500, 1000].map(ml => (
                  <button key={ml} onClick={() => logWater(ml)} className="bg-[#F2F2F7] py-4 rounded-xl font-bold text-[#007AFF] active:bg-gray-200 text-sm">
                    +{ml < 1000 ? ml : '1L'}
                  </button>
                ))}
             </div>
             <div className="flex gap-2">
                <button onClick={() => setStats(prev => ({...prev, waterIntakeMl: 0}))} className="flex-1 py-4 bg-red-50 text-red-500 rounded-xl font-bold text-sm">Reset</button>
                <button onClick={() => setIsWaterModalOpen(false)} className="flex-[2] py-4 bg-[#007AFF] text-white rounded-xl font-bold">Done</button>
             </div>
          </div>
        </div>
      )}

      {pendingFood && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center px-2 pb-5">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPendingFood(null)}></div>
          <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl relative animate-in slide-in-from-bottom-full duration-300">
             <h2 className="text-xl font-bold text-center mb-6">Log {pendingFood.name}?</h2>
             <div className="bg-[#F2F2F7] p-4 rounded-2xl mb-6 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[10px] font-bold text-gray-400 uppercase">Prot</p><p className="font-bold">{pendingFood.protein}g</p></div>
                <div><p className="text-[10px] font-bold text-gray-400 uppercase">Carb</p><p className="font-bold">{pendingFood.carbs}g</p></div>
                <div><p className="text-[10px] font-bold text-gray-400 uppercase">Fat</p><p className="font-bold">{pendingFood.fat}g</p></div>
             </div>
             <div className="grid grid-cols-2 gap-3 mb-6">
                {Object.values(MealType).map(m => (
                  <button key={m} onClick={() => finalizeEntry(m)} className="bg-[#F2F2F7] py-4 rounded-xl font-bold active:bg-gray-200">{m}</button>
                ))}
             </div>
             <button onClick={() => setPendingFood(null)} className="w-full py-4 text-red-500 font-bold">Discard</button>
          </div>
        </div>
      )}

      {isScanning && (
        <div className="fixed inset-0 z-[300] bg-black">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <button onClick={stopCamera} className="absolute top-14 left-5 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-md">
            <i className="fa-solid fa-xmark"></i>
          </button>
          <div className="absolute bottom-16 left-0 right-0 flex justify-center">
            <button onClick={captureAndAnalyze} disabled={isProcessing} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center">
              <div className={`w-16 h-16 rounded-full ${isProcessing ? 'bg-gray-400' : 'bg-white animate-pulse'}`}></div>
            </button>
          </div>
          {isProcessing && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white font-bold p-10 text-center">
              <div className="w-12 h-12 border-4 border-[#007AFF] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-lg">Analyzing food with Gemini AI...</p>
              <p className="text-xs text-white/50 mt-2">Identifying local Indian ingredients...</p>
            </div>
          )}
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-xl border-t border-black/5 flex items-center justify-around px-6 pb-6">
        {[
          { id: 'health', icon: 'fa-heart-pulse', label: 'Summary' },
          { id: 'food', icon: 'fa-plate-wheat', label: 'Log' },
          { id: 'stats', icon: 'fa-chart-pie', label: 'Trends' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => { haptic.light(); setActiveTab(tab.id as any); }}
            className={`flex flex-col items-center gap-1 ${activeTab === tab.id ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
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
