import copy
from collections.abc import Iterable
from pathlib import PurePosixPath

from trilogy import Environment
from trilogy.authoring import (
    Concept,
)
from trilogy.constants import CONFIG
from trilogy.core.enums import ConceptSource
from trilogy.core.exceptions import InvalidSyntaxException
from trilogy.core.models.datasource import Address
from trilogy.core.models.environment import DictImportResolver, EnvironmentConfig
from trilogy.parsing.exceptions import ParseError
from trilogy.parsing.parse_engine_v2 import TopLevelStatementParser, parse_syntax
from trilogy.parsing.v2.import_service import ImportEnvCacheKey

from common import concept_to_description, flatten_lineage
from io_models import (
    Model,
    ModelInSchema,
    ModelSource,
    ModelSourceInSchema,
    UIConcept,
    UIDatasource,
)

PARSE_DEPENDENCY_RESOLUTION_ATTEMPTS = 10


class StudioEnvironmentConfig(EnvironmentConfig):
    def copy_for_root(self, root: str | None) -> "StudioEnvironmentConfig":
        return copy.deepcopy(self)


def _normalize_source_path(path: str | None) -> str | None:
    if not path:
        return None
    normalized = path.replace("\\", "/").strip()
    normalized = normalized.removesuffix(".preql")
    normalized = normalized.removesuffix(".sql")
    normalized = normalized.removesuffix(".py")
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


def parse_source_into_env(
    env: Environment,
    text: str,
    environment_lookup: dict[ImportEnvCacheKey, Environment] | None = None,
    text_lookup: dict | None = None,
) -> list:
    """`parse_text(text, env)` with the hydrator's import caches supplied by the
    caller, so several parses over the same model share one hydration of each
    imported file instead of re-hydrating the whole import tree per parse."""
    parser = TopLevelStatementParser(
        environment=env, import_keys=["root"], parse_config=CONFIG.parsing
    )
    # Set directly: the constructor only adopts a lookup when it is non-empty,
    # which would leave a caller's fresh dict unshared on the first parse.
    if environment_lookup is not None:
        parser.hydrator.parsed_environments = environment_lookup
    if text_lookup is not None:
        parser.hydrator.text_lookup = text_lookup
    try:
        parsed = parser.parse(parse_syntax(text))
    except SyntaxError as e:
        raise InvalidSyntaxException(str(e)).with_traceback(e.__traceback__)
    env.concepts.fail_on_missing = True
    return parsed


def source_to_model_source(
    source: ModelSourceInSchema,
    sources: list[ModelSourceInSchema],
    environment_lookup: dict[ImportEnvCacheKey, Environment] | None = None,
    text_lookup: dict | None = None,
) -> ModelSource:
    final_concepts: list[UIConcept] = []
    final_datasources: list[UIDatasource] = []
    env = parse_env_from_full_model(sources)
    try:
        parse_source_into_env(env, source.contents, environment_lookup, text_lookup)
    except Exception as e:
        raise ParseError(
            f"Unable to process file '{source.alias}', parsing error: {e}"
        ) from e

    for sconcept in env.concepts.values():
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
    # Every source is parsed against the same model, so the imported files
    # each one pulls in are identical: hydrate each once and share. Sources
    # here are only read after parsing, so the shared child environments are
    # never mutated behind another source's back.
    environment_lookup: dict[ImportEnvCacheKey, Environment] = {}
    text_lookup: dict = {}
    return Model(
        name=model.name,
        sources=[
            source_to_model_source(
                source, model.sources, environment_lookup, text_lookup
            )
            for source in model.sources
        ],
    )
