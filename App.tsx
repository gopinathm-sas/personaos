
import React, { useState, useRef } from 'react';
import { MealType, FoodEntry, UserStats } from './types';
import { ProgressRing } from './components/ProgressRing';
import { analyzeFoodImage, analyzeFoodText } from './services/geminiService';

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
  waterIntakeMl: 1200
};

const WATER_GOAL_ML = 2500;

const INITIAL_FOODS: FoodEntry[] = [
  { id: '1', name: 'Poha with Sprouts', calories: 320, protein: 12, carbs: 45, fat: 8, timestamp: Date.now() - 14400000, mealType: MealType.BREAKFAST },
  { id: '2', name: 'Masala Chai', calories: 45, protein: 2, carbs: 5, fat: 2, timestamp: Date.now() - 10800000, mealType: MealType.BREAKFAST },
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
  const [manualInput, setManualInput] = useState('');
  
  // Modal states
  const [pendingFood, setPendingFood] = useState<Partial<FoodEntry> & { servings?: number } | null>(null);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [isWaterModalOpen, setIsWaterModalOpen] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const totalCalories = foods.reduce((acc, f) => acc + f.calories, 0);
  const calorieProgress = Math.min(totalCalories / stats.dailyCalorieGoal, 1);
  const waterProgress = Math.min(stats.waterIntakeMl / WATER_GOAL_ML, 1);

  const multiplier = pendingFood?.servings || 1;
  const calcVal = (val: number = 0) => Math.round(val * multiplier);

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
      setPendingFood({ ...result, servings: 1 });
      stopCamera();
    } else {
      haptic.warning();
      alert("Analysis failed. Try again.");
    }
    setIsProcessing(false);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim() || isProcessing) return;
    
    haptic.medium();
    setIsProcessing(true);
    const result = await analyzeFoodText(manualInput);
    if (result?.name) {
      haptic.success();
      setPendingFood({ ...result, servings: 1 });
      setManualInput('');
    } else {
      haptic.warning();
      alert("Could not estimate calories for that. Try being more specific.");
    }
    setIsProcessing(false);
  };

  const finalizeEntry = (type: MealType) => {
    if (!pendingFood) return;
    haptic.success();
    
    const entry: FoodEntry = {
      id: editingFoodId || Date.now().toString(),
      name: pendingFood.name || 'Food',
      calories: calcVal(pendingFood.calories),
      protein: calcVal(pendingFood.protein),
      carbs: calcVal(pendingFood.carbs),
      fat: calcVal(pendingFood.fat),
      timestamp: Date.now(),
      mealType: type
    };

    if (editingFoodId) {
      setFoods(foods.map(f => f.id === editingFoodId ? entry : f));
    } else {
      setFoods([entry, ...foods]);
    }

    setPendingFood(null);
    setEditingFoodId(null);
    setActiveTab('food');
  };

  const handleEdit = (food: FoodEntry) => {
    haptic.light();
    setEditingFoodId(food.id);
    setPendingFood({
      name: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      mealType: food.mealType,
      servings: 1
    });
  };

  const deleteEntry = () => {
    if (!editingFoodId) return;
    haptic.warning();
    setFoods(foods.filter(f => f.id !== editingFoodId));
    setPendingFood(null);
    setEditingFoodId(null);
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
            
            <form onSubmit={handleManualSubmit} className="relative mb-6">
               <input 
                 type="text"
                 placeholder="Search or log food (e.g. 2 Idlis)"
                 value={manualInput}
                 onChange={(e) => setManualInput(e.target.value)}
                 className="w-full bg-white h-12 px-11 rounded-xl shadow-sm border border-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 transition-all"
               />
               <i className={`fa-solid ${isProcessing ? 'fa-circle-notch animate-spin text-[#007AFF]' : 'fa-magnifying-glass text-gray-300'} absolute left-4 top-1/2 -translate-y-1/2`}></i>
               {manualInput && !isProcessing && (
                 <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#007AFF] uppercase px-2 py-1">Log</button>
               )}
            </form>

            <div className="flex gap-4 mb-2">
               <button onClick={startCamera} className="flex-1 py-4 bg-white rounded-2xl shadow-sm border border-black/5 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-[#007AFF] flex items-center justify-center">
                    <i className="fa-solid fa-camera"></i>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest">Scan Food</span>
               </button>
               <div className="flex-1 py-4 bg-white rounded-2xl shadow-sm border border-black/5 flex flex-col items-center justify-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center">
                    <i className="fa-solid fa-bolt"></i>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest">AI Assisted</span>
               </div>
            </div>

            <div className="space-y-3 mt-6">
              <h3 className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wider px-1">Today's Entries</h3>
              {foods.length === 0 ? (
                <div className="text-center py-12 opacity-30">
                  <p className="text-sm font-medium">Log your first meal to start tracking</p>
                </div>
              ) : (
                foods.map(food => (
                  <div 
                    key={food.id} 
                    onClick={() => handleEdit(food)}
                    className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 flex justify-between items-center active:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <div className="flex-1">
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
            </div>
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
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setPendingFood(null); setEditingFoodId(null); }}></div>
          <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl relative animate-in slide-in-from-bottom-full duration-300 max-h-[90vh] overflow-y-auto">
             <div className="w-10 h-1 bg-black/10 rounded-full mx-auto mb-6"></div>
             <h2 className="text-xl font-bold text-center mb-6">{editingFoodId ? 'Edit Entry' : `Log ${pendingFood.name}`}</h2>
             
             <div className="bg-[#F2F2F7] p-5 rounded-2xl mb-6 flex flex-col items-center">
                <div className="flex items-baseline gap-1 mb-2">
                   <span className="text-3xl font-black">{calcVal(pendingFood.calories)}</span>
                   <span className="text-sm font-bold text-gray-400 uppercase">kcal</span>
                </div>
                <div className="grid grid-cols-3 gap-8 w-full text-center border-t border-black/5 pt-4 mt-2">
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Prot</p><p className="font-bold">{calcVal(pendingFood.protein)}g</p></div>
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Carb</p><p className="font-bold">{calcVal(pendingFood.carbs)}g</p></div>
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Fat</p><p className="font-bold">{calcVal(pendingFood.fat)}g</p></div>
                </div>
             </div>

             <div className="space-y-4 mb-8">
                <div>
                   <div className="flex justify-between items-center mb-2 px-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Adjust Servings</label>
                      <span className="text-sm font-bold text-[#007AFF]">{pendingFood.servings} serving(s)</span>
                   </div>
                   <input 
                      type="range" 
                      min="0.25" 
                      max="5" 
                      step="0.25" 
                      value={pendingFood.servings} 
                      onChange={(e) => {
                        haptic.light();
                        setPendingFood({...pendingFood, servings: parseFloat(e.target.value)});
                      }}
                      className="w-full h-1.5 bg-[#F2F2F7] rounded-lg appearance-none cursor-pointer accent-[#007AFF]"
                   />
                </div>
                
                <div className="bg-[#F2F2F7] p-4 rounded-xl flex justify-between items-center">
                   <label className="text-sm font-bold">Total Weight (est.)</label>
                   <div className="flex items-center gap-2">
                      <span className="font-bold text-[#007AFF]">{Math.round(150 * (pendingFood.servings || 1))}</span>
                      <span className="text-sm font-bold text-gray-400">g</span>
                   </div>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-3 mb-4">
                {Object.values(MealType).map(m => (
                  <button 
                    key={m} 
                    onClick={() => finalizeEntry(m)} 
                    className={`py-4 rounded-xl font-bold transition-all ${pendingFood.mealType === m ? 'bg-[#007AFF] text-white' : 'bg-[#F2F2F7] active:bg-gray-200'}`}
                  >
                    {m}
                  </button>
                ))}
             </div>

             <div className="flex flex-col gap-2">
                {editingFoodId && (
                   <button onClick={deleteEntry} className="w-full py-4 text-red-500 font-bold bg-red-50 rounded-xl mb-2">Delete Entry</button>
                )}
                <button onClick={() => { setPendingFood(null); setEditingFoodId(null); }} className="w-full py-2 text-gray-400 font-bold">Cancel</button>
             </div>
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
              <p className="text-lg">Analyzing Food...</p>
              <p className="text-xs text-white/50 mt-2 italic">Gemini 3 Pro is estimating nutrients...</p>
            </div>
          )}
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 h-24 bg-white/80 backdrop-blur-xl border-t border-black/5 flex items-center justify-around px-6 pb-6 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
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
            <span className="text-[10px] font-bold uppercase tracking-tight">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
