
export enum MealType {
  BREAKFAST = 'Breakfast',
  LUNCH = 'Lunch',
  DINNER = 'Dinner',
  SNACK = 'Snack'
}

export interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  timestamp: number;
  mealType: MealType;
}

export interface UserStats {
  dailyCalorieGoal: number;
  dailyStepGoal: number;
  currentSteps: number;
  waterIntakeMl: number;
}
