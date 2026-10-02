'use client'

import type { CSSProperties } from 'react'
import type { DesignDoc, Layer } from '@/lib/design'

export function layerStyle(l: Layer, scale: number): CSSProperties {
  return {
    position: 'absolute',
    left: l.x * scale,
    top: l.y * scale,
    width: l.w * scale,
    height: l.h * scale,
    transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
  }
}

export function LayerView({ l, scale }: { l: Layer; scale: number }) {
  if (l.type === 'shape')
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: l.fill,
          opacity: l.opacity,
          borderRadius: l.shape === 'ellipse' ? '50%' : l.radius * scale,
        }}
      />
    )
  if (l.type === 'image')
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={l.src}
        alt=""
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: l.fit, borderRadius: l.radius * scale, opacity: l.opacity }}
      />
    )
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        color: l.color,
        fontSize: l.fontSize * scale,
        fontWeight: l.fontWeight,
        fontFamily: l.fontFamily === 'Inter' ? 'var(--font-inter), Arial, sans-serif' : l.fontFamily,
        textAlign: l.align,
        lineHeight: l.lineHeight,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
      }}
    >
      {l.text}
    </div>
  )
}

// Read-only, scaled rendering — template cards and design thumbnails.
export function DesignPreview({ doc, w, h, width }: { doc: DesignDoc; w: number; h: number; width: number }) {
  const scale = width / w
  return (
    <div className="relative overflow-hidden" style={{ width, height: h * scale, background: doc.background }}>
      {doc.layers.map((l) => (
        <div key={l.id} style={layerStyle(l, scale)}>
          <LayerView l={l} scale={scale} />
        </div>
      ))}
    </div>
  )
}
