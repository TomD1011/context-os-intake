'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
}

type IntakeSummary = Record<string, unknown>

type StreamEvent =
  | { type: 'session'; session_id: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'complete'; summary: IntakeSummary; closing_text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

// ─────────────────────────────────────────────
// WELCOME SCREEN
// ─────────────────────────────────────────────

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="section-enter text-center max-w-lg mx-auto py-12">
      <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold font-serif mx-auto mb-6">
        C
      </div>
      <h1 className="text-3xl font-serif font-bold text-stone-900 mb-4">
        Context OS Intake
      </h1>
      <p className="text-stone-500 text-lg leading-relaxed mb-3">
        A structured conversation that captures how your business actually runs — so we build the right system for it.
      </p>
      <p className="text-stone-400 text-base leading-relaxed mb-8">
        Takes 30–40 minutes. Be specific in your answers. The better the inputs here, the better the system we build.
      </p>
      <button onClick={onStart} className="btn-primary text-lg px-8 py-4">
        Begin Intake
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// CHAT MESSAGE
// ─────────────────────────────────────────────

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 message-enter`}>
      <div
        className={`max-w-[85%] px-5 py-3 rounded-2xl text-base leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white text-stone-800 border border-stone-200 rounded-bl-sm shadow-sm'
        }`}
      >
        {message.content}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// TYPING INDICATOR
// ─────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4 message-enter">
      <div className="bg-white text-stone-800 border border-stone-200 rounded-2xl rounded-bl-sm px-5 py-4 inline-flex gap-1.5 items-center shadow-sm">
        <span className="w-2 h-2 bg-stone-400 rounded-full typing-dot" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-stone-400 rounded-full typing-dot" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-stone-400 rounded-full typing-dot" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// CHAT INPUT
// ─────────────────────────────────────────────

function ChatInput({
  value,
  onChange,
  onSend,
  onAttachFile,
  disabled,
  uploadDisabled,
  isUploading,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAttachFile?: (file: File) => void
  disabled: boolean
  uploadDisabled?: boolean
  isUploading?: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!disabled && value.trim()) onSend()
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [value])

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onAttachFile) onAttachFile(file)
    // Reset so the same filename can be re-selected later
    e.target.value = ''
  }

  const showAttach = Boolean(onAttachFile)

  return (
    <div className="flex items-end gap-2 bg-white rounded-2xl border border-stone-200 p-3 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
      {showAttach && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFilePick}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploadDisabled || isUploading}
            className={`flex-shrink-0 rounded-xl p-2.5 transition-all ${
              disabled || uploadDisabled || isUploading
                ? 'text-stone-300 cursor-not-allowed'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
            }`}
            aria-label="Attach file"
            title={
              uploadDisabled
                ? 'File upload is not configured'
                : isUploading
                ? 'Uploading…'
                : 'Attach a file'
            }
          >
            {isUploading ? (
              <svg
                className="w-5 h-5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.414a4 4 0 10-5.656-5.656L4.929 11.586a6 6 0 108.485 8.485L20 13"
                />
              </svg>
            )}
          </button>
        </>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your answer..."
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none bg-transparent text-stone-800 placeholder-stone-400 focus:outline-none text-base leading-relaxed min-h-[28px] max-h-[200px] px-2 py-1 disabled:opacity-60"
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className={`flex-shrink-0 rounded-xl p-2.5 transition-all ${
          disabled || !value.trim()
            ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
        aria-label="Send"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12l14-7-7 14-2-5-5-2z" />
        </svg>
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// SUMMARY SCREEN (shown after submit_intake_summary fires)
// ─────────────────────────────────────────────

function SummaryScreen(_props: {
  // intentionally unused — summary is captured server-side; the user does NOT
  // see it. We render a thank-you only. Props kept for caller compatibility.
  summary: IntakeSummary
  onRestart: () => void
}) {
  return (
    <div className="section-enter pt-2 pb-8">
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-8 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-serif font-bold text-stone-900 mb-2">
              Thanks, great work.
            </h2>
            <p className="text-stone-700 text-base leading-relaxed">
              Your intake is complete. Tom will review it and be in touch within the next 24 hours.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────

export default function IntakePage() {
  const [started, setStarted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [hasStreamedText, setHasStreamedText] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<IntakeSummary | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isHydrating, setIsHydrating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Keep sessionId accessible inside streamChat without retriggering it
  const sessionIdRef = useRef<string | null>(null)
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  const isComplete = summary !== null

  // ───────────────────────────────
  // Resume flow — on first mount, check ?session=<id> and rehydrate
  // ───────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const resumeId = params.get('session')
    if (!resumeId) return

    let cancelled = false
    setIsHydrating(true)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/intake/${encodeURIComponent(resumeId)}`,
          { method: 'GET' }
        )
        if (!res.ok) {
          // 404/503 — silently drop the param and start fresh
          if (!cancelled) {
            const url = new URL(window.location.href)
            url.searchParams.delete('session')
            window.history.replaceState({}, '', url.toString())
          }
          return
        }
        const data = await res.json()
        if (cancelled) return
        setSessionId(resumeId)
        setMessages(data.messages ?? [])
        if (data.summary) setSummary(data.summary)
        if ((data.messages?.length ?? 0) > 0 || data.summary) setStarted(true)
      } catch {
        // network glitch — don't block the app
      } finally {
        if (!cancelled) setIsHydrating(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Push the sessionId into the URL (replaceState — no history spam) so refresh
  // and share-link resume work.
  useEffect(() => {
    if (!sessionId) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('session') === sessionId) return
    url.searchParams.set('session', sessionId)
    window.history.replaceState({}, '', url.toString())
  }, [sessionId])
  // Show typing indicator only when we're waiting AND haven't received any
  // text yet. Once the first delta lands, the streaming bubble takes over.
  const showTyping = isStreaming && !hasStreamedText

  // Auto-scroll to bottom on new messages / stream updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming, isComplete])

  /**
   * Open the streaming endpoint, consume the NDJSON response line-by-line,
   * and update state as each event arrives. Creates a placeholder assistant
   * message that fills in as deltas land.
   */
  const streamChat = useCallback(async (msgs: Message[]): Promise<void> => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: msgs,
        session_id: sessionIdRef.current ?? undefined,
      }),
    })

    if (!res.ok || !res.body) {
      let errMsg = `Request failed (${res.status})`
      try {
        const j = await res.json()
        if (j?.error) errMsg = j.error
      } catch {
        /* non-JSON error body — keep default */
      }
      throw new Error(errMsg)
    }

    // Insert placeholder assistant message that deltas will fill in
    let placeholderAdded = false
    const ensurePlaceholder = () => {
      if (placeholderAdded) return
      placeholderAdded = true
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
    }

    const appendDelta = (delta: string) => {
      ensurePlaceholder()
      setHasStreamedText(true)
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        const updated: Message = {
          role: 'assistant',
          content: last.content + delta,
        }
        return [...prev.slice(0, -1), updated]
      })
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let streamError: string | null = null

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newlineIdx: number
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim()
        buffer = buffer.slice(newlineIdx + 1)
        if (!line) continue

        let event: StreamEvent
        try {
          event = JSON.parse(line) as StreamEvent
        } catch {
          continue // ignore malformed fragments
        }

        if (event.type === 'session') {
          setSessionId(event.session_id)
        } else if (event.type === 'text_delta') {
          appendDelta(event.delta)
        } else if (event.type === 'complete') {
          // Completion turn — replace/insert the closing text as the assistant
          // message and surface the summary.
          if (placeholderAdded) {
            setMessages((prev) => {
              const last = prev[prev.length - 1]
              if (!last || last.role !== 'assistant') return prev
              return [
                ...prev.slice(0, -1),
                { role: 'assistant', content: event.closing_text },
              ]
            })
          } else {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: event.closing_text },
            ])
          }
          setSummary(event.summary)
        } else if (event.type === 'error') {
          streamError = event.message
        }
        // 'done' requires no client action
      }
    }

    // Flush any trailing buffered line
    const tail = buffer.trim()
    if (tail) {
      try {
        const event = JSON.parse(tail) as StreamEvent
        if (event.type === 'session') setSessionId(event.session_id)
        else if (event.type === 'text_delta') appendDelta(event.delta)
        else if (event.type === 'complete') {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: event.closing_text },
          ])
          setSummary(event.summary)
        } else if (event.type === 'error') {
          streamError = event.message
        }
      } catch {
        /* ignore */
      }
    }

    if (streamError) throw new Error(streamError)
  }, [])

  const startIntake = useCallback(async () => {
    setStarted(true)
    setIsStreaming(true)
    setHasStreamedText(false)
    setError(null)

    const firstMessage: Message = {
      role: 'user',
      content: "I'm ready to start the intake.",
    }
    setMessages([firstMessage])

    try {
      await streamChat([firstMessage])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start intake.')
    } finally {
      setIsStreaming(false)
    }
  }, [streamChat])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming || isComplete) return

    const userMessage: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsStreaming(true)
    setHasStreamedText(false)
    setError(null)

    try {
      await streamChat(newMessages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message failed to send.')
    } finally {
      setIsStreaming(false)
    }
  }, [input, isStreaming, isComplete, messages, streamChat])

  /**
   * Upload a file attached to the current session, then send a short system-
   * style user message to Claude so it knows the file exists and can reference
   * it in the `sources` field of the final summary.
   */
  const handleAttachFile = useCallback(
    async (file: File) => {
      const activeSessionId = sessionIdRef.current
      if (!activeSessionId) {
        setError(
          'File upload needs an active session. Send your first answer, then attach files.'
        )
        return
      }
      if (isStreaming || isUploading || isComplete) return

      // ─── V2.5: client-side pre-validation ────────────────────────────
      // Catch obvious failures (wrong type, zero bytes, too large) BEFORE
      // hitting the backend. Surface error as an inline chat message —
      // not a bottom-of-page red banner the user might miss.
      const ALLOWED_CLIENT = new Set([
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/json',
        'text/plain',
        'text/csv',
        'text/markdown',
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/webp',
      ])
      const MAX_MB = 20

      const showInlineError = (msg: string) => {
        const errMsg: Message = {
          role: 'assistant',
          content: `⚠️ Upload failed: ${msg}`,
        }
        setMessages((prev) => [...prev, errMsg])
        setError(null) // we're showing it inline instead
      }

      if (file.size === 0) {
        showInlineError(`"${file.name}" is empty (0 bytes).`)
        return
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        const mb = (file.size / 1024 / 1024).toFixed(1)
        showInlineError(`"${file.name}" is ${mb} MB. Max is ${MAX_MB} MB.`)
        return
      }
      const detectedType = file.type || 'application/octet-stream'
      if (!ALLOWED_CLIENT.has(detectedType)) {
        showInlineError(
          `"${file.name}" isn't a supported file type. Detected as "${detectedType}". Allowed: PDF, Word, Excel, PowerPoint, text, CSV, images. Try a different file, or paste the text into the chat.`
        )
        return
      }

      setError(null)
      setIsUploading(true)

      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch(
          `/api/intake/${encodeURIComponent(activeSessionId)}/upload`,
          { method: 'POST', body: formData }
        )
        const data = await res.json()
        if (!res.ok) {
          showInlineError(data?.error || `server rejected the file (${res.status})`)
          return
        }

        // Inject the upload as a user message — this is the ONLY signal the
        // bot uses to confirm a real upload (per V2.5 system prompt rule).
        const sizeKb = Math.max(1, Math.round((data.size_bytes ?? 0) / 1024))
        const announcement = `[Attached file: ${data.filename} — ${sizeKb} KB, ${data.content_type}. Stored as ${data.storage_path}.]`

        const userMessage: Message = { role: 'user', content: announcement }
        const next = [...messages, userMessage]
        setMessages(next)
        setIsStreaming(true)
        setHasStreamedText(false)

        try {
          await streamChat(next)
        } catch (err) {
          showInlineError(
            err instanceof Error ? err.message : 'Failed to notify the bot.'
          )
        } finally {
          setIsStreaming(false)
        }
      } catch (err) {
        showInlineError(err instanceof Error ? err.message : 'Upload failed.')
      } finally {
        setIsUploading(false)
      }
    },
    [isStreaming, isUploading, isComplete, messages, streamChat]
  )

  const resetConversation = useCallback(() => {
    setStarted(false)
    setMessages([])
    setInput('')
    setError(null)
    setIsStreaming(false)
    setHasStreamedText(false)
    setIsUploading(false)
    setSummary(null)
    setSessionId(null)
    // Drop ?session=... so a refresh starts fresh
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (url.searchParams.has('session')) {
        url.searchParams.delete('session')
        window.history.replaceState({}, '', url.toString())
      }
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-stone-900">FounderOS</span>
            <span className="text-stone-300">·</span>
            <span className="text-stone-500 text-sm">Context Intake</span>
          </div>
          {started && (
            <button
              onClick={() => {
                if (confirm('Start over? Your current progress will be lost.')) {
                  resetConversation()
                }
              }}
              className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
            >
              Start over
            </button>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col w-full max-w-2xl mx-auto px-6">
        {isHydrating ? (
          <div className="section-enter text-center max-w-lg mx-auto py-16">
            <div className="inline-flex gap-1.5 items-center">
              <span className="w-2 h-2 bg-stone-400 rounded-full typing-dot" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-stone-400 rounded-full typing-dot" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-stone-400 rounded-full typing-dot" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-stone-500 mt-4 text-sm">Resuming your intake…</p>
          </div>
        ) : !started ? (
          <WelcomeScreen onStart={startIntake} />
        ) : (
          <>
            <div className="flex-1 py-8">
              {messages.map((m, i) => (
                <ChatMessage key={i} message={m} />
              ))}
              {showTyping && <TypingIndicator />}
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  <div className="font-medium mb-1">Something went wrong</div>
                  <div className="text-red-600">{error}</div>
                </div>
              )}
              {isComplete && summary && (
                <SummaryScreen
                  summary={summary}
                  onRestart={resetConversation}
                />
              )}
              <div ref={messagesEndRef} />
            </div>
            {!isComplete && (
              <div className="pb-6 pt-2 sticky bottom-0 bg-stone-50">
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSend={sendMessage}
                  onAttachFile={handleAttachFile}
                  disabled={isStreaming}
                  uploadDisabled={!sessionId}
                  isUploading={isUploading}
                />
                <p className="text-xs text-stone-400 mt-2 px-1">
                  Press Enter to send · Shift+Enter for new line
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer (only shown on welcome) */}
      {!started && (
        <footer className="border-t border-stone-100">
          <div className="max-w-2xl mx-auto px-6 py-6 text-center text-sm text-stone-400">
            Context OS Intake · FounderOS
          </div>
        </footer>
      )}
    </div>
  )
}
