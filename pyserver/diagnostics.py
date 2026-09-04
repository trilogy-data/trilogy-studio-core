import re
from logging import getLogger
from typing import Any

from trilogy.authoring import (
    ArrayType,
    Concept,
    DataType,
    Environment,
    MapType,
    StructType,
)
from trilogy.constants import DEFAULT_NAMESPACE
from trilogy.core.models.core import NumericType, TraitDataType
from trilogy.core.statements.author import ImportStatement
from trilogy.parsing.parse_engine_v2 import TopLevelStatementParser, parse_syntax

from common import concept_to_derivation, concept_to_description
from env_helpers import (
    normalize_relative_imports,
    parse_env_from_full_model,
)
from io_models import (
    CompletionItem,
    Import,
    ModelSourceInSchema,
    Severity,
    TrilogyType,
    ValidateItem,
    ValidateResponse,
)

logger = getLogger("diagnostics")

# pest reports the failure point as ` --> line:col` in its raw error text.
_PEST_POS_RE = re.compile(r"-->\s*(\d+):(\d+)")


def address_to_display(address: str) -> str:
    if address.startswith(DEFAULT_NAMESPACE):
        return address.split(".", 1)[1]
    else:
        return address


def user_repr(error: Exception) -> str:
    # pytrilogy's syntax errors append a "Location:" excerpt of the source;
    # the editor already points at the position, so keep only the message.
    return str(error).split("\nLocation:", 1)[0]


def truncate_to_last_semicolon(text: str) -> str:
    last_semicolon_index = text.rfind(";")
    if last_semicolon_index + 1 == len(text):
        return truncate_to_last_semicolon(text[: last_semicolon_index - 1])
    if last_semicolon_index != -1:
        return text[: last_semicolon_index + 1]
    else:
        return text  # Return original string if no semicolon is found


def syntax_error_position(text: str) -> tuple[int, int]:
    """1-based (line, column) at which the Rust parser rejects `text`, or
    (0, 0) if it cannot say.

    `parse_syntax` raises an InvalidSyntaxException that carries only a
    message, so this re-runs the raw pest parse (sub-millisecond, error path
    only) to recover the position from its ` --> line:col` marker."""
    try:
        from _preql_import_resolver import (  # type: ignore[import-untyped]
            parse_trilogy_syntax_tuple,
        )
    except ImportError:
        return 0, 0
    try:
        parse_trilogy_syntax_tuple(text)
    except ValueError as exc:
        match = _PEST_POS_RE.search(str(exc))
        if match:
            return int(match.group(1)), int(match.group(2))
    except Exception:  # position is best-effort
        logger.debug("could not recover syntax error position", exc_info=True)
    return 0, 0


def datatype_to_display(
    datatype: (
        DataType | TraitDataType | NumericType | ArrayType | MapType | StructType | Any
    ),
) -> str:
    if isinstance(datatype, TraitDataType):
        traits = "::".join(datatype.traits)
        return f"{datatype_to_display(datatype.type)}[{traits}]"
    elif isinstance(datatype, DataType):
        return datatype.value
    elif isinstance(datatype, NumericType):
        return f"{datatype.value}({datatype.precision},{datatype.scale})"
    elif isinstance(datatype, ArrayType):
        return f"Array<{datatype_to_display(datatype.type)}>"
    elif isinstance(datatype, MapType):
        return f"Map<{datatype_to_display(datatype.key_type)}, {datatype_to_display(datatype.value_type)}>"
    elif isinstance(datatype, StructType):
        return f"Struct<{', '.join([f'{k}: {datatype_to_display(v)}' for k, v in datatype.fields_map.items()])}>"
    else:
        return str(datatype)


def concept_to_completion(label: str, concept: Concept, environment: Environment):
    return CompletionItem(
        label=label,
        datatype=datatype_to_display(concept.datatype),
        description=concept_to_description(concept),
        type="concept",
        insertText=label,
        trilogyType=TrilogyType.CONCEPT,
        trilogySubType=concept.purpose,
        calculation=concept_to_derivation(concept, environment),
        keys=[address_to_display(x) for x in concept.keys] if concept.keys else None,
    )


def get_diagnostics(
    doctext: str,
    sources: list[ModelSourceInSchema],
    current_filename: str | None = None,
    files: list[str] | None = None,
    working_path: str | None = None,
    env: Environment | None = None,
    include_completions: bool = True,
) -> ValidateResponse:
    """Syntax diagnostics, import list and completions for an editor buffer.

    `env` lets a caller validating several fragments against one model build
    the environment once; it is parsed INTO, so pass a duplicate if it must
    stay clean. `include_completions=False` skips the per-concept completion
    projection, which is most of the cost when only the diagnostics are read.
    """
    diagnostics: list[ValidateItem] = []
    completions: list[CompletionItem] = []
    imports: list[Import] = []

    parse_fragment = normalize_relative_imports(doctext, current_filename)
    document = None
    loops = 0
    # The parser has no error recovery, so a broken statement fails the whole
    # buffer. Report the first failure at its position, then retry on
    # progressively shorter prefixes (cut at statement boundaries) so imports
    # and declarations ahead of the error still feed completions.
    while parse_fragment.count(";") > 0:
        loops += 1
        try:
            document = parse_syntax(parse_fragment)
            break
        except Exception as exc:  # noqa: BLE001 -- retry on shorter input
            if not diagnostics:
                line, column = syntax_error_position(parse_fragment)
                diagnostics.append(
                    ValidateItem(
                        startLineNumber=line,
                        startColumn=column,
                        endLineNumber=line,
                        endColumn=column + 1,
                        severity=Severity.Error,
                        message=user_repr(exc),
                    )
                )
            parse_fragment = truncate_to_last_semicolon(parse_fragment)
        if loops > 20:
            break
    if not document:
        return ValidateResponse(items=diagnostics, completion_items=completions)
    try:
        if env is None:
            env = parse_env_from_full_model(
                sources, files=files, working_path=working_path
            )
        seen: set[str] = set()
        if include_completions:
            for k, v in env.concepts.items():
                if v.name.startswith("_") or v.namespace.startswith("_"):
                    continue
                if v.namespace == DEFAULT_NAMESPACE:
                    label = v.name
                else:
                    label = k
                completions.append(concept_to_completion(label, v, env))
                seen.add(k)
        try:
            # get a partial parse tree
            parser = TopLevelStatementParser(environment=env)
            pass_two = parser.parse(document)
            for x in pass_two:
                logger.info(x)
                if isinstance(x, ImportStatement):
                    imports.append(Import(name=str(x.path), alias=x.alias))

        except Exception:
            logger.exception("text parse error, may have partial results")
        if include_completions:
            for k, v in env.concepts.items():
                if v.name.startswith("_") or v.namespace.startswith("_"):
                    continue
                if v.namespace == DEFAULT_NAMESPACE:
                    label = v.name
                else:
                    label = k
                if k not in seen:
                    completions.append(concept_to_completion(label, v, env))

    except Exception:
        logger.exception("completion generation raised exception")
    return ValidateResponse(
        items=diagnostics, completion_items=completions, imports=imports
    )
