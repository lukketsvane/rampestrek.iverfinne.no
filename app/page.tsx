"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Pencil, Play, Pause, RotateCcw, Undo, Redo, Clock, Save, Image as ImageIcon, Grid } from 'lucide-react'
import FileSaver from 'file-saver'
import GIF from 'gif.js'
import { Switch } from "@/components/ui/switch"
import Image from 'next/image'

interface Point {
  x: number
  y: number
  time: number
}

interface Path {
  color: string
  size: number
  points: Point[]
}

const DEFAULT_COLORS = ['#000000', '#1E00D2', '#0ACF83', '#A259FF', '#F24E1E', '#FF7262', '#1ABCFE']
const DEFAULT_SIZE = 4
const MIN_SIZE = 1
const MAX_SIZE = 20
const MIN_DURATION = 0.1
const MAX_DURATION = 30
const DEFAULT_DURATION = 3
const FPS = 60
const MAX_SHAKE = 5

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export default function FullScreenDrawingImprovedAnimation() {
  const [isDrawing, setIsDrawing] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
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
  const [prevPoint, setPrevPoint] = useState<Point | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [gifTransparency, setGifTransparency] = useState(false)
  const [svgFileName, setSvgFileName] = useState('drawing.svg')
  const [gifFileName, setGifFileName] = useState('animated-drawing.gif')
  const [shake, setShake] = useState(0)
  const [simultaneousAnimation, setSimultaneousAnimation] = useState(false)
  const [showReferenceLines, setShowReferenceLines] = useState(false)
  const referenceCanvasRef = useRef<HTMLCanvasElement>(null)

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

  useEffect(() => {
    drawReferenceLines()
  }, [dimensions, showReferenceLines])

  const drawReferenceLines = () => {
    const canvas = referenceCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!showReferenceLines) return

    ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)'
    ctx.lineWidth = 1

    // Draw horizontal lines
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }

    // Draw vertical lines
    for (let x = 0; x < canvas.width; x += 20) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
  }

  const animatePaths = useCallback(() => {
    if (!svgRef.current) return

    const svgPaths = Array.from(svgRef.current.querySelectorAll('path'))
    const animationDuration = duration * 1000 // Convert duration to milliseconds
    let startTime: number | null = null

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const elapsedTime = timestamp - startTime
      const progress = Math.min(elapsedTime / animationDuration, 1)
      const easedProgress = easeInOutCubic(progress)

      if (simultaneousAnimation) {
        // Simultaneous animation (all paths at once)
        svgPaths.forEach((path) => {
          const length = path.getTotalLength()
          path.style.strokeDasharray = `${length} ${length}`
          path.style.strokeDashoffset = `${length * (1 - easedProgress)}`
        })
      } else {
        // Sequential animation (one path at a time)
        const totalLength = svgPaths.reduce((sum, path) => sum + path.getTotalLength(), 0)
        let accumulatedLength = 0

        svgPaths.forEach((path) => {
          const length = path.getTotalLength()
          const startOffset = accumulatedLength / totalLength
          const endOffset = (accumulatedLength + length) / totalLength

          if (easedProgress > startOffset) {
            const pathProgress = Math.min((easedProgress - startOffset) / (endOffset - startOffset), 1)
            const easedPathProgress = easeInOutCubic(pathProgress)
            path.style.strokeDasharray = `${length} ${length}`
            path.style.strokeDashoffset = `${length * (1 - easedPathProgress)}`
          } else {
            path.style.strokeDasharray = `${length} ${length}`
            path.style.strokeDashoffset = `${length}`
          }

          accumulatedLength += length
        })
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setIsAnimating(false)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [duration, simultaneousAnimation])

  useEffect(() => {
    if (isAnimating && paths.length > 0) {
      const timeout = setTimeout(() => {
        animatePaths()
      }, 50) // Short delay to ensure reset has taken effect
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
    const canvas = canvasRef.current
    if (!canvas) return

    setIsDrawing(true)
    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in event ? event.touches[0].clientX : event.clientX) - rect.left
    const y = ('touches' in event ? event.touches[0].clientY : event.clientY) - rect.top
    const time = Date.now()
    const newPoint = { x, y, time }
    setPrevPoint(newPoint)
    setPaths(prev => {
      setUndoStack(undoStack => [...undoStack, prev])
      setRedoStack([])
      return [...prev, { color: currentColor, size, points: [newPoint] }]
    })
  }

  const draw = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !prevPoint) return

    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in event ? event.touches[0].clientX : event.clientX) - rect.left
    const y = ('touches' in event ? event.touches[0].clientY : event.clientY) - rect.top
    const time = Date.now()

    // Apply shake to the new point
    const shakeAmount = shake * MAX_SHAKE
    const shakenX = x + (Math.random() - 0.5) * shakeAmount
    const shakenY = y + (Math.random() - 0.5) * shakeAmount
    const newPoint = { x: shakenX, y: shakenY, time }

    setPaths(prev => {
      const newPaths = [...prev]
      const currentPath = newPaths[newPaths.length - 1]
      currentPath.points.push(newPoint)

      // Draw the new segment
      ctx.strokeStyle = currentPath.color
      ctx.lineWidth = currentPath.size
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(prevPoint.x, prevPoint.y)
      ctx.lineTo(newPoint.x, newPoint.y)
      ctx.stroke()

      return newPaths
    })

    setPrevPoint(newPoint)
  }

  const endDrawing = () => {
    setIsDrawing(false)
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
  }

  const toggleAnimation = () => {
    setIsAnimating(prev => !prev)
  }

  const redrawCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    paths.forEach(path => {
      ctx.strokeStyle = path.color
      ctx.lineWidth = path.size
      ctx.beginPath()
      path.points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y)
        } else {
          ctx.lineTo(point.x, point.y)
        }
      })
      ctx.stroke()
    })
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
      const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement

      // Create a temporary canvas to determine the bounding box
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = dimensions.width
      tempCanvas.height = dimensions.height
      const tempCtx = tempCanvas.getContext('2d')
      if (!tempCtx) return

      // Draw all paths to determine the bounding box
      paths.forEach(path => {
        tempCtx.strokeStyle = path.color
        tempCtx.lineWidth = path.size
        tempCtx.lineCap = 'round'
        tempCtx.lineJoin = 'round'
        tempCtx.beginPath()
        path.points.forEach((point, index) => {
          if (index === 0) {
            tempCtx.moveTo(point.x, point.y)
          } else {
            tempCtx.lineTo(point.x, point.y)
          }
        })
        tempCtx.stroke()
      })

      const { minX, minY, maxX, maxY } = getBoundingBox(tempCtx, dimensions.width, dimensions.height)
      const cropWidth = maxX - minX + 20  // Add some padding
      const cropHeight = maxY - minY + 20 // Add some padding

      // Update SVG viewBox and size
      svgClone.setAttribute('viewBox', `${minX - 10} ${minY - 10} ${cropWidth} ${cropHeight}`)
      svgClone.setAttribute('width', cropWidth.toString())
      svgClone.setAttribute('height', cropHeight.toString())

      const svgData = new XMLSerializer().serializeToString(svgClone)
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })

      FileSaver.saveAs(svgBlob, svgFileName)
    }
  }

  const downloadGIF = async () => {
    if (!svgRef.current || paths.length === 0) return

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = dimensions.width
    tempCanvas.height = dimensions.height
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    // Draw all paths to determine the bounding box
    paths.forEach(path => {
      tempCtx.strokeStyle = path.color
      tempCtx.lineWidth = path.size
      tempCtx.lineCap = 'round'
      tempCtx.lineJoin = 'round'
      tempCtx.beginPath()
      path.points.forEach((point, index) => {
        if (index === 0) {
          tempCtx.moveTo(point.x, point.y)
        } else {
          tempCtx.lineTo(point.x, point.y)
        }
      })
      tempCtx.stroke()
    })

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
      const easedProgress = easeInOutCubic(progress)

      if (simultaneousAnimation) {
        // Simultaneous animation (all paths at once)
        pathElements.forEach((pathElement) => {
          const length = pathElement.getTotalLength()
          pathElement.style.strokeDasharray = `${length} ${length}`
          pathElement.style.strokeDashoffset = `${length * (1 - easedProgress)}`
        })
      } else {
        // Sequential animation (one path at a time)
        pathElements.forEach((pathElement) => {
          const length = pathElement.getTotalLength()
          const startOffset = accumulatedLength / totalLength
          const endOffset = (accumulatedLength + length) / totalLength

          if (easedProgress > startOffset) {
            const pathProgress = Math.min((easedProgress - startOffset) / (endOffset - startOffset), 1)
            const easedPathProgress = easeInOutCubic(pathProgress)
            pathElement.style.strokeDasharray = `${length} ${length}`
            pathElement.style.strokeDashoffset = `${length * (1 - easedPathProgress)}`
          } else {
            pathElement.style.strokeDasharray = `${length} ${length}`
            pathElement.style.strokeDashoffset = `${length}`
          }

          accumulatedLength += length
        })
      }

      const svgData = new XMLSerializer().serializeToString(svgClone)
      const img = new globalThis.Image()
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
            ctx.drawImage(img, -minX + 10, -minY + 10) // Adjust for padding
            gif.addFrame(canvas, { copy: true, delay: 1000 / FPS })
          }
          resolve()
        }
      })
    }

    gif.on('finished', (blob: Blob) => {
      FileSaver.saveAs(blob, gifFileName)
    })

    gif.render()
  }

  return (
    <div ref={containerRef} className="fixed inset-0 bg-background flex flex-col">
      <div className="relative flex-grow">
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className={`touch-none ${isAnimating ? 'hidden' : 'block'}`}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={endDrawing}
        />
        <canvas
          ref={referenceCanvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className="absolute top-0 left-0 pointer-events-none"
        />
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="absolute top-0 left-0 pointer-events-none"
        >
          {paths.map((path, index) => (
            <path
              key={index}
              d={`M ${path.points.map(p => `${p.x},${p.y}`).join(' L ')}`}
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
      <div className="flex items-center justify-between p-4 bg-background border-t border-border h-20">
        <div className="flex items-center gap-4">
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
                  <Image
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
                  <Label htmlFor="shake-slider">Shake Intensity:</Label>
                  <Slider
                    id="shake-slider"
                    min={0}
                    max={1}
                    step={0.01}
                    value={[shake]}
                    onValueChange={(value) => setShake(value[0])}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex items-center space-x-2">
            <Switch
              id="reference-lines"
              checked={showReferenceLines}
              onCheckedChange={setShowReferenceLines}
            />

          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
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
                className="w-16 pr-6"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">s</span>
            </div>
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
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
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleAnimation}
            disabled={paths.length === 0}
            aria-label={isAnimating ? "Stop animation" : "Start animation"}
          >
            {isAnimating ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}