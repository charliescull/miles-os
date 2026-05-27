'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { config } from '@/lib/config'

const TICKERS = [
  { symbol: 'BTC', value: '$64,120' },
  { symbol: 'NDX', value: '18,240' },
  { symbol: 'XAU', value: '$2,384' },
]

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
      <span className="mono text-sm text-white">{time}</span>
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
      w-7 h-7 rounded-full flex items-center justify-center
      bg-[oklch(0.72_0.18_145/0.2)] border border-[oklch(0.72_0.18_145/0.4)]
      text-[oklch(0.72_0.18_145)] text-[10px] font-bold mono
    ">
      {initials}
    </div>
  )
}

export default function TopRail() {
  const pathname = usePathname()

  return (
    <header className="
      flex items-center justify-between px-4 h-10 flex-shrink-0
      border-b border-[oklch(1_0_0/0.06)] bg-[oklch(0.08_0_0/0.95)]
      backdrop-blur-sm sticky top-0 z-50
    ">
      {/* Brand */}
      <div className="flex items-center gap-4 min-w-0">
        <Link href="/" className="mono text-xs font-semibold text-white whitespace-nowrap hover:text-[oklch(0.72_0.18_145)] transition-colors">
          MILES OS // V3.1
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
                  px-3 py-1 text-[11px] font-semibold tracking-widest rounded-sm
                  transition-colors duration-150
                  ${active
                    ? 'bg-white text-black'
                    : 'text-[oklch(0.55_0_0)] hover:text-[oklch(0.75_0_0)]'
                  }
                `}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Right side: tickers + clock + avatar */}
      <div className="flex items-center gap-4">
        {/* Tickers */}
        <div className="hidden md:flex items-center gap-3">
          {TICKERS.map(({ symbol, value }) => (
            <span key={symbol} className="flex items-center gap-1.5">
              <span className="card-label">{symbol}</span>
              <span className="mono text-xs text-white">{value}</span>
            </span>
          ))}
        </div>

        <Clock />
        <Avatar />
      </div>
    </header>
  )
}
