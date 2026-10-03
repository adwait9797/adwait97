import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal typing for the Web Speech API (Safari exposes it as webkitSpeechRecognition).
interface Recognizer {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type Ctor = new () => Recognizer

function recognitionCtor(): Ctor | null {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Speech-to-text with the browser's built-in recognizer (free, nothing is sent to our servers).
 * `onText` (keep it stable, e.g. a state setter) gets the full text so far: `base` (already typed) plus what was said.
 */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Recognizer | null>(null)

  const stop = useCallback(() => rec.current?.stop(), [])
  const clearError = useCallback(() => setError(null), [])

  const start = useCallback((base: string) => {
    setError(null)
    const Ctor = recognitionCtor()
    if (!Ctor) {
      setError("Voice input isn't available in this browser. Tap the text box and use the 🎤 on your keyboard instead.")
      return
    }
    const r = new Ctor()
    r.lang = navigator.language || 'en-US'
    r.continuous = true
    r.interimResults = true
    const prefix = base.trim() ? `${base.trim()} ` : ''
    r.onresult = (e) => {
      let said = ''
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript
      onText(prefix + said.trim())
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone access is blocked. Allow it in Settings → Safari → Microphone, or use the 🎤 on your keyboard.')
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setError("Couldn't hear that. Try again, or type it instead.")
      }
    }
    r.onend = () => {
      setListening(false)
      rec.current = null
    }
    rec.current = r
    try {
      r.start()
      setListening(true)
    } catch {
      setError("Couldn't start the microphone. Try again.")
    }
  }, [onText])

  // Stop listening when the component goes away.
  useEffect(() => () => rec.current?.abort(), [])

  return { listening, error, start, stop, clearError }
}
