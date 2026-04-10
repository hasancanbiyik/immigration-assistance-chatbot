import { useState, useRef, useCallback, useEffect } from "react";

const API_BASE = "http://localhost:8000/api";

const TABS = [
  { id: "qa", label: "Document Q&A", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { id: "translate", label: "Translation", icon: "M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" },
  { id: "timeline", label: "Case Timeline", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
];

const LANGUAGES = { tr: "Turkish", es: "Spanish", zh: "Chinese", ar: "Arabic", en: "English" };

function Icon({ path, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

function StatusBadge({ type, children }) {
  const colors = {
    success: { bg: "#EAF3DE", text: "#27500A", border: "#97C459" },
    warning: { bg: "#FAEEDA", text: "#633806", border: "#EF9F27" },
    info: { bg: "#E6F1FB", text: "#0C447C", border: "#85B7EB" },
    error: { bg: "#FCEBEB", text: "#791F1F", border: "#F09595" },
  };
  const c = colors[type] || colors.info;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 500, padding: "2px 10px", borderRadius: 100, background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {children}
    </span>
  );
}

function FileUploadZone({ onFilesSelected, accept = ".pdf", multiple = false, label }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); setDragOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFilesSelected(files);
      }}
      style={{
        border: `2px dashed ${dragOver ? "#378ADD" : "rgba(0,0,0,0.15)"}`,
        borderRadius: 12, padding: "2rem", textAlign: "center", cursor: "pointer",
        background: dragOver ? "rgba(55,138,221,0.04)" : "transparent",
        transition: "all 0.2s",
      }}
    >
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} hidden
        onChange={e => { if (e.target.files?.length) onFilesSelected(Array.from(e.target.files)); }} />
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 8px" }}>
        <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <p style={{ fontSize: 14, color: "rgba(0,0,0,0.5)", margin: 0 }}>{label || "Drop PDF here or click to upload"}</p>
    </div>
  );
}

function DocumentQA() {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [clientFilter, setClientFilter] = useState("");
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const uploadFile = useCallback(async (files) => {
    setUploading(true);
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      if (clientFilter) form.append("client_name", clientFilter);
      try {
        const res = await fetch(`${API_BASE}/documents/upload`, { method: "POST", body: form });
        const data = await res.json();
        if (res.ok) {
          setUploadedDocs(prev => [...prev, { name: file.name, ...data }]);
          setMessages(prev => [...prev, { role: "system", text: `Uploaded ${file.name}: ${data.pages_processed} pages, ${data.chunks_created} chunks indexed. Case type: ${data.extracted_metadata?.case_type || "unknown"}.` }]);
        } else {
          setMessages(prev => [...prev, { role: "system", text: `Failed to upload ${file.name}: ${data.detail || "Unknown error"}`, error: true }]);
        }
      } catch (e) {
        setMessages(prev => [...prev, { role: "system", text: `Upload error: ${e.message}`, error: true }]);
      }
    }
    setUploading(false);
  }, [clientFilter]);

  const askQuestion = useCallback(async () => {
    if (!question.trim()) return;
    const q = question.trim();
    setQuestion("");
    setMessages(prev => [...prev, { role: "user", text: q }]);
    setAsking(true);
    try {
      const body = { question: q, top_k: 5 };
      if (clientFilter) body.client_name = clientFilter;
      const res = await fetch(`${API_BASE}/documents/ask`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: "assistant", text: data.answer, confidence: data.confidence,
        sources: data.sources, disclaimer: data.disclaimer,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "system", text: `Error: ${e.message}`, error: true }]);
    }
    setAsking(false);
  }, [question, clientFilter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid rgba(0,0,0,0.08)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" placeholder="Filter by client name..." value={clientFilter} onChange={e => setClientFilter(e.target.value)}
          style={{ padding: "6px 12px", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, fontSize: 13, width: 200, outline: "none" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {uploadedDocs.map((d, i) => <StatusBadge key={i} type="success">{d.name}</StatusBadge>)}
        </div>
        {uploading && <StatusBadge type="warning">Processing...</StatusBadge>}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "1.5rem" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <FileUploadZone onFilesSelected={uploadFile} multiple label="Upload immigration documents (PDF) to get started" />
            <p style={{ marginTop: 16, fontSize: 13, color: "rgba(0,0,0,0.4)" }}>
              Upload USCIS notices, petitions, support letters, or any case documents
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            marginBottom: 16, display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
          }}>
            <div style={{
              maxWidth: "80%", padding: "12px 16px", borderRadius: 12, fontSize: 14, lineHeight: 1.6,
              background: msg.role === "user" ? "#0F6E56" : msg.error ? "#FCEBEB" : "#F6F5F0",
              color: msg.role === "user" ? "#fff" : msg.error ? "#791F1F" : "#2C2C2A",
              borderBottomRightRadius: msg.role === "user" ? 4 : 12,
              borderBottomLeftRadius: msg.role !== "user" ? 4 : 12,
            }}>
              <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
              {msg.confidence !== undefined && (
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <StatusBadge type={msg.confidence > 0.7 ? "success" : msg.confidence > 0.4 ? "warning" : "error"}>
                    Confidence: {Math.round(msg.confidence * 100)}%
                  </StatusBadge>
                  {msg.sources?.length > 0 && (
                    <StatusBadge type="info">{msg.sources.length} sources</StatusBadge>
                  )}
                </div>
              )}
              {msg.disclaimer && (
                <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 8, marginBottom: 0, fontStyle: "italic" }}>{msg.disclaimer}</p>
              )}
            </div>
          </div>
        ))}
        {asking && (
          <div style={{ display: "flex", gap: 4, padding: 12 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: "50%", background: "#0F6E56",
                animation: `pulse 1s ease-in-out ${i * 0.15}s infinite`,
              }} />
            ))}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid rgba(0,0,0,0.08)", display: "flex", gap: 8 }}>
        {messages.length > 0 && (
          <button onClick={() => document.querySelector('input[type=file]')?.click()}
            style={{ padding: "8px 12px", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>
            +
          </button>
        )}
        <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === "Enter" && askQuestion()}
          placeholder="Ask about your immigration documents..."
          style={{ flex: 1, padding: "8px 14px", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, fontSize: 14, outline: "none" }} />
        <button onClick={askQuestion} disabled={asking || !question.trim()}
          style={{
            padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500,
            background: question.trim() ? "#0F6E56" : "rgba(0,0,0,0.08)", color: question.trim() ? "#fff" : "rgba(0,0,0,0.3)",
            transition: "all 0.15s",
          }}>
          Ask
        </button>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
}

