import type  {ConnectionInterface } from "./connection";
import { Results } from "./results";
import type {ResultsInterface} from "./results";
import {ref} from 'vue';
export interface EditorInterface {
  name: string;
  type: string;
  syntax: string;
  connection: string;
  results: ResultsInterface;
  contents: string;
  loading: boolean;
  error: ref<string | null>;
  status_code: number;
  executed: boolean;
  duration: number | null;
  generated_sql: string | null;
  visible: boolean;
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
  error: ref<string | null>;
  status_code: number;
  executed: boolean;
  duration: number | null;
  generated_sql: string | null;
  visible: boolean;
  // monaco: editor.IStandaloneCodeEditor | null;

  constructor({ name, type, connection, contents = null }: { name: string; type: string; connection: string; contents?: string | null }) {
    this.name = name;
    this.type = type;
    this.syntax = "preql";
    this.connection = connection;
    this.results = new Results([], new Map());
    this.contents = contents ? contents : "SELECT 1 -> echo;";
    this.loading = false;
    this.error = ref(null);
    this.executed = false;
    this.duration = null;
    // this.monaco = null;
    this.status_code = 200;
    this.generated_sql = null;
    this.visible = true;
  }

  setError(error: string| null) {
    this.error.value = error;
  }


  static fromJSON(json: string | Partial<Editor>): Editor {
    const parsed: Partial<Editor> = typeof json === "string" ? JSON.parse(json) : json;

    // Initialize a new Editor instance
    const editor = new Editor({
      name: parsed.name || "",
      type: parsed.type || "unknown",
      connection: parsed.connection || "",
      contents: parsed.contents || null,
    });

    // Hydrate additional properties
    editor.syntax = parsed.syntax || "preql";
    editor.results = parsed.results ? Results.fromJSON(parsed.results) : new Results(new Map(), []);
    editor.loading = parsed.loading || false;
    editor.error.value = parsed.error || null;
    editor.status_code = parsed.status_code || 200;
    editor.executed = parsed.executed || false;
    editor.duration = parsed.duration || null;
    editor.generated_sql = parsed.generated_sql || null;
    editor.visible = parsed.visible !== undefined ? parsed.visible : true;

    return editor
  }
}
