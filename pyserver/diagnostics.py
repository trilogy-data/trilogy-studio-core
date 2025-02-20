from typing import List, Union, Tuple, Any
import logging
from lark import UnexpectedToken, ParseTree
from trilogy.parsing.parse_engine import PARSER
from io_models import ValidateItem, ValidateResponse, Severity



def user_repr(error: Union[UnexpectedToken]):
    if isinstance(error, UnexpectedToken):
        expected = ", ".join(error.accepts or error.expected)
        return (
            f"Unexpected token {str(error.token)!r}. Expected one of:\n{{{expected}}}"
        )
    else:
        return str(error)


def get_diagnostics(doctext: str) -> ValidateResponse:
    diagnostics: List[ValidateItem] = []

    def on_error(e: UnexpectedToken) -> Any:
        diagnostics.append(
            ValidateItem(
                startLineNumber=e.line,
                startColumn=e.column,
                endLineNumber=e.line,
                endColumn=e.column+len(e.token),
                severity=Severity.Error,
                message=user_repr(e),
            )
        )
        return True

    try:
        PARSER.parse(doctext, on_error=on_error)  # type: ignore
    except Exception:
        logging.exception("parser raised exception")
    return ValidateResponse(items=diagnostics)