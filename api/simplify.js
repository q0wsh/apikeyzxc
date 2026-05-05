import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Список моделей в порядке приоритета
const MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-lite",
  "gemini-pro"
];

// Функция проверки, работает ли модель
async function isModelWorking(modelName, testPrompt = "Привет") {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(testPrompt);
    const response = await result.response;
    return response.text() !== undefined;
  } catch (error) {
    console.log(`Модель ${modelName} не работает: ${error.message}`);
    return false;
  }
}

// Функция выбора рабочей модели
async function selectWorkingModel() {
  for (const modelName of MODELS) {
    const isWorking = await isModelWorking(modelName);
    if (isWorking) {
      console.log(`✅ Выбрана рабочая модель: ${modelName}`);
      return modelName;
    }
  }
  return MODELS[0];
}

let cachedWorkingModel = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getWorkingModel() {
  const now = Date.now();
  if (cachedWorkingModel && (now - cacheTime) < CACHE_TTL) {
    return cachedWorkingModel;
  }
  cachedWorkingModel = await selectWorkingModel();
  cacheTime = now;
  return cachedWorkingModel;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, systemPrompt, userPrompt } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  try {
    const selectedModel = await getWorkingModel();
    const model = genAI.getGenerativeModel({ model: selectedModel });
    
    const fullPrompt = `${systemPrompt}\n\n${userPrompt || text}`;
    
    let result;
    try {
      result = await model.generateContent(fullPrompt);
    } catch (error) {
      if (error.message.includes('429') || error.message.includes('quota')) {
        cachedWorkingModel = null;
        const newModel = await getWorkingModel();
        const newModelInstance = genAI.getGenerativeModel({ model: newModel });
        result = await newModelInstance.generateContent(fullPrompt);
      } else {
        throw error;
      }
    }
    
    const simplifiedText = result.response.text();

    return res.status(200).json({ 
      success: true, 
      text: simplifiedText.trim()
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
