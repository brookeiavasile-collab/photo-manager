import { useState, useRef, useEffect, useCallback } from 'react'

export function useZoomPan({ containerRef, minScale = 0.5, maxScale = 5, resetScale = 1, depKey }) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const scaleRef = useRef(1)
  const positionRef = useRef({ x: 0, y: 0 })
  const touchRef = useRef({
    mode: null,
    initialDistance: 0,
    initialScale: 1,
    initialCenter: { x: 0, y: 0 },
    initialPosition: { x: 0, y: 0 },
    lastTouch: { x: 0, y: 0 },
  })

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    positionRef.current = position
  }, [position])

  useEffect(() => {
    if (depKey != null) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
    }
  }, [depKey])

  const zoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + 0.25, maxScale))
  }, [maxScale])

  const zoomOut = useCallback(() => {
    setScale(prev => {
      const next = Math.max(prev - 0.25, minScale)
      if (next <= resetScale) {
        setPosition({ x: 0, y: 0 })
      }
      return next
    })
  }, [minScale, resetScale])

  const reset = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  const onMouseDown = useCallback((e) => {
    if (scaleRef.current > 1 && e.button === 0) {
      setIsDragging(true)
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: positionRef.current.x,
        posY: positionRef.current.y
      }
    }
  }, [])

  const onMouseMove = useCallback((e) => {
    if (isDragging && scaleRef.current > 1) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      setPosition({
        x: dragStartRef.current.posX + dx,
        y: dragStartRef.current.posY + dy
      })
    }
  }, [isDragging])

  const onMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const getTouchCenter = (touches) => {
      if (touches.length < 2) return { x: 0, y: 0 }
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      }
    }

    const getTouchDistance = (touches) => {
      if (touches.length < 2) return 0
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        touchRef.current = {
          mode: 'pinch',
          initialDistance: getTouchDistance(e.touches),
          initialScale: scaleRef.current,
          initialCenter: getTouchCenter(e.touches),
          initialPosition: positionRef.current,
          lastTouch: touchRef.current.lastTouch,
        }
      } else if (e.touches.length === 1 && scaleRef.current > 1) {
        const touch = e.touches[0]
        touchRef.current = {
          ...touchRef.current,
          mode: 'pan',
          lastTouch: { x: touch.clientX, y: touch.clientY },
          initialPosition: positionRef.current,
        }
      }
    }

    const handleTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const currentDistance = getTouchDistance(e.touches)
        const currentCenter = getTouchCenter(e.touches)
        const { initialDistance, initialScale, initialCenter, initialPosition } = touchRef.current
        if (initialDistance > 0) {
          const newScale = Math.max(minScale, Math.min(initialScale * (currentDistance / initialDistance), maxScale))
          setScale(newScale)
          if (newScale <= resetScale) {
            setPosition({ x: 0, y: 0 })
          } else {
            setPosition({
              x: initialPosition.x + (currentCenter.x - initialCenter.x),
              y: initialPosition.y + (currentCenter.y - initialCenter.y),
            })
          }
        }
      } else if (e.touches.length === 1 && touchRef.current.mode === 'pan' && scaleRef.current > 1) {
        e.preventDefault()
        const touch = e.touches[0]
        const { lastTouch } = touchRef.current
        const nextPosition = {
          x: positionRef.current.x + (touch.clientX - lastTouch.x),
          y: positionRef.current.y + (touch.clientY - lastTouch.y),
        }
        touchRef.current.lastTouch = { x: touch.clientX, y: touch.clientY }
        setPosition(nextPosition)
      }
    }

    const handleTouchEnd = (e) => {
      if (e.touches.length === 1 && scaleRef.current > 1) {
        const touch = e.touches[0]
        touchRef.current = {
          ...touchRef.current,
          mode: 'pan',
          initialDistance: 0,
          lastTouch: { x: touch.clientX, y: touch.clientY },
        }
        return
      }

      touchRef.current = {
        ...touchRef.current,
        mode: null,
        initialDistance: 0,
      }
    }

    const handleGestureStart = (e) => {
      e.preventDefault()
      touchRef.current = {
        ...touchRef.current,
        mode: 'pinch',
        initialScale: scaleRef.current,
        initialPosition: positionRef.current,
      }
    }

    const handleGestureChange = (e) => {
      e.preventDefault()
      const baseScale = touchRef.current.initialScale || scaleRef.current
      const nextScale = Math.max(minScale, Math.min(baseScale * e.scale, maxScale))
      setScale(nextScale)
      if (nextScale <= resetScale) {
        setPosition({ x: 0, y: 0 })
      }
    }

    const handleTrackpadWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault()
        const delta = -e.deltaY * 0.01
        setScale(prev => {
          const nextScale = Math.max(minScale, Math.min(prev + delta, maxScale))
          if (nextScale <= resetScale) {
            setPosition({ x: 0, y: 0 })
          }
          return nextScale
        })
        return
      }

      if (scaleRef.current > 1) {
        e.preventDefault()
        setPosition(prev => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }))
      }
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: false })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd)
    container.addEventListener('touchcancel', handleTouchEnd)
    container.addEventListener('gesturestart', handleGestureStart)
    container.addEventListener('gesturechange', handleGestureChange)
    container.addEventListener('wheel', handleTrackpadWheel, { passive: false })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      container.removeEventListener('touchcancel', handleTouchEnd)
      container.removeEventListener('gesturestart', handleGestureStart)
      container.removeEventListener('gesturechange', handleGestureChange)
      container.removeEventListener('wheel', handleTrackpadWheel)
    }
  }, [containerRef, minScale, maxScale, resetScale])

  return {
    scale,
    position,
    isDragging,
    zoomIn,
    zoomOut,
    reset,
    bind: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave: onMouseUp
    }
  }
}
