import express from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { generateEmbedding, generateAnswer } from './src/lib/gemini';
import { chunkText } from './src/lib/chunker';
import { VectorStore } from './src/lib/vectorstore';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const app = express();
const PORT = 3000;

app.use(express.json());

const upload = multer({ dest: 'uploads/' });
const vectorStore = new VectorStore('./vector_db.json');

// Ensure uploads dir exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// API Routes
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, path: filePath } = req.file;
    const text = fs.readFileSync(filePath, 'utf-8');
    
    // Clean up uploaded file
    fs.unlinkSync(filePath);

    // 1. Chunk the text
    const chunks = chunkText(text, 1000, 200);

    // 2. Embed each chunk
    const docId = uuidv4();
    const documentName = originalname;
    
    for (const chunk of chunks) {
      const embedding = await generateEmbedding(chunk);
      vectorStore.add({
        id: uuidv4(),
        docId,
        text: chunk,
        embedding,
        metadata: {
          documentName,
          timestamp: new Date().toISOString()
        }
      });
    }

    res.json({ success: true, message: `Processed and embedded ${chunks.length} chunks from ${documentName}` });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/query', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // 1. Embed query
    const queryEmbedding = await generateEmbedding(query);

    // 2. Search local vector store
    const results = vectorStore.search(queryEmbedding, 3); // top 3 results

    if (results.length === 0) {
      return res.json({ answer: "I don't have any relevant information in my database.", sources: [] });
    }

    // 3. Construct prompt with context
    const context = results.map(r => r.item.text).join('\n\n');
    const answer = await generateAnswer(query, context);

    res.json({
      answer,
      sources: results.map(r => ({
        id: r.item.id,
        text: r.item.text,
        score: r.score,
        documentName: r.item.metadata?.documentName
      }))
    });

  } catch (error: any) {
    console.error('Query error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/api/documents', (req, res) => {
  // Aggregate chunks to list unique documents
  const items = vectorStore.getAll();
  const docsMap = new Map();
  
  items.forEach(item => {
    if (!docsMap.has(item.docId)) {
      docsMap.set(item.docId, {
        id: item.docId,
        name: item.metadata?.documentName || 'Unknown',
        chunkCount: 1,
        timestamp: item.metadata?.timestamp
      });
    } else {
      docsMap.get(item.docId).chunkCount++;
    }
  });

  const docsList = Array.from(docsMap.values()).sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  res.json({ documents: docsList });
});

app.delete('/api/documents/:docId', (req, res) => {
  try {
    const { docId } = req.params;
    const deletedCount = vectorStore.deleteByDocId(docId);
    res.json({ success: true, message: `Deleted ${deletedCount} chunks.` });
  } catch (error: any) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Start Server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
