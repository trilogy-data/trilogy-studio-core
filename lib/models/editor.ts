import type  {ConnectionInterface } from "./connection";
import { Results } from "./results";
import type {ResultsInterface} from "./results";

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
  // monaco: editor.IStandaloneCodeEditor | null;
}

export interface EditorEnrichedInterface {
  name: string;
  type: string;
  connection: ConnectionInterface;
  results: ResultsInterface;
  contents: string;
  loading: boolean;
  error: string | null;
  executed: boolean;
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
  // monaco: editor.IStandaloneCodeEditor | null;

  constructor({ name, type, connection, contents = null }: { name: string; type: string; connection: string; contents?: string | null }) {
    this.name = name;
    this.type = type;
    this.syntax = "preql";
    this.connection = connection;
    this.results = new Results([], new Map());
    this.contents = contents ? contents : "SELECT 1 -> echo;";
    this.loading = false;
    this.error = null;
    this.executed = false;
    this.duration = null;
    // this.monaco = null;
    this.status_code = 200;
    this.generated_sql = null;
    this.visible = true;
  }


}
