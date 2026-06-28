'use client'

import { ReactNode, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const BootSequence = dynamic(() => import('./BootSequence'), { ssr: false })

/**
 * Mount around HOME's content. Plays the boot once per browser session;
 * listens for the TopRail's `miles:reboot` event to replay (with sound,
 * since the click gesture unlocks WebAudio). Children render underneath
 * the whole time so the assemble-phase dissolve reveals the live brain.
 */
export default function BootGate({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(false)

  useEffect(() => {
    try {
      if (!sessionStorage.getItem('miles-booted')) setBooting(true)
    } catch {
      setBooting(true)
    }
    const onReboot = () => { setBooting(true) }
    window.addEventListener('miles:reboot', onReboot)
    return () => window.removeEventListener('miles:reboot', onReboot)
  }, [])

  function done() {
    try { sessionStorage.setItem('miles-booted', '1') } catch {}
    setBooting(false)
  }

  return (
    <>
      {children}
      {booting && <BootSequence onDone={done} />}
    </>
  )
}
