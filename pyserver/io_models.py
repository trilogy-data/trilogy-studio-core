from enum import Enum
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, Field
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

import server_policy as policy


def _max(limit: int) -> int | None:
    """A pydantic max_length, where a limit of 0 means unlimited."""
    return limit or None


# Request-body building blocks. The bounds and the reasons for them live in
# server_policy; these only attach them to the wire models.

#: Trilogy source the parser will see: a query, a model file.
TrilogyText = Annotated[str, AfterValidator(policy.check_nesting)]
#: One filter expression. Short by nature, and the filter path makes several
#: passes over each one per parameter.
FilterText = Annotated[
    str,
    Field(max_length=_max(policy.MAX_FILTER_CHARS)),
    AfterValidator(policy.check_nesting),
]
ExtraFilters = Annotated[
    list[FilterText], Field(max_length=_max(policy.MAX_EXTRA_FILTERS))
]
ParameterName = Annotated[str, AfterValidator(policy.check_parameter_name)]
Parameters = Annotated[
    dict[ParameterName, str | int | float],
    Field(max_length=_max(policy.MAX_PARAMETERS)),
]
ImportName = Annotated[str, AfterValidator(policy.check_import_name)]
FileNames = Annotated[list[str], Field(max_length=_max(policy.MAX_FILES))]


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
    contents: TrilogyText


ModelSources = Annotated[
    list[ModelSourceInSchema], Field(max_length=_max(policy.MAX_MODEL_SOURCES))
]


class ModelInSchema(BaseModel):
    name: str
    sources: ModelSources


class Import(BaseModel):
    # Spliced into `import <name> as <alias>;`, so held to identifier-safe
    # characters (server_policy.check_import_name).
    name: ImportName
    alias: ImportName | None = None


Imports = Annotated[list[Import], Field(max_length=_max(policy.MAX_IMPORTS))]


class MultiQueryComponent(BaseModel):
    query: TrilogyText
    label: str | None = None
    extra_filters: ExtraFilters | None = None
    parameters: Parameters | None = None


class MultiQueryInSchema(BaseModel):
    imports: Imports
    full_model: ModelInSchema
    dialect: Dialects
    queries: list[MultiQueryComponent] = Field(
        max_length=_max(policy.MAX_QUERIES_PER_BATCH)
    )
    extra_filters: ExtraFilters | None = None
    parameters: Parameters | None = None
    # Names (or paths) of files the client has registered locally. Lifted
    # into DictImportResolver.data_files so the parser treats matching
    # `file '…'` datasources as live even when the trilogy compiler runs
    # remotely and can't see the user's files on disk.
    files: FileNames | None = None
    # Optional absolute path to the user's project root (Tauri shell only).
    # Becomes Environment.working_path; file addresses resolve against it
    # so the rendered SQL points at the actual OS path the local DuckDB
    # worker can open. Studio leaves this null — the browser shell has no
    # filesystem to anchor against.
    working_path: str | None = None


class QueryInSchema(BaseModel):
    imports: Imports
    query: TrilogyText
    dialect: Dialects
    full_model: ModelInSchema
    current_filename: str | None = None
    extra_filters: ExtraFilters | None = None
    parameters: Parameters | None = None
    # See MultiQueryInSchema.files
    files: FileNames | None = None
    # See MultiQueryInSchema.working_path
    working_path: str | None = None
    # chart_type: ChartType | None = None


class DrilldownQueryInSchema(QueryInSchema):
    drilldown_remove: str
    drilldown_add: list[str] = Field(max_length=100)
    drilldown_filter: FilterText


class ValidateQueryInSchema(BaseModel):
    query: TrilogyText
    imports: Imports
    sources: ModelSources
    current_filename: str | None = None
    extra_filters: ExtraFilters | None = None
    parameters: Parameters | None = None
    # See MultiQueryInSchema.files
    files: FileNames | None = None
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


class ChartPlacementOut(BaseModel):
    """A `place hline|vline at <literal> [as <label>]` reference line."""

    kind: str
    value: str | int | float | bool | None = None
    label: str | None = None


class ChartLayerOut(BaseModel):
    """One `layer <type> (<role> <- <expr>, ...)` of a chart statement.

    Roles keep pytrilogy's names (`x_trellis`, not the studio's
    `trellisRowField`); the client owns the translation into its own
    ChartConfig so this stays a faithful projection of
    ``ProcessedChartLayer``.
    """

    chart_type: str
    generated_sql: str | None = None
    parameters: dict[str, str | int | float | list] | None = None
    x_fields: list[str] = Field(default_factory=list)
    y_fields: list[str] = Field(default_factory=list)
    color_field: str | None = None
    size_field: str | None = None
    group_field: str | None = None
    x_trellis_field: str | None = None
    y_trellis_field: str | None = None
    geo_field: str | None = None
    annotation_field: str | None = None
    # display labels for roles bound with `as`, keyed by the select output name
    field_labels: dict[str, str] = Field(default_factory=dict)
    # This layer's own output columns. Each layer is an independent select over
    # its own grain, so a client needs a column map per layer to resolve field
    # types, format hints and colour scales. `QueryOut.columns` stays the first
    # layer's, for clients that know nothing about charts.
    columns: list[QueryOutColumn] = Field(default_factory=list)


class ChartOut(BaseModel):
    layers: list[ChartLayerOut] = Field(default_factory=list)
    placements: list[ChartPlacementOut] = Field(default_factory=list)
    hide_legend: bool = False
    show_title: bool = False
    scale_x: str | None = None
    scale_y: str | None = None


class QueryOut(BaseModel):
    generated_sql: str | None
    columns: list[QueryOutColumn] | None
    generated_output: list[dict[str, Any]] | None = None
    error: str | None = None
    label: str | None = None
    select_count: int | None = None
    parameters: dict[str, str | int | float | list] | None = None
    # Present only for `chart ...` statements. `generated_sql` above is the
    # first layer's query, so a client that ignores this field still gets a
    # runnable result set.
    chart: ChartOut | None = None


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
