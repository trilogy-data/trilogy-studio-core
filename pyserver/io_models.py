from typing import List, Optional

from trilogy.authoring import (
    DataType,
    Purpose,
    ListType,
    StructType,
)  # , NumericType, TraitDataType
from trilogy.core.models.core import NumericType, TraitDataType
from trilogy.core.models.core import MapType
from pydantic import BaseModel, Field

from trilogy import Dialects
from enum import Enum

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


class Model(BaseModel):
    name: str
    concepts: List[UIConcept]
    datasources: List[UIDatasource]
    rendered: str | None = None


class ListModelResponse(BaseModel):
    models: List[Model]


class GenAIQueryInSchema(BaseModel):
    connection: str
    text: str
    genai_connection: str


class GenAIQueryOutSchema(BaseModel):
    text: str


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


class QueryInSchema(BaseModel):
    query: str
    dialect: Dialects
    full_model: ModelInSchema | None = None
    # chart_type: ChartType | None = None

class ValidateQueryInSchema(BaseModel):
    query: str

class QueryOutColumn(BaseModel):
    name: str
    datatype: DataType | TraitDataType | ListType | StructType | MapType | NumericType
    purpose: Purpose


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

class ValidateResponse(BaseModel):
    items: List[ValidateItem]