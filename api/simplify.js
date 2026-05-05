import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Список моделей в порядке приоритета
const MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-lite",
  "gemini-pro"
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, systemPrompt, userPrompt } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  const fullPrompt = `${systemPrompt}\n\n${userPrompt || text}`;
  
  let lastError = null;
  
  // Пробуем каждую модель по очереди
  for (const modelName of MODELS) {
    try {
      console.log(`🔄 Пробуем модель: ${modelName}`);
      
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(fullPrompt);
      const simplifiedText = result.response.text();
      
      console.log(`✅ Успех с моделью: ${modelName}`);
      
      return res.status(200).json({ 
        success: true, 
        text: simplifiedText.trim(),
        modelUsed: modelName
      });
      
    } catch (error) {
      console.log(`❌ Модель ${modelName} не сработала: ${error.message}`);
      lastError = error;
      
      // Если ошибка не про квоту (429) и не "модель не найдена" (404) — прекращаем
      if (!error.message.includes('429') && !error.message.includes('quota')) {
        return res.status(500).json({ success: false, error: error.message });
      }
      // Иначе пробуем следующую модель
    }
  }
  
  // Если все модели выдали ошибку
  return res.status(429).json({ 
    success: false, 
    error: 'Все модели Gemini временно недоступны. Попробуйте позже.',
    details: lastError?.message
  });
}
