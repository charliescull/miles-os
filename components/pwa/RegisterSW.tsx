'use client'

import { useEffect } from 'react'

// Registers the service worker so the app is installable ("Add to Home Screen").
export default function RegisterSW() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
