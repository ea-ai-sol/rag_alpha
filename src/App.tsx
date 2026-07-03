import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Send, Loader2, Trash2, Database, MessageSquare, Plus, CheckCircle2 } from 'lucide-react';

interface Document {
  id: string;
  name: string;
  size: number;
  totalChunks: number;
  processedChunks: number;
  status: 'processing' | 'completed';
  timestamp: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function App() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  
  const [isUploading, setIsUploading] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDocuments();
    
    // Poll for document updates every 3 seconds to show background processing progress
    const interval = setInterval(fetchDocuments, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (data.documents) {
        setDocuments(data.documents);
      }
    } catch (error) {
      console.error('Failed to fetch documents', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned a non-JSON response (Status ${res.status}): ${text.substring(0, 100)}...`);
      }
      
      if (data.success) {
        await fetchDocuments();
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        alert(data.error || 'Failed to upload');
      }
    } catch (error) {
      console.error('Upload error', error);
      alert('Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document and its embeddings?')) return;
    
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchDocuments();
      }
    } catch (error) {
      console.error('Delete error', error);
    }
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isQuerying) return;

    const currentQuery = query.trim();
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: currentQuery }]);
    
    setIsQuerying(true);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: currentQuery }),
      });
      
      const data = await res.json();
      
      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.answer,
          sources: data.sources 
        }]);
      }
    } catch (error) {
      console.error('Query error', error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error while processing your request.' }]);
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-zinc-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-sm">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-zinc-900 leading-tight">Local RAG Workspace</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden max-w-[1400px] w-full mx-auto">
        
        {/* Left Sidebar - Documents */}
        <div className="w-80 flex flex-col bg-zinc-50/50 border-r border-zinc-200 h-[calc(100vh-73px)]">
          <div className="p-5 border-b border-zinc-200/60 bg-white/30">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center justify-between">
              Knowledge Base
              <span className="bg-zinc-200 text-zinc-600 px-2 py-0.5 rounded-full text-[10px]">{documents.length}</span>
            </h2>
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white py-2.5 px-4 rounded-xl font-medium text-sm transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 shadow-sm"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {isUploading ? 'Uploading...' : 'Upload Document'}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".txt,.md,.csv" 
              className="hidden" 
            />
            <p className="text-[11px] text-zinc-400 mt-3 text-center">Supports plain text files (.txt, .md, .csv)</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            {documents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 opacity-70">
                <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-zinc-200 flex items-center justify-center mb-4">
                  <FileText className="w-6 h-6 text-zinc-400" />
                </div>
                <p className="text-sm font-medium text-zinc-600">No documents yet</p>
                <p className="text-xs text-zinc-400 mt-1">Upload a file to start indexing</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {documents.map(doc => (
                  <div key={doc.id} className="group relative bg-white border border-zinc-200 rounded-xl p-3.5 hover:border-indigo-300 hover:shadow-sm transition-all duration-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-8">
                        <h3 className="text-sm font-semibold text-zinc-800 truncate" title={doc.name}>{doc.name}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px] text-zinc-500 font-medium bg-zinc-100 px-1.5 py-0.5 rounded-md">{formatBytes(doc.size)}</span>
                          {doc.status === 'processing' ? (
                            <span className="text-[11px] text-amber-600 font-medium flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {doc.processedChunks}/{doc.totalChunks} chunks
                            </span>
                          ) : (
                            <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                              <CheckCircle2 className="w-3 h-3" />
                              Indexed
                            </span>
                          )}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="absolute right-3 top-3 p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200"
                        title="Delete Document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Models Info */}
          <div className="p-4 border-t border-zinc-200/60 bg-zinc-50 text-[11px] font-medium text-zinc-500">
            <div className="flex flex-col gap-2.5">
               <div className="flex items-center justify-between">
                 <span className="uppercase tracking-wider text-[10px]">Embeddings</span>
                 <span className="bg-white px-2 py-0.5 rounded border border-zinc-200 shadow-sm font-mono text-[10px] text-zinc-600">gemini-embedding-2</span>
               </div>
               <div className="flex items-center justify-between">
                 <span className="uppercase tracking-wider text-[10px]">Chat</span>
                 <span className="bg-white px-2 py-0.5 rounded border border-zinc-200 shadow-sm font-mono text-[10px] text-zinc-600">gemini-3.5-flash</span>
               </div>
            </div>
          </div>
        </div>

        {/* Right Area - Chat/Query */}
        <div className="flex-1 flex flex-col bg-white h-[calc(100vh-73px)] relative">
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-indigo-100">
                  <MessageSquare className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-xl font-semibold text-zinc-900 mb-3">Chat with your knowledge base</h3>
                <p className="text-[15px] text-zinc-500 leading-relaxed">
                  Upload a document on the left, then ask questions about its content here. The AI will find relevant sections and answer your query using only the provided context.
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-8">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group animate-in slide-in-from-bottom-2 fade-in duration-300`}>
                    <div className={`max-w-[85%] rounded-3xl px-6 py-4 ${
                      msg.role === 'user' 
                        ? 'bg-zinc-900 text-white rounded-br-sm shadow-sm' 
                        : 'bg-zinc-50 border border-zinc-200 text-zinc-800 rounded-bl-sm shadow-sm'
                    }`}>
                      <div className="prose prose-sm max-w-none prose-p:leading-relaxed">
                        {msg.content.split('\n').map((line, j) => (
                          <p key={j} className={j > 0 ? 'mt-2' : ''}>{line}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {isQuerying && (
              <div className="flex justify-start max-w-3xl mx-auto">
                <div className="bg-zinc-50 border border-zinc-200 text-zinc-800 rounded-3xl rounded-bl-sm px-6 py-4 shadow-sm flex items-center gap-3 animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                  <span className="text-sm font-medium text-zinc-500">Searching documents and generating response...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>

          {/* Input Area */}
          <div className="p-4 sm:p-6 bg-white border-t border-zinc-100">
            <form onSubmit={handleQuery} className="max-w-3xl mx-auto relative flex items-end gap-3 group">
              <div className="relative flex-1 bg-zinc-50 border border-zinc-200 rounded-3xl transition-all duration-200 focus-within:ring-4 focus-within:ring-indigo-50 focus-within:border-indigo-300 focus-within:bg-white shadow-sm">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={documents.length === 0 ? "Upload a document first..." : "Ask a question about your documents..."}
                  disabled={documents.length === 0 || isQuerying}
                  className="w-full bg-transparent border-none rounded-3xl py-4 pl-6 pr-14 text-[15px] outline-none disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-zinc-400"
                />
                <button
                  type="submit"
                  disabled={!query.trim() || documents.length === 0 || isQuerying}
                  className="absolute right-2 bottom-2 p-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm disabled:hover:bg-indigo-600 active:scale-95"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </div>
            </form>
            <div className="text-center mt-3 text-[11px] font-medium text-zinc-400">
              AI can make mistakes. Always verify information with the source documents.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
