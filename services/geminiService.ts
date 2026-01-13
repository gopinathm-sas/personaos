
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const foodSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    calories: { type: Type.NUMBER },
    protein: { type: Type.NUMBER },
    carbs: { type: Type.NUMBER },
    fat: { type: Type.NUMBER },
  },
  required: ["name", "calories", "protein", "carbs", "fat"],
};

export const analyzeFoodImage = async (base64Image: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // High quality for images
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          },
          {
            text: "Identify this food and estimate its nutritional values (calories, protein, carbs, fat) per standard serving. Use Indian food context if applicable. Return only JSON.",
          }
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: foodSchema,
      },
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini Image Analysis Error:", error);
    return null;
  }
};

export const analyzeFoodText = async (textDescription: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite-latest', // Fast for text
      contents: `Estimate nutritional values for this food: "${textDescription}". Provide values for a single serving. Return JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: foodSchema,
      },
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini Text Analysis Error:", error);
    return null;
  }
};
