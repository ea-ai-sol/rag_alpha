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

// Track documents separately for better metadata
const DOCS_DB_PATH = './documents_db.json';
let documentsInfo: any[] = [];
if (fs.existsSync(DOCS_DB_PATH)) {
  documentsInfo = JSON.parse(fs.readFileSync(DOCS_DB_PATH, 'utf-8'));
}

function saveDocumentsInfo() {
  fs.writeFileSync(DOCS_DB_PATH, JSON.stringify(documentsInfo, null, 2));
}

// Global flag to track deleted documents and stop their background jobs
const deletedDocIds = new Set<string>();

// API Routes
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, path: filePath, size } = req.file;
    const text = fs.readFileSync(filePath, 'utf-8');
    
    // Clean up uploaded file
    fs.unlinkSync(filePath);

    // 1. Chunk the text with larger chunks to make fewer API calls (Free tier rate limit friendly)
    const chunks = chunkText(text, 5000, 1000);

    // 2. Embed each chunk (Background processing)
    const docId = uuidv4();
    const documentName = originalname;
    
    documentsInfo.push({
      id: docId,
      name: documentName,
      size,
      totalChunks: chunks.length,
      processedChunks: 0,
      status: 'processing',
      timestamp: new Date().toISOString()
    });
    saveDocumentsInfo();
    
    res.json({ success: true, message: `Started processing ${chunks.length} chunks from ${documentName} in the background.` });
    
    // Process in background asynchronously
    (async () => {
      let processed = 0;
      for (const chunk of chunks) {
        if (deletedDocIds.has(docId)) {
          console.log(`Document ${docId} was deleted, stopping background processing.`);
          break;
        }

        try {
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
          processed++;
          
          // Update progress
          const doc = documentsInfo.find(d => d.id === docId);
          if (doc) {
            doc.processedChunks = processed;
            saveDocumentsInfo();
          }
          
          // Free tier allows ~15 requests per minute, so we wait ~4.5 seconds between requests
          await new Promise(resolve => setTimeout(resolve, 4500));
        } catch (err) {
          console.error(`Error processing chunk for ${documentName}:`, err);
        }
      }
      
      const doc = documentsInfo.find(d => d.id === docId);
      if (doc && !deletedDocIds.has(docId)) {
        doc.status = 'completed';
        saveDocumentsInfo();
        console.log(`Finished processing ${processed}/${chunks.length} chunks for ${documentName}`);
      }
    })();
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
  res.json({ documents: documentsInfo.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) });
});

app.delete('/api/documents/:docId', (req, res) => {
  try {
    const { docId } = req.params;
    
    // Mark as deleted for background job
    deletedDocIds.add(docId);
    
    // Remove from documents database
    documentsInfo = documentsInfo.filter(d => d.id !== docId);
    saveDocumentsInfo();
    
    // Remove from vector store
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
