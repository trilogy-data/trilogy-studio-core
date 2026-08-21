from trilogy.dialect.duckdb import DuckDBDialect

from io_models import QueryInSchema
from query_helpers import generate_query_core, query_to_output


def test_show_statement():
    query = QueryInSchema.model_validate(
        {
            "imports": [{"name": "game_event", "alias": None}],
            "query": "show SELECT type,\r\n       sub_type,\r\n       count(id) AS event_count;\r\n",
            "dialect": "bigquery",
            "full_model": {
                "name": "",
                "sources": [
                    {
                        "alias": "game",
                        "contents": "import team as home_team;\r\nimport team as away_team;\r\n\r\nkey id string; # [Game data] Unique identifier for the game\r\nproperty id.season int; # [Game data] Season the game was played in\r\nproperty id.neutral_site bool; # [Game data] Indicator of whether the game was played on a neutral court\r\nproperty id.scheduled_date date; # [Game data] Date the game was played\r\nproperty id.gametime timestamp; # [Game data] Date and time the game was played\r\nproperty id.conference_game bool; # [Game data] Indicator of whether the two teams were in the same conference at the time the game was played\r\nproperty id.tournament string; # [Game data] Whether the game was played in a post-season tournament\r\nproperty id.tournament_type string; # [Game data] Type of post-season tournament a game was in played\r\nproperty id.tournament_round string; # [Game data] Tournament round\r\nproperty id.tournament_game_no string; # [Game data] Tournament game number\r\nproperty id.attendance int; # [Game data] Attendance of the game\r\nproperty id.lead_changes int; # [Game stats] Number of lead changes in the game\r\nproperty id.times_tied int; # [Game stats] Number of ties in the game\r\nproperty id.periods int; # [Game stats] Number of periods the game\r\nproperty id.possession_arrow string; # [Game stats] The unique identifier of the team that would receive the ball the next time a jump ball is called, see https://en.wikipedia.org/wiki/Jump_ball for more information\r\n\r\nproperty id.home_market string; # [Home Team data] Home team school name\r\nproperty id.home_alias string; # [Home Team data] Home team school alias (unique)\r\n\r\nproperty id.away_market string; # [Away Team data] Away team school name\r\nproperty id.away_alias string; # [Away Team data] Away team school alias\r\n\r\n\r\nproperty id.home_three_points_att int; #  [Home Team data] Three point Attempts\r\nproperty id.home_three_points_made int; #  [Home Team data] Three points made\r\n\r\n\r\nproperty id.away_three_points_att int; #  [Away Team data] Three point Attempts\r\nproperty id.away_three_points_made int; #  [Away Team data] Three points made\r\n\r\n\r\n# metrics\r\nmetric count <- count_distinct(id); # count of games\r\n\r\n\r\n# base games source\r\ndatasource games_sr (\r\n    game_id:id,\r\n    season:season,\r\n    scheduled_date:scheduled_date,\r\n    gametime:gametime,\r\n    h_id: home_team.id,\r\n    a_id:away_team.id,\r\n    h_market: home_market,\r\n    h_alias: home_alias,\r\n    a_market: away_market,\r\n    a_alias:away_alias,\r\n    h_three_points_att:home_three_points_att,\r\n    a_three_points_att: away_three_points_att,\r\n    h_three_points_made: home_three_points_made,\r\n    a_three_points_made: away_three_points_made,\r\n    conference_game:conference_game,\r\n    tournament:tournament,\r\n    tournament_type:tournament_type,\r\n    tournament_round:tournament_round,\r\n    tournament_game_no:tournament_game_no,\r\n    attendance:attendance,\r\n    lead_changes:lead_changes,\r\n    times_tied:times_tied,\r\n    periods:periods,\r\n    neutral_site:neutral_site,\r\n    possession_arrow: possession_arrow\r\n)\r\ngrain (id)\r\naddress `bigquery-public-data.ncaa_basketball.mbb_games_sr`\r\n;\r\n",
                    },
                    {
                        "alias": "metadata",
                        "contents": "key id string;\r\nproperty id.name string;\r\nproperty id.alias string;",
                    },
                    {
                        "alias": "team",
                        "contents": "import metadata as division;\r\nimport metadata  as league;\r\nimport metadata  as conference;\r\n\r\nkey id string;\r\nkey code_ncaa int;\r\nproperty id.alias string;\r\nproperty id.name string;\r\nproperty id.kaggle_team_id int;\r\nproperty id.school_ncaa string;\r\nproperty id.turner_name string;\r\nproperty id.color string; # The team color\r\n\r\nproperty id.venue_id string;\r\nproperty id.venue_city string;\r\nproperty id.venue_state string;\r\nproperty id.venue_address string;\r\nproperty id.venue_zip string;\r\nproperty id.venue_country string;\r\nproperty id.venue_name string;\r\nproperty id.venue_capacity int;\r\nproperty id.logo_large string;\r\nproperty id.logo_medium string;\r\nproperty id.logo_small string;\r\n\r\ndatasource mbb_teams (\r\nid:id,\r\ncode_ncaa:code_ncaa,\r\nalias:alias,\r\nname:name,\r\nkaggle_team_id:kaggle_team_id,\r\nschool_ncaa:school_ncaa,\r\nturner_name:turner_name,\r\n\r\nleague_name:league.name,\r\nleague_alias:league.alias,\r\nleague_id:league.id,\r\n\r\nconf_name:conference.name,\r\nconf_alias:conference.alias,\r\nconf_id:conference.id,\r\n\r\ndivision_name:division.name,\r\ndivision_alias:division.alias,\r\ndivision_id:division.id,\r\n\r\nvenue_id:venue_id,\r\nvenue_city:venue_city,\r\nvenue_state:venue_state,\r\nvenue_address:venue_address,\r\nvenue_zip:venue_zip,\r\nvenue_country:venue_country,\r\nvenue_name:venue_name,\r\nvenue_capacity:venue_capacity,\r\n\r\nlogo_large:logo_large,\r\nlogo_medium:logo_medium,\r\nlogo_small:logo_small\r\n)\r\ngrain (id)\r\naddress `bigquery-public-data.ncaa_basketball.mbb_teams`;\r\n\r\n\r\ndatasource team_colors (\r\nid:id,\r\ncolor:color\r\n)\r\naddress `bigquery-public-data.ncaa_basketball.team_colors`;",
                    },
                    {
                        "alias": "player",
                        "contents": "key id string; #Unique identifier for the player to whom the event is attributed\r\nproperty id.full_name string; #Name for the player to whom the event is attributed",
                    },
                    {
                        "alias": "game_event",
                        "contents": 'import game as game;\r\nimport team as team;\r\nimport player as player;\r\nkey id int; #Unique identifier for the event ("play")\r\n\r\n\r\nproperty id.description string; #A description of the event\r\nproperty id.type string; #Category of event\r\nproperty id.sub_type string; #Event subtype giving additional information about the event\r\nproperty id.shot_made bool; #Boolean value indicating whether the event was a shot made\r\nproperty id.shot_type string; #There are 5 categories of shot types: jump shot, layup, hook shot, dunk, tip shot\r\nproperty id.shot_subtype string; #Additional information about shot type (e.g. fadeaway, floating, pullup, step back, turnaround, alley-oop, driving, finger roll, putback, reverse)\r\nproperty id.points_scored float; #Number of points scored on the play\r\n\r\ndatasource game_events\r\n(\r\ngame_id:game.id,\r\nevent_id:id,\r\nteam_id: team.id,\r\nplayer_id: player.id,\r\nplayer_full_name:player.full_name,\r\nevent_type:type,\r\ntype: sub_type,\r\nshot_type:shot_type,\r\nshot_subtype: shot_subtype,\r\npoints_scored: points_scored,\r\nevent_description: description,\r\nshot_made: shot_made\r\n)\r\n\r\ngrain (id)\r\naddress `bigquery-public-data.ncaa_basketball.mbb_pbp_sr`;',
                    },
                ],
            },
        }
    )
    _target, _columns, results, _, _ = generate_query_core(query, DuckDBDialect())
    assert len(results) == 1


