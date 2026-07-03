import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export async function generateEmbedding(text: string, retries = 5): Promise<number[]> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: text,
      });
      return response.embeddings?.[0]?.values || [];
    } catch (error: any) {
      const errorMessage = error.message || error.toString();
      if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
        if (attempt === retries - 1) {
          console.error("Max retries reached for embedding generation.");
          throw new Error("Rate limit exceeded. Please try again later.");
        }
        const delay = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s, 16s
        console.log(`Rate limited (429). Retrying embedding in ${delay}ms... (Attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error("Error generating embedding:", error);
        throw new Error("Failed to generate embedding: " + errorMessage);
      }
    }
  }
  return [];
}

export async function generateAnswer(query: string, context: string, retries = 3): Promise<string> {
  const prompt = `You are a helpful assistant. Use the following context to answer the question. If you don't know the answer based on the context, just say that you don't know, don't try to make up an answer.

Context:
${context}

Question: ${query}

Answer:`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
      });
      return response.text || "No response generated.";
    } catch (error: any) {
      const errorMessage = error.message || error.toString();
      if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
        if (attempt === retries - 1) {
          console.error("Max retries reached for answer generation.");
          throw new Error("Rate limit exceeded. Please try again later.");
        }
        const delay = Math.pow(2, attempt) * 2000;
        console.log(`Rate limited (429). Retrying answer in ${delay}ms... (Attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error("Error generating answer:", error);
        throw new Error("Failed to generate answer: " + errorMessage);
      }
    }
  }
  return "No response generated.";
}
