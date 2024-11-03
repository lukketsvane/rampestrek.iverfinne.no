"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Pencil, Play, Pause, RotateCcw, Undo, Redo, Clock, Save, Image as ImageIcon } from 'lucide-react'
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
}

const DEFAULT_COLORS = ['#000000', '#1E00D2', '#0ACF83', '#A259FF', '#F24E1E', '#FF7262', '#1ABCFE']
const DEFAULT_SIZE = 4
const MIN_SIZE = 1
const MAX_SIZE = 20
const MIN_DURATION = 0.1
const MAX_DURATION = 30
const DEFAULT_DURATION = 3 // Changed to 3 seconds
const FPS = 30

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
  const [prevPoint, setPrevPoint] = useState<{ x: number; y: number } | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [isExporting, setIsExporting] = useState(false)
  const [gifTransparency, setGifTransparency] = useState(false) // Changed to false by default
  const [svgFileName, setSvgFileName] = useState('drawing.svg')
  const [gifFileName, setGifFileName] = useState('animated-drawing.gif')

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
    if (svgRef.current && paths.length > 0) {
      const pathElements = svgRef.current.querySelectorAll('path')
      pathElements.forEach((pathElement) => {
        const length = pathElement.getTotalLength()
        pathElement.style.strokeDasharray = `${length} ${length}`
        pathElement.style.strokeDashoffset = `${length}`
      })
    }
  }, [paths])

  const animatePaths = useCallback(() => {
    if (!svgRef.current) return

    const pathElements = svgRef.current.querySelectorAll('path')
    const totalLength = Array.from(pathElements).reduce((sum, path) => sum + path.getTotalLength(), 0)
    const animationDuration = duration * 1000 // Convert duration to milliseconds
    let startTime: number | null = null

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const elapsedTime = timestamp - startTime

      let accumulatedLength = 0
      pathElements.forEach((pathElement) => {
        const length = pathElement.getTotalLength()
        const startOffset = (accumulatedLength / totalLength) * animationDuration
        const endOffset = ((accumulatedLength + length) / totalLength) * animationDuration

        if (elapsedTime > startOffset) {
          const progress = Math.min((elapsedTime - startOffset) / (endOffset - startOffset), 1)
          pathElement.style.strokeDashoffset = `${length * (1 - progress)}`
        } else {
          pathElement.style.strokeDashoffset = `${length}`
        }

        accumulatedLength += length
      })

      if (elapsedTime < animationDuration) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setIsAnimating(false)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [duration])

  useEffect(() => {
    if (isAnimating && paths.length > 0) {
      resetAnimation()
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
    setPrevPoint({ x, y })
    setPaths(prev => {
      setUndoStack(undoStack => [...undoStack, prev])
      setRedoStack([])
      return [...prev, { d: `M${x},${y}`, color: currentColor, size }]
    })
  }

  const draw = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !prevPoint) return

    ctx.strokeStyle = currentColor
    ctx.lineWidth = size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in event ? event.touches[0].clientX : event.clientX) - rect.left
    const y = ('touches' in event ? event.touches[0].clientY : event.clientY) - rect.top

    ctx.beginPath()
    ctx.moveTo(prevPoint.x, prevPoint.y)
    ctx.lineTo(x, y)
    ctx.stroke()

    setPaths(prev => {
      const newPaths = [...prev]
      newPaths[newPaths.length - 1].d += ` L${x},${y}`
      return newPaths
    })

    setPrevPoint({ x, y })
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

    paths.forEach(path => {
      ctx.strokeStyle = path.color
      ctx.lineWidth = path.size
      const pathData = new Path2D(path.d)
      ctx.stroke(pathData)
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
        const pathData = new Path2D(path.d)
        tempCtx.stroke(pathData)
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

    setIsExporting(true)

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
      const pathData = new Path2D(path.d)
      tempCtx.stroke(pathData)
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
      const targetLength = totalLength * progress

      pathElements.forEach((pathElement, index) => {
        const length = pathElement.getTotalLength()
        const startOffset = accumulatedLength / totalLength
        const endOffset = (accumulatedLength + length) / totalLength

        if (progress > startOffset) {
          const pathProgress = Math.min((progress - startOffset) / (endOffset - startOffset), 1)
          pathElement.style.strokeDasharray = `${length} ${length}`
          pathElement.style.strokeDashoffset = `${length * (1 - pathProgress)}`
        } else {
          pathElement.style.strokeDasharray = `${length} ${length}`
          pathElement.style.strokeDashoffset = `${length}`
        }

        if (index === pathElements.length - 1) {
          accumulatedLength = 0 // Reset for the next frame
        } else {
          accumulatedLength += length
        }
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
            ctx.drawImage(img, -minX + 10, -minY + 10) // Adjust for padding
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
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            className="absolute top-0 left-0 pointer-events-none"
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
                  <div className="flex items-center">
                    <input
                      type="color"
                      value={currentColor}
                      onChange={(e) => setCurrentColor(e.target.value)}
                      className="w-8 h-8 rounded-full cursor-pointer"
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
                <div className="flex items-center gap-2">
                  <Label htmlFor="size-slider" className="w-12">Size:</Label>
                  <Slider
                    id="size-slider"
                    min={MIN_SIZE}
                    max={MAX_SIZE}
                    step={1}
                    value={[size]}
                    onValueChange={(value) => setSize(value[0])}
                    className="w-full"
                  />
                </div>
              </PopoverContent>
            </Popover>
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
    </TooltipProvider>
  )
}