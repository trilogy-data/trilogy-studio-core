from diagnostics import get_diagnostics
from io_models import ModelInSchema, ModelSourceInSchema, ValidateQueryInSchema


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


INPUT = {
    "query": "import crime;\r\n\r\n\r\n\r\n# Select the ward and count of cases where the primary_type indicates a violent crime.  \r\n# Filter for violent crimes based on known types.  \r\nselect local.ward, count_distinct(local.case_number) as violent_crime_count  \r\nwhere local.primary_type in (\"HOMICIDE\"::string, \"ASSAULT\"::string, \"ROBBERY\"::string, \"AGGRAVATED ASSAULT\"::string)  \r\nhaving violent_crime_count > 0  \r\n\r\n\r\n# give me a summary query for violent crime in chicago?\r\n  \r\n# This query summarizes the count of violent crime incidents in Chicago.  \r\n# We will filter by known violent crime types.  \r\n# Replace \"VIOLENT_CRIME_TYPES\" with the actual types of violent crimes if needed.  \r\n\r\n\r\n\r\n\r\nselect  \r\n  local.primary_type,  \r\n  count_distinct(local.unique_key) as local.unique_key.count  \r\nwhere  \r\n  local.primary_type in ('HOMICIDE', 'ASSAULT', 'ROBBERY', 'BATTERY', 'SEX OFFENSE')  \r\nhaving  \r\n  local.unique_key.count > 0  \r\n\r\n  # give me a ummary of violent crime over time in chicago?\r\n\r\n# Summarizing violent crime over time in Chicago\r\n\r\n# Select the year and count of unique case numbers that represent violent crimes\r\n# Here, we will assume that the definition of violent crimes is determined by the primary_type or arrest status.\r\n\r\nselect local.date.year as year,\r\n       count_distinct(local.case_number) as violent_crime_count\r\n\r\n# Filter the results to include only violent crimes\r\nwhere local.primary_type::string in ('HOMICIDE', 'ASSAULT', 'ROBBERY', 'BATTERY', 'SEX OFFENSE');\r\n\r\n# No GROUP BY clause is needed\r\n# The HAVING clause is not applicable here since we are not filtering on aggregates\r\n\r\n",
    "sources": [
        {
            "alias": "crime",
            "contents": "key unique_key int;\nproperty unique_key.case_number string;\nproperty unique_key.date timestamp;\nproperty unique_key.block string;\nproperty unique_key.iucr string;\nproperty unique_key.primary_type string;\nproperty unique_key.description string;\nproperty unique_key.location_description string;\nproperty unique_key.arrest bool;\nproperty unique_key.domestic bool;\nproperty unique_key.beat int;\nproperty unique_key.district int;\nproperty unique_key.ward int;\nproperty unique_key.community_area int;\nproperty unique_key.fbi_code string;\nproperty unique_key.x_coordinate float;\nproperty unique_key.y_coordinate float;\nproperty unique_key.year int;\nproperty unique_key.updated_on timestamp;\nproperty unique_key.latitude float;\nproperty unique_key.longitude float;\nproperty unique_key.location string;\n\ndatasource crime (\n    unique_key:unique_key,\n\tcase_number:case_number,\n\tdate:date,\n\tblock:block,\n\tiucr:iucr,\n\tprimary_type:primary_type,\n\tdescription:description,\n\tlocation_description:location_description,\n\tarrest:arrest,\n\tdomestic:domestic,\n\tbeat:beat,\n\tdistrict:district,\n\tward:ward,\n\tcommunity_area:community_area,\n\tfbi_code:fbi_code,\n\tx_coordinate:x_coordinate,\n\ty_coordinate:y_coordinate,\n\tyear:year,\n\tupdated_on:updated_on,\n\tlatitude:latitude,\n\tlongitude:longitude,\n\tlocation:location\n    ) \ngrain (unique_key) \naddress `bigquery-public-data.chicago_crime.crime`;",
        }
    ],
    "imports": [],
}


def test_partial_parse_three():
    model = ValidateQueryInSchema.model_validate(INPUT)

    diagnostics = get_diagnostics(model.query, model.sources)
    assert len(diagnostics.imports) == 1


