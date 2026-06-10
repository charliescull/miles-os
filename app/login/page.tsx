'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        setError('Invalid password')
        setPassword('')
      }
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[oklch(0.08_0_0)]">
      <div className="w-80">
        <div className="mb-8 text-center">
          <p className="card-label mb-1">PERSONAL OS</p>
          <h1 className="text-xl font-semibold text-white mono">// V3.1</h1>
        </div>

        <form onSubmit={handleSubmit} className="card rounded-sm p-6 space-y-4">
          <div>
            <label className="card-label block mb-2">ACCESS CODE</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              className="
                w-full bg-transparent border border-[oklch(1_0_0/0.08)] rounded-sm
                px-3 py-2 text-sm text-white placeholder-[oklch(0.45_0_0)]
                focus:outline-none focus:border-white/50
                mono
              "
            />
          </div>

          {error && (
            <p className="text-xs text-[var(--signal-down)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="
              w-full py-2 px-4 hud text-sm tracking-[0.18em]
              bg-white text-black hover:bg-[oklch(0.90_0_0)]
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {loading ? 'AUTHENTICATING...' : 'ENTER'}
          </button>
        </form>
      </div>
    </div>
  )
}