def test_validate_statement_empty():
    query = QueryInSchema.model_validate(
        {
            "imports": [],
            "query": "validate all ;",
            "dialect": "bigquery",
            "full_model": {
                "name": "",
                "sources": [],
            },
        }
    )
    dialect = DuckDBDialect()
    target, columns, results, _, _ = generate_query_core(query, dialect)
    assert not results, results
    query_to_output(target, columns, results, "default", dialect, False)


def test_validate_statement():
    query = QueryInSchema.model_validate(
        {
            "imports": [{"name": "game_event", "alias": None}],
            "query": "validate all ;",
            "dialect": "bigquery",
            "full_model": {
                "name": "",
                "sources": [
                    {
                        "alias": "game",
                        "contents": "import team as home_team;\r\nimport team as away_team;\r\n\r\nkey id string; # [Game data] Unique identifier for the game\r\nproperty id.season int; # [Game data] Season the game was played in\r\nproperty id.neutral_site bool; # [Game data] Indicator of whether the game was played on a neutral court\r\nproperty id.scheduled_date date; # [Game data] Date the game was played\r\nproperty id.gametime timestamp; # [Game data] Date and time the game was played\r\nproperty id.conference_game bool; # [Game data] Indicator of whether the two teams were in the same conference at the time the game was played\r\nproperty id.tournament string; # [Game data] Whether the game was played in a post-season tournament\r\nproperty id.tournament_type string; # [Game data] Type of post-season tournament a game was in played\r\nproperty id.tournament_round string; # [Game data] Tournament round\r\nproperty id.tournament_game_no string; # [Game data] Tournament game number\r\nproperty id.attendance int; # [Game data] Attendance of the game\r\nproperty id.lead_changes int; # [Game stats] Number of lead changes in the game\r\nproperty id.times_tied int; # [Game stats] Number of ties in the game\r\nproperty id.periods int; # [Game stats] Number of periods the game\r\nproperty id.possession_arrow string; # [Game stats] The unique identifier of the team that would receive the ball the next time a jump ball is called, see https://en.wikipedia.org/wiki/Jump_ball for more information\r\n\r\nproperty id.home_market string; # [Home Team data] Home team school name\r\nproperty id.home_alias string; # [Home Team data] Home team school alias (unique)\r\n\r\nproperty id.away_market string; # [Away Team data] Away team school name\r\nproperty id.away_alias string; # [Away Team data] Away team school alias\r\n\r\n\r\nproperty id.home_three_points_att int; #  [Home Team data] Three point Attempts\r\nproperty id.home_three_points_made int; #  [Home Team data] Three points made\r\n\r\n\r\nproperty id.away_three_points_att int; #  [Away Team data] Three point Attempts\r\nproperty id.away_three_points_made int; #  [Away Team data] Three points made\r\n\r\n\r\n# metrics\r\nmetric count <- count_distinct(id); # count of games\r\n\r\n\r\n# base games source\r\ndatasource games_sr (\r\n    game_id:id,\r\n    season:season,\r\n    scheduled_date:scheduled_date,\r\n    gametime:gametime,\r\n    h_id: home_team.id,\r\n    a_id:away_team.id,\r\n    h_market: home_market,\r\n    h_alias: home_alias,\r\n    a_market: away_market,\r\n    a_alias:away_alias,\r\n    h_three_points_att:home_three_points_att,\r\n    a_three_points_att: away_three_points_att,\r\n    h_three_points_made: home_three_points_made,\r\n    a_three_points_made: away_three_points_made,\r\n    conference_game:conference_game,\r\n    tournament:tournament,\r\n    tournament_type:tournament_type,\r\n    tournament_round:tournament_round,\r\n    tournament_game_no:tournament_game_no,\r\n    attendance:attendance,\r\n    lead_changes:lead_changes,\r\n    times_tied:times_tied,\r\n    periods:periods,\r\n    neutral_site:neutral_site,\r\n    possession_arrow: possession_arrow\r\n)\r\ngrain (id)\r\naddress `bigquery-public-data.ncaa_basketball.mbb_games_sr`\r\n;\r\n",
                    },
                    {
                        "alias": "metadata",
                        "contents": "key id string;\r\nproperty id.name string;\r\nproperty id.alias string;",
                    },
                    {
                        "alias": "team",
                        "contents": "import metadata as division;\r\nimport metadata  as league;\r\nimport metadata  as conference;\r\n\r\nkey id string;\r\nkey code_ncaa int;\r\nproperty id.alias string;\r\nproperty id.name string;\r\nproperty id.kaggle_team_id int;\r\nproperty id.school_ncaa string;\r\nproperty id.turner_name string;\r\nproperty id.color string; # The team color\r\n\r\nproperty id.venue_id string;\r\nproperty id.venue_city string;\r\nproperty id.venue_state string;\r\nproperty id.venue_address string;\r\nproperty id.venue_zip string;\r\nproperty id.venue_country string;\r\nproperty id.venue_name string;\r\nproperty id.venue_capacity int;\r\nproperty id.logo_large string;\r\nproperty id.logo_medium string;\r\nproperty id.logo_small string;\r\n\r\ndatasource mbb_teams (\r\nid:id,\r\ncode_ncaa:code_ncaa,\r\nalias:alias,\r\nname:name,\r\nkaggle_team_id:kaggle_team_id,\r\nschool_ncaa:school_ncaa,\r\nturner_name:turner_name,\r\n\r\nleague_name:league.name,\r\nleague_alias:league.alias,\r\nleague_id:league.id,\r\n\r\nconf_name:conference.name,\r\nconf_alias:conference.alias,\r\nconf_id:conference.id,\r\n\r\ndivision_name:division.name,\r\ndivision_alias:division.alias,\r\ndivision_id:division.id,\r\n\r\nvenue_id:venue_id,\r\nvenue_city:venue_city,\r\nvenue_state:venue_state,\r\nvenue_address:venue_address,\r\nvenue_zip:venue_zip,\r\nvenue_country:venue_country,\r\nvenue_name:venue_name,\r\nvenue_capacity:venue_capacity,\r\n\r\nlogo_large:logo_large,\r\nlogo_medium:logo_medium,\r\nlogo_small:logo_small\r\n)\r\ngrain (id)\r\naddress `bigquery-public-data.ncaa_basketball.mbb_teams`;\r\n\r\n\r\ndatasource team_colors (\r\nid:id,\r\ncolor:color\r\n)\r\naddress `bigquery-public-data.ncaa_basketball.team_colors`;",
                    },
                    {
                        "alias": "player",
                        "contents": "key id string; #Unique identifier for the player to whom the event is attributed\r\nproperty id.full_name string; #Name for the player to whom the event is attributed",
                    },
                    {
                        "alias": "game_event",
                        "contents": 'import game as game;\r\nimport team as team;\r\nimport player as player;\r\nkey id int; #Unique identifier for the event ("play")\r\n\r\n\r\nproperty id.description string; #A description of the event\r\nproperty id.type string; #Category of event\r\nproperty id.sub_type string; #Event subtype giving additional information about the event\r\nproperty id.shot_made bool; #Boolean value indicating whether the event was a shot made\r\nproperty id.shot_type string; #There are 5 categories of shot types: jump shot, layup, hook shot, dunk, tip shot\r\nproperty id.shot_subtype string; #Additional information about shot type (e.g. fadeaway, floating, pullup, step back, turnaround, alley-oop, driving, finger roll, putback, reverse)\r\nproperty id.points_scored float; #Number of points scored on the play\r\n\r\ndatasource game_events\r\n(\r\ngame_id:game.id,\r\nevent_id:id,\r\nteam_id: team.id,\r\nplayer_id: player.id,\r\nplayer_full_name:player.full_name,\r\nevent_type:type,\r\ntype: sub_type,\r\nshot_type:shot_type,\r\nshot_subtype: shot_subtype,\r\npoints_scored: points_scored,\r\nevent_description: description,\r\nshot_made: shot_made\r\n)\r\n\r\ngrain (id)\r\naddress `bigquery-public-data.ncaa_basketball.mbb_pbp_sr`;',
                    },
                ],
            },
        }
    )
    dialect = DuckDBDialect()
    target, columns, results, _, _ = generate_query_core(query, dialect)
    assert len(results) == 19, results
    query_to_output(target, columns, results, "default", dialect, False)


