import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// تهيئة الـ AI باستخدام مفتاح الـ API المخزن في .env.local
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(request: Request) {
  try {
    const { lessonText } = await request.json();

    if (!lessonText) {
      return NextResponse.json({ error: 'Lesson text is required' }, { status: 400 });
    }

    // الـ Prompt اللي بيوجه الذكاء الاصطناعي لتوليد الأسئلة بدقة
    const prompt = `
      بناءً على النص التعليمي التالي، قم بإنشاء 4 أزواج من المصطلحات وتعريفاتها (أو الأسئلة وإجاباتها) المناسبة للعبة مطابقة الكروت.
      يجب أن يكون الرد بصيغة JSON صالح فقط بدون أي نصوص أو علامات ترحيب إضافية، بحيث يكون بالهيكل التالي تماماً:
      [
        { "question": "السؤال أو المصطلح", "answer": "الإجابة أو التعريف" }
      ]

      النص التعليمي:
      ${lessonText}
    `;

    // استدعاء موديل الـ AI
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const textResult = response.text ?? '';
    
    // استخراج الـ JSON بدقة من رد الـ AI
    const jsonStartIndex = textResult.indexOf('[');
    const jsonEndIndex = textResult.lastIndexOf(']') + 1;
    const jsonString = textResult.substring(jsonStartIndex, jsonEndIndex);
    
    const pairs = JSON.parse(jsonString);

    return NextResponse.json({ pairs });

  } catch (error) {
    console.error('Error generating game questions:', error);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}