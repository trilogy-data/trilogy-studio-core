
import { Results } from "./results";
import type { ResultsInterface } from "./results";

// enum of tags
export enum EditorTag {
  SOURCE = "source",
}

export interface EditorInterface {
  name: string;
  type: string;
  syntax: string;
  connection: string;
  results: ResultsInterface;
  contents: string;
  loading: boolean;
  error: string | null;
  status_code: number;
  executed: boolean;
  duration: number | null;
  generated_sql: string | null;
  visible: boolean;
  storage: string;
  tags: EditorTag[];
  cancelCallback:  (() => void) | null;
  // monaco: editor.IStandaloneCodeEditor | null;
}

export default class Editor implements EditorInterface {
  name: string;
  type: string;
  syntax: string;
  connection: string;
  results: Results;
  contents: string;
  loading: boolean;
  error: string | null;
  status_code: number;
  executed: boolean;
  duration: number | null;
  generated_sql: string | null;
  visible: boolean;
  storage: string;
  tags: EditorTag[];
  cancelCallback:  (() => void) | null;
  // monaco: editor.IStandaloneCodeEditor | null;

  defaultContents(type: string) {
    switch (type) {
      case "sql":
        return `SELECT 1;`;
      case "preql":
        return `SELECT 1 -> echo;`;
      default:
        return `SELECT 1;`;
    }
  }
  constructor({ name, type, connection, storage, contents = null, tags = null }: { name: string; type: string; connection: string; storage: string, contents?: string | null, tags?: EditorTag[] | null }) {
    this.name = name;
    this.type = type;
    this.syntax = "preql";
    this.connection = connection;
    this.results = new Results(new Map(), []);
    this.contents = contents ? contents : this.defaultContents(type);
    this.loading = false;
    this.error = null;
    this.executed = false;
    this.duration = null;
    // this.monaco = null;
    this.status_code = 200;
    this.generated_sql = null;
    this.visible = true;
    this.storage = storage;
    this.tags = tags ? tags : [];
    this.cancelCallback = null;
  }

  setError(error: string | null) {
    this.error = error;
  }

  toJSON(): object {
    return {
      name: this.name,
      type: this.type,
      syntax: this.syntax,
      connection: this.connection,
      results: this.results.toJSON(), // Serialize the Results instance
      contents: this.contents,
      loading: this.loading,
      error: this.error,
      status_code: this.status_code,
      executed: this.executed,
      duration: this.duration,
      generated_sql: this.generated_sql,
      visible: this.visible,
      storage: this.storage,
      tags: this.tags
    };
  }

  static fromJSON(json: string | Partial<Editor>): Editor {
    const parsed: Partial<Editor> = typeof json === "string" ? JSON.parse(json) : json;

    // Initialize a new Editor instance
    const editor = new Editor({
      name: parsed.name || "",
      type: parsed.type || "unknown",
      connection: parsed.connection || "",
      storage: parsed.storage || "local",
      contents: parsed.contents || null,
    });

    // Hydrate additional properties
    editor.syntax = parsed.syntax || "preql";
    editor.results = parsed.results ? Results.fromJSON(parsed.results) : new Results(new Map(), []);
    editor.loading = parsed.loading || false;
    editor.error = parsed.error || null;
    editor.status_code = parsed.status_code || 200;
    editor.executed = parsed.executed || false;
    editor.duration = parsed.duration || null;
    editor.generated_sql = parsed.generated_sql || null;
    editor.visible = parsed.visible !== undefined ? parsed.visible : true;
    // rehydrate tags to EditorTag
    console.log(parsed.tags)
    editor.tags = parsed.tags ? parsed.tags.map((tag: string) => {
      return Object.values(EditorTag).includes(tag as EditorTag) ? tag as EditorTag : null;
    }).filter((tag): tag is EditorTag => tag !== null) : [];
    

    return editor
  }
}
