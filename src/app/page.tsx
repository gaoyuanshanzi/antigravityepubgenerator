'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  BookOpen,
  Settings,
  AlertTriangle,
  Play,
  Pause,
  Download,
  LogOut,
  CheckCircle,
  RefreshCw,
  Key,
  Image as ImageIcon,
  Book,
  FileText,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { buildEpub, EpubChapter } from '@/utils/epubBuilder';

// Interface for chapter state in frontend
interface ChapterItem {
  title: string;
  originalText: string;
  translatedText: string;
  summary: string;
  status: 'pending' | 'translating' | 'completed' | 'error';
  errorMessage?: string;
  illustrationPrompt?: string;
  illustrationUrl?: string;
  illustrationBuffer?: ArrayBuffer;
}

export default function Home() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [adminId, setAdminId] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  // Book Configurations
  const [bookTitle, setBookTitle] = useState<string>('');
  const [author, setAuthor] = useState<string>('Becko Hyun');
  const [publisher, setPublisher] = useState<string>('Evvia Publishing');
  const [contact, setContact] = useState<string>('evviacorp@gmail.com');

  // Translation & Style Configurations
  const [geminiModel, setGeminiModel] = useState<string>('gemini-2.5-flash');
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [artStyle, setArtStyle] = useState<string>('watercolor painting, dreamy atmosphere, soft colors');
  const [guidelines, setGuidelines] = useState<string>(
    'Maintain standard literary English narrative style. Keep it readable, natural, and immersive. Use a consistent voice.'
  );
  const [glossary, setGlossary] = useState<string>(
    `홍길동 -> Hong Gildong\n임꺽정 -> Im Kkeokjeong\n율도국 -> Yuldo Kingdom`
  );

  // Parse & Progress States
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [storySummary, setStorySummary] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(-1);
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [coverBuffer, setCoverBuffer] = useState<ArrayBuffer | null>(null);
  const [isGeneratingCover, setIsGeneratingCover] = useState<boolean>(false);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState<number>(0);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [parseLogs, setParseLogs] = useState<string>('');

  // Keep ref to translation state so loop can check if paused
  const isTranslatingRef = useRef<boolean>(false);
  isTranslatingRef.current = isTranslating;

  // Check Session Storage for authentication
  useEffect(() => {
    const authSession = sessionStorage.getItem('evvia_admin_session');
    const savedApiKey = sessionStorage.getItem('evvia_gemini_api_key');
    if (authSession === 'authenticated' && savedApiKey) {
      setIsAuthenticated(true);
      setCustomApiKey(savedApiKey);
    }
  }, []);

  // Handle Login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customApiKey.trim()) {
      setAuthError('Gemini API Key를 입력하세요.');
      return;
    }
    if (adminId === 'admin' && adminPassword === '123jesus') {
      sessionStorage.setItem('evvia_admin_session', 'authenticated');
      sessionStorage.setItem('evvia_gemini_api_key', customApiKey.trim());
      setIsAuthenticated(true);
      setAuthError('');
    } else {
      setAuthError('ID 또는 비밀번호가 일치하지 않습니다.');
    }
  };

  // Handle Logout
  const handleLogout = () => {
    sessionStorage.removeItem('evvia_admin_session');
    sessionStorage.removeItem('evvia_gemini_api_key');
    setIsAuthenticated(false);
    setAdminId('');
    setAdminPassword('');
    setCustomApiKey('');
  };

  // Split Korean document into chapters based on headings or paragraphs
  const parseDocument = (htmlContent: string, rawText: string) => {
    setParseLogs('문서 해석 중...');
    
    // We try to parse using HTML tags first
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const headings = doc.querySelectorAll('h1, h2, h3, h4');

    let parsedChapters: { title: string; text: string }[] = [];

    if (headings.length > 1) {
      setParseLogs(`HTML 제목 태그(${headings.length}개) 발견. 제목 기준으로 챕터를 나눕니다.`);
      headings.forEach((heading, idx) => {
        const title = heading.textContent?.trim() || `Chapter ${idx + 1}`;
        let contentText = '';
        let nextSibling = heading.nextElementSibling;
        
        // Accumulate text paragraphs until next heading
        while (nextSibling && !['H1', 'H2', 'H3', 'H4'].includes(nextSibling.tagName)) {
          if (nextSibling.textContent) {
            contentText += nextSibling.textContent.trim() + '\n\n';
          }
          nextSibling = nextSibling.nextElementSibling;
        }

        if (contentText.trim().length > 0) {
          parsedChapters.push({ title, text: contentText.trim() });
        }
      });
    }

    // Fallback: Split raw text by paragraph rules
    if (parsedChapters.length === 0) {
      setParseLogs('제목 태그 미발견. 텍스트 패턴(예: 제1장, 제 1 화, Chapter 1) 기준으로 챕터를 나눕니다.');
      const paragraphs = rawText.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
      
      // Look for paragraphs matching chapter patterns
      const chapterPattern = /^(제\s*\d+\s*[장화화강편])|^(chapter\s*\d+)|^(초장|프롤로그|에필로그|prologue|epilogue)/i;
      
      let currentTitle = 'Prologue';
      let currentContent = '';

      paragraphs.forEach((p) => {
        if (chapterPattern.test(p) && p.length < 50) {
          // If we had a previous chapter accumulated, save it
          if (currentContent.trim()) {
            parsedChapters.push({ title: currentTitle, text: currentContent.trim() });
          }
          currentTitle = p;
          currentContent = '';
        } else {
          currentContent += p + '\n\n';
        }
      });

      // Save the last chapter
      if (currentContent.trim()) {
        parsedChapters.push({ title: currentTitle, text: currentContent.trim() });
      }
    }

    // Fallback 2: If still only one or zero chapters, split by word chunks
    if (parsedChapters.length <= 1) {
      const textToSplit = rawText.trim() || '본문 내용이 비어 있습니다.';
      const words = textToSplit.split(/\s+/);
      
      if (words.length > 3000) {
        setParseLogs(`구분선 미발견. 소설 분량이 크므로(${words.length} 단어) 3,000단어 단위로 자동 분할합니다.`);
        const wordsPerChapter = 3000;
        let chapterIndex = 1;
        
        for (let i = 0; i < words.length; i += wordsPerChapter) {
          const chunk = words.slice(i, i + wordsPerChapter).join(' ');
          parsedChapters.push({
            title: `Chapter ${chapterIndex}`,
            text: chunk,
          });
          chapterIndex++;
        }
      } else {
        setParseLogs('단일 챕터로 읽어옵니다.');
        parsedChapters = [{ title: 'Chapter 1', text: textToSplit }];
      }
    }

    // Convert to ChapterItem structure
    const items: ChapterItem[] = parsedChapters.map((ch) => ({
      title: ch.title,
      originalText: ch.text,
      translatedText: '',
      summary: '',
      status: 'pending',
    }));

    setChapters(items);
    setSelectedChapterIndex(0);
    setParseLogs(`파싱 완료: 총 ${items.length}개의 챕터가 감지되었습니다.`);
  };

  // Handle .docx File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsLoadingFile(true);
    const file = files[0];
    
    // Auto-detect title from file name (without extension)
    const detectedTitle = file.name.replace(/\.[^/.]+$/, "");
    setBookTitle(detectedTitle);

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // Dynamically import mammoth to prevent SSR issues
      const mammoth = await import('mammoth');
      
      const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
      const textResult = await mammoth.extractRawText({ arrayBuffer });
      
      parseDocument(htmlResult.value, textResult.value);
    } catch (error: any) {
      console.error('File parsing error:', error);
      setParseLogs(`파일 파싱 중 에러 발생: ${error?.message || error}`);
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Run translation loop sequentially
  const startTranslation = async () => {
    if (chapters.length === 0) return;
    setIsTranslating(true);

    // Find first non-completed chapter index to resume from
    let startIndex = chapters.findIndex(ch => ch.status !== 'completed');
    if (startIndex === -1) startIndex = 0; // If all completed, start from beginning

    setActiveChapterIndex(startIndex);

    for (let i = startIndex; i < chapters.length; i++) {
      // Check if user clicked pause
      if (!isTranslatingRef.current) {
        break;
      }

      setActiveChapterIndex(i);
      setSelectedChapterIndex(i);
      
      // Update chapter status to translating
      setChapters(prev => {
        const copy = [...prev];
        copy[i] = { ...copy[i], status: 'translating', errorMessage: undefined };
        return copy;
      });

      try {
        const prevChapterTail = i > 0 ? chapters[i - 1].translatedText.slice(-600) : '';

        // 1. Call translation API
        const translateResponse = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: chapters[i].originalText,
            storySummary: storySummary,
            glossary: glossary,
            translationGuidelines: guidelines,
            previousChapterTail: prevChapterTail,
            apiKey: customApiKey || undefined,
            model: geminiModel,
          }),
        });

        if (!translateResponse.ok) {
          const errData = await translateResponse.json();
          throw new Error(errData.error || `Translation server returned status ${translateResponse.status}`);
        }

        const translateData = await translateResponse.json();
        const { translation, chapterSummary } = translateData;

        // Update story summary with the new chapter summary
        const updatedStorySummary = storySummary
          ? `${storySummary}\nChapter ${i + 1}: ${chapterSummary}`
          : `Chapter ${i + 1}: ${chapterSummary}`;
        setStorySummary(updatedStorySummary);

        // 2. Generate illustration prompt
        const promptResponse = await fetch('/api/generate-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: chapters[i].title,
            summary: chapterSummary,
            artStyle: artStyle,
            apiKey: customApiKey || undefined,
            model: geminiModel,
          }),
        });

        let illustrationPrompt = `${chapters[i].title}, ${artStyle}`;
        if (promptResponse.ok) {
          const promptData = await promptResponse.ok ? await promptResponse.json() : null;
          if (promptData && promptData.prompt) {
            illustrationPrompt = promptData.prompt;
          }
        }

        // 3. Fetch image through proxy
        const seed = Math.floor(Math.random() * 1000000);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(illustrationPrompt)}?width=800&height=1000&nologo=true&seed=${seed}`;
        
        let illustrationBuffer: ArrayBuffer | undefined = undefined;
        let illustrationUrl: string | undefined = undefined;

        try {
          const imageResponse = await fetch(`/api/fetch-image?url=${encodeURIComponent(imageUrl)}`);
          if (imageResponse.ok) {
            illustrationBuffer = await imageResponse.arrayBuffer();
            illustrationUrl = URL.createObjectURL(new Blob([illustrationBuffer], { type: 'image/jpeg' }));
          }
        } catch (imgErr) {
          console.error(`Failed to fetch illustration for Chapter ${i + 1}:`, imgErr);
        }

        // Update chapters state with translation and images
        setChapters(prev => {
          const copy = [...prev];
          copy[i] = {
            ...copy[i],
            status: 'completed',
            translatedText: translation,
            summary: chapterSummary,
            illustrationPrompt,
            illustrationUrl,
            illustrationBuffer,
          };
          return copy;
        });

      } catch (error: any) {
        console.error(`Error in Chapter ${i + 1}:`, error);
        setChapters(prev => {
          const copy = [...prev];
          copy[i] = {
            ...copy[i],
            status: 'error',
            errorMessage: error?.message || 'Unknown translation error occurred.',
          };
          return copy;
        });
        setIsTranslating(false);
        break; // Stop loop on error
      }
    }

    setIsTranslating(false);
  };

  // Pause translation
  const pauseTranslation = () => {
    setIsTranslating(false);
  };

  // Generate Cover Image based on overall story summary
  const generateCoverImage = async () => {
    if (!bookTitle) return;
    setIsGeneratingCover(true);

    try {
      // Use storySummary or description if summary empty
      const summaryText = storySummary || `A novel titled ${bookTitle} written by ${author}.`;
      
      const promptResponse = await fetch('/api/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: bookTitle,
          summary: `This is a book cover art prompt for the novel titled "${bookTitle}". The summary of the book is: ${summaryText}`,
          artStyle: `${artStyle}, professional book cover design, epic layout, focal point, title spacing`,
          apiKey: customApiKey || undefined,
          model: geminiModel,
        }),
      });

      let coverPrompt = `Stunning professional book cover design for a novel titled "${bookTitle}" in the art style of ${artStyle}`;
      if (promptResponse.ok) {
        const promptData = await promptResponse.json();
        if (promptData && promptData.prompt) {
          coverPrompt = promptData.prompt;
        }
      }

      const seed = Math.floor(Math.random() * 1000000);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(coverPrompt)}?width=800&height=1200&nologo=true&seed=${seed}`;
      
      const imageResponse = await fetch(`/api/fetch-image?url=${encodeURIComponent(imageUrl)}`);
      if (imageResponse.ok) {
        const buffer = await imageResponse.arrayBuffer();
        setCoverBuffer(buffer);
        setCoverUrl(URL.createObjectURL(new Blob([buffer], { type: 'image/jpeg' })));
      } else {
        throw new Error('Failed to fetch cover image from generator proxy.');
      }
    } catch (err: any) {
      console.error('Cover generation error:', err);
      alert('표지 이미지 생성 실패: ' + err?.message);
    } finally {
      setIsGeneratingCover(false);
    }
  };

  // Download EPUB eBook
  const handleDownloadEpub = async () => {
    try {
      const completedChapters = chapters.filter(ch => ch.status === 'completed');
      if (completedChapters.length === 0) {
        alert('번역 완료된 챕터가 없습니다. 먼저 번역을 완료해 주세요.');
        return;
      }

      // Convert ChapterItem state to EpubChapter format
      const epubChapters: EpubChapter[] = completedChapters.map(ch => ({
        title: ch.title,
        originalText: ch.originalText,
        translatedText: ch.translatedText,
        illustrationBuffer: ch.illustrationBuffer,
      }));

      const epubBlob = await buildEpub({
        title: bookTitle || 'Translated Novel',
        author: author,
        publisher: publisher,
        contact: contact,
        coverBuffer: coverBuffer || undefined,
        chapters: epubChapters,
      });

      const url = URL.createObjectURL(epubBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bookTitle || 'Novel'}_EN.epub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('EPUB Download error:', err);
      alert('EPUB 빌드 실패: ' + err?.message);
    }
  };

  // Use a mock story for easy testing
  const loadMockStory = () => {
    setBookTitle('심청전 (The Story of Shim Cheong)');
    const mockChapters: ChapterItem[] = [
      {
        title: '제 1 장: 효녀 심청 (Chapter 1: The Devoted Daughter Shim Cheong)',
        originalText: `옛날 옛적에 심학도라는 눈먼 봉사가 살고 있었다. 그의 아내 곽씨 부인은 인품이 훌륭했으나 심청이를 낳은 후 세상을 떠났다. 
심봉사는 동냥젖을 얻어먹이며 외딸 심청이를 정성껏 키웠다. 심청이는 자라면서 효성이 지극하여 동네 사람들 모두가 침이 마르도록 칭찬하였다. 
하루는 심봉사가 물에 빠졌는데, 몽운사 스님이 지나가다 그를 구해주고 "공양미 삼백 석을 시주하면 눈을 뜰 수 있다"고 말했다. 심봉사는 덜컥 약속을 해 버리고 집으로 돌아와 깊은 탄식을 내뱉었다.`,
        translatedText: '',
        summary: '',
        status: 'pending',
      },
      {
        title: '제 2 장: 인당수의 제물 (Chapter 2: The Sacrifice of Indangsu)',
        originalText: `심청은 아버지가 탄식하는 사연을 듣고 깊은 고민에 빠졌다. 
마침 뱃사람들이 인당수 바다의 성난 파도를 잠재우기 위해 처녀 제물을 찾고 있다는 소식을 들었다. 그들은 대가로 공양미 삼백 석을 주겠다고 제안했다. 
심청은 아버지의 눈을 뜨게 할 유일한 방법이라 생각하고, 뱃사람들에게 자신을 제물로 팔기로 결심했다. 약속된 날이 오자 심청은 눈물을 흘리며 아버지에게 작별 인사를 건넸다. 배는 인당수로 향했고, 거친 파도가 몰아치는 가운데 심청은 뱃머리에서 바다로 몸을 던졌다.`,
        translatedText: '',
        summary: '',
        status: 'pending',
      },
      {
        title: '제 3 장: 용궁의 환생 (Chapter 3: Rebirth in the Dragon Palace)',
        originalText: `바다에 빠진 심청은 죽지 않았다. 지극한 효성에 감동한 용왕이 그녀를 용궁으로 영접하여 귀빈으로 극진히 대접했다. 
그곳에서 어머니 곽씨 부인을 꿈결처럼 재회하며 위로를 얻었다. 용왕은 심청을 커다란 연꽃에 실어 다시 인간 세상으로 보냈다. 
뱃사람들은 바다 위로 떠오른 거대한 연꽃을 발견하고 신기하게 여겨 왕에게 진상했다. 왕은 연꽃 속에서 나온 아름다운 심청을 보고 첫눈에 반해 왕비로 맞이했다. 
왕비가 된 심청은 전국의 맹인들을 모아 잔치를 베풀었고, 잔치에 참석한 심봉사는 딸을 극적으로 만나자 놀라움과 기쁨에 번쩍 눈을 뜨게 되었다.`,
        translatedText: '',
        summary: '',
        status: 'pending',
      },
    ];
    setChapters(mockChapters);
    setSelectedChapterIndex(0);
    setParseLogs('테스트용 맹인 심봉사와 심청전 3개 챕터가 로드되었습니다.');
  };

  // Rendering parameters
  const completedCount = chapters.filter((c) => c.status === 'completed').length;
  const progressPercent = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0;

  // Render Login Card
  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <form onSubmit={handleLogin} className="glass-panel login-card">
          <div className="login-logo">Evvia Publishing</div>
          <div className="login-subtitle">EPUB Translation System Login</div>

          {authError && <div className="error-alert"><AlertTriangle size={16} /> {authError}</div>}

          <div className="form-group">
            <label className="form-label">ADMIN ID</label>
            <input
              type="text"
              className="form-input"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              placeholder="Enter admin ID"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">PASSWORD</label>
            <input
              type="password"
              className="form-input"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">GEMINI API KEY</label>
            <input
              type="password"
              className="form-input"
              value={customApiKey}
              onChange={(e) => setCustomApiKey(e.target.value)}
              placeholder="AIzaSy..."
              required
            />
          </div>

          <button type="submit" className="btn-primary" style={{ marginTop: '12px' }}>
            Access Console <ChevronRight size={18} />
          </button>
        </form>
      </div>
    );
  }

  // Render main layout
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="dashboard-logo">
            <Book size={22} className="text-cyan-400" />
            <span>Evvia EPUB Publisher Console</span>
          </div>
          <button onClick={handleLogout} className="btn-logout">
            <LogOut size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            로그아웃
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="dashboard-main">
        {/* Left Side: Parameters / Settings */}
        <section className="left-panel">
          
          {/* Metadata Settings */}
          <div className="glass-panel section-card">
            <div className="section-title">
              <Settings size={18} /> 도서 메타데이터 설정
            </div>
            <div className="settings-grid">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">도서 제목</label>
                <input
                  type="text"
                  className="form-input"
                  value={bookTitle}
                  onChange={(e) => setBookTitle(e.target.value)}
                  placeholder="예: 홍길동전"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">저자 (Author)</label>
                <input
                  type="text"
                  className="form-input"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">출판사 (Publisher)</label>
                <input
                  type="text"
                  className="form-input"
                  value={publisher}
                  onChange={(e) => setPublisher(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">출판사 이메일 (Contact)</label>
                <input
                  type="email"
                  className="form-input"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Translation Configs */}
          <div className="glass-panel section-card">
            <div className="section-title">
              <Sparkles size={18} /> 번역 및 삽화 프롬프트
            </div>
            <div className="settings-grid">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Gemini 모델</label>
                <select
                  className="form-input"
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (추천)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Gemini API Key</label>
                <input
                  type="text"
                  className="form-input"
                  value={customApiKey ? `${customApiKey.substring(0, 8)}...` : ''}
                  disabled
                  style={{ opacity: 0.7, cursor: 'not-allowed', background: 'rgba(15, 23, 42, 0.4)' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginTop: '4px', display: 'block' }}>
                  ✓ 로그인 시 입력된 키 사용 중
                </span>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">삽화 화풍 (Art Style)</label>
                <input
                  type="text"
                  className="form-input"
                  value={artStyle}
                  onChange={(e) => setArtStyle(e.target.value)}
                  placeholder="예: watercolor painting, oil painting"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">번역 가이드라인 (Guidelines)</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  value={guidelines}
                  onChange={(e) => setGuidelines(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Glossary Config */}
          <div className="glass-panel section-card">
            <div className="section-title">
              <Key size={18} /> 용어 사전 (Glossary)
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">고유명사 및 말투 가이드 (줄바꿈 구분)</label>
              <textarea
                className="form-input"
                style={{ minHeight: '100px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.85rem' }}
                value={glossary}
                onChange={(e) => setGlossary(e.target.value)}
                placeholder="한국어 -> English"
              />
            </div>
          </div>
        </section>

        {/* Right Side: Main Panels */}
        <section className="right-panel">
          {/* File Upload Zone */}
          {chapters.length === 0 ? (
            <div className="glass-panel upload-card">
              <input
                type="file"
                id="file-upload"
                accept=".docx"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
                disabled={isLoadingFile}
              />
              <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'block' }}>
                <Upload className="upload-icon" />
                <div className="upload-title">
                  {isLoadingFile ? '파일 해석 중...' : '한국어 MS Word (.docx) 원고 업로드'}
                </div>
                <div className="upload-desc">
                  드래그하거나 여기를 클릭해 파일을 선택하세요. 14만 단어 대용량 번역도 지원합니다.
                </div>
              </label>
              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <button
                  onClick={loadMockStory}
                  className="btn-logout"
                  style={{ borderStyle: 'dashed', borderColor: 'var(--accent-cyan)' }}
                >
                  <Sparkles size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                  샘플 텍스트 로드하기 (테스트용)
                </button>
              </div>
              {parseLogs && (
                <div
                  style={{
                    marginTop: '20px',
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.3)',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    textAlign: 'left',
                    color: 'var(--accent-cyan)',
                  }}
                >
                  {parseLogs}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Controller & Progress */}
              <div className="glass-panel console-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '4px' }}>
                      {bookTitle || 'Untitled Book'}
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      전체 {chapters.length}개 챕터 중 {completedCount}개 번역 완료 ({progressPercent}%)
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {isTranslating ? (
                      <button onClick={pauseTranslation} className="btn-primary" style={{ background: 'var(--text-muted)' }}>
                        <Pause size={16} /> 일시정지
                      </button>
                    ) : (
                      <button onClick={startTranslation} className="btn-primary">
                        <Play size={16} /> 번역 및 삽화 생성 시작
                      </button>
                    )}
                    <button
                      onClick={handleDownloadEpub}
                      disabled={completedCount === 0}
                      className="btn-primary"
                      style={{
                        background: completedCount > 0 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255,255,255,0.05)',
                        boxShadow: completedCount > 0 ? '0 4px 15px rgba(16, 185, 129, 0.3)' : 'none',
                        color: completedCount > 0 ? '#fff' : 'var(--text-muted)',
                      }}
                    >
                      <Download size={16} /> EPUB 다운로드
                    </button>
                  </div>
                </div>

                <div className="progress-container">
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
                  </div>
                </div>

                {parseLogs && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>
                    {parseLogs}
                  </div>
                )}
              </div>

              {/* Cover & Gallery preview */}
              <div className="glass-panel art-preview-card">
                <div className="section-title">
                  <ImageIcon size={18} /> 책 표지 및 삽화 갤러리
                </div>
                <div className="art-preview-grid">
                  {/* Left: Cover Render */}
                  <div className="cover-wrapper">
                    {coverUrl ? (
                      <>
                        <img src={coverUrl} alt="Cover Preview" />
                        <div className="cover-info-overlay">
                          <div className="cover-info-title">{bookTitle}</div>
                          <div className="cover-info-meta">{author}</div>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '16px' }}>
                        <BookOpen size={40} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                        <button
                          onClick={generateCoverImage}
                          disabled={isGeneratingCover}
                          className="btn-logout"
                          style={{ fontSize: '0.8rem', borderColor: 'var(--accent-cyan)' }}
                        >
                          {isGeneratingCover ? '생성 중...' : '표지 이미지 생성'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right: Chapter Illustrations */}
                  <div>
                    <h3 style={{ fontSize: '0.95rem', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                      챕터별 생성된 삽화 (클릭하여 확인)
                    </h3>
                    <div className="art-gallery">
                      {chapters.map((ch, idx) => (
                        <div
                          key={idx}
                          className="gallery-item"
                          onClick={() => setSelectedChapterIndex(idx)}
                          style={{
                            borderColor: selectedChapterIndex === idx ? 'var(--accent-cyan)' : 'var(--border-glass)',
                          }}
                        >
                          {ch.illustrationUrl ? (
                            <img src={ch.illustrationUrl} alt={ch.title} />
                          ) : (
                            <div
                              style={{
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                              }}
                            >
                              대기 중
                            </div>
                          )}
                          <div className="gallery-item-label">Ch {idx + 1}</div>
                        </div>
                      ))}
                    </div>
                    {chapters[selectedChapterIndex]?.illustrationPrompt && (
                      <div
                        style={{
                          marginTop: '16px',
                          padding: '12px',
                          borderRadius: '8px',
                          background: 'rgba(30, 41, 59, 0.3)',
                          fontSize: '0.8rem',
                          border: '1px solid var(--border-glass)',
                        }}
                      >
                        <strong style={{ color: 'var(--accent-cyan)' }}>Ch {selectedChapterIndex + 1} Prompt: </strong>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {chapters[selectedChapterIndex].illustrationPrompt}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Side-by-Side Content Console */}
              <div className="glass-panel console-card" style={{ flex: 1 }}>
                <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={18} /> 실시간 번역 프리뷰
                  </div>
                  <select
                    value={selectedChapterIndex}
                    onChange={(e) => setSelectedChapterIndex(Number(e.target.value))}
                    className="form-input"
                    style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem', height: 'auto' }}
                  >
                    {chapters.map((ch, idx) => (
                      <option key={idx} value={idx}>
                        Ch {idx + 1}: {ch.title.substring(0, 20)}...
                      </option>
                    ))}
                  </select>
                </div>

                <div className="live-viewer">
                  {/* Left Pane: Korean (Original) */}
                  <div className="viewer-pane">
                    <div className="pane-header">
                      Original Korean ({chapters[selectedChapterIndex]?.title})
                    </div>
                    <div className="pane-content">
                      {chapters[selectedChapterIndex]?.originalText}
                    </div>
                  </div>

                  {/* Right Pane: English (Translated) */}
                  <div className="viewer-pane">
                    <div className="pane-header">
                      Translated English
                      {chapters[selectedChapterIndex]?.status === 'translating' && (
                        <RefreshCw size={12} className="spin" style={{ float: 'right', marginTop: '3px' }} />
                      )}
                    </div>
                    <div className="pane-content" style={{ fontFamily: 'var(--font-serif)', fontSize: '0.95rem' }}>
                      {chapters[selectedChapterIndex]?.status === 'translating' && (
                        <div style={{ color: 'var(--accent-cyan)', fontStyle: 'italic' }}>
                          Gemini가 실시간 번역을 수행하고 있습니다...
                        </div>
                      )}
                      {chapters[selectedChapterIndex]?.status === 'error' && (
                        <div style={{ color: '#ef4444', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div><AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />번역 오류가 발생했습니다:</div>
                          <code style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px' }}>
                            {chapters[selectedChapterIndex]?.errorMessage}
                          </code>
                          <button onClick={startTranslation} className="btn-logout" style={{ alignSelf: 'flex-start', marginTop: '12px' }}>
                            다시 시도
                          </button>
                        </div>
                      )}
                      {chapters[selectedChapterIndex]?.translatedText || (
                        chapters[selectedChapterIndex]?.status === 'pending' && (
                          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            번역이 시작되면 이곳에 결과가 표시됩니다.
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
