from enum import Enum
from typing import Any

from pydantic import BaseModel, Field
from trilogy import Dialects
from trilogy.authoring import (
    ArrayType,
    DataType,
    EnumType,
    MapType,
    NumericType,
    Purpose,
    StructType,
    TraitDataType,
    ValidatedType,
)  # , NumericType, TraitDataType


class TrilogyType(Enum):
    CONCEPT = "concept"
    FUNCTION = "function"
    TYPE = "type"


class LineageItem(BaseModel):
    token: str
    depth: int
    link: str | None = None


class UIConcept(BaseModel):
    address: str
    name: str
    namespace: str
    datatype: (
        DataType
        | ArrayType
        | MapType
        | StructType
        | NumericType
        | TraitDataType
        | EnumType
        | ValidatedType
    )
    purpose: Purpose
    description: str | None = None
    lineage: list[LineageItem] = Field(default_factory=list)
    keys: list[str] = Field(default_factory=list)


class UIDatasource(BaseModel):
    name: str
    location: str
    description: str | None = None
    concepts: list[UIConcept]
    grain: list[UIConcept] = Field(default_factory=list)


class ModelSource(BaseModel):
    alias: str
    concepts: list[UIConcept]
    datasources: list[UIDatasource]


class Model(BaseModel):
    name: str
    sources: list[ModelSource]


class ListModelResponse(BaseModel):
    models: list[Model]


class FormatQueryOutSchema(BaseModel):
    text: str


class InputRequest(BaseModel):
    text: str
    connection: str
    # conversation:str


class ModelSourceInSchema(BaseModel):
    alias: str
    contents: str


class ModelInSchema(BaseModel):
    name: str
    sources: list[ModelSourceInSchema]


class Import(BaseModel):
    name: str
    alias: str | None = None


class MultiQueryComponent(BaseModel):
    query: str
    label: str | None = None
    extra_filters: list[str] | None = None
    parameters: dict[str, str | int | float] | None = None


class MultiQueryInSchema(BaseModel):
    imports: list[Import]
    full_model: ModelInSchema
    dialect: Dialects
    queries: list[MultiQueryComponent]
    extra_filters: list[str] | None = None
    parameters: dict[str, str | int | float] | None = None
    # Names (or paths) of files the client has registered locally. Lifted
    # into DictImportResolver.data_files so the parser treats matching
    # `file '…'` datasources as live even when the trilogy compiler runs
    # remotely and can't see the user's files on disk.
    files: list[str] | None = None
    # Optional absolute path to the user's project root (Tauri shell only).
    # Becomes Environment.working_path; file addresses resolve against it
    # so the rendered SQL points at the actual OS path the local DuckDB
    # worker can open. Studio leaves this null — the browser shell has no
    # filesystem to anchor against.
    working_path: str | None = None


class QueryInSchema(BaseModel):
    imports: list[Import]
    query: str
    dialect: Dialects
    full_model: ModelInSchema
    current_filename: str | None = None
    extra_filters: list[str] | None = None
    parameters: dict[str, str | int | float] | None = None
    # See MultiQueryInSchema.files
    files: list[str] | None = None
    # See MultiQueryInSchema.working_path
    working_path: str | None = None
    # chart_type: ChartType | None = None


class DrilldownQueryInSchema(QueryInSchema):
    drilldown_remove: str
    drilldown_add: list[str]
    drilldown_filter: str


class ValidateQueryInSchema(BaseModel):
    query: str
    imports: list[Import]
    sources: list[ModelSourceInSchema]
    current_filename: str | None = None
    extra_filters: list[str] | None = None
    parameters: dict[str, str | int | float] | None = None
    # See MultiQueryInSchema.files
    files: list[str] | None = None
    # See MultiQueryInSchema.working_path
    working_path: str | None = None


class QueryOutColumn(BaseModel):
    name: str
    datatype: (
        DataType
        | TraitDataType
        | ArrayType
        | StructType
        | MapType
        | NumericType
        | EnumType
        | ValidatedType
    )
    purpose: Purpose
    traits: list[str] | None = None
    description: str | None = None
    keys: list[str] | None = None


class QueryOut(BaseModel):
    generated_sql: str | None
    columns: list[QueryOutColumn] | None
    generated_output: list[dict[str, Any]] | None = None
    error: str | None = None
    label: str | None = None
    select_count: int | None = None
    parameters: dict[str, str | int | float | list] | None = None


class MultiQueryOutSchema(BaseModel):
    queries: list[QueryOut] = Field(default_factory=list)


class Severity(Enum):
    Error = 8
    Warning = 4
    Information = 2
    Hint = 1


class ValidateItem(BaseModel):
    startLineNumber: int
    startColumn: int
    endLineNumber: int
    endColumn: int
    message: str
    severity: Severity


class CompletionItem(BaseModel):
    label: str
    type: str
    datatype: str
    insertText: str
    trilogyType: TrilogyType | None = None
    trilogySubType: Purpose | str | None = None
    description: str | None = None
    calculation: str | None = None
    keys: list[str] | None = None


class ValidateResponse(BaseModel):
    items: list[ValidateItem]
    completion_items: list[CompletionItem]
    imports: list[Import] = Field(default_factory=list)
