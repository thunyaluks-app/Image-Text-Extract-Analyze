import React, { useState, useCallback, useRef } from 'react';
import { analyzeImage, analyzeTextAndStartChat, continueChat, generateFilenameFromText } from './services/geminiService';
import type { Chat } from '@google/genai';
import Spinner from './components/Spinner';

const App: React.FC = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  const [expertAnalysis, setExpertAnalysis] = useState<string>('');
  const [isAnalyzingText, setIsAnalyzingText] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [expertError, setExpertError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
      setImageFile(file);
      const newImageUrl = URL.createObjectURL(file);
      setImageUrl(newImageUrl);
      setError(null);
    }
  };

  const handleTextFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            setAnalysisResult(prev => prev ? `${prev}\n\n${text}` : text);
            // Reset downstream analysis and chat states
            setExpertAnalysis('');
            setChatSession(null);
            setChatInput('');
            setExpertError(null);
            setError(null);
        };
        reader.onerror = () => {
            setError('เกิดข้อผิดพลาดในการอ่านไฟล์');
        };
        reader.readAsText(file, 'UTF-8');
    }
    // Reset the file input so the onChange event fires again for the same file.
    if (event.target) {
        event.target.value = '';
    }
  };

  const handleAnalyzeClick = useCallback(async () => {
    if (!imageFile) {
      setError('กรุณาเลือกไฟล์รูปภาพก่อน');
      return;
    }

    setIsLoading(true);
    setError(null);
    setExpertAnalysis('');
    setChatSession(null);
    setChatInput('');
    setExpertError(null);

    try {
      const result = await analyzeImage(imageFile);
      setAnalysisResult(prev => {
        if (!prev) {
          return result;
        }

        let overlapLength = 0;
        const minLength = Math.min(prev.length, result.length);
        for (let i = minLength; i > 0; i--) {
          if (prev.endsWith(result.substring(0, i))) {
            overlapLength = i;
            break;
          }
        }
        
        if (overlapLength > 0) {
          return prev + result.substring(overlapLength);
        } else {
          return `${prev}\n\n---\n\n${result}`;
        }
      });
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการวิเคราะห์ภาพ');
    } finally {
      setIsLoading(false);
    }
  }, [imageFile]);

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  }
  
  const triggerTextFileSelect = () => {
    textFileInputRef.current?.click();
  };

  const handleClearImage = () => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    setImageFile(null);
    setImageUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearText = () => {
    setAnalysisResult('');
    setExpertAnalysis('');
    setChatSession(null);
    setChatInput('');
    setExpertError(null);
  };

  const handleSaveToFile = async () => {
    if (!analysisResult || isSaving) return;
    
    setIsSaving(true);
    setError(null);

    try {
        const suggestedName = await generateFilenameFromText(analysisResult);

        const now = new Date();
        const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-mm-ss
        const timestamp = `${date}_${time}`;

        const finalFilename = `${suggestedName}_${timestamp}.txt`;

        const blob = new Blob([analysisResult], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = finalFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (err: any) {
        setError(err.message || "เกิดข้อผิดพลาดในการสร้างชื่อไฟล์");
        // Fallback to original save logic on error
        const blob = new Blob([analysisResult], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gemini-analysis-result_${new Date().toISOString()}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } finally {
        setIsSaving(false);
    }
  };

  const handleAnalyzeTextClick = async () => {
    if (!analysisResult || isLoading) return;

    setIsAnalyzingText(true);
    setExpertError(null);
    setChatSession(null);
    setExpertAnalysis('');

    try {
        const { chat, initialResponse } = await analyzeTextAndStartChat(analysisResult);
        setChatSession(chat);
        setExpertAnalysis(initialResponse);
    } catch (err: any) {
        setExpertError(err.message || 'เกิดข้อผิดพลาดในการวิเคราะห์ข้อความ');
    } finally {
        setIsAnalyzingText(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatInput.trim() || !chatSession || isAnalyzingText) return;

      const userMessage = chatInput.trim();
      setExpertAnalysis(prev => `${prev}\n\n---\n\n**You:**\n${userMessage}`);
      setChatInput('');
      setIsAnalyzingText(true);
      setExpertError(null);

      try {
          const response = await continueChat(chatSession, userMessage);
          setExpertAnalysis(prev => `${prev}\n\n**AI:**\n${response}`);
      } catch (err: any) {
          setExpertError(err.message || 'เกิดข้อผิดพลาดในการตอบกลับ');
          setExpertAnalysis(prev => `${prev}\n\n*เกิดข้อผิดพลาด โปรดลองอีกครั้ง*`);
      } finally {
          setIsAnalyzingText(false);
      }
  };


  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Gemini Image Analyzer
          </h1>
          <p className="text-gray-400 mt-2">อัปโหลดภาพเพื่อให้ AI วิเคราะห์และดึงข้อความออกมา</p>
        </header>

        <main className="space-y-6">
          <div className="bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg p-6 flex flex-col items-center justify-center text-center">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="hidden"
              id="file-upload"
            />
             <input
              type="file"
              accept=".txt"
              onChange={handleTextFileChange}
              ref={textFileInputRef}
              className="hidden"
              id="text-file-upload"
            />
            <button
                onClick={triggerFileSelect}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
            >
                เลือกรูปภาพ
            </button>
            {imageFile && <p className="mt-4 text-gray-300">ไฟล์ที่เลือก: {imageFile.name}</p>}
          </div>

          {imageUrl && (
            <div className="w-full max-w-[600px] mx-auto bg-gray-800 rounded-lg overflow-hidden shadow-lg border border-gray-700">
              <img src={imageUrl} alt="Preview" className="w-full h-auto object-contain" />
            </div>
          )}

          <div className="flex justify-center flex-wrap gap-4">
            <button
              onClick={handleAnalyzeClick}
              disabled={!imageFile || isLoading}
              className="flex-grow sm:flex-grow-0 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-opacity-50"
            >
              {isLoading ? (
                <>
                  <Spinner />
                  กำลังวิเคราะห์...
                </>
              ) : (
                'วิเคราะห์รูปภาพ'
              )}
            </button>
            {imageFile && !isLoading && (
              <button
                onClick={handleClearImage}
                className="flex-grow sm:flex-grow-0 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
              >
                เคลียร์รูปภาพ
              </button>
            )}
          </div>
          
          {error && <p className="text-red-400 text-center">{error}</p>}

          <div className="w-full">
            <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
              <label htmlFor="results" className="block text-lg font-medium text-gray-300">
                ผลลัพธ์จากการวิเคราะห์:
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={triggerTextFileSelect}
                    className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-1 px-3 rounded-md transition-colors"
                    aria-label="Open a text file"
                  >
                    เปิดไฟล์ .txt
                  </button>
                {analysisResult && (
                  <>
                    <button
                      onClick={handleAnalyzeTextClick}
                      disabled={isAnalyzingText || isLoading}
                      className="text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md transition-colors flex items-center gap-1"
                      aria-label="Analyze extracted text"
                    >
                      {isAnalyzingText && !chatSession ? <Spinner/> : null}
                      {isAnalyzingText && !chatSession ? 'กำลังวิเคราะห์...' : 'วิเคราะห์ข้อมูล'}
                    </button>
                    <button
                      onClick={handleSaveToFile}
                      disabled={isSaving}
                      className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md transition-colors flex items-center gap-1"
                      aria-label="Save analysis results to a text file"
                    >
                      {isSaving ? (
                        <>
                          <Spinner />
                          กำลังบันทึก...
                        </>
                      ) : (
                        'บันทึกเป็น .txt'
                      )}
                    </button>
                    <button
                      onClick={handleClearText}
                      className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold py-1 px-3 rounded-md transition-colors"
                      aria-label="Clear analysis results"
                    >
                      เคลียร์ข้อความ
                    </button>
                  </>
                )}
              </div>
            </div>
            <textarea
              id="results"
              readOnly
              value={analysisResult}
              placeholder="ข้อความที่ AI ดึงมาจากรูปภาพจะแสดงที่นี่..."
              className="w-full p-4 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 resize-y font-mono"
              style={{ minHeight: '10rem', height: '20rem' }}
            />
          </div>

          {expertError && <p className="text-red-400 text-center mt-4">{expertError}</p>}
          
          {(isAnalyzingText && !chatSession) && (
             <div className="flex justify-center items-center gap-2 text-gray-400">
                <Spinner/>
                <span>ผู้เชี่ยวชาญกำลังวิเคราะห์ข้อมูล...</span>
             </div>
          )}

          {chatSession && (
            <div className="w-full mt-6 space-y-4">
              <div>
                <label htmlFor="expert-results" className="block text-lg font-medium text-gray-300 mb-2">
                  ผลการวิเคราะห์โดยผู้เชี่ยวชาญ:
                </label>
                <textarea
                  id="expert-results"
                  readOnly
                  value={expertAnalysis}
                  placeholder="ผลการวิเคราะห์จะแสดงที่นี่..."
                  className="w-full p-4 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 resize-none font-mono"
                  style={{ height: '22.5rem' }}
                />
              </div>
          
              <form onSubmit={handleChatSubmit}>
                <label htmlFor="chat-input" className="block text-lg font-medium text-gray-300 mb-2">
                  สอบถามเพิ่มเติม:
                </label>
                <textarea
                  id="chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="พิมพ์คำถามของคุณที่นี่..."
                  className="w-full p-4 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 resize-none font-mono"
                  style={{ height: '7.5rem' }}
                  disabled={isAnalyzingText}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSubmit(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isAnalyzingText}
                  className="mt-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
                >
                  {isAnalyzingText ? (
                    <>
                      <Spinner />
                      กำลังส่ง...
                    </>
                  ) : (
                    'ส่งคำถาม'
                  )}
                </button>
              </form>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

export default App;