def test_generate_query_supports_relative_imports_from_current_filename():
    query = QueryInSchema.model_validate(
        {
            "imports": [],
            "query": "import ..some_parent as parent_source;\nSELECT parent_source.count;",
            "current_filename": "nested/test.preql",
            "dialect": "duckdb",
            "full_model": {
                "name": "",
                "sources": [
                    {
                        "alias": "some_parent",
                        "contents": """
key id int;
metric count <- count(id);

datasource some_parent (
    id:id
)
grain (id)
address some_parent;
""",
                    }
                ],
            },
        }
    )

    target, columns, _, _, _ = generate_query_core(query, DuckDBDialect())
    sql = DuckDBDialect().compile_statement(target)

    assert "count" in sql.lower()
    assert columns[0].name == "parent_source.count"


def test_generate_query_supports_relative_imports_inside_source_files():
    query = QueryInSchema.model_validate(
        {
            "imports": [{"name": "nested.test", "alias": "nested_test"}],
            "query": "SELECT nested_test.count;",
            "dialect": "duckdb",
            "full_model": {
                "name": "",
                "sources": [
                    {
                        "alias": "some_parent",
                        "contents": """
key id int;
metric count <- count(id);

datasource some_parent (
    id:id
)
grain (id)
address some_parent;
""",
                    },
                    {
                        "alias": "nested/test",
                        "contents": """
import ..some_parent as parent_source;
auto count <- parent_source.count;
""",
                    },
                ],
            },
        }
    )

    target, columns, _, _, _ = generate_query_core(query, DuckDBDialect())
    sql = DuckDBDialect().compile_statement(target)

    assert "count" in sql.lower()
    assert columns[0].name == "nested_test.count"


