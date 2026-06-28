'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { config } from '@/lib/config'
import { Barcode, Serial } from '@/components/hud'

// Live system telemetry — real numbers from the snapshot, not wallpaper.
function LiveTicker() {
  const [nw, setNw] = useState<string | null>(null)
  const [day, setDay] = useState<{ text: string; up: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/finance/snapshot')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (typeof d?.net_worth !== 'number') return
        const usd = (n: number) =>
          new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
        setNw(usd(d.net_worth))
        if (typeof d.daily_delta === 'number') {
          setDay({ text: `${d.daily_delta >= 0 ? '+' : ''}${usd(d.daily_delta)}`, up: d.daily_delta >= 0 })
        }
      })
      .catch(() => {})
  }, [])

  if (!nw) return <span className="card-label text-[oklch(0.30_0_0)]">SYNC…</span>
  return (
    <>
      <span className="flex items-center gap-1.5">
        <span className="card-label">NW</span>
        <span className="mono text-xs text-white">{nw}</span>
      </span>
      {day && (
        <span className="flex items-center gap-1.5">
          <span className="card-label">DAY</span>
          <span className={`mono text-xs ${day.up ? 'text-[var(--signal-up)]' : 'text-[var(--signal-down)]'}`}>{day.text}</span>
        </span>
      )}
    </>
  )
}

const NAV = [
  { label: 'HOME', href: '/' },
  { label: 'CRM', href: '/crm' },
  { label: 'FINANCE', href: '/finance' },
  { label: 'HEALTH', href: '/health' },
  { label: 'REVIEW', href: '/review' },
]

function Clock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    function update() {
      const now = new Date()
      const t = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: config.timezone,
        hour12: false,
      })
      const d = now.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        timeZone: config.timezone,
      }).toUpperCase()
      setTime(t)
      setDate(d)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-3">
      <span className="card-label">{date}</span>
      <span className="hud text-sm glow">{time}</span>
    </div>
  )
}

function Avatar() {
  const initials = config.displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="
      w-7 h-7 flex items-center justify-center
      border border-white/40 glow-box
      text-white text-[10px] hud
    ">
      {initials}
    </div>
  )
}

export default function TopRail() {
  const pathname = usePathname()

  // Re-trigger the boot sequence — BootGate listens for this.
  function reboot() {
    try { sessionStorage.removeItem('miles-booted') } catch {}
    window.dispatchEvent(new CustomEvent('miles:reboot'))
  }

  return (
    <header className="
      flex items-center justify-between px-4 h-10 flex-shrink-0
      border-b border-white/10 bg-black
      sticky top-0 z-50
    ">
      {/* Brand */}
      <div className="flex items-center gap-4 min-w-0">
        <Link href="/" className="display text-[11px] text-white whitespace-nowrap glow">
          MILES OS <span className="text-[oklch(0.45_0_0)]">// V3.1</span>
        </Link>

        {/* Nav tabs */}
        <nav className="flex items-center gap-0.5">
          {NAV.map(({ label, href }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`
                  hud px-3 py-1 text-[11px] tracking-[0.18em]
                  transition-colors duration-150
                  ${active
                    ? 'bg-white text-black'
                    : 'text-[oklch(0.52_0_0)] hover:text-white hover:glow'
                  }
                `}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Right side: tickers + reboot + clock + avatar */}
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-3">
          <LiveTicker />
        </div>

        <div className="hidden lg:flex items-center gap-2" aria-hidden>
          <Barcode seed="toprail" bars={18} height={12} className="opacity-50" />
          <Serial seed="toprail" groups={[4, 2]} />
        </div>

        <button
          onClick={reboot}
          title="Replay boot sequence"
          className="hud text-[10px] tracking-[0.18em] text-[oklch(0.45_0_0)] hover:text-white hover:glow transition-colors"
        >
          [ REBOOT ]
        </button>

        <Clock />
        <Avatar />
      </div>
    </header>
  )
}
