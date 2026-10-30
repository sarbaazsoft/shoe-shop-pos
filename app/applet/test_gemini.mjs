import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
});

async function main() {
  const resp = await fetch('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRAH1c2JLcBiSNQaTHGmlQDGIbiDEvjrufISW8bSkuqDQ&s=10');
  const buf = Buffer.from(await resp.arrayBuffer());
  console.log('Image fetched, size:', buf.length);
  try {
    const res = await client.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { data: buf.toString('base64'), mimeType: 'image/jpeg' } },
          { text: 'Return JSON with title, category, brand, shoeType.' }
        ]
      }],
      config: { responseMimeType: 'application/json' }
    });
    console.log('Gemini response:', res.text);
  } catch (err) {
    console.error('Gemini error:', err);
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