def test_query_out_column_includes_keys_for_property():
    """QueryOutColumn.keys should be populated for a property concept."""
    query = QueryInSchema.model_validate(
        {
            "imports": [{"name": "region", "alias": None}],
            "query": "SELECT id, name;",
            "dialect": "duckdb",
            "full_model": {
                "name": "",
                "sources": [
                    {
                        "alias": "region",
                        "contents": """
key id int;
property id.name string;

datasource regions (
    region_id:id,
    region_name:name,
)
grain (id)
address regions;
""",
                    }
                ],
            },
        }
    )

    _, columns, _, _, _ = generate_query_core(query, DuckDBDialect())

    col_by_name = {c.name: c for c in columns}

    # The key concept should have no keys of its own
    id_col = col_by_name.get("id")
    assert id_col is not None
    assert not id_col.keys

    # The property concept should list its key's address
    name_col = col_by_name.get("name")
    assert name_col is not None
    assert name_col.keys is not None
    assert len(name_col.keys) == 1
    assert "id" in name_col.keys[0]


def test_query_ending_in_comment_returns_last_statement_results():
    """A query ending in a comment should return results from the last
    non-comment statement rather than a blank result for the comment."""
    query = QueryInSchema.model_validate(
        {
            "imports": [{"name": "region", "alias": None}],
            "query": "SELECT id, name;\n# trailing comment with no statement",
            "dialect": "duckdb",
            "full_model": {
                "name": "",
                "sources": [
                    {
                        "alias": "region",
                        "contents": """
key id int;
property id.name string;

datasource regions (
    region_id:id,
    region_name:name,
)
grain (id)
address regions;
""",
                    }
                ],
            },
        }
    )

    target, columns, _, _, _ = generate_query_core(query, DuckDBDialect())

    # We should resolve the SELECT, not the trailing comment.
    assert target is not None
    assert [c.name for c in columns] == ["id", "name"]
    sql = DuckDBDialect().compile_statement(target)
    assert "select" in sql.lower()


