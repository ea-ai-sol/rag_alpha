import fs from 'fs';
import path from 'path';

export interface VectorItem {
  id: string;
  docId: string;
  text: string;
  embedding: number[];
  metadata?: any;
}

export interface SearchResult {
  item: VectorItem;
  score: number;
}

export class VectorStore {
  private data: VectorItem[] = [];
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = path.resolve(dbPath);
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const fileContent = fs.readFileSync(this.dbPath, 'utf-8');
        this.data = JSON.parse(fileContent);
      }
    } catch (err) {
      console.error(`Error loading vector store from ${this.dbPath}`, err);
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error(`Error saving vector store to ${this.dbPath}`, err);
    }
  }

  add(item: VectorItem) {
    this.data.push(item);
    this.save();
  }

  getAll(): VectorItem[] {
    return this.data;
  }

  deleteByDocId(docId: string): number {
    const initialLength = this.data.length;
    this.data = this.data.filter(item => item.docId !== docId);
    this.save();
    return initialLength - this.data.length;
  }

  // Cosine similarity
  private similarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  search(queryEmbedding: number[], topK: number = 5): SearchResult[] {
    if (this.data.length === 0) return [];

    const results: SearchResult[] = this.data.map(item => ({
      item,
      score: this.similarity(queryEmbedding, item.embedding)
    }));

    // Sort descending by score
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }
}
