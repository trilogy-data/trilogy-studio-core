from typing import List, Union, Any
import logging
from lark import UnexpectedToken
from trilogy.parsing.parse_engine import PARSER
from io_models import (
    ValidateItem,
    ValidateResponse,
    Severity,
    ModelSourceInSchema,
    CompletionItem,
)
from env_helpers import parse_env_from_full_model
from trilogy.parsing.parse_engine import ParseToObjects


def user_repr(error: Union[UnexpectedToken]):
    if isinstance(error, UnexpectedToken):
        expected = ", ".join(error.accepts or error.expected)
        return (
            f"Unexpected token {str(error.token)!r}. Expected one of:\n{{{expected}}}"
        )
    else:
        return str(error)


def truncate_to_last_semicolon(text):
    last_semicolon_index = text.rfind(";")

    if last_semicolon_index != -1:
        return text[: last_semicolon_index + 1]
    else:
        return text  # Return original string if no semicolon is found


def get_diagnostics(
    doctext: str, sources: List[ModelSourceInSchema]
) -> ValidateResponse:
    diagnostics: List[ValidateItem] = []
    completions: List[CompletionItem] = []

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

    try:
        tree = PARSER.parse(doctext, on_error=on_error)  # type: ignore
    except Exception:
        try:
            tree = PARSER.parse(truncate_to_last_semicolon(doctext), on_error=on_error)  # type: ignore
        except Exception:
            logging.exception("parse error")
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
            return ValidateResponse(items=diagnostics, completion_items=completions)
    try:
        env = parse_env_from_full_model(sources)
        seen = set()
        for k, v in env.concepts.items():
            if v.name.startswith("_") or v.namespace.startswith("_"):
                continue
            completions.append(
                CompletionItem(
                    label=k,
                    datatype=str(v.datatype),
                    description=v.metadata.description,
                    type="concept",
                    insertText=k,
                )
            )
            seen.add(k)
        try:
            # get a partial parse tree
            ParseToObjects(environment=env).transform(tree)
        except Exception:
            logging.exception("text parse error, may have partial results")
        for k, v in env.concepts.items():
            if v.name.startswith("_") or v.namespace.startswith("_"):
                continue
            if k not in seen:
                completions.append(
                    CompletionItem(
                        label=k,
                        datatype=str(v.datatype),
                        description=v.metadata.description,
                        type="concept",
                        insertText=k,
                    )
                )

    except Exception:
        logging.exception("completion generation raised exception")
    return ValidateResponse(items=diagnostics, completion_items=completions)
