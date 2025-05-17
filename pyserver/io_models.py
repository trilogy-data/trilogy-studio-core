from typing import List, Optional

from trilogy.authoring import (
    DataType,
    Purpose,
    ListType,
    StructType,
)  # , NumericType, TraitDataType
from trilogy.core.models.core import NumericType, TraitDataType, MapType
from pydantic import BaseModel, Field

from trilogy import Dialects
from enum import Enum


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
    datatype: DataType | ListType | MapType | StructType | NumericType | TraitDataType
    purpose: Purpose
    description: Optional[str] = None
    lineage: List[LineageItem] = Field(default_factory=list)
    keys: List[str] = Field(default_factory=list)


class UIDatasource(BaseModel):
    name: str
    location: str
    description: Optional[str] = None
    concepts: List[UIConcept]
    grain: List[UIConcept] = Field(default_factory=list)


class ModelSource(BaseModel):
    alias: str
    concepts: List[UIConcept]
    datasources: List[UIDatasource]


class Model(BaseModel):
    name: str
    sources: list[ModelSource]


class ListModelResponse(BaseModel):
    models: List[Model]


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
    sources: List[ModelSourceInSchema]


class Import(BaseModel):
    name: str
    alias: str | None = None


class MultiQueryComponent(BaseModel):
    query: str
    extra_filters: Optional[list[str]] = None
    parameters: Optional[dict[str, str | int | float]] = None


class MultiQueryInSchema(BaseModel):
    imports: List[Import]
    full_model: ModelInSchema
    dialect: Dialects
    queries: List[MultiQueryComponent]


class QueryInSchema(BaseModel):
    imports: list[Import]
    query: str
    dialect: Dialects
    full_model: ModelInSchema
    extra_filters: Optional[list[str]] = None
    parameters: Optional[dict[str, str | int | float]] = None
    # chart_type: ChartType | None = None


class ValidateQueryInSchema(BaseModel):
    query: str
    imports: list[Import]
    sources: List[ModelSourceInSchema]
    extra_filters: Optional[list[str]] = None


class QueryOutColumn(BaseModel):
    name: str
    datatype: DataType | TraitDataType | ListType | StructType | MapType | NumericType
    purpose: Purpose
    traits: List[str] | None = None
    description: str | None = None


class QueryOut(BaseModel):
    generated_sql: str | None
    columns: List[QueryOutColumn] | None


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
    keys: List[str] | None = None


class ValidateResponse(BaseModel):
    items: List[ValidateItem]
    completion_items: list[CompletionItem]
    imports: list[Import] = Field(default_factory=list)