BAD_INPUT = {
    "query": "import;\r\n\r\n\r\n\r\n# Select the ward and count of cases where the primary_type indicates a violent crime.  \r\n# Filter for violent crimes based on known types.  \r\nselect local.ward, count_distinct(local.case_number) as violent_crime_count  \r\nwhere local.primary_type in (\"HOMICIDE\"::string, \"ASSAULT\"::string, \"ROBBERY\"::string, \"AGGRAVATED ASSAULT\"::string)  \r\nhaving violent_crime_count > 0  \r\n\r\n\r\n# give me a summary query for violent crime in chicago?\r\n  \r\n# This query summarizes the count of violent crime incidents in Chicago.  \r\n# We will filter by known violent crime types.  \r\n# Replace \"VIOLENT_CRIME_TYPES\" with the actual types of violent crimes if needed.  \r\n\r\n\r\n\r\n\r\nselect  \r\n  local.primary_type,  \r\n  count_distinct(local.unique_key) as local.unique_key.count  \r\nwhere  \r\n  local.primary_type in ('HOMICIDE', 'ASSAULT', 'ROBBERY', 'BATTERY', 'SEX OFFENSE')  \r\nhaving  \r\n  local.unique_key.count > 0  \r\n\r\n  # give me a ummary of violent crime over time in chicago?\r\n\r\n# Summarizing violent crime over time in Chicago\r\n\r\n# Select the year and count of unique case numbers that represent violent crimes\r\n# Here, we will assume that the definition of violent crimes is determined by the primary_type or arrest status.\r\n\r\nselect local.date.year as year,\r\n       count_distinct(local.case_number) as violent_crime_count\r\n\r\n# Filter the results to include only violent crimes\r\nwhere local.primary_type::string in ('HOMICIDE', 'ASSAULT', 'ROBBERY', 'BATTERY', 'SEX OFFENSE');\r\n\r\n# No GROUP BY clause is needed\r\n# The HAVING clause is not applicable here since we are not filtering on aggregates\r\n\r\n",
    "sources": [
        {
            "alias": "crime",
            "contents": "key unique_key int;\nproperty unique_key.case_number string;\nproperty unique_key.date timestamp;\nproperty unique_key.block string;\nproperty unique_key.iucr string;\nproperty unique_key.primary_type string;\nproperty unique_key.description string;\nproperty unique_key.location_description string;\nproperty unique_key.arrest bool;\nproperty unique_key.domestic bool;\nproperty unique_key.beat int;\nproperty unique_key.district int;\nproperty unique_key.ward int;\nproperty unique_key.community_area int;\nproperty unique_key.fbi_code string;\nproperty unique_key.x_coordinate float;\nproperty unique_key.y_coordinate float;\nproperty unique_key.year int;\nproperty unique_key.updated_on timestamp;\nproperty unique_key.latitude float;\nproperty unique_key.longitude float;\nproperty unique_key.location string;\n\ndatasource crime (\n    unique_key:unique_key,\n\tcase_number:case_number,\n\tdate:date,\n\tblock:block,\n\tiucr:iucr,\n\tprimary_type:primary_type,\n\tdescription:description,\n\tlocation_description:location_description,\n\tarrest:arrest,\n\tdomestic:domestic,\n\tbeat:beat,\n\tdistrict:district,\n\tward:ward,\n\tcommunity_area:community_area,\n\tfbi_code:fbi_code,\n\tx_coordinate:x_coordinate,\n\ty_coordinate:y_coordinate,\n\tyear:year,\n\tupdated_on:updated_on,\n\tlatitude:latitude,\n\tlongitude:longitude,\n\tlocation:location\n    ) \ngrain (unique_key) \naddress `bigquery-public-data.chicago_crime.crime`;",
        }
    ],
    "imports": [],
}


def test_partial_parse_broken():
    model = ValidateQueryInSchema.model_validate(BAD_INPUT)

    diagnostics = get_diagnostics(model.query, model.sources)
    assert len(diagnostics.imports) == 0
