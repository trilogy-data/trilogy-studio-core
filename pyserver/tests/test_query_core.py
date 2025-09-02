from query_helpers import generate_query_core
from io_models import QueryInSchema
from trilogy import Dialects

def test_show_statement():
    query = QueryInSchema(

    )
    target, columns, results = generate_query_core(query, Dialects.DUCK_DB,)