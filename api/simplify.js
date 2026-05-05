import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Используем модель с самыми щедрыми квотами
const MODEL_NAME = "gemini-1.5-flash";

export default async function handler(req, res) {
  // Разрешаем только POST запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, systemPrompt, userPrompt } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  try {
    console.log(`🔄 Используем модель: ${MODEL_NAME}`);
    
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const fullPrompt = `${systemPrompt}\n\n${userPrompt || text}`;
    const result = await model.generateContent(fullPrompt);
    const simplifiedText = result.response.text();
    
    console.log(`✅ Успех!`);
    
    return res.status(200).json({ 
      success: true, 
      text: simplifiedText.trim()
    });
    
  } catch (error) {
    console.error('API Error:', error);
    
    // Если квота исчерпана, понятное сообщение
    if (error.message.includes('429')) {
      return res.status(429).json({ 
        success: false, 
        error: 'Квота Gemini временно исчерпана. Попробуйте через минуту или создайте новый API ключ.'
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
