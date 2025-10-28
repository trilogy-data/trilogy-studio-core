export type FieldType = 'nominal' | 'temporal' | 'ordinal' | 'quantitative';
 
 export interface FieldEncodingOutput {
  /** The field name to encode (required when fieldName is provided) */
  field?: string;
  
  /** The Vega-Lite field type */
  type?: FieldType;

  /** Human-readable title for the field (derived from description or field name) */
  title?: string;
  
  /** Format hint for displaying values (e.g., date formats, number formats) */
  format?: string;
  
  /** Format type for parsing values */
  formatType?: string;
  
  /** Sorting configuration for the field */
  sort?: 
    | string[] // Explicit sort order (e.g., days of week)
    | { 
        field: string; 
        order: 'ascending' | 'descending' 
      } // Sort by field value
    | {
        field?: string;
        order?: 'ascending' | 'descending';
      };
  
  /** Scale configuration for the encoding */
  scale?: {
    /** Scale type (e.g., 'linear', 'log', 'sqrt') */
    type?: string;
    
    /** Whether to include zero in the scale domain */
    zero?: boolean;
    
    /** Other scale properties */
    [key: string]: any;
  };
  
  /** Axis configuration properties */
  axis?: {
    /** Axis title */
    title?: string;
    
    /** Axis labels configuration */
    labels?: boolean;
    
    /** Tick configuration */
    ticks?: boolean;
    
    /** Grid lines configuration */
    grid?: boolean;
    
    /** Other axis properties */
    [key: string]: any;
  };
  
  /** Legend configuration properties */
  legend?: {
    /** Legend orientation */
    orient?: 'left' | 'right' | 'top' | 'bottom';
    
    /** Legend title orientation */
    titleOrient?: 'left' | 'right' | 'top' | 'bottom' | 'center';
    
    /** Legend direction */
    direction?: 'horizontal' | 'vertical';
    
    /** Legend title font size */
    titleFontSize?: number;
    
    /** Number of ticks in legend */
    tickCount?: number;
    
    /** Specific values to show in legend */
    values?: any[];
    
    /** Format for legend values */
    format?: string;
    
    /** Format type for legend values */
    formatType?: string;
    
    /** Other legend properties */
    [key: string]: any;
  } | null; // null when legend is explicitly hidden
  
  /** 
   * Additional properties that may be merged from axisOptions parameter
   * This allows for any additional Vega-Lite encoding properties
   */
  [key: string]: any;
}

