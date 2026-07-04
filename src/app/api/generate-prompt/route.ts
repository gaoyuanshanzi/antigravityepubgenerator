import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      title,
      summary,
      artStyle = 'watercolor painting',
      apiKey,
      model = 'gemini-2.5-flash',
    } = body;

    if (!summary) {
      return NextResponse.json({ error: 'Summary is required' }, { status: 400 });
    }

    const activeApiKey = apiKey || process.env.GEMINI_API_KEY;
    if (!activeApiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is not configured. Please configure it in your environment or enter it in settings.' },
        { status: 401 }
      );
    }

    const ai = new GoogleGenAI({ apiKey: activeApiKey });

    const prompt = `Based on the following chapter summary and title of a novel, write a detailed, highly descriptive prompt for an AI image generator to create a stunning chapter illustration.

Chapter Title: ${title || 'Untitled'}
Chapter Summary: ${summary}
Art Style: ${artStyle}

Requirements for the output prompt:
1. Describe a single, coherent, visually striking scene representing this chapter.
2. The description must be in English.
3. Incorporate the specified art style: "${artStyle}".
4. Specify details such as lighting (e.g. volumetric, sunset glow, dark shadows), composition (e.g. wide shot, close-up, silhouette, Rule of Thirds), colors, and mood.
5. Do NOT use buzzwords like "photorealistic", "ultra quality", "highly detailed", "8k". Instead, describe textures, materials, and atmospheric elements (e.g. "rough canvas texture, mist rising from the damp ground, glowing particles of gold dust").
6. Return ONLY the final image generator prompt as a plain text string. Do not include quotes, markdown formatting, introductory remarks, or explanations. Just output the prompt itself.`;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });

    const responseText = response.text?.trim() || '';
    if (!responseText) {
      throw new Error('Gemini returned an empty prompt.');
    }

    // Clean up if Gemini included quotes anyway
    let cleanedPrompt = responseText;
    if (cleanedPrompt.startsWith('"') && cleanedPrompt.endsWith('"')) {
      cleanedPrompt = cleanedPrompt.substring(1, cleanedPrompt.length - 1);
    }
    if (cleanedPrompt.startsWith('`') && cleanedPrompt.endsWith('`')) {
      cleanedPrompt = cleanedPrompt.substring(1, cleanedPrompt.length - 1);
    }

    return NextResponse.json({ prompt: cleanedPrompt });
  } catch (error: any) {
    console.error('Prompt generation error:', error);
    return NextResponse.json(
      { error: error?.message || 'An error occurred during prompt generation' },
      { status: 500 }
    );
  }
}
