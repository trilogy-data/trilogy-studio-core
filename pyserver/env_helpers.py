import copy
import os
from pathlib import PurePosixPath
from typing import Iterable

import trilogy
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
from trilogy.core.models.environment import (
    DictImportResolver,
    EnvironmentConfig,
    FileSystemImportResolver,
)
from trilogy.authoring import (
    Concept,
)
from trilogy.core.enums import ConceptSource
from trilogy.core.models.datasource import Address

from common import flatten_lineage

PARSE_DEPENDENCY_RESOLUTION_ATTEMPTS = 10

# Absolute path to trilogy's bundled standard library (``trilogy/std``),
# normalized with forward slashes for cross-platform prefix comparison.
_STDLIB_DIR = (
    os.path.join(os.path.dirname(trilogy.__file__), "std")
    .replace("\\", "/")
    .rstrip("/")
)


def _is_stdlib_root(root: str | None) -> bool:
    """True when ``root`` points inside trilogy's bundled std library.

    When a stdlib file (e.g. ``std/money.preql``) imports a sibling stdlib
    file with a bare relative name (``import currency;``), the parser does
    not flag that nested import as stdlib, so it falls through to whatever
    import resolver the environment config carries. Studio configs carry a
    ``DictImportResolver`` (which only knows client-provided sources), so
    the nested stdlib import fails. Detecting the stdlib root lets us hand
    those child parses a filesystem resolver instead.
    """
    if not root:
        return False
    normalized = os.path.normpath(str(root)).replace("\\", "/")
    return normalized == _STDLIB_DIR or normalized.startswith(_STDLIB_DIR + "/")


class StudioEnvironmentConfig(EnvironmentConfig):
    def copy_for_root(self, root: str | None) -> "StudioEnvironmentConfig":
        new = copy.deepcopy(self)
        # Nested imports inside trilogy's standard library resolve from disk,
        # not from the client-provided DictImportResolver. Swap in a
        # filesystem resolver for std child parses so relative stdlib imports
        # (e.g. money.preql's `import currency;`) resolve correctly.
        if _is_stdlib_root(root) and isinstance(
            new.import_resolver, DictImportResolver
        ):
            new.import_resolver = FileSystemImportResolver()
        return new


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


def parse_env_from_full_model(
    sources: list[ModelSourceInSchema],
    files: Iterable[str] | None = None,
    working_path: str | None = None,
) -> Environment:
    env_kwargs: dict = {}
    if working_path:
        env_kwargs["working_path"] = working_path

    # Register client-known file basenames in the resolver so the trilogy parser
    # treats `file '…'` datasources as published (skipping its filesystem
    # existence check) and preserves the literal address — rendered SQL points
    # at what the client registered (e.g. duckdb-wasm), not a server CWD path.
    data_files = {f: b"" for f in files if f} if files else {}

    content = {
        source.alias.replace("/", "."): normalize_relative_imports(
            source.contents, source.alias
        )
        for source in sources
    }
    resolver = DictImportResolver(content=content, data_files=data_files)
    return Environment(
        config=StudioEnvironmentConfig(import_resolver=resolver), **env_kwargs
    )


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