CHART_MODEL = """
key id int;
property id.category string;
property id.state string;
property id.value float;

datasource facts (
    fact_id: id,
    category: category,
    state: state,
    value: value
)
grain (id)
address raw_facts;
"""


def _chart_query(query: str, extra_filters: list[str] | None = None) -> QueryInSchema:
    return QueryInSchema.model_validate(
        {
            "imports": [{"name": "facts", "alias": None}],
            "query": query,
            "dialect": "duckdb",
            "full_model": {
                "name": "",
                "sources": [{"alias": "facts", "contents": CHART_MODEL}],
            },
            "extra_filters": extra_filters,
        }
    )


def test_chart_statement_returns_layer_sql_and_roles():
    dialect = DuckDBDialect()
    query = _chart_query(
        "chart layer bar (x_axis <- category, y_axis <- sum(value) as total_value)"
        " order by total_value desc limit 10;"
    )

    target, columns, results, select_count, _ = generate_query_core(query, dialect)
    out = query_to_output(
        target, columns, results, "default", dialect, False, select_count
    )

    # One statement, so one select as far as callers policing multi-select input
    # are concerned - regardless of how many layers it holds.
    assert select_count == 1
    assert out.chart is not None
    assert [c.name for c in out.columns or []] == ["category", "total_value"]

    layer = out.chart.layers[0]
    assert layer.chart_type == "bar"
    assert layer.x_fields == ["category"]
    assert layer.y_fields == ["total_value"]
    assert layer.field_labels == {"total_value": "total_value"}
    # The chart's SQL is also the top-level SQL, so a chart-unaware client
    # still gets a runnable query back.
    assert layer.generated_sql == out.generated_sql
    assert "order by" in (out.generated_sql or "").lower()


def test_chart_statement_carries_settings_and_placements():
    dialect = DuckDBDialect()
    query = _chart_query(
        "chart set hide_legend set scale_y: log"
        " layer line (x_axis <- category, y_axis <- sum(value) as tv, color <- state)"
        " place hline at 5 as target;"
    )

    target, columns, results, select_count, _ = generate_query_core(query, dialect)
    out = query_to_output(
        target, columns, results, "default", dialect, False, select_count
    )

    assert out.chart is not None
    assert out.chart.hide_legend is True
    assert out.chart.scale_y == "log"
    assert out.chart.layers[0].color_field == "state"
    placement = out.chart.placements[0]
    assert (placement.kind, placement.value, placement.label) == ("hline", 5, "target")


def test_chart_statement_applies_extra_filters_to_layer_selects():
    """Cross-filters have to reach the layer select, or a filtered dashboard
    would silently render unfiltered chart data."""
    dialect = DuckDBDialect()
    query = _chart_query(
        "chart layer bar (x_axis <- category, y_axis <- total_value)"
        " from select category, sum(value) as total_value;",
        extra_filters=["state = 'CA'"],
    )

    target, columns, results, select_count, _ = generate_query_core(query, dialect)
    out = query_to_output(
        target, columns, results, "default", dialect, False, select_count
    )

    assert out.chart is not None
    assert "'CA'" in (out.chart.layers[0].generated_sql or "")


def test_multi_layer_chart_reports_every_layer():
    dialect = DuckDBDialect()
    query = _chart_query(
        "chart layer bar (x_axis <- category, y_axis <- sum(value) as total_value)"
        " layer line (x_axis <- category, y_axis <- avg(value) as avg_value);"
    )

    target, columns, results, select_count, layer_columns = generate_query_core(
        query, dialect
    )
    out = query_to_output(
        target,
        columns,
        results,
        "default",
        dialect,
        False,
        select_count,
        layer_columns,
    )

    assert out.chart is not None
    assert [layer.chart_type for layer in out.chart.layers] == ["bar", "line"]
    assert [layer.y_fields for layer in out.chart.layers] == [
        ["total_value"],
        ["avg_value"],
    ]
    # Every layer carries its own SQL even though only the first is promoted
    # to the top-level `generated_sql`.
    assert all(layer.generated_sql for layer in out.chart.layers)

    # Each layer is its own select over its own grain, so it carries its own
    # column map; the client resolves field types and format hints against it.
    assert [[col.name for col in layer.columns] for layer in out.chart.layers] == [
        ["category", "total_value"],
        ["category", "avg_value"],
    ]
    # The top-level columns stay the first layer's, for chart-unaware clients.
    assert [col.name for col in (out.columns or [])] == ["category", "total_value"]


def test_non_chart_query_has_no_layer_columns():
    dialect = DuckDBDialect()
    query = _chart_query("select category, sum(value) as total_value;")

    _target, _columns, _results, _select_count, layer_columns = generate_query_core(
        query, dialect
    )

    assert layer_columns is None
