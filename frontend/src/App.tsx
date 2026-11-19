import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import hljs from "highlight.js";
import {
  Orbit, ArrowRight, Eye, EyeOff, ShieldCheck,
  Code2, MessageSquare, Copy, LogOut, Send, RefreshCw,
  Check, FileCode2, Type, Clock
} from "lucide-react";
import "./App.css";
import "highlight.js/styles/github-dark.css";

type Message = {
  _id: string;
  author: string;
  content: string;
  type: "text" | "code";
  language: string;
  createdAt: string;
  expireAt: string;
};

const languages = [
  "plaintext", "javascript", "typescript", "python", "bash",
  "json", "html", "css", "sql", "yaml", "java", "cpp",
  "c", "go", "php", "dart", "jsx", "tsx", "markdown"
];

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<"text" | "code">("text");
  const [language, setLanguage] = useState("javascript");
  const [posting, setPosting] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [copiedId, setCopiedId] = useState("");

  const loadMessages = useCallback(async () => {
    setFeedLoading(true);
    setFeedError("");

    try {
      const response = await fetch("/api/messages", {
        credentials: "include",
      });

      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }

      if (!response.ok) throw new Error("Unable to load messages");

      const data = await response.json();
      setMessages(data.messages || []);
    } catch {
      setFeedError("Couldn't load messages. Please try again.");
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (res.ok) setAuthenticated(true);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    loadMessages();
    const interval = window.setInterval(loadMessages, 30000);

    return () => window.clearInterval(interval);
  }, [authenticated, loadMessages]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Incorrect password");
      } else {
        setPassword("");
        setAuthenticated(true);
      }
    } catch {
      setError("Cannot connect to OpenWall server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setAuthenticated(false);
    setMessages([]);
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();

    if (!content.trim()) return;

    setPosting(true);
    setFeedError("");

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: author.trim() || "Anonymous",
          content: content.trim(),
          type,
          language: type === "code" ? language : "plaintext",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to publish message");
      }

      setContent("");
      await loadMessages();
    } catch (err) {
      setFeedError(
        err instanceof Error ? err.message : "Unable to publish message"
      );
    } finally {
      setPosting(false);
    }
  }

  async function copyContent(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(""), 1800);
    } catch {
      setFeedError("Clipboard access failed. Use HTTPS or localhost.");
    }
  }

  function formatDate(date: string) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  }

  if (checking) {
    return <div className="loading-screen"><Orbit className="spin" /></div>;
  }

  if (!authenticated) {
    return (
      <main className="login-screen">
        <div className="login-glow glow-one" />
        <div className="login-glow glow-two" />

        <section className="login-card">
          <div className="brand">
            <div className="brand-icon"><Orbit size={27} /></div>
            <span>Open<span className="accent">Wall</span></span>
          </div>

          <div className="login-content">
            {/* <div className="lock-icon"><LockKeyhole size={25} /></div> */}
            <p className="eyebrow">PRIVATE SPACE</p>
            {/* <h1>A little space<br />to share ideas.</h1> */}
            <p className="subtitle">
              Enter the access password to join the conversation.
            </p>

            <form onSubmit={handleLogin}>
              {/* <label htmlFor="password">ACCESS PASSWORD</label> */}
              <div className="password-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="visibility-button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {error && <p className="error-message">{error}</p>}

              <button className="unlock-button" disabled={loading}>
                {loading ? "Unlocking..." : "Unlock OpenWall"}
                {!loading && <ArrowRight size={18} />}
              </button>
            </form>

            <div className="hint"><span>HINT</span><span>GOTG</span></div>
          </div>

          <div className="login-footer">
            <ShieldCheck size={15} />
            <span>Private access · Shared space</span>
          </div>
        </section>
        <p className="copyright">OPENWALL © 2026</p>
      </main>
    );
  }

  return (
    <main className="wall-screen">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon"><Orbit size={23} /></div>
          <span>Open<span className="accent">Wall</span></span>
        </div>
        <nav className="nav-links">
          <a className="active" href="#wall">Message Wall</a>
          <button className="logout-button" onClick={handleLogout}>
            <LogOut size={16} /> Exit
          </button>
        </nav>
      </header>

      <section className="wall-container" id="wall">
        {/* <div className="wall-heading">
          <p className="eyebrow">YOUR SHARED SPACE</p>
          <h1>Public Message Wall<span className="accent">.</span></h1>
          <p className="subtitle">
            Share thoughts, snippets and ideas with everyone.
          </p>
        </div> */}

        <form className="composer" onSubmit={handlePost}>
          {/* <div className="composer-heading">
            <MessageSquare size={19} />
            <span>Write something</span>
          </div> */}

          <div className="composer-toolbar">
            <div className="mode-switch">
              <button
                type="button"
                className={type === "text" ? "mode-active" : ""}
                onClick={() => setType("text")}
              >
                <Type size={15} /> Text
              </button>
              <button
                type="button"
                className={type === "code" ? "mode-active" : ""}
                onClick={() => setType("code")}
              >
                <Code2 size={15} /> Code
              </button>
            </div>

            {type === "code" && (
              <select
                className="language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="Code language"
              >
                {languages.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            )}
          </div>

          <input
            className="author-input"
            placeholder="Your nickname (optional)"
            value={author}
            maxLength={30}
            onChange={(e) => setAuthor(e.target.value)}
          />

          <textarea
            placeholder={
              type === "code"
                ? "Paste your code here..."
                : "What's on your mind? Markdown is supported..."
            }
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={20000}
            required
            spellCheck={type === "text"}
          />

          <div className="composer-bottom">
            <div className="format-tools">
              <span>
                {type === "code" ? <FileCode2 size={16} /> : <MessageSquare size={16} />}
                {type === "code" ? "Syntax highlighting" : "Markdown supported"}
              </span>
              <span>{content.length.toLocaleString()} / 20,000</span>
            </div>
            <button
              className="post-button"
              disabled={posting || !content.trim()}
            >
              {posting ? "Posting..." : "Post message"}
              <Send size={16} />
            </button>
          </div>
          <p className="coming-note">Messages automatically expire after 24 hours.</p>
        </form>

        <section className="feed-section">
          <div className="feed-heading">
            <h2>Recent messages <span className="message-count">{messages.length}</span></h2>
            <button className="refresh-button" onClick={loadMessages} disabled={feedLoading}>
              <RefreshCw size={14} className={feedLoading ? "spin" : ""} />
              Refresh
            </button>
          </div>

          {feedError && <p className="error-message">{feedError}</p>}

          {messages.length === 0 && !feedLoading ? (
            <div className="empty-state">
              <div className="empty-icon"><Copy size={24} /></div>
              <h3>Your wall starts here</h3>
              <p>Be the first to share a thought or code snippet.</p>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article className="message-card" key={message._id}>
                  <div className="message-top">
                    <div className="author-info">
                      <div className="avatar">
                        {(message.author || "A").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <strong>{message.author}</strong>
                        <span className="message-date">
                          <Clock size={12} /> {formatDate(message.createdAt)}
                        </span>
                      </div>
                    </div>
                    <span className={`message-type ${message.type}`}>
                      {message.type === "code" ? <Code2 size={13} /> : <MessageSquare size={13} />}
                      {message.type === "code" ? message.language : "Text"}
                    </span>
                  </div>

                  {message.type === "code" ? (
                    <div className="code-container">
                      <div className="code-header">
                        <span><FileCode2 size={14} /> {message.language}</span>
                        <button onClick={() => copyContent(message._id, message.content)}>
                          {copiedId === message._id ? <Check size={14} /> : <Copy size={14} />}
                          {copiedId === message._id ? "Copied" : "Copy code"}
                        </button>
                      </div>
                      <pre className="code-content"><code
                        dangerouslySetInnerHTML={{
                          __html: (() => {
                            try {
                              return hljs.getLanguage(message.language)
                                ? hljs.highlight(message.content, { language: message.language }).value
                                : hljs.highlightAuto(message.content).value;
                            } catch {
                              return hljs.highlightAuto(message.content).value;
                            }
                          })()
                        }}
                      /></pre>
                    </div>
                  ) : (
                    <div className="text-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  <div className="message-bottom">
                    <span>Expires {formatDate(message.expireAt)}</span>
                    {message.type === "text" && (
                      <button onClick={() => copyContent(message._id, message.content)}>
                        {copiedId === message._id ? <Check size={14} /> : <Copy size={14} />}
                        {copiedId === message._id ? "Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <footer className="wall-footer">OPENWALL · A SPACE TO SHARE</footer>
    </main>
  );
}

export default App;
