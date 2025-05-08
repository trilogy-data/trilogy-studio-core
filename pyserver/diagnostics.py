from typing import List, Union, Any
import logging
from lark import UnexpectedToken
from trilogy.parsing.parse_engine import PARSER
from trilogy.constants import DEFAULT_NAMESPACE
from trilogy.core.statements.author import ImportStatement
from trilogy.authoring import DataType, Concept, Environment
from io_models import (
    ValidateItem,
    ValidateResponse,
    Severity,
    ModelSourceInSchema,
    CompletionItem,
    Import,
    TrilogyType,
)
from env_helpers import parse_env_from_full_model
from trilogy.parsing.parse_engine import ParseToObjects
from logging import getLogger
from common import concept_to_description, concept_to_derivation

logger = getLogger("diagnostics")


def user_repr(error: Union[UnexpectedToken]):
    if isinstance(error, UnexpectedToken):
        expected = ", ".join(error.accepts or error.expected)
        return (
            f"Unexpected token {str(error.token)!r}. Expected one of:\n{{{expected}}}"
        )
    else:
        return str(error)


def truncate_to_last_semicolon(text: str):
    last_semicolon_index = text.rfind(";")
    if last_semicolon_index + 1 == len(text):
        return truncate_to_last_semicolon(text[: last_semicolon_index - 1])
    if last_semicolon_index != -1:
        return text[: last_semicolon_index + 1]
    else:
        return text  # Return original string if no semicolon is found


def concept_to_completion(label: str, concept: Concept, environment: Environment):
    return CompletionItem(
        label=label,
        datatype=(
            concept.datatype.value
            if isinstance(concept.datatype, DataType)
            else str(concept.datatype)
        ),
        description=concept_to_description(concept),
        type="concept",
        insertText=label,
        trilogyType=TrilogyType.CONCEPT,
        trilogySubType=concept.purpose,
        calculation=concept_to_derivation(concept, environment),
    )


def get_diagnostics(
    doctext: str, sources: List[ModelSourceInSchema]
) -> ValidateResponse:
    diagnostics: List[ValidateItem] = []
    completions: List[CompletionItem] = []
    imports: list[Import] = []

    def on_error(e: UnexpectedToken) -> Any:
        diagnostics.append(
            ValidateItem(
                startLineNumber=e.line,
                startColumn=e.column,
                endLineNumber=e.line,
                endColumn=e.column + len(e.token),
                severity=Severity.Error,
                message=user_repr(e),
            )
        )
        return True

    parse_fragment = doctext
    tree = None
    loops = 0
    while parse_fragment.count(";") > 0:
        loops += 1
        try:

            tree = PARSER.parse(parse_fragment, on_error=on_error)  # type: ignore
            break
        except Exception:
            parse_fragment = truncate_to_last_semicolon(parse_fragment)
            logger.info(parse_fragment)
            diagnostics.append(
                ValidateItem(
                    startLineNumber=0,
                    startColumn=0,
                    endLineNumber=0,
                    endColumn=0,
                    severity=Severity.Error,
                    message="Parse error",
                )
            )
        if loops > 20:
            break
    if not tree:
        return ValidateResponse(items=diagnostics, completion_items=completions)
    try:
        env = parse_env_from_full_model(sources)
        seen = set()
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
            parser = ParseToObjects(environment=env)
            parser.prepare_parse()
            parser.transform(tree)
            pass_two = parser.run_second_parse_pass()
            for x in pass_two:
                logger.info(x)
                if isinstance(x, ImportStatement):
                    imports.append(Import(name=str(x.path), alias=x.alias))

        except Exception:
            logging.exception("text parse error, may have partial results")
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
        logging.exception("completion generation raised exception")
    return ValidateResponse(
        items=diagnostics, completion_items=completions, imports=imports
    )
