import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Send, Loader2, Trash2, Database, MessageSquare, Plus } from 'lucide-react';

interface Document {
  id: string;
  name: string;
  chunkCount: number;
  timestamp: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
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
      
      const data = await res.json();
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
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Database className="w-6 h-6 text-indigo-600" />
          <h1 className="text-xl font-semibold tracking-tight">Local RAG Workspace</h1>
        </div>
        <div className="text-sm text-neutral-500 font-medium">
          Powered by Gemini AI
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden max-w-7xl w-full mx-auto">
        
        {/* Left Sidebar - Documents */}
        <div className="w-80 flex flex-col bg-white border-r border-neutral-200 h-[calc(100vh-65px)]">
          <div className="p-4 border-b border-neutral-200">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4">Knowledge Base</h2>
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-md font-medium transition-colors disabled:opacity-70"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {isUploading ? 'Indexing...' : 'Upload Document'}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".txt,.md,.csv" 
              className="hidden" 
            />
            <p className="text-xs text-neutral-400 mt-2 text-center">Supports .txt, .md, .csv</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {documents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 opacity-60">
                <FileText className="w-8 h-8 mb-3 text-neutral-400" />
                <p className="text-sm">No documents indexed yet. Upload a file to start.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map(doc => (
                  <div key={doc.id} className="group relative bg-neutral-50 border border-neutral-200 rounded-lg p-3 hover:border-indigo-300 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-6">
                        <h3 className="text-sm font-medium text-neutral-800 truncate">{doc.name}</h3>
                        <p className="text-xs text-neutral-500 mt-1">{doc.chunkCount} chunks • {new Date(doc.timestamp).toLocaleDateString()}</p>
                      </div>
                      <button 
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="absolute right-2 top-2 p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
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
        </div>

        {/* Right Area - Chat/Query */}
        <div className="flex-1 flex flex-col bg-neutral-50 h-[calc(100vh-65px)] relative">
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-60 max-w-sm mx-auto">
                <MessageSquare className="w-10 h-10 mb-4 text-indigo-500" />
                <h3 className="text-lg font-medium text-neutral-800 mb-2">Ask your documents</h3>
                <p className="text-sm text-neutral-500">
                  Upload a text document on the left, then ask questions about its content here. The AI will find relevant sections and answer your query.
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-5 py-4 ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white rounded-br-none shadow-sm' 
                      : 'bg-white border border-neutral-200 text-neutral-800 rounded-bl-none shadow-sm'
                  }`}>
                    <div className="prose prose-sm max-w-none">
                      {msg.content.split('\n').map((line, j) => (
                        <p key={j} className={j > 0 ? 'mt-2' : ''}>{line}</p>
                      ))}
                    </div>
                    
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-neutral-100">
                        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Sources Referenced</p>
                        <div className="space-y-2">
                          {msg.sources.map((source, j) => (
                            <div key={j} className="bg-neutral-50 rounded p-2 text-xs border border-neutral-100">
                              <span className="font-medium text-indigo-600 block mb-1">
                                {source.documentName} <span className="text-neutral-400 font-normal">({(source.score * 100).toFixed(1)}% match)</span>
                              </span>
                              <span className="text-neutral-600 line-clamp-2 italic">"{source.text}"</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            
            {isQuerying && (
              <div className="flex justify-start">
                <div className="bg-white border border-neutral-200 text-neutral-800 rounded-2xl rounded-bl-none px-5 py-4 shadow-sm flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span className="text-sm font-medium text-neutral-500">Analyzing documents...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-neutral-200">
            <form onSubmit={handleQuery} className="max-w-3xl mx-auto relative flex items-end gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={documents.length === 0 ? "Upload a document first..." : "Ask a question about your documents..."}
                  disabled={documents.length === 0 || isQuerying}
                  className="w-full bg-neutral-100 border-none rounded-full py-3.5 pl-6 pr-12 text-sm focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <button
                type="submit"
                disabled={!query.trim() || documents.length === 0 || isQuerying}
                className="absolute right-2 bottom-1.5 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="text-center mt-2 text-[10px] text-neutral-400">
              AI can make mistakes. Verify information from the source documents.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
