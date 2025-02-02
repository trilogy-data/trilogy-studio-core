declare module 'split.js' {
    function Split(elements: HTMLElement[], options?: SplitOptions): SplitInstance;
  
    interface SplitOptions {
      sizes?: number[];
      minSize?: number | number[];
      maxSize?: number | number[];
      // Add other options as needed
    }
  
    interface SplitInstance {
      // Add methods and properties of the Split instance as needed
      destroy(): void;
    }
  }