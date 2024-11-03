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

// IMPORTANT: Download the GIF worker script from:
// https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js
// and place it in your public directory.

interface Path {
  d: string
  color: string
  size: number
}

const DEFAULT_COLORS = ['#1E00D2', '#0ACF83', '#A259FF', '#F24E1E', '#FF7262', '#1ABCFE']
const DEFAULT_SIZE = 4
const MIN_SIZE = 1
const MAX_SIZE = 20
const MIN_DURATION = 0.1
const MAX_DURATION = 30
const DEFAULT_DURATION = 5
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
      void svgRef.current.getBBox() // Force reflow
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

  const downloadSVG = () => {
    if (svgRef.current) {
      // Clone the SVG to modify it without affecting the displayed version
      const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement

      // Set the width and height attributes
      svgClone.setAttribute('width', dimensions.width.toString())
      svgClone.setAttribute('height', dimensions.height.toString())

      // Create a blob from the SVG content
      const svgData = new XMLSerializer().serializeToString(svgClone)
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })

      // Prompt for file name
      const fileName = prompt('Enter file name', 'drawing.svg') || 'drawing.svg'

      // Save the file
      FileSaver.saveAs(svgBlob, fileName)
    }
  }

  const downloadGIF = async () => {
    if (!svgRef.current || paths.length === 0) return

    setIsExporting(true)

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: dimensions.width,
      height: dimensions.height,
      workerScript: '/gif.worker.js',
      transparent: 'rgba(0,0,0,0)'
    })

    const totalFrames = Math.ceil(duration * FPS)
    const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement
    // svgClone.style.backgroundColor = 'white' // Removed line

    for (let frame = 0; frame <= totalFrames; frame++) {
      const progress = frame / totalFrames
      const pathElements = svgClone.querySelectorAll('path')

      pathElements.forEach((pathElement) => {
        const length = pathElement.getTotalLength()
        pathElement.style.strokeDasharray = `${length} ${length}`
        pathElement.style.strokeDashoffset = `${length * (1 - progress)}`
      })

      const svgData = new XMLSerializer().serializeToString(svgClone)
      const img = new Image()
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData)

      await new Promise<void>((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = dimensions.width
          canvas.height = dimensions.height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            // Removed white background fill
            ctx.drawImage(img, 0, 0)
            gif.addFrame(canvas, { copy: true, delay: 1000 / FPS, transparent: 0 })
          }
          resolve()
        }
      })
    }

    gif.on('finished', (blob: Blob) => {
      FileSaver.saveAs(blob, 'animated-drawing.gif')
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
                variant="outline"
                size="icon"
                onClick={undo}
                disabled={undoStack.length === 0}
                aria-label="Undo"
                className="rounded-r-none border-r-0"
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={redo}
                disabled={redoStack.length === 0}
                aria-label="Redo"
                className="rounded-l-none"
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
              <PopoverContent className="w-40">
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
                  className="w-20 pr-8"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">s</span>
              </div>
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={downloadSVG}
                    aria-label="Download SVG"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download SVG</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={downloadGIF}
                    disabled={isExporting || paths.length === 0}
                    aria-label="Download GIF"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download GIF</TooltipContent>
              </Tooltip>
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