function TranslationPanel() {
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [sourceLang, setSourceLang] = useState("tr");
  const [targetLang, setTargetLang] = useState("en");
  const [certification, setCertification] = useState("");
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState(null);
  const [mode, setMode] = useState("text");

  const translateText = async () => {
    if (!sourceText.trim()) return;
    setLoading(true); setTranslatedText(""); setCertification("");
    try {
      const res = await fetch(`${API_BASE}/translation/text`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText, source_lang: sourceLang, target_lang: targetLang, generate_certification: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setTranslatedText(data.translated_text);
        setCertification(data.certification_statement || "");
        setMeta({ model: data.model_used, words: data.word_count, time: data.processing_time_ms });
      } else {
        setTranslatedText(`Error: ${data.detail || "Translation failed"}`);
      }
    } catch (e) { setTranslatedText(`Error: ${e.message}`); }
    setLoading(false);
  };

  const translateDocument = async (files) => {
    if (!files.length) return;
    setLoading(true); setTranslatedText(""); setCertification("");
    const form = new FormData();
    form.append("file", files[0]);
    form.append("source_lang", sourceLang);
    form.append("target_lang", targetLang);
    form.append("generate_certification", "true");
    try {
      const res = await fetch(`${API_BASE}/translation/document`, { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        const allText = data.translated_pages.map(p => `--- Page ${p.page_number} ---\n${p.translated_text}`).join("\n\n");
        setTranslatedText(allText);
        setCertification(data.certification_statement || "");
        setMeta({ pages: data.total_pages, time: data.processing_time_ms });
      } else {
        setTranslatedText(`Error: ${data.detail}`);
      }
    } catch (e) { setTranslatedText(`Error: ${e.message}`); }
    setLoading(false);
  };

  const langOptions = Object.entries(LANGUAGES).filter(([k]) => k !== (mode === "text" ? targetLang : ""));

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["text", "document"].map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
            border: mode === m ? "1.5px solid #0F6E56" : "1px solid rgba(0,0,0,0.12)",
            background: mode === m ? "#E1F5EE" : "transparent",
            color: mode === m ? "#085041" : "rgba(0,0,0,0.5)",
          }}>
            {m === "text" ? "Text" : "Document"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <select value={sourceLang} onChange={e => setSourceLang(e.target.value)}
          style={{ padding: "6px 12px", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, fontSize: 13 }}>
          {langOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span style={{ fontSize: 18, color: "rgba(0,0,0,0.25)" }}>→</span>
        <select value={targetLang} onChange={e => setTargetLang(e.target.value)}
          style={{ padding: "6px 12px", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, fontSize: 13 }}>
          {Object.entries(LANGUAGES).filter(([k]) => k !== sourceLang).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {mode === "text" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 6, fontWeight: 500 }}>
              Source ({LANGUAGES[sourceLang]})
            </label>
            <textarea value={sourceText} onChange={e => setSourceText(e.target.value)}
              rows={10} placeholder={`Enter ${LANGUAGES[sourceLang]} text...`}
              style={{ width: "100%", padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, fontSize: 14, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            <button onClick={translateText} disabled={loading || !sourceText.trim()}
              style={{
                marginTop: 10, width: "100%", padding: "10px", borderRadius: 8, border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer",
                background: sourceText.trim() ? "#0F6E56" : "rgba(0,0,0,0.08)", color: sourceText.trim() ? "#fff" : "rgba(0,0,0,0.3)",
              }}>
              {loading ? "Translating..." : "Translate"}
            </button>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 6, fontWeight: 500 }}>
              Translation ({LANGUAGES[targetLang]})
            </label>
            <textarea value={translatedText} readOnly rows={10}
              placeholder="Translation will appear here..."
              style={{ width: "100%", padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, fontSize: 14, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit", background: "#FAFAF7", outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
      ) : (
        <div>
          <FileUploadZone onFilesSelected={translateDocument} label={`Upload ${LANGUAGES[sourceLang]} PDF for translation`} />
          {translatedText && (
            <div style={{ marginTop: 16, padding: 16, background: "#FAFAF7", borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)" }}>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.7, margin: 0, fontFamily: "inherit" }}>{translatedText}</pre>
            </div>
          )}
        </div>
      )}

      {meta && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {meta.model && <StatusBadge type="info">Model: {meta.model.split("/").pop()}</StatusBadge>}
          {meta.words && <StatusBadge type="info">{meta.words} words</StatusBadge>}
          {meta.pages && <StatusBadge type="info">{meta.pages} pages</StatusBadge>}
          {meta.time && <StatusBadge type="success">{Math.round(meta.time)}ms</StatusBadge>}
        </div>
      )}

      {certification && (
        <details style={{ marginTop: 20 }}>
          <summary style={{ fontSize: 13, fontWeight: 500, color: "#0F6E56", cursor: "pointer" }}>
            View USCIS certification statement
          </summary>
          <pre style={{
            marginTop: 8, padding: 16, background: "#FAFAF7", borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.08)", fontSize: 12, lineHeight: 1.6,
            whiteSpace: "pre-wrap", fontFamily: "'DM Mono', monospace",
          }}>
            {certification}
          </pre>
        </details>
      )}
    </div>
  );
}

function TimelinePanel() {
  const [events, setEvents] = useState([]);
  const [caseInfo, setCaseInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clientName, setClientName] = useState("");

  const extractTimeline = async (files) => {
    setLoading(true);
    const form = new FormData();
    if (files.length === 1) {
      form.append("file", files[0]);
      if (clientName) form.append("client_name", clientName);
      try {
        const res = await fetch(`${API_BASE}/timeline/extract`, { method: "POST", body: form });
        const data = await res.json();
        if (res.ok) {
          setEvents(data.events); setCaseInfo(data);
        }
      } catch (e) { console.error(e); }
    } else {
      files.forEach(f => form.append("files", f));
      if (clientName) form.append("client_name", clientName);
      try {
        const res = await fetch(`${API_BASE}/timeline/extract-multiple`, { method: "POST", body: form });
        const data = await res.json();
        if (res.ok) { setEvents(data.events); setCaseInfo(data); }
      } catch (e) { console.error(e); }
    }
    setLoading(false);
  };

  const eventColors = {
    filing: { bg: "#E6F1FB", dot: "#378ADD", text: "#0C447C" },
    receipt: { bg: "#E1F5EE", dot: "#1D9E75", text: "#085041" },
    biometrics: { bg: "#EEEDFE", dot: "#7F77DD", text: "#3C3489" },
    rfe_issued: { bg: "#FAEEDA", dot: "#EF9F27", text: "#633806" },
    rfe_response: { bg: "#FAEEDA", dot: "#BA7517", text: "#633806" },
    interview: { bg: "#EEEDFE", dot: "#534AB7", text: "#26215C" },
    approval: { bg: "#EAF3DE", dot: "#639922", text: "#173404" },
    denial: { bg: "#FCEBEB", dot: "#E24B4A", text: "#501313" },
    transfer: { bg: "#F1EFE8", dot: "#888780", text: "#2C2C2A" },
    other: { bg: "#F1EFE8", dot: "#888780", text: "#2C2C2A" },
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 700, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <input type="text" placeholder="Client name (optional)" value={clientName} onChange={e => setClientName(e.target.value)}
          style={{ padding: "6px 12px", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, fontSize: 13, width: 220, outline: "none", marginBottom: 12 }} />
        <FileUploadZone onFilesSelected={extractTimeline} multiple label="Upload USCIS notices to build case timeline" />
      </div>

      {loading && <p style={{ textAlign: "center", color: "rgba(0,0,0,0.4)", fontSize: 14 }}>Extracting timeline events...</p>}

      {caseInfo && events.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {caseInfo.client_name && <StatusBadge type="info">{caseInfo.client_name}</StatusBadge>}
            {caseInfo.case_type && <StatusBadge type="info">{caseInfo.case_type}</StatusBadge>}
            {caseInfo.receipt_number && <StatusBadge type="success">{caseInfo.receipt_number}</StatusBadge>}
            <StatusBadge type="info">{events.length} events</StatusBadge>
          </div>

          <div style={{ position: "relative", paddingLeft: 28 }}>
            <div style={{ position: "absolute", left: 9, top: 8, bottom: 8, width: 2, background: "rgba(0,0,0,0.08)", borderRadius: 1 }} />
            {events.map((evt, i) => {
              const c = eventColors[evt.event_type] || eventColors.other;
              return (
                <div key={i} style={{ position: "relative", marginBottom: 16 }}>
                  <div style={{
                    position: "absolute", left: -22, top: 6, width: 12, height: 12,
                    borderRadius: "50%", background: c.dot, border: "2px solid #fff",
                    boxShadow: "0 0 0 2px rgba(0,0,0,0.06)",
                  }} />
                  <div style={{ padding: "10px 14px", background: c.bg, borderRadius: 10, borderLeft: `3px solid ${c.dot}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: c.text, textTransform: "capitalize" }}>
                        {evt.event_type.replace(/_/g, " ")}
                      </span>
                      {evt.date && <span style={{ fontSize: 11, color: "rgba(0,0,0,0.4)" }}>{evt.date}</span>}
                    </div>
                    <p style={{ fontSize: 13, color: "#2C2C2A", lineHeight: 1.5, margin: 0 }}>{evt.description}</p>
                    {(evt.receipt_number || evt.form_type) && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        {evt.receipt_number && <StatusBadge type="info">{evt.receipt_number}</StatusBadge>}
                        {evt.form_type && <StatusBadge type="info">{evt.form_type}</StatusBadge>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!loading && events.length === 0 && (
        <p style={{ textAlign: "center", fontSize: 13, color: "rgba(0,0,0,0.35)", marginTop: 24 }}>
          Upload USCIS notices, approval letters, or RFE documents to automatically build a case timeline.
        </p>
      )}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("qa");
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/health`).then(r => r.json()).then(setHealth).catch(() => setHealth({ status: "offline" }));
  }, []);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", color: "#2C2C2A", background: "#FAFAF7" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />

      <header style={{
        padding: "0 1.5rem", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(0,0,0,0.08)", background: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #0F6E56, #1D9E75)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21v-4a2 2 0 012-2h4a2 2 0 012 2v4M13 21v-4a2 2 0 012-2h4a2 2 0 012 2v4M3 10V6a2 2 0 012-2h14a2 2 0 012 2v4" />
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" }}>Immigration Assistance ChatBot</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {health && (
            <StatusBadge type={health.status === "healthy" ? "success" : "error"}>
              {health.status === "healthy" ? "API Connected" : "API Offline"}
            </StatusBadge>
          )}
          {health?.modules?.gemini_llm && (
            <StatusBadge type={health.modules.gemini_llm === "active" ? "success" : "warning"}>
              Gemini {health.modules.gemini_llm}
            </StatusBadge>
          )}
        </div>
      </header>

      <nav style={{
        display: "flex", gap: 0, borderBottom: "1px solid rgba(0,0,0,0.08)", background: "#fff", padding: "0 1.5rem",
      }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "12px 20px", fontSize: 13, fontWeight: 500,
            border: "none", borderBottom: activeTab === tab.id ? "2px solid #0F6E56" : "2px solid transparent",
            background: "transparent", cursor: "pointer",
            color: activeTab === tab.id ? "#0F6E56" : "rgba(0,0,0,0.45)",
            transition: "all 0.15s",
          }}>
            <Icon path={tab.icon} size={16} />
            {tab.label}
          </button>
        ))}
      </nav>

      <main style={{ flex: 1, overflow: "auto" }}>
        {activeTab === "qa" && <DocumentQA />}
        {activeTab === "translate" && <TranslationPanel />}
        {activeTab === "timeline" && <TimelinePanel />}
      </main>

      <footer style={{
        padding: "8px 1.5rem", borderTop: "1px solid rgba(0,0,0,0.06)",
        fontSize: 11, color: "rgba(0,0,0,0.3)", textAlign: "center", background: "#fff",
      }}>
        Immigration Assistance ChatBot v1.0 — For informational purposes only. Consult USCIS or an immigration attorney for official guidance.
      </footer>
    </div>
  );
}
