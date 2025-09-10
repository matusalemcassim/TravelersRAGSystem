"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const App = () => {
  // Authentication state
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // All existing state declarations
  const [activeTab, setActiveTab] = useState('chat');
  const [inputText, setInputText] = useState('');
  const [ingestionStatus, setIngestionStatus] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [stats, setStats] = useState({ totalDocuments: 0, totalChunks: 0, lastIngestion: null });
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [conversationLength, setConversationLength] = useState(0);
  
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const router = useRouter();

  const API_URL = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000';

  // Check authentication on component mount
  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const userData = localStorage.getItem('user');
      const storedSessionId = localStorage.getItem('sessionId');

      if (!token || !userData) {
        // No authentication data, redirect to login
        router.push('/login');
        return;
      }

      // Verify token is still valid
      const response = await fetch(`${API_URL}/api/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        // Token is invalid, clear storage and redirect
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        localStorage.removeItem('sessionId');
        router.push('/login');
        return;
      }

      // Authentication is valid
      setAuthToken(token);
      setUser(JSON.parse(userData));
      if (storedSessionId) {
        setSessionId(storedSessionId);
      }
      
      console.log('User authenticated:', JSON.parse(userData));
      
    } catch (error) {
      console.error('Authentication check failed:', error);
      // On error, redirect to login
      router.push('/login');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Call logout endpoint
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local storage and redirect regardless of API call success
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      localStorage.removeItem('sessionId');
      router.push('/login');
    }
  };

  // Helper function to get auth headers
  const getAuthHeaders = () => {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    return headers;
  };

  // Sample questions for demonstration
  const sampleQuestions = [
    "What is property casualty insurance?",
    "When did Travelers repurchase the red umbrella rights?",
    "Tell me about Travelers golf tournament in 2007",
    "Who is Paul Freeman?"
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [chatInput]);

  // File upload handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file) => {
    // Check file type
    const allowedTypes = ['text/plain', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.txt')) {
      setError('Unsupported file type. Please upload .txt, .pdf, or .docx files.');
      return;
    }

    setUploadedFileName(file.name);
    
    try {
      let text = '';
      
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        // Handle text files
        text = await file.text();
      } else if (file.type === 'application/pdf') {
        // TODO: PDF processing will be implemented later
        setError('PDF processing will be implemented soon. Please use .txt files for now.');
        return;
      } else {
        // TODO: Word document processing will be implemented later  
        setError('Word document processing will be implemented soon. Please use .txt files for now.');
        return;
      }
      
      setInputText(text);
      setError(null);
      
    } catch (error) {
      setError(`Failed to read file: ${error.message}`);
      setUploadedFileName('');
    }
  };

  const handleIngestDocument = async () => {
    setError(null);
    setIngestionStatus(null);
    setIsProcessing(true);
    
    try {
      if (!inputText.trim()) {
        throw new Error('Please enter some text to ingest or upload a file.');
      }
      
      const response = await fetch(`${API_URL}/api/ingest`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ documentText: inputText }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      setIngestionStatus(result);
      setStats(prev => ({
        ...prev,
        totalDocuments: prev.totalDocuments + 1,
        totalChunks: prev.totalChunks + result.chunkCount,
        lastIngestion: new Date().toLocaleString()
      }));
      setInputText(''); // Clear the input after successful ingestion
      setUploadedFileName(''); // Clear the uploaded file name
      
    } catch (err) {
      console.error("Ingestion failed:", err);
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async (question = chatInput) => {
    if (!question.trim()) return;

    const userMessage = { sender: 'user', text: question, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsChatProcessing(true);
    setShowWelcome(false);

    try {
      const response = await fetch(`${API_URL}/api/retrieve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          question,
          sessionId: sessionId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      
      // Update session ID if it's new
      if (!sessionId && result.sessionId) {
        setSessionId(result.sessionId);
        localStorage.setItem('sessionId', result.sessionId);
        console.log('Started new conversation session:', result.sessionId);
      }
      
      // Update conversation length
      if (result.conversationLength) {
        setConversationLength(result.conversationLength);
      }
      
      const botMessage = {
        sender: 'bot',
        text: result.answer,
        chunks: result.retrievedChunks,
        searchMethod: result.searchMethod,
        aiModel: result.aiModel,
        tokensUsed: result.tokensUsed,
        needsFollowUp: result.needsFollowUp,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMessage]);

    } catch (err) {
      console.error("Retrieval failed:", err);
      const errorMessage = {
        sender: 'bot',
        text: 'I encountered an error while processing your question. Please try again.',
        chunks: [],
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatProcessing(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isChatProcessing) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = async () => {
    // Clear session on server if exists
    if (sessionId) {
      try {
        await fetch(`${API_URL}/api/clear-session`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ sessionId })
        });
        console.log('Cleared server session:', sessionId);
      } catch (error) {
        console.error('Failed to clear server session:', error);
      }
    }
    
    // Reset frontend state
    setMessages([]);
    setShowWelcome(true);
    setSessionId(null);
    setConversationLength(0);
    localStorage.removeItem('sessionId');
  };

  // Show loading screen while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden">
            <img src="/logo/umbrella.jpg" alt="Company Logo" className="w-full h-full object-contain p-0.5" />
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* User Info Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center overflow-hidden">
              <img src="/logo/umbrella.jpg" alt="Company Logo" className="w-full h-full object-contain p-0.5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Travelers RAG System</h1>
              <p className="text-sm text-gray-300">
                Welcome, {user?.firstName} {user?.lastName} ({user?.role})
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right text-sm">
              <div className="text-gray-300">{user?.department} Department</div>
              <div className="text-gray-400">Access Level: {user?.accessLevel}</div>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
            >
              <span>Logout</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="bg-white/5 backdrop-blur-sm rounded-full p-1 border border-white/10">
            <button
              className={`px-8 py-3 rounded-full font-medium transition-all duration-300 ${
                activeTab === 'chat' 
                  ? 'bg-gradient-to-r from-red-500 to-red-700 text-white shadow-lg transform scale-105' 
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
              onClick={() => setActiveTab('chat')}
            >
              💬 Chat Interface
            </button>
            {(user?.permissions?.documents === 'all' || user?.role === 'admin') && (
              <button
                className={`px-8 py-3 rounded-full font-medium transition-all duration-300 ${
                  activeTab === 'ingest' 
                    ? 'bg-gradient-to-r from-red-500 to-red-700 text-white shadow-lg transform scale-105' 
                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
                onClick={() => setActiveTab('ingest')}
              >
                📄 Document Ingestion
              </button>
            )}
          </div>
        </div>

        {activeTab === 'chat' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
              
              {/* Chat Header */}
              <div className="bg-gradient-to-r from-red-500/10 to-red-700/10 px-6 py-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center overflow-hidden">
                      <img src="/logo/umbrella.jpg" alt="Company Logo" className="w-full h-full object-contain p-0.5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">RAG Assistant</h3>
                      <p className="text-xs text-gray-400">
                        {conversationLength > 0 
                          ? `Conversation active • ${Math.floor(conversationLength / 2)} exchanges`
                          : "Ask questions about your documents"
                        }
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={clearChat}
                    className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="h-[500px] overflow-y-auto px-6 py-4 space-y-4">
                {showWelcome && messages.length === 0 && (
                  <div className="text-center py-8 space-y-6">
                    <div className="text-6xl">🤖</div>
                    <div>
                      <h3 className="text-2xl font-bold mb-2">Welcome to your RAG System</h3>
                      <p className="text-gray-400 mb-2">Ask questions about the documents you've ingested using advanced vector search and keyword matching.</p>
                      <p className="text-sm text-yellow-300">Logged in as: {user?.firstName} {user?.lastName} ({user?.role})</p>
                    </div>
                    <div className="space-y-3">
                      <p className="text-sm text-gray-400 font-medium">Try these sample questions:</p>
                      <div className="grid gap-2 max-w-md mx-auto">
                        {sampleQuestions.map((question, index) => (
                          <button
                            key={index}
                            onClick={() => handleSendMessage(question)}
                            className="text-left p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all duration-300 text-sm hover:transform hover:scale-105 hover:border-red-500/50"
                          >
                            "{question}"
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {messages.map((msg, index) => (
                  <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] ${msg.sender === 'user' ? 'order-2' : 'order-1'}`}>
                      <div className={`flex items-start space-x-3 ${msg.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${
                          msg.sender === 'user' 
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-500' 
                            : 'bg-white'
                        }`}>
                          {msg.sender === 'user' ? (
                            <span className="text-sm font-bold text-white">U</span>
                          ) : (
                            <img src="/logo/umbrella.jpg" alt="Company Logo" className="w-full h-full object-contain p-0.5" />
                          )}
                        </div>
                        <div className={`rounded-2xl px-4 py-3 ${
                          msg.sender === 'user' 
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' 
                            : 'bg-white/10 border border-white/10'
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                          {msg.chunks && msg.chunks.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-white/20">
                              <details className="cursor-pointer">
                                <summary className="text-xs text-gray-300 font-medium mb-2">
                                  View Retrieved Context ({msg.chunks.length} chunks) 
                                  {msg.searchMethod && ` • ${msg.searchMethod}`}
                                  {msg.aiModel && ` • ${msg.aiModel}`}
                                  {msg.tokensUsed && ` • ${msg.tokensUsed} tokens`}
                                </summary>
                                <div className="space-y-2">
                                  {msg.chunks.map((chunk, chunkIndex) => (
                                    <div key={chunkIndex} className="text-xs text-gray-400 bg-black/20 rounded-lg p-2">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="font-mono text-[10px] text-gray-500">{chunk.id}</span>
                                        <span className="text-[10px] text-gray-500">
                                          Score: {chunk.score?.toFixed(3)} {chunk.searchType && `(${chunk.searchType})`}
                                        </span>
                                      </div>
                                      <p className="break-words">{chunk.text}</p>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={`text-xs text-gray-500 mt-1 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                        {msg.timestamp?.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}

                {isChatProcessing && (
                  <div className="flex justify-start">
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center overflow-hidden">
                        <img src="/logo/umbrella.jpg" alt="Company Logo" className="w-full h-full object-contain p-0.5" />
                      </div>
                      <div className="bg-white/10 border border-white/10 rounded-2xl px-4 py-3">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce delay-100"></div>
                          <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce delay-200"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="border-t border-white/10 px-6 py-4 bg-white/5">
                <div className="flex items-end space-x-3">
                  <div className="flex-1">
                    <textarea
                      ref={textareaRef}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none transition-all duration-300"
                      placeholder="Ask a question about your documents..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      style={{ minHeight: '44px', maxHeight: '120px' }}
                    />
                  </div>
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={isChatProcessing || !chatInput.trim()}
                    className={`px-6 py-3 rounded-xl font-medium transition-all duration-300 flex items-center space-x-2 ${
                      isChatProcessing || !chatInput.trim()
                        ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                        : 'bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                    }`}
                  >
                    <span>Send</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ingest' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8 shadow-2xl">
              <div className="text-center mb-8">
                <div className="text-6xl mb-4">📚</div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-red-200 bg-clip-text text-transparent mb-3">
                  Document Ingestion Pipeline
                </h2>
                <p className="text-gray-400 max-w-2xl mx-auto">
                  Upload your documents to the Neo4j vector database. The system will automatically chunk, embed, and index your content for intelligent retrieval.
                </p>
                <p className="text-sm text-yellow-300 mt-2">
                  Logged in as: {user?.firstName} {user?.lastName} ({user?.role})
                </p>
              </div>

              <div className="space-y-6">
                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="text-center">
                      <div className="text-2xl mb-2">📄</div>
                      <div className="text-lg font-semibold">{stats.totalDocuments}</div>
                      <div className="text-xs text-gray-400">Documents</div>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="text-center">
                      <div className="text-2xl mb-2">🧩</div>
                      <div className="text-lg font-semibold">{stats.totalChunks}</div>
                      <div className="text-xs text-gray-400">Chunks</div>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="text-center">
                      <div className="text-2xl mb-2">⏱️</div>
                      <div className="text-lg font-semibold text-green-400">Active</div>
                      <div className="text-xs text-gray-400">Status</div>
                    </div>
                  </div>
                </div>

                {/* File Upload Drop Zone */}
                <div
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 cursor-pointer ${
                    dragActive 
                      ? 'border-red-500 bg-red-500/10' 
                      : 'border-white/30 hover:border-red-500/50 hover:bg-white/5'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    accept=".txt,.pdf,.doc,.docx"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-4 pointer-events-none">
                    <div className="text-4xl">📁</div>
                    <div>
                      <h3 className="text-lg font-semibold mb-2">
                        {dragActive ? 'Drop your file here' : 'Drop files or click to upload'}
                      </h3>
                      <p className="text-gray-400 text-sm">
                        Supports .txt files (PDF and Word processing coming soon)
                      </p>
                      {uploadedFileName && (
                        <p className="text-red-400 text-sm mt-2">
                          📎 {uploadedFileName}
                        </p>
                      )}
                    </div>
                    <div className="inline-flex items-center px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg transition-colors">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Choose File
                    </div>
                  </div>
                </div>

                <div className="text-center text-sm text-gray-400">
                  <span>— OR —</span>
                </div>

                <textarea
                  className="w-full h-64 bg-white/10 border border-white/20 rounded-xl px-6 py-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-300"
                  placeholder="Or paste your document content here... (insurance policies, company information, etc.)"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />

                <button
                  onClick={handleIngestDocument}
                  disabled={isProcessing || !inputText.trim()}
                  className={`w-full py-4 px-6 rounded-xl font-bold transition-all duration-300 transform flex items-center justify-center space-x-2 ${
                    isProcessing || !inputText.trim()
                      ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                      : 'bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white shadow-lg hover:shadow-xl hover:scale-105'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Processing Document...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span>Ingest Document</span>
                    </>
                  )}
                </button>

                {error && (
                  <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-4 rounded-xl">
                    <div className="flex items-center space-x-2">
                      <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium">Error</span>
                    </div>
                    <p className="mt-2">{error}</p>
                  </div>
                )}

                {ingestionStatus && (
                  <div className="bg-green-500/20 border border-green-500/50 text-green-200 p-6 rounded-xl">
                    <div className="flex items-center space-x-2 mb-4">
                      <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-bold text-lg">Document Ingested Successfully!</span>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Document ID:</span>
                        <div className="font-mono text-xs text-green-300 bg-black/20 rounded px-2 py-1 mt-1">
                          {ingestionStatus.documentId}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Chunks Created:</span>
                        <div className="text-2xl font-bold text-green-400 mt-1">
                          {ingestionStatus.chunkCount}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-green-300 mt-4 italic">
                      Your document is now searchable! Switch to the Chat tab to ask questions.
                    </p>
                  </div>
                )}

                {stats.lastIngestion && (
                  <div className="text-center text-sm text-gray-400">
                    Last ingestion: {stats.lastIngestion}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;