import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// تهيئة Groq باستخدام المفتاح الخاص به
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(request: Request) {
  try {
    const { lessonText } = await request.json();

    if (!lessonText) {
      return NextResponse.json({ error: 'Lesson text is required' }, { status: 400 });
    }

    const prompt = `
      بناءً على النص التعليمي التالي، قم بإنشاء 4 أزواج من المصطلحات وتعريفاتها (أو الأسئلة وإجاباتها) المناسبة للعبة مطابقة الكروت.
      يجب أن يكون الرد بصيغة JSON صالح فقط بدون أي نصوص إضافية أو علامات Markdown (مثل \`\`\`json)، بحيث يكون بالهيكل التالي تماماً:
      [
        { "question": "السؤال أو المصطلح", "answer": "الإجابة أو التعريف" }
      ]

      النص التعليمي:
      ${lessonText}
    `;

    // استدعاء موديل Groq القوي والسريع
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile", // موديل قوي جداً ودقيق في الـ JSON
      messages: [
        { role: "system", content: "You are a helpful educational assistant that outputs strictly in JSON format." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    });

    const textResult = completion.choices[0]?.message?.content || '';
    
    // تنظيف واستخراج الـ JSON بدقة
    const jsonStartIndex = textResult.indexOf('[');
    const jsonEndIndex = textResult.lastIndexOf(']') + 1;
    const jsonString = textResult.substring(jsonStartIndex, jsonEndIndex);
    
    const pairs = JSON.parse(jsonString);

    return NextResponse.json({ pairs });

  } catch (error) {
    console.error('Error generating game questions with Groq:', error);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}