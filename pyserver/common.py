from trilogy.authoring import (
    Concept,
    ConceptRef,
    Function,
    WindowItem,
    FilterItem,
    AggregateWrapper,
    MultiSelectStatement,
    DEFAULT_NAMESPACE,
    Environment,
)
from trilogy.core.models.author import (
    FunctionCallWrapper,
)

from io_models import (
    LineageItem,
)
from typing import Any, List
from trilogy.parsing.render import Renderer


def flatten_array(input: Any, depth: int = 0) -> List[LineageItem]:
    arr_len = len(input)
    output = []
    for idx, val in enumerate(input):
        output += flatten_lineage(val, depth)
        if idx < arr_len - 1:
            output.append(LineageItem(token=",", depth=depth - 1))
    return output


def flatten_lineage(
    input: Any,
    depth: int = 0,
) -> List[LineageItem]:
    if depth == 0:
        chain = []
    elif isinstance(input, Function):
        chain = [
            LineageItem(token=input.operator.name, depth=depth),
            LineageItem(token="(", depth=depth),
        ]
        chain += flatten_array(input.arguments, depth + 1)
        chain += [LineageItem(token=")", depth=depth)]
    elif isinstance(input, WindowItem):
        chain = [
            LineageItem(token="rank", depth=depth),
            LineageItem(token="(", depth=depth),
        ]
        chain += flatten_lineage(input.content, depth + 1)  # type: ignore
        chain += [LineageItem(token="over", depth=depth)]
        chain += flatten_array(input.over, depth + 1)
        chain += [LineageItem(token="order by", depth=depth)]
        chain += flatten_array(input.order_by, depth + 1)
        chain += [LineageItem(token=")", depth=depth)]
    elif isinstance(input, FilterItem):
        chain = [
            LineageItem(token="filter", depth=depth),
            LineageItem(token="(", depth=depth),
        ]
        chain += flatten_lineage(input.content, depth + 1)
        chain += [LineageItem(token="by", depth=depth)]
        chain += flatten_array(input.where.concept_arguments, depth + 1)
        chain += [LineageItem(token=")", depth=depth)]
    elif isinstance(input, AggregateWrapper):
        return flatten_lineage(input.function, depth)
    elif isinstance(input, FunctionCallWrapper):
        chain = [
            LineageItem(token=input.name, depth=depth),
            LineageItem(token="(", depth=depth),
        ]
        for arg in input.args:
            chain += flatten_array(arg, depth + 1)
        chain += (LineageItem(token=")", depth=depth),)
    # elif isinstance(input, RowsetItem):
    #     chain = []
    #     chain += [LineageItem(token="(", depth=depth)]
    #     chain += [LineageItem(token=input.rowset.name, depth=depth)]
    #     chain += [LineageItem(token=")", depth=depth)]
    # elif isinstance(input, SelectStatement):
    #     chain = []
    #     chain += [LineageItem(token="(", depth=depth)]
    #     chain += [LineageItem(token="CTE", depth=depth)]
    #     chain += flatten_array(input.output_components, depth + 1)
    #     chain += [LineageItem(token=")", depth=depth)]
    # elif isinstance(input, MergeStatementV2):
    #     chain = []
    #     chain += [LineageItem(token="(", depth=depth)]
    #     chain += [LineageItem(token="MERGE", depth=depth)]
    #     chain += flatten_array(input.target, depth + 1)
    #     chain += [LineageItem(token=")", depth=depth)]
    elif isinstance(input, MultiSelectStatement):
        chain = []
        chain += [LineageItem(token="(", depth=depth)]
        chain += [LineageItem(token="MULTISELECT", depth=depth)]
        for select in input.selects:
            chain += flatten_lineage(select, depth + 1)
        chain += [LineageItem(token=")", depth=depth)]
    elif isinstance(input, ConceptRef):
        return [
            LineageItem(
                token=(
                    input.address
                    if input.namespace != DEFAULT_NAMESPACE
                    else input.name
                ),
                depth=depth,
            )
        ]
    elif not isinstance(input, Concept):
        return [LineageItem(token=str(input), depth=depth)]

    else:
        chain = [
            LineageItem(
                token=(
                    input.address
                    if input.namespace != DEFAULT_NAMESPACE
                    else input.name
                ),
                depth=depth,
            )
        ]

    # enrich block
    if isinstance(input, Concept) and input.lineage:
        if not depth == 0:
            chain += [LineageItem(token="<-", depth=depth)]
        chain += flatten_lineage(input.lineage, depth + 1)

    return chain


def concept_to_derivation(concept: Concept, environment: Environment) -> str | None:
    """Convert a concept to its derivation string."""
    if concept.lineage:
        return Renderer(environment).to_string(concept.lineage)
    return None


def concept_to_description(
    concept: Concept,
) -> str | None:
    # base = f"Derivation: {str(concept.lineage)}. " if concept.lineage else None
    base = None
    if concept.metadata and concept.metadata.description:
        base = (
            base + str(concept.metadata.description)
            if base
            else str(concept.metadata.description)
        )

    return base
