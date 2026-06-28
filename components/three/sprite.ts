import * as THREE from 'three'

/**
 * A soft radial sprite — white core fading to black at the rim. Drawn on a
 * canvas once and cached. Used as the `map` on point materials so each point
 * renders as a soft glow blob instead of a hard pixel, which (under additive
 * blending) reads as an organic, fleshy volume rather than a dotted wireframe.
 */
let _soft: THREE.Texture | null = null

export function softSprite(): THREE.Texture {
  if (_soft) return _soft
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.12)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  _soft = tex
  return tex
}
