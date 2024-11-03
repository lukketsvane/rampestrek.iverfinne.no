"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Pencil, Play, Pause, RotateCcw, Undo, Redo, Save, Image as ImageIcon, Hand } from 'lucide-react'
import FileSaver from 'file-saver'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import GIF from 'gif.js'
import { Switch } from "@/components/ui/switch"

// IMPORTANT: Download the GIF worker script from:
// https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js
// and place it in your public directory.

interface Path {
  d: string
  color: string
  size: number
  points: { x: number; y: number; time: number }[]
}

const DEFAULT_COLORS = ['#000000', '#1E00D2', '#0ACF83', '#A259FF', '#F24E1E', '#FF7262', '#1ABCFE']
const DEFAULT_SIZE = 4
const MIN_SIZE = 1
const MAX_SIZE = 20
const MIN_DURATION = 0.1
const MAX_DURATION = 30
const DEFAULT_DURATION = 3
const FPS = 60

export default function FullScreenDrawingImprovedAnimation() {
  const [isDrawing, setIsDrawing] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [panMode, setPanMode] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [paths, setPaths] = useState<Path[]>([])
  const [currentColor, setCurrentColor] = useState(DEFAULT_COLORS[0])
  const [undoStack, setUndoStack] = useState<Path[][]>([])
  const [redoStack, setRedoStack] = useState<Path[][]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>()
  const [prevPoint, setPrevPoint] = useState<{ x: number; y: number } | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [isExporting, setIsExporting] = useState(false)
  const [gifTransparency, setGifTransparency] = useState(false)
  const [svgFileName, setSvgFileName] = useState('drawing.svg')
  const [gifFileName, setGifFileName] = useState('animated-drawing.gif')
  const [jitter, setJitter] = useState(0)
  const [simultaneousAnimation, setSimultaneousAnimation] = useState(false)

  useEffect(() => {
    const metaViewport = document.querySelector('meta[name=viewport]')
    if (metaViewport) {
      metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, orientation=portrait')
    } else {
      const newMetaViewport = document.createElement('meta')
      newMetaViewport.name = 'viewport'
      newMetaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, orientation=portrait'
      document.head.appendChild(newMetaViewport)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        setPanMode(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setPanMode(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight - 80 // Subtracting toolbar height
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  const animatePaths = useCallback(() => {
    if (!svgRef.current) return

    const pathElements = svgRef.current.querySelectorAll('path')
    const animationDuration = duration * 1000 // Convert duration to milliseconds
    let startTime: number | null = null
    const totalLength = paths.reduce((sum, path) => sum + path.points.length, 0)

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const elapsedTime = timestamp - startTime
      const progress = Math.min(elapsedTime / animationDuration, 1)

      pathElements.forEach((pathElement, index) => {
        const originalPath = paths[index]
        const pathLength = originalPath.points.length
        let pathProgress: number

        if (simultaneousAnimation) {
          pathProgress = progress
        } else {
          const startOffset = paths.slice(0, index).reduce((sum, path) => sum + path.points.length, 0) / totalLength
          const endOffset = startOffset + pathLength / totalLength
          pathProgress = Math.max(0, Math.min((progress - startOffset) / (endOffset - startOffset), 1))
        }

        const visiblePointCount = Math.ceil(pathLength * pathProgress)
        const visiblePoints = originalPath.points.slice(0, visiblePointCount)

        // Apply smooth jitter effect
        const jitteredPoints = visiblePoints.map((point, i) => {
          const t = i / (visiblePointCount - 1)
          const shake = Math.sin(t * Math.PI * 2) * jitter * (Math.random() - 0.5)
          return { x: point.x + shake, y: point.y + shake }
        })

        // Use cubic Bezier curves for smoother path
        const pathData = jitteredPoints.reduce((acc, point, i, arr) => {
          if (i === 0) return `M ${point.x},${point.y}`
          if (i === 1) return `${acc} L ${point.x},${point.y}`
          const prev = arr[i - 1]
          const mid = {
            x: (prev.x + point.x) / 2,
            y: (prev.y + point.y) / 2
          }
          return `${acc} Q ${prev.x},${prev.y} ${mid.x},${mid.y}`
        }, '')

        pathElement.setAttribute('d', pathData)
        pathElement.style.strokeDashoffset = `${pathElement.getTotalLength() * (1 - pathProgress)}`
      })

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setIsAnimating(false)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [duration, simultaneousAnimation, paths, jitter])

  useEffect(() => {
    if (isAnimating && paths.length > 0) {
      resetAnimation()
      const timeout = setTimeout(() => {
        animatePaths()
      }, 50)
      return () => {
        clearTimeout(timeout)
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
        }
      }
    } else {
      redrawCanvas()
    }
  }, [isAnimating, paths, animatePaths])

  const startDrawing = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (panMode) {
      startPanning(event)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    setIsDrawing(true)
    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in event ? event.touches[0].clientX : event.clientX) - rect.left - panOffset.x
    const y = ('touches' in event ? event.touches[0].clientY : event.clientY) - rect.top - panOffset.y
    const time = Date.now()
    setPrevPoint({ x, y })
    setPaths(prev => {
      setUndoStack(undoStack => [...undoStack, prev])
      setRedoStack([])
      return [...prev, { d: `M${x},${y}`, color: currentColor, size, points: [{ x, y, time }] }]
    })
  }

  const draw = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (panMode) {
      pan(event)
      return
    }

    if (!isDrawing) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !prevPoint) return

    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in event ? event.touches[0].clientX : event.clientX) - rect.left - panOffset.x
    const y = ('touches' in event ? event.touches[0].clientY : event.clientY) - rect.top - panOffset.y

    const time = Date.now()
    const newPoint = { x, y, time }

    setPaths(prev => {
      const newPaths = [...prev]
      const currentPath = newPaths[newPaths.length - 1]
      currentPath.points.push(newPoint)

      // Use cubic Bezier curve for smoother drawing
      if (currentPath.points.length > 2) {
        const p1 = currentPath.points[currentPath.points.length - 3]
        const p2 = currentPath.points[currentPath.points.length - 2]
        const p3 = newPoint
        const midPoint1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
        const midPoint2 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 }
        currentPath.d += ` Q ${p2.x},${p2.y} ${midPoint2.x},${midPoint2.y}`
      } else {
        currentPath.d += ` L ${x},${y}`
      }

      // Redraw the path
      ctx.strokeStyle = currentPath.color
      ctx.lineWidth = currentPath.size
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      const path = new Path2D(currentPath.d)
      ctx.stroke(path)

      return newPaths
    })

    setPrevPoint(newPoint)
  }

  const endDrawing = () => {
    setIsDrawing(false)
    setPrevPoint(null)
  }

  const startPanning = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsPanning(true)
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY
    setPrevPoint({ x: clientX, y: clientY })
  }

  const pan = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isPanning || !prevPoint) return

    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY

    const dx = clientX - prevPoint.x
    const dy = clientY - prevPoint.y

    setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }))
    setPrevPoint({ x: clientX, y: clientY })

    redrawCanvas()
  }

  const endPanning = () => {
    setIsPanning(false)
    setPrevPoint(null)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setPaths([])
    setUndoStack([])
    setRedoStack([])
    setIsAnimating(false)
    setPanOffset({ x: 0, y: 0 })
  }

  const toggleAnimation = () => {
    setIsAnimating(prev => !prev)
  }

  const resetAnimation = () => {
    if (svgRef.current) {
      const pathElements = svgRef.current.querySelectorAll('path')
      pathElements.forEach((pathElement) => {
        const length = pathElement.getTotalLength()
        pathElement.style.strokeDasharray = `${length} ${length}`
        pathElement.style.strokeDashoffset = `${length}`
        pathElement.style.transition = 'none'
      })
      void svgRef.current.getBBox()
    }
  }

  const redrawCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.save()
    ctx.translate(panOffset.x, panOffset.y)

    paths.forEach(path => {
      ctx.strokeStyle = path.color
      ctx.lineWidth = path.size
      ctx.beginPath()
      const pathObj = new Path2D(path.d)
      ctx.stroke(pathObj)
    })

    ctx.restore()
  }

  const undo = () => {
    if (undoStack.length === 0) return
    const previousPaths = undoStack[undoStack.length - 1]
    
    setUndoStack(undoStack.slice(0, -1))
    setRedoStack([...redoStack, paths])
    setPaths(previousPaths)
  }

  const redo = () => {
    if (redoStack.length === 0) return
    const nextPaths = redoStack[redoStack.length - 1]
    setRedoStack(redoStack.slice(0, -1))
    setUndoStack([...undoStack, paths])
    setPaths(nextPaths)
  }

  const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value)
    if (!isNaN(value) && value >= MIN_DURATION && value <= MAX_DURATION) {
      setDuration(Math.round(value * 10) / 10) // Round to one decimal place
    }
  }

  const getBoundingBox = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imageData = ctx.getImageData(0, 0, width, height)
    let minX = width, minY = height, maxX = 0, maxY = 0

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = imageData.data[(y * width + x) * 4 + 3]
        if (alpha !== 0) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }

    return { minX, minY, maxX, maxY }
  }

  const downloadSVG = () => {
    if (svgRef.current) {
      const svgClone = svgRef.current.cloneNode(true) as  SVGSVGElement

      // Create a temporary canvas to determine the bounding box
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = dimensions.width
      tempCanvas.height = dimensions.height
      const tempCtx = tempCanvas.getContext('2d')
      if (!tempCtx) return

      // Draw all paths to determine the bounding box
      tempCtx.save()
      tempCtx.translate(panOffset.x, panOffset.y)
      paths.forEach(path => {
        tempCtx.strokeStyle = path.color
        tempCtx.lineWidth = path.size
        tempCtx.lineCap = 'round'
        tempCtx.lineJoin = 'round'
        const pathData = new Path2D(path.d)
        tempCtx.stroke(pathData)
      })
      tempCtx.restore()

      const { minX, minY, maxX, maxY } = getBoundingBox(tempCtx, dimensions.width, dimensions.height)
      const cropWidth = maxX - minX + 20  // Add some padding
      const cropHeight = maxY - minY + 20 // Add some padding

      // Update SVG viewBox and size
      svgClone.setAttribute('viewBox', `${minX - 10 - panOffset.x} ${minY - 10 - panOffset.y} ${cropWidth} ${cropHeight}`)
      svgClone.setAttribute('width', cropWidth.toString())
      svgClone.setAttribute('height', cropHeight.toString())

      const svgData = new XMLSerializer().serializeToString(svgClone)
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })

      FileSaver.saveAs(svgBlob, svgFileName)
    }
  }

  const downloadGIF = async () => {
    if (!svgRef.current || paths.length === 0) return

    setIsExporting(true)

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = dimensions.width
    tempCanvas.height = dimensions.height
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    // Draw all paths to determine the bounding box
    tempCtx.save()
    tempCtx.translate(panOffset.x, panOffset.y)
    paths.forEach(path => {
      tempCtx.strokeStyle = path.color
      tempCtx.lineWidth = path.size
      tempCtx.lineCap = 'round'
      tempCtx.lineJoin = 'round'
      const pathData = new Path2D(path.d)
      tempCtx.stroke(pathData)
    })
    tempCtx.restore()

    const { minX, minY, maxX, maxY } = getBoundingBox(tempCtx, dimensions.width, dimensions.height)
    const cropWidth = maxX - minX + 20  // Add some padding
    const cropHeight = maxY - minY + 20 // Add some padding

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: cropWidth,
      height: cropHeight,
      workerScript: '/gif.worker.js',
      transparent: gifTransparency ? 'rgba(0,0,0,0)' : null,
      background: gifTransparency ? null : '#ffffff'
    })

    const totalFrames = Math.ceil(duration * FPS)
    const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement
    const pathElements = Array.from(svgClone.querySelectorAll('path'))

    const totalLength = pathElements.reduce((sum, path) => sum + path.getTotalLength(), 0)
    let accumulatedLength = 0

    for (let frame = 0; frame <= totalFrames; frame++) {
      const progress = frame / totalFrames

      pathElements.forEach((pathElement, index) => {
        const originalPath = paths[index]
        const length = pathElement.getTotalLength()
        let pathProgress: number

        if (simultaneousAnimation) {
          pathProgress = progress
        } else {
          const totalLength = paths.reduce((sum, path) => sum + path.points.length, 0)
          const startOffset = paths.slice(0, index).reduce((sum, path) => sum + path.points.length, 0) / totalLength
          const endOffset = (startOffset + originalPath.points.length / totalLength)
          pathProgress = Math.max(0, Math.min((progress - startOffset) / (endOffset - startOffset), 1))
        }

        const visiblePointCount = Math.ceil(originalPath.points.length * pathProgress)
        const visiblePoints = originalPath.points.slice(0, visiblePointCount)

        // Apply smooth jitter effect
        const jitteredPoints = visiblePoints.map((point, i) => {
          const t = i / (visiblePointCount - 1)
          const shake = Math.sin(t * Math.PI * 2) * jitter * (Math.random() - 0.5)
          return { x: point.x + shake, y: point.y + shake }
        })

        // Use cubic Bezier curves for smoother path
        const pathData = jitteredPoints.reduce((acc, point, i, arr) => {
          if (i === 0) return `M ${point.x},${point.y}`
          if (i === 1) return `${acc} L ${point.x},${point.y}`
          const prev = arr[i - 1]
          const mid = {
            x: (prev.x + point.x) / 2,
            y: (prev.y + point.y) / 2
          }
          return `${acc} Q ${prev.x},${prev.y} ${mid.x},${mid.y}`
        }, '')

        pathElement.setAttribute('d', pathData)
        pathElement.style.strokeDasharray = `${length} ${length}`
        pathElement.style.strokeDashoffset = `${length * (1 - pathProgress)}`
      })

      const svgData = new XMLSerializer().serializeToString(svgClone)
      const img = new Image()
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData)

      await new Promise<void>((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = cropWidth
          canvas.height = cropHeight
          const ctx = canvas.getContext('2d')
          if (ctx) {
            if (!gifTransparency) {
              ctx.fillStyle = '#ffffff'
              ctx.fillRect(0, 0, cropWidth, cropHeight)
            }
            ctx.drawImage(img, -minX + 10 - panOffset.x, -minY + 10 - panOffset.y) // Adjust for padding and pan offset
            gif.addFrame(canvas, { copy: true, delay: 1000 / FPS })
          }
          resolve()
        }
      })
    }

    gif.on('finished', (blob: Blob) => {
      FileSaver.saveAs(blob, gifFileName)
      setIsExporting(false)
    })

    gif.render()
  }

  return (
    <TooltipProvider>
      <div ref={containerRef} className="fixed inset-0 bg-background flex flex-col select-none">
        <div className="relative flex-grow">
          <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            className={`touch-none select-none ${isAnimating ? 'hidden' : 'block'}`}
            onMouseDown={panMode ? startPanning : startDrawing}
            onMouseMove={panMode ? pan : draw}
            onMouseUp={panMode ? endPanning : endDrawing}
            onMouseLeave={panMode ? endPanning : endDrawing}
            onTouchStart={panMode ? startPanning : startDrawing}
            onTouchMove={panMode ? pan : draw}
            onTouchEnd={panMode ? endPanning : endDrawing}
          />
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            className="absolute top-0 left-0 pointer-events-none select-none"
            style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
          >
            {paths.map((path, index) => (
              <path
                key={index}
                d={path.d}
                fill="none"
                stroke={path.color}
                strokeWidth={path.size}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </div>

        {/* Bottom Toolbar */}
        <div className="flex items-center justify-between p-2 bg-background border-t border-border h-16">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={clearCanvas}
              aria-label="Clear canvas"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <div className="flex">
              <Button
                variant="ghost"
                size="icon"
                onClick={undo}
                disabled={undoStack.length === 0}
                aria-label="Undo"
                className="hover:bg-transparent"
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={redo}
                disabled={redoStack.length === 0}
                aria-label="Redo"
                className="hover:bg-transparent"
              >
                <Redo className="h-4 w-4" />
              </Button>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="w-8 h-8 rounded-full p-0"
                  style={{ backgroundColor: currentColor }}
                  aria-label="Select color"
                />
              </PopoverTrigger>
              <PopoverContent className="w-56">
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_COLORS.map((color) => (
                    <Button
                      key={color}
                      variant="outline"
                      size="icon"
                      className="w-8 h-8 rounded-full p-0"
                      style={{ backgroundColor: color }}
                      onClick={() => setCurrentColor(color)}
                      aria-label={`Select ${color} color`}
                    />
                  ))}
                  <div className="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden border-2 border-primary relative">
                    <img
                      src="/images/color_picker.png"
                      alt="Custom color picker"
                      width={32}
                      height={32}
                      className="absolute inset-0"
                    />
                    <input
                      type="color"
                      value={currentColor}
                      onChange={(e) => setCurrentColor(e.target.value)}
                      className="opacity-0 w-full h-full cursor-pointer absolute inset-0"
                      aria-label="Select custom color"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Adjust stroke width">
                  <Pencil className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="size-slider">Size:</Label>
                    <Slider
                      id="size-slider"
                      min={MIN_SIZE}
                      max={MAX_SIZE}
                      step={1}
                      value={[size]}
                      onValueChange={(value) => setSize(value[0])}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jitter-slider">Shake Intensity:</Label>
                    <Slider
                      id="jitter-slider"
                      min={0}
                      max={10}
                      step={0.1}
                      value={[jitter]}
                      onValueChange={(value) => {
                        setJitter(value[0])
                        redrawCanvas()
                      }}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant={panMode ? "secondary" : "outline"}
              size="icon"
              onClick={() => setPanMode(!panMode)}
              aria-label={panMode ? "Disable pan mode" : "Enable pan mode"}
              className="h-8 w-8"
            >
              <Hand className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <Label htmlFor="duration-input" className="sr-only">Animation duration (seconds)</Label>
              <div className="relative">
                <Input
                  id="duration-input"
                  type="number"
                  min={MIN_DURATION}
                  max={MAX_DURATION}
                  step={0.1}
                  value={duration}
                  onChange={handleDurationChange}
                  className="w-14 pr-5 h-8 text-xs"
                />
                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">s</span>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Download options"
                >
                  <Save className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="svg-filename">SVG Filename</Label>
                    <div className="flex gap-2">
                      <Input
                        id="svg-filename"
                        value={svgFileName}
                        onChange={(e) => setSvgFileName(e.target.value)}
                        className="flex-grow"
                      />
                      <Button onClick={downloadSVG} size="icon" aria-label="Download SVG">
                        <Save className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="gif-filename">GIF Filename</Label>
                    <div className="flex gap-2">
                      <Input
                        id="gif-filename"
                        value={gifFileName}
                        onChange={(e) => setGifFileName(e.target.value)}
                        className="flex-grow"
                      />
                      <Button onClick={downloadGIF} size="icon" aria-label="Download GIF">
                        <ImageIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="gif-transparency"
                      checked={gifTransparency}
                      onCheckedChange={setGifTransparency}
                    />
                    <Label htmlFor="gif-transparency">GIF Transparency</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="animation-mode"
                      checked={simultaneousAnimation}
                      onCheckedChange={setSimultaneousAnimation}
                    />
                    <Label htmlFor="animation-mode">Animate All Paths Simultaneously</Label>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleAnimation}
              disabled={paths.length === 0}
              aria-label={isAnimating ? "Stop animation" : "Start animation"}
              className="h-8 w-8"
            >
              {isAnimating ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}            