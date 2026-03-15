import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastType = 'success' | 'info' | 'warning' | 'danger'

export interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
  /** Auto-dismiss duration in ms. `undefined` = persistent (user must dismiss). */
  duration?: number
}

type ToastInput = Omit<Toast, 'id'>

interface ToastContextValue {
  toasts: Toast[]
  addToast: (toast: ToastInput) => string
  removeToast: (id: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TOASTS = 5

const DEFAULT_DURATIONS: Record<ToastType, number | undefined> = {
  success: 5000,
  info: 5000,
  warning: undefined,
  danger: undefined,
}

const ICON_MAP: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  danger: XCircle,
}

const STYLE_MAP: Record<ToastType, { bg: string; text: string; border: string }> = {
  success: { bg: 'bg-success-bg', text: 'text-success', border: 'border-l-success' },
  info: { bg: 'bg-info-bg', text: 'text-info', border: 'border-l-info' },
  warning: { bg: 'bg-warning-bg', text: 'text-warning', border: 'border-l-warning' },
  danger: { bg: 'bg-danger-bg', text: 'text-danger', border: 'border-l-danger' },
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type Action =
  | { type: 'ADD'; toast: Toast }
  | { type: 'REMOVE'; id: string }

function reducer(state: Toast[], action: Action): Toast[] {
  switch (action.type) {
    case 'ADD': {
      const next = [...state, action.toast]
      // Evict oldest if over limit
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next
    }
    case 'REMOVE':
      return state.filter((t) => t.id !== action.id)
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(reducer, [])

  const addToast = useCallback((input: ToastInput): string => {
    const id = crypto.randomUUID()
    const duration = input.duration !== undefined ? input.duration : DEFAULT_DURATIONS[input.type]
    dispatch({ type: 'ADD', toast: { ...input, id, duration } })
    return id
  }, [])

  const removeToast = useCallback((id: string) => {
    dispatch({ type: 'REMOVE', id })
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')

  const { addToast, removeToast } = ctx

  return {
    /** Add a toast with full control over options. */
    toast: addToast,
    /** Show a success toast (auto-dismisses in 5s). */
    success: (title: string, description?: string) =>
      addToast({ type: 'success', title, description }),
    /** Show an info toast (auto-dismisses in 5s). */
    info: (title: string, description?: string) =>
      addToast({ type: 'info', title, description }),
    /** Show a warning toast (persistent). */
    warning: (title: string, description?: string) =>
      addToast({ type: 'warning', title, description }),
    /** Show a danger toast (persistent). */
    danger: (title: string, description?: string) =>
      addToast({ type: 'danger', title, description }),
    /** Dismiss a toast by ID. */
    dismiss: removeToast,
  }
}

// ---------------------------------------------------------------------------
// Toast Item Component
// ---------------------------------------------------------------------------

const EXIT_ANIMATION_MS = 300

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerExit = useCallback(() => {
    setExiting(true)
    setTimeout(() => onRemove(toast.id), EXIT_ANIMATION_MS)
  }, [onRemove, toast.id])

  // Auto-dismiss
  useEffect(() => {
    if (toast.duration == null) return
    timerRef.current = setTimeout(triggerExit, toast.duration)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [toast.duration, triggerExit])

  const styles = STYLE_MAP[toast.type]
  const Icon = ICON_MAP[toast.type]
  const role = toast.type === 'warning' || toast.type === 'danger' ? 'alert' : 'status'

  return (
    <div
      role={role}
      className={`
        pointer-events-auto flex w-full items-start gap-3 rounded-lg border-l-4
        bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.15)]
        ${styles.border}
        ${exiting ? 'toast-exit' : 'toast-enter'}
      `}
    >
      <div className={`shrink-0 ${styles.text}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${styles.text}`}>{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-[13px] text-gray-600">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => triggerExit()}
        className="shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:text-gray-600"
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Container Component
// ---------------------------------------------------------------------------

export function ToastContainer() {
  const ctx = useContext(ToastContext)
  if (!ctx) return null

  const { toasts, removeToast } = ctx

  // Escape key dismisses most recent toast
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && toasts.length > 0) {
        removeToast(toasts[toasts.length - 1]!.id)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toasts, removeToast])

  if (toasts.length === 0) return null

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed top-4 right-4 z-50 flex w-[360px] flex-col gap-3"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}
