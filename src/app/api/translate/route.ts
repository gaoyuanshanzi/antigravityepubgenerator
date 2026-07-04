import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      text,
      storySummary = '',
      glossary = '',
      translationGuidelines = '',
      previousChapterTail = '',
      apiKey,
      model = 'gemini-2.5-flash',
    } = body;

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const activeApiKey = apiKey || process.env.GEMINI_API_KEY;
    if (!activeApiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is not configured. Please configure it in your environment or enter it in settings.' },
        { status: 401 }
      );
    }

    const ai = new GoogleGenAI({ apiKey: activeApiKey });

    const prompt = `You are an expert literary translator specializing in translating Korean web novels and literature into English.
Your goal is to translate the current chapter of a Korean novel into English, maintaining a consistent tone, style, and character voice.

### Guidelines & Style Instructions:
${translationGuidelines || 'Maintain standard literary English narrative style. Keep it readable and immersive.'}

### Glossary & Named Entities:
Use the following translations for characters, places, and terms:
${glossary || 'None specified.'}

### Story Summary So Far:
${storySummary || 'No summary available yet. This is the start of the book.'}

### Context (End of previous chapter in English):
For continuity, here is how the previous chapter ended:
"""
${previousChapterTail || 'No previous chapter context (this is Chapter 1).'}
"""

---

### Task:
1. Translate the provided Korean text into English, maintaining the original paragraph structure and layout.
2. Generate a brief 2-3 sentence summary of this chapter in English for context tracking in subsequent chapters.
3. Return your response in JSON format.

Korean Text to Translate:
"""
${text}
"""`;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            translation: {
              type: 'STRING',
              description: 'The complete English translation of the provided chapter. Maintain paragraphs.',
            },
            chapterSummary: {
              type: 'STRING',
              description: 'A brief 2-3 sentence summary of the key plot points in this chapter in English.',
            },
          },
          required: ['translation', 'chapterSummary'],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Gemini returned an empty response.');
    }

    const result = JSON.parse(responseText);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: error?.message || 'An error occurred during translation' },
      { status: 500 }
    );
  }
}
