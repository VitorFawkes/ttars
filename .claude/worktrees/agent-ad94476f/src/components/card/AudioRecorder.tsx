import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Square, Upload, FileAudio, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AudioRecorderProps {
  onAudioReady: (blob: Blob) => void
  disabled?: boolean
}

type RecordingState = 'idle' | 'requesting' | 'recording' | 'done'
type InputMode = 'record' | 'upload'

const MAX_DURATION_SECONDS = 600 // 10 minutes
const ACCEPTED_AUDIO_TYPES = 'audio/webm,audio/mp3,audio/mpeg,audio/mp4,audio/m4a,audio/ogg,audio/wav,audio/*'

export default function AudioRecorder({ onAudioReady, disabled }: AudioRecorderProps) {
  const [mode, setMode] = useState<InputMode>('record')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer()
      stopStream()
    }
  }, [])

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const startRecording = useCallback(async () => {
    setError(null)
    setRecordingState('requesting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        setRecordingState('done')
        onAudioReady(blob)
        stopStream()
      }

      recorder.start(1000) // Collect data every second
      setRecordingState('recording')
      setDuration(0)

      // Timer
      timerRef.current = setInterval(() => {
        setDuration(prev => {
          const next = prev + 1
          if (next >= MAX_DURATION_SECONDS) {
            stopRecording()
          }
          return next
        })
      }, 1000)
    } catch (err) {
      console.error('Microphone error:', err)
      setRecordingState('idle')
      stopStream()
      if ((err as Error).name === 'NotAllowedError') {
        setError('Permissão do microfone negada. Habilite nas configurações do navegador.')
      } else {
        setError('Não foi possível acessar o microfone.')
      }
    }
  }, [onAudioReady])

  const stopRecording = useCallback(() => {
    stopTimer()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return

    // Max 25MB (Whisper API limit)
    if (file.size > 25 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 25MB.')
      return
    }

    setAudioBlob(file)
    setFileName(file.name)
    setRecordingState('done')
    onAudioReady(file)
  }, [onAudioReady])

  const clearAudio = useCallback(() => {
    setAudioBlob(null)
    setFileName(null)
    setRecordingState('idle')
    setDuration(0)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const isRecording = recordingState === 'recording'
  const isDone = recordingState === 'done'

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => { setMode('record'); clearAudio() }}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            mode === 'record'
              ? 'border-amber-500 text-amber-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          )}
          disabled={disabled || isRecording}
        >
          <Mic className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Gravar Áudio
        </button>
        <button
          type="button"
          onClick={() => { setMode('upload'); clearAudio() }}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            mode === 'upload'
              ? 'border-amber-500 text-amber-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          )}
          disabled={disabled || isRecording}
        >
          <Upload className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Enviar Arquivo
        </button>
      </div>

      {/* Record mode */}
      {mode === 'record' && (
        <div className="flex flex-col items-center gap-4 py-4">
          {/* Recording indicator */}
          {isRecording && (
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-2xl font-mono text-slate-900 tabular-nums">
                {formatTime(duration)}
              </span>
              <span className="text-xs text-slate-400">
                / {formatTime(MAX_DURATION_SECONDS)}
              </span>
            </div>
          )}

          {/* Done indicator */}
          {isDone && !fileName && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
              <FileAudio className="h-4 w-4" />
              <span>Gravação pronta — {formatTime(duration)}</span>
              <button onClick={clearAudio} className="ml-1 text-green-500 hover:text-green-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Record / Stop button */}
          {!isDone && (
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={disabled || recordingState === 'requesting'}
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-md',
                isRecording
                  ? 'bg-red-600 hover:bg-red-700 text-white scale-110'
                  : 'bg-amber-600 hover:bg-amber-700 text-white',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isRecording ? (
                <Square className="h-6 w-6" />
              ) : (
                <Mic className="h-7 w-7" />
              )}
            </button>
          )}

          {!isRecording && !isDone && (
            <p className="text-xs text-slate-400 text-center">
              Clique para gravar. Máximo {MAX_DURATION_SECONDS / 60} minutos.
            </p>
          )}
        </div>
      )}

      {/* Upload mode */}
      {mode === 'upload' && (
        <div className="py-4">
          {isDone && fileName ? (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <FileAudio className="h-5 w-5 text-green-600 flex-shrink-0" />
              <span className="text-sm text-green-800 truncate flex-1">{fileName}</span>
              <span className="text-xs text-green-500">
                {audioBlob ? (audioBlob.size / 1024 / 1024).toFixed(1) + ' MB' : ''}
              </span>
              <button onClick={clearAudio} className="text-green-500 hover:text-green-700">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              className={cn(
                'flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
                disabled
                  ? 'border-slate-200 bg-slate-50 cursor-not-allowed'
                  : 'border-slate-300 hover:border-amber-400 hover:bg-amber-50/50'
              )}
            >
              <Upload className="h-8 w-8 text-slate-400" />
              <span className="text-sm text-slate-600 font-medium">
                Clique para selecionar um arquivo de áudio
              </span>
              <span className="text-xs text-slate-400">
                MP3, M4A, WAV, OGG, WebM — até 25MB
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_AUDIO_TYPES}
                onChange={handleFileSelect}
                disabled={disabled}
                className="hidden"
              />
            </label>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
