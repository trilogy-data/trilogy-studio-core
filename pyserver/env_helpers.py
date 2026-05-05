import copy
from pathlib import PurePosixPath
from typing import Iterable

from trilogy import Environment
from io_models import (
    ModelInSchema,
    Model,
    UIConcept,
    UIDatasource,
    ModelSource,
    ModelSourceInSchema,
)
from common import concept_to_description
from trilogy.parsing.exceptions import ParseError
from trilogy.core.models.environment import DictImportResolver, EnvironmentConfig
from trilogy.authoring import (
    Concept,
)
from trilogy.core.enums import ConceptSource, DatasourceState
from trilogy.core.models.datasource import Address

from common import flatten_lineage

PARSE_DEPENDENCY_RESOLUTION_ATTEMPTS = 10


def _file_basename(path_str: str) -> str:
    """Cross-platform basename: trilogy resolves file addresses against the
    server's CWD, so the location may use either separator depending on the
    server's OS. Normalize before extracting the name."""
    return PurePosixPath(path_str.replace("\\", "/")).name


def mark_known_files(env: Environment, files: Iterable[str] | None) -> None:
    """Patch file-backed datasources whose paths the client has confirmed exist.

    Trilogy's parser does ``Path(addr.location).exists()`` against the server's
    filesystem and marks a datasource ``UNPOPULATED`` (which the build phase
    skips) if the file isn't there. For the explorer / Tauri app, files live on
    the client and the server can't see them — so we explicitly tell trilogy
    which files to trust by name, rewrite the address to the basename (so the
    rendered SQL is something the client can resolve against its own
    duckdb-wasm filesystem), and reset the datasource state.

    Matching is by basename only. ``files`` may contain bare filenames or full
    paths; only the trailing component is compared.
    """
    if not files:
        return
    known = {_file_basename(f) for f in files if f}
    if not known:
        return
    for ds in env.datasources.values():
        addr = ds.address
        if not isinstance(addr, Address) or not addr.is_file:
            continue
        primary_name = _file_basename(addr.location)
        if primary_name in known:
            addr.location = primary_name
            addr.exists = True
            if ds.status == DatasourceState.UNPOPULATED:
                ds.status = DatasourceState.PUBLISHED
        if addr.additional_locations:
            addr.additional_locations = [
                _file_basename(p) if _file_basename(p) in known else p
                for p in addr.additional_locations
            ]


class StudioEnvironmentConfig(EnvironmentConfig):
    def copy_for_root(self, root: str | None) -> "StudioEnvironmentConfig":
        return copy.deepcopy(self)


def _normalize_source_path(path: str | None) -> str | None:
    if not path:
        return None
    normalized = path.replace("\\", "/").strip()
    if normalized.endswith(".preql"):
        normalized = normalized[: -len(".preql")]
    if normalized.endswith(".sql"):
        normalized = normalized[: -len(".sql")]
    if normalized.endswith(".py"):
        normalized = normalized[: -len(".py")]
    return normalized.strip("/")


def resolve_import_path(import_name: str, current_filename: str | None) -> str:
    current_path = _normalize_source_path(current_filename)
    if not current_path or import_name.startswith("std."):
        return import_name

    leading_dots = len(import_name) - len(import_name.lstrip("."))
    relative_name = import_name[leading_dots:]
    relative_parts = [part for part in relative_name.split(".") if part]

    current_parts = list(PurePosixPath(current_path).parent.parts)
    if current_parts == ["."]:
        current_parts = []

    if leading_dots > 0:
        parent_dirs = max(leading_dots - 1, 0)
        if parent_dirs >= len(current_parts):
            base_parts: list[str] = []
        else:
            base_parts = current_parts[: len(current_parts) - parent_dirs]
    else:
        base_parts = current_parts

    resolved_parts = base_parts + relative_parts
    return ".".join(part for part in resolved_parts if part)


def normalize_relative_imports(text: str, current_filename: str | None) -> str:
    if not current_filename:
        return text

    lines = []
    for raw_line in text.splitlines():
        stripped = raw_line.lstrip()
        indent = raw_line[: len(raw_line) - len(stripped)]
        if not stripped.startswith("import ") or ";" not in stripped:
            lines.append(raw_line)
            continue

        statement, suffix = stripped.split(";", 1)
        parts = statement.split()
        if len(parts) >= 2 and parts[0] == "import":
            import_name = parts[1]
            normalized_name = resolve_import_path(import_name, current_filename)
            rebuilt = " ".join(["import", normalized_name, *parts[2:]])
            lines.append(f"{indent}{rebuilt};{suffix}")
            continue

        lines.append(raw_line)

    return "\n".join(lines)


def parse_env_from_full_model(sources: list[ModelSourceInSchema]) -> Environment:
    if not sources:
        return Environment()

    resolver = DictImportResolver(
        content={
            source.alias.replace("/", "."): normalize_relative_imports(
                source.contents, source.alias
            )
            for _, source in enumerate(sources)
        }
    )
    env = Environment(config=StudioEnvironmentConfig(import_resolver=resolver))

    return env


def concept_to_ui_concept(concept: Concept) -> UIConcept:
    return UIConcept(
        name=concept.name,
        datatype=concept.datatype,
        purpose=concept.purpose,
        description=concept_to_description(concept),
        namespace=concept.namespace or "",
        address=concept.address,
        lineage=flatten_lineage(concept, depth=0),
        keys=list(concept.keys) if concept.keys else [],
    )


def source_to_model_source(
    source: ModelSourceInSchema, sources: list[ModelSourceInSchema]
) -> ModelSource:
    final_concepts: list[UIConcept] = []
    final_datasources: list[UIDatasource] = []
    env = parse_env_from_full_model(sources)
    try:
        env.parse(source.contents)
    except Exception as e:
        raise ParseError(
            f"Unable to process file '{source.alias}', parsing error: {e}"
        ) from e

    for skey, sconcept in env.concepts.items():
        # don't show private concepts
        if sconcept.name.startswith("_"):
            continue
        if "__preql_internal" in sconcept.address:
            continue
        if (
            sconcept.metadata
            and sconcept.metadata.concept_source == ConceptSource.AUTO_DERIVED
        ):
            continue
        final_concepts.append(concept_to_ui_concept(sconcept))
    final_concepts.sort(key=lambda x: x.address)

    for dkey, datasource in env.datasources.items():
        dconcepts: list[UIConcept] = []
        for cref in datasource.concepts:
            # don't show private concepts
            if cref.name.startswith("_"):
                continue

            sconcept = env.concepts[cref.address]
            dconcepts.append(concept_to_ui_concept(sconcept))
        dconcepts.sort(key=lambda x: x.address)
        if isinstance(datasource.address, Address):
            final_address = datasource.address.location
        else:
            final_address = datasource.address

        final_datasources.append(
            UIDatasource(
                name=dkey,
                location=final_address,
                concepts=dconcepts,
                grain=[
                    concept_to_ui_concept(env.concepts[x])
                    for x in datasource.grain.components
                ],
            )
        )
    return ModelSource(
        alias=source.alias, concepts=final_concepts, datasources=final_datasources
    )


def model_to_response(model: ModelInSchema) -> Model:
    return Model(
        name=model.name,
        sources=[
            source_to_model_source(source, model.sources) for source in model.sources
        ],
    )
