// api/simplify.js
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
    // Если ошибка 429 (квота) или 404 (нет модели), возвращаем false
    console.log(`Модель ${modelName} не работает: ${error.message}`);
    return false;
  }
}

// Функция выбора рабочей модели с проверкой
async function selectWorkingModel() {
  for (const modelName of MODELS) {
    // Сначала быстрая проверка (без полного промпта)
    const isWorking = await isModelWorking(modelName);
    if (isWorking) {
      console.log(`✅ Выбрана рабочая модель: ${modelName}`);
      return modelName;
    }
  }
  
  // Если все модели не прошли проверку, возвращаем первую (будет ошибка дальше)
  console.warn("⚠️ Все модели недоступны, использована первая");
  return MODELS[0];
}

// Кэш для рабочей модели (сохраняем выбор на 5 минут, чтобы каждый раз не проверять)
let cachedWorkingModel = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

async function getWorkingModel() {
  const now = Date.now();
  
  // Если кэш ещё свежий, возвращаем сохранённую модель
  if (cachedWorkingModel && (now - cacheTime) < CACHE_TTL) {
    return cachedWorkingModel;
  }
  
  // Иначе выбираем новую рабочую модель
  cachedWorkingModel = await selectWorkingModel();
  cacheTime = now;
  return cachedWorkingModel;
}

export default async function handler(req, res) {
  // Разрешаем только POST запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, level, systemPrompt, userPrompt } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  try {
    // 1. Выбираем рабочую модель
    const selectedModel = await getWorkingModel();
    const model = genAI.getGenerativeModel({ model: selectedModel });
    
    // 2. Формируем полный промпт
    const fullPrompt = `${systemPrompt}\n\n${userPrompt || text}`;
    
    // 3. Делаем запрос к Gemini с обработкой ошибок
    let result;
    try {
      result = await model.generateContent(fullPrompt);
    } catch (error) {
      // Если текущая модель выдала ошибку (например, 429)
      if (error.message.includes('429') || error.message.includes('quota')) {
        // Сбрасываем кэш и пробуем другую модель
        cachedWorkingModel = null;
        const newModel = await getWorkingModel(); // автоматически выберет другую
        const newModelInstance = genAI.getGenerativeModel({ model: newModel });
        result = await newModelInstance.generateContent(fullPrompt);
      } else {
        throw error;
      }
    }
    
    const simplifiedText = result.response.text();

    return res.status(200).json({ 
      success: true, 
      text: simplifiedText.trim(),
      modelUsed: selectedModel  // опционально: можно вернуть название модели
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
