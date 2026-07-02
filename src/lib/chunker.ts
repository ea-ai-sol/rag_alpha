/**
 * Splits text into chunks of roughly `chunkSize` characters,
 * with `overlap` characters of overlap between chunks.
 */
export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  // Simple implementation: split by paragraphs first, then group
  // A more robust implementation would use a proper tokenizer, but this works for plain text.
  
  if (!text || text.trim() === '') return [];
  
  const chunks: string[] = [];
  
  // Split into paragraphs to respect natural boundaries if possible
  const paragraphs = text.split(/\n\s*\n/);
  
  let currentChunk = "";
  
  for (const paragraph of paragraphs) {
    const cleanParagraph = paragraph.trim();
    if (!cleanParagraph) continue;

    if (currentChunk.length + cleanParagraph.length <= chunkSize) {
      // If adding this paragraph keeps us under the size, add it
      currentChunk += (currentChunk ? "\n\n" : "") + cleanParagraph;
    } else {
      // If the current chunk is not empty, save it
      if (currentChunk) {
        chunks.push(currentChunk);
        // Start new chunk with overlap from the end of the previous chunk
        // We do this by taking the last `overlap` characters, but preferably at a word boundary
        const overlapText = currentChunk.slice(-overlap);
        const lastSpace = overlapText.indexOf(' ');
        const actualOverlap = lastSpace !== -1 ? overlapText.slice(lastSpace + 1) : overlapText;
        
        currentChunk = actualOverlap + "\n\n" + cleanParagraph;
      } else {
        // If a single paragraph is larger than chunkSize, we have to slice it
        let i = 0;
        while (i < cleanParagraph.length) {
          chunks.push(cleanParagraph.slice(i, i + chunkSize));
          i += (chunkSize - overlap);
        }
        currentChunk = "";
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}
