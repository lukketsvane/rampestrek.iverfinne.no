declare module 'gif.js' {
    export interface GIFOptions {
      workers?: number;
      quality?: number;
      width?: number;
      height?: number;
      workerScript?: string;
      [key: string]: any;
    }
  
    export default class GIF {
      constructor(options: GIFOptions);
      addFrame(imageData: ImageData | HTMLCanvasElement | HTMLImageElement, options?: { delay?: number; copy?: boolean }): void;
      render(): void;
      on(event: string, callback: (blob: Blob) => void): void;
    }
  }