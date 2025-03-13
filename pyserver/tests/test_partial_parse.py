from diagnostics import get_diagnostics
from io_models import ModelInSchema, ModelSourceInSchema


def test_get_diagnostics():
    model = ModelInSchema(
        name="test_parse",
        sources=[
            ModelSourceInSchema(
                alias="customer",
                contents="""key cuid int;
property cuid.name string;
auto customer_count <- count(cuid);
    """,
            )
        ],
    )

    diagnostics = get_diagnostics(
        """import customer as cust;
    
        syntax err

                    """,
        model.sources,
    )

    assert diagnostics.completion_items[0].label == "cust.cuid"


def test_get_diagnostics_two():
    model = ModelInSchema(
        name="test_parse",
        sources=[
            ModelSourceInSchema(
                alias="customer",
                contents="""key cuid int;
property cuid.name string;
auto customer_count <- count(cuid);
    """,
            )
        ],
    )

    diagnostics = get_diagnostics(
        """import customer as cust;
    
select err
                    """,
        model.sources,
    )

    assert diagnostics.completion_items[0].label == "cust.cuid"
