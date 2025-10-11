from io_models import QueryInSchema
from trilogy.parser import parse_text

from env_helpers import parse_env_from_full_model
from trilogy.render import get_dialect_generator
from query_helpers import generate_query_core
from io_models import MultiQueryInSchema
from query_helpers import generate_multi_query_core
from trilogy.authoring import ArrayType, StructType
from trilogy.core.models.core import MapType
from trilogy.core.statements.execute import ProcessedQuery, ProcessedQueryPersist
from trilogy.core.exceptions import UndefinedConceptException

RAW_PAYLOAD = {
    "imports": [{"name": "game_event", "alias": None}],
    "query": "SELECT type,\r\n       sub_type,\r\n       count(id) AS event_count;\r\n",
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


def test_parse_env():
    query = QueryInSchema.model_validate(RAW_PAYLOAD)
    env = parse_env_from_full_model(query.full_model.sources)
    dialect = get_dialect_generator(query.dialect)
    for imp in query.imports:
        if imp.alias:
            imp_string = f"import {imp.name} as {imp.alias};"
        else:
            imp_string = f"import {imp.name};"
        parse_text(imp_string, env)
    _, parsed = parse_text(query.query, env)
    final = parsed[-1]

    dialect.generate_queries(environment=env, statements=[final])


RAW_PAYLOAD_TYPE = {
    "query": "type year int;\n\nSELECT\nflight.dep_time.year::int::year as departure_year,\ncount(flight.id2) as flight_count,\norder by departure_year asc;",
    "dialect": "duckdb",
    "full_model": {
        "name": "",
        "sources": [
            {
                "alias": "airport",
                "contents": "#auto-generated datasource from table/view airport\n\nkey id int;\nproperty key.code string;\nproperty key.site_number string;\nproperty key.fac_type string;\nproperty key.fac_use string;\nproperty key.faa_region string;\nproperty key.faa_dist string;\nproperty key.city string;\nproperty key.county string;\nproperty key.state string;\nproperty key.full_name string;\nproperty key.own_type string;\nproperty key.longitude float;\nproperty key.latitude float;\nproperty key.elevation int;\nproperty key.aero_cht string;\nproperty key.cbd_dist int;\nproperty key.cbd_dir string;\nproperty key.act_date string;\nproperty key.cert string;\nproperty key.fed_agree string;\nproperty key.cust_intl string;\nproperty key.c_ldg_rts string;\nproperty key.joint_use string;\nproperty key.mil_rts string;\nproperty key.cntl_twr string;\nproperty key.major string;\n\nauto count <- count(id);\n\ndatasource airport (\n\tid:id,\n\tcode:code,\n\tsite_number:site_number,\n\tfac_type:fac_type,\n\tfac_use:fac_use,\n\tfaa_region:faa_region,\n\tfaa_dist:faa_dist,\n\tcity:city,\n\tcounty:county,\n\tstate:state,\n\tfull_name:full_name,\n\town_type:own_type,\n\tlongitude:longitude,\n\tlatitude:latitude,\n\televation:elevation,\n\taero_cht:aero_cht,\n\tcbd_dist:cbd_dist,\n\tcbd_dir:cbd_dir,\n\tact_date:act_date,\n\tcert:cert,\n\tfed_agree:fed_agree,\n\tcust_intl:cust_intl,\n\tc_ldg_rts:c_ldg_rts,\n\tjoint_use:joint_use,\n\tmil_rts:mil_rts,\n\tcntl_twr:cntl_twr,\n\tmajor:major,\n)\ngrain(id)\naddress airport;",
            },
            {
                "alias": "flight",
                "contents": "#auto-generated datasource from table/view flight\nimport aircraft as aircraft;\nimport carrier as carrier;\nimport airport as origin;\nimport airport as destination;\n\nproperty id2.flight_num string;\nproperty id2.flight_time int;\nproperty id2.dep_time datetime;\nproperty id2.arr_time datetime;\nproperty id2.dep_delay int;\nproperty id2.arr_delay int;\nproperty id2.taxi_out int;\nproperty id2.taxi_in int;\nproperty id2.distance int;\nproperty id2.cancelled string;\nproperty id2.diverted string;\nkey id2 int;\n\nauto count <-count(id2);\nauto total_distance <-sum(distance);\n\ndatasource flight (\n\tcarrier:carrier.code,\n\torigin:origin.code,\n\tdestination:destination.code,\n\tflight_num:flight_num,\n\tflight_time:flight_time,\n\ttail_num:aircraft.tail_num,\n\tdep_time:dep_time,\n\tarr_time:arr_time,\n\tdep_delay:dep_delay,\n\tarr_delay:arr_delay,\n\ttaxi_out:taxi_out,\n\ttaxi_in:taxi_in,\n\tdistance:distance,\n\tcancelled:cancelled,\n\tdiverted:diverted,\n\tid2:id2,\n)\ngrain (id2)\naddress flight;",
            },
            {
                "alias": "aircraft",
                "contents": "#auto-generated datasource from table/view aircraft\nimport aircraft_model as aircraft_model;\n\nkey id int;\nproperty id.tail_num string;\nproperty id.aircraft_serial string;\nproperty id.aircraft_engine_code string;\nproperty id.year_built int;\nproperty id.aircraft_type_id int;\nproperty id.aircraft_engine_type_id int;\nproperty id.registrant_type_id int;\nproperty id.name string;\nproperty id.address1 string;\nproperty id.address2 string;\nproperty id.city string;\nproperty id.state string;\nproperty id.zip string;\nproperty id.region string;\nproperty id.county string;\nproperty id.country string;\nproperty id.certification string;\nproperty id.status_code string;\nproperty id.mode_s_code string;\nproperty id.fract_owner string;\nproperty id.last_action_date date;\nproperty id.cert_issue_date date;\nproperty id.air_worth_date date;\n\ndatasource aircraft (\n\tid:id,\n\ttail_num:tail_num,\n\taircraft_serial:aircraft_serial,\n\taircraft_model_code:aircraft_model.aircraft_model_code,\n\taircraft_engine_code:aircraft_engine_code,\n\tyear_built:year_built,\n\taircraft_type_id:aircraft_type_id,\n\taircraft_engine_type_id:aircraft_engine_type_id,\n\tregistrant_type_id:registrant_type_id,\n\tname:name,\n\taddress1:address1,\n\taddress2:address2,\n\tcity:city,\n\tstate:state,\n\tzip:zip,\n\tregion:region,\n\tcounty:county,\n\tcountry:country,\n\tcertification:certification,\n\tstatus_code:status_code,\n\tmode_s_code:mode_s_code,\n\tfract_owner:fract_owner,\n\tlast_action_date:last_action_date,\n\tcert_issue_date:cert_issue_date,\n\tair_worth_date:air_worth_date,\n)\ngrain (id)\naddress aircraft;\n\n\ndatasource aircraft_tail_num (\n\tid:id,\n\ttail_num:tail_num,\n\taircraft_serial:aircraft_serial,\n\taircraft_model_code:aircraft_model.aircraft_model_code,\n\taircraft_engine_code:aircraft_engine_code,\n\tyear_built:year_built,\n\taircraft_type_id:aircraft_type_id,\n\taircraft_engine_type_id:aircraft_engine_type_id,\n\tregistrant_type_id:registrant_type_id,\n\tname:name,\n\taddress1:address1,\n\taddress2:address2,\n\tcity:city,\n\tstate:state,\n\tzip:zip,\n\tregion:region,\n\tcounty:county,\n\tcountry:country,\n\tcertification:certification,\n\tstatus_code:status_code,\n\tmode_s_code:mode_s_code,\n\tfract_owner:fract_owner,\n\tlast_action_date:last_action_date,\n\tcert_issue_date:cert_issue_date,\n\tair_worth_date:air_worth_date,\n)\ngrain (tail_num)\naddress aircraft;",
            },
            {
                "alias": "aircraft_model",
                "contents": "\nkey aircraft_model_code string;\nproperty aircraft_model_code.manufacturer string;\nproperty aircraft_model_code.model string;\nproperty aircraft_model_code.aircraft_type_id int;\nproperty aircraft_model_code.aircraft_engine_type_id int;\nproperty aircraft_model_code.aircraft_category_id int;\nproperty aircraft_model_code.amateur int;\nproperty aircraft_model_code.engines int;\nproperty aircraft_model_code.seats int;\nproperty aircraft_model_code.weight int;\nproperty aircraft_model_code.speed int;\n\ndatasource aircraft_model (\n\taircraft_model_code:aircraft_model_code,\n\tmanufacturer:manufacturer,\n\tmodel:model,\n\taircraft_type_id:aircraft_type_id,\n\taircraft_engine_type_id:aircraft_engine_type_id,\n\taircraft_category_id:aircraft_category_id,\n\tamateur:amateur,\n\tengines:engines,\n\tseats:seats,\n\tweight:weight,\n\tspeed:speed,\n)\ngrain (aircraft_model_code)\naddress aircraft_model;",
            },
            {
                "alias": "carrier",
                "contents": "\nkey code string; #short, two digit code for the airline - UA for United, for example.\nproperty code.name string;\nproperty code.nickname string;\n\ndatasource carrier (\n\tcode:code,\n\tname:name,\n\tnickname:nickname,\n)\ngrain (code)\naddress carrier;",
            },
        ],
    },
    "imports": [{"name": "flight", "alias": "flight"}],
    "extra_filters": [],
}


def test_parse_with_declare():
    query = QueryInSchema.model_validate(RAW_PAYLOAD_TYPE)
    env = parse_env_from_full_model(query.full_model.sources)
    dialect = get_dialect_generator(query.dialect)
    for imp in query.imports:
        if imp.alias:
            imp_string = f"import {imp.name} as {imp.alias};"
        else:
            imp_string = f"import {imp.name};"
        parse_text(imp_string, env)
    _, parsed = parse_text(query.query, env)
    final = parsed[-1]
    dialect.generate_queries(environment=env, statements=[final])


RAW_VARIABLE_REQUEST = {
    "query": "SELECT\nflight.origin.full_name,\ncount(flight.id2) as flight_count,\norder by flight_count desc limit 15;",
    "dialect": "duckdb",
    "full_model": {
        "name": "",
        "sources": [
            {
                "alias": "airport",
                "contents": "#auto-generated datasource from table/view airport\n\nkey id int;\nproperty key.code string;\nproperty key.site_number string;\nproperty key.fac_type string;\nproperty key.fac_use string;\nproperty key.faa_region string;\nproperty key.faa_dist string;\nproperty key.city string;\nproperty key.county string;\nproperty key.state string;\nproperty key.full_name string;\nproperty key.own_type string;\nproperty key.longitude float;\nproperty key.latitude float;\nproperty key.elevation int;\nproperty key.aero_cht string;\nproperty key.cbd_dist int;\nproperty key.cbd_dir string;\nproperty key.act_date string;\nproperty key.cert string;\nproperty key.fed_agree string;\nproperty key.cust_intl string;\nproperty key.c_ldg_rts string;\nproperty key.joint_use string;\nproperty key.mil_rts string;\nproperty key.cntl_twr string;\nproperty key.major string;\n\nauto count <- count(id);\n\ndatasource airport (\n\tid:id,\n\tcode:code,\n\tsite_number:site_number,\n\tfac_type:fac_type,\n\tfac_use:fac_use,\n\tfaa_region:faa_region,\n\tfaa_dist:faa_dist,\n\tcity:city,\n\tcounty:county,\n\tstate:state,\n\tfull_name:full_name,\n\town_type:own_type,\n\tlongitude:longitude,\n\tlatitude:latitude,\n\televation:elevation,\n\taero_cht:aero_cht,\n\tcbd_dist:cbd_dist,\n\tcbd_dir:cbd_dir,\n\tact_date:act_date,\n\tcert:cert,\n\tfed_agree:fed_agree,\n\tcust_intl:cust_intl,\n\tc_ldg_rts:c_ldg_rts,\n\tjoint_use:joint_use,\n\tmil_rts:mil_rts,\n\tcntl_twr:cntl_twr,\n\tmajor:major,\n)\ngrain(id)\naddress airport;",
            },
            {
                "alias": "flight",
                "contents": "#auto-generated datasource from table/view flight\nimport aircraft as aircraft;\nimport carrier as carrier;\nimport airport as origin;\nimport airport as destination;\n\nproperty id2.flight_num string;\nproperty id2.flight_time int;\nproperty id2.dep_time datetime;\nproperty id2.arr_time datetime;\nproperty id2.dep_delay int;\nproperty id2.arr_delay int;\nproperty id2.taxi_out int;\nproperty id2.taxi_in int;\nproperty id2.distance int;\nproperty id2.cancelled string;\nproperty id2.diverted string;\nkey id2 int;\n\nauto count <-count(id2);\nauto total_distance <-sum(distance);\n\ndatasource flight (\n\tcarrier:carrier.code,\n\torigin:origin.code,\n\tdestination:destination.code,\n\tflight_num:flight_num,\n\tflight_time:flight_time,\n\ttail_num:aircraft.tail_num,\n\tdep_time:dep_time,\n\tarr_time:arr_time,\n\tdep_delay:dep_delay,\n\tarr_delay:arr_delay,\n\ttaxi_out:taxi_out,\n\ttaxi_in:taxi_in,\n\tdistance:distance,\n\tcancelled:cancelled,\n\tdiverted:diverted,\n\tid2:id2,\n)\ngrain (id2)\naddress flight;",
            },
            {
                "alias": "aircraft",
                "contents": "#auto-generated datasource from table/view aircraft\nimport aircraft_model as aircraft_model;\n\nkey id int;\nproperty id.tail_num string;\nproperty id.aircraft_serial string;\nproperty id.aircraft_engine_code string;\nproperty id.year_built int;\nproperty id.aircraft_type_id int;\nproperty id.aircraft_engine_type_id int;\nproperty id.registrant_type_id int;\nproperty id.name string;\nproperty id.address1 string;\nproperty id.address2 string;\nproperty id.city string;\nproperty id.state string;\nproperty id.zip string;\nproperty id.region string;\nproperty id.county string;\nproperty id.country string;\nproperty id.certification string;\nproperty id.status_code string;\nproperty id.mode_s_code string;\nproperty id.fract_owner string;\nproperty id.last_action_date date;\nproperty id.cert_issue_date date;\nproperty id.air_worth_date date;\n\ndatasource aircraft (\n\tid:id,\n\ttail_num:tail_num,\n\taircraft_serial:aircraft_serial,\n\taircraft_model_code:aircraft_model.aircraft_model_code,\n\taircraft_engine_code:aircraft_engine_code,\n\tyear_built:year_built,\n\taircraft_type_id:aircraft_type_id,\n\taircraft_engine_type_id:aircraft_engine_type_id,\n\tregistrant_type_id:registrant_type_id,\n\tname:name,\n\taddress1:address1,\n\taddress2:address2,\n\tcity:city,\n\tstate:state,\n\tzip:zip,\n\tregion:region,\n\tcounty:county,\n\tcountry:country,\n\tcertification:certification,\n\tstatus_code:status_code,\n\tmode_s_code:mode_s_code,\n\tfract_owner:fract_owner,\n\tlast_action_date:last_action_date,\n\tcert_issue_date:cert_issue_date,\n\tair_worth_date:air_worth_date,\n)\ngrain (id)\naddress aircraft;\n\n\ndatasource aircraft_tail_num (\n\tid:id,\n\ttail_num:tail_num,\n\taircraft_serial:aircraft_serial,\n\taircraft_model_code:aircraft_model.aircraft_model_code,\n\taircraft_engine_code:aircraft_engine_code,\n\tyear_built:year_built,\n\taircraft_type_id:aircraft_type_id,\n\taircraft_engine_type_id:aircraft_engine_type_id,\n\tregistrant_type_id:registrant_type_id,\n\tname:name,\n\taddress1:address1,\n\taddress2:address2,\n\tcity:city,\n\tstate:state,\n\tzip:zip,\n\tregion:region,\n\tcounty:county,\n\tcountry:country,\n\tcertification:certification,\n\tstatus_code:status_code,\n\tmode_s_code:mode_s_code,\n\tfract_owner:fract_owner,\n\tlast_action_date:last_action_date,\n\tcert_issue_date:cert_issue_date,\n\tair_worth_date:air_worth_date,\n)\ngrain (tail_num)\naddress aircraft;",
            },
            {
                "alias": "aircraft_model",
                "contents": "\nkey aircraft_model_code string;\nproperty aircraft_model_code.manufacturer string;\nproperty aircraft_model_code.model string;\nproperty aircraft_model_code.aircraft_type_id int;\nproperty aircraft_model_code.aircraft_engine_type_id int;\nproperty aircraft_model_code.aircraft_category_id int;\nproperty aircraft_model_code.amateur int;\nproperty aircraft_model_code.engines int;\nproperty aircraft_model_code.seats int;\nproperty aircraft_model_code.weight int;\nproperty aircraft_model_code.speed int;\n\ndatasource aircraft_model (\n\taircraft_model_code:aircraft_model_code,\n\tmanufacturer:manufacturer,\n\tmodel:model,\n\taircraft_type_id:aircraft_type_id,\n\taircraft_engine_type_id:aircraft_engine_type_id,\n\taircraft_category_id:aircraft_category_id,\n\tamateur:amateur,\n\tengines:engines,\n\tseats:seats,\n\tweight:weight,\n\tspeed:speed,\n)\ngrain (aircraft_model_code)\naddress aircraft_model;",
            },
            {
                "alias": "carrier",
                "contents": "\nkey code string; #short, two digit code for the airline - UA for United, for example.\nproperty code.name string;\nproperty code.nickname string;\n\ndatasource carrier (\n\tcode:code,\n\tname:name,\n\tnickname:nickname,\n)\ngrain (code)\naddress carrier;",
            },
        ],
    },
    "imports": [{"name": "flight", "alias": "flight"}],
    "extra_filters": ["flight.aircraft.aircraft_model.model = :param1"],
    "parameters": {":param1": "A319-112"},
}


# def test_parse_with_variables():
#     from trilogy.constants import Rendering

#     query = QueryInSchema.model_validate(RAW_VARIABLE_REQUEST)
#     final, columns = generate_query_core(query)
#     dialect = get_dialect_generator(query.dialect, rendering=Rendering(parameters=True))
#     generated_sql = dialect.compile_statement(final)
#     assert ":param1" in generated_sql, generated_sql


RAW_VARIABLE_REQUEST_TWO = {
    "query": "SELECT\nflight.origin.full_name,\ncount(flight.id2) as flight_count,\norder by flight_count desc limit 15;",
    "dialect": "duckdb",
    "full_model": {
        "name": "",
        "sources": [
            {
                "alias": "airport",
                "contents": "#auto-generated datasource from table/view airport\nimport std.geography;\n\nkey id int;\nproperty id.code string;\nproperty id.site_number string;\nproperty id.fac_type string;\nproperty id.fac_use string;\nproperty id.faa_region string;\nproperty id.faa_dist string;\nproperty id.city string;\nproperty id.county string;\nproperty id.state string;\nproperty id.full_name string;\nproperty id.own_type string;\nproperty id.longitude float::longitude;\nproperty id.latitude float::latitude;\nproperty id.elevation int;\nproperty id.aero_cht string;\nproperty id.cbd_dist int;\nproperty id.cbd_dir string;\nproperty id.act_date string;\nproperty id.cert string;\nproperty id.fed_agree string;\nproperty id.cust_intl string;\nproperty id.c_ldg_rts string;\nproperty id.joint_use string;\nproperty id.mil_rts string;\nproperty id.cntl_twr string;\nproperty id.major string;\n\nauto count <- count(id);\n\ndatasource airport (\n\tid:id,\n\tcode:code,\n\tsite_number:site_number,\n\tfac_type:fac_type,\n\tfac_use:fac_use,\n\tfaa_region:faa_region,\n\tfaa_dist:faa_dist,\n\tcity:city,\n\tcounty:county,\n\tstate:state,\n\tfull_name:full_name,\n\town_type:own_type,\n\tlongitude:longitude,\n\tlatitude:latitude,\n\televation:elevation,\n\taero_cht:aero_cht,\n\tcbd_dist:cbd_dist,\n\tcbd_dir:cbd_dir,\n\tact_date:act_date,\n\tcert:cert,\n\tfed_agree:fed_agree,\n\tcust_intl:cust_intl,\n\tc_ldg_rts:c_ldg_rts,\n\tjoint_use:joint_use,\n\tmil_rts:mil_rts,\n\tcntl_twr:cntl_twr,\n\tmajor:major,\n)\ngrain(id)\naddress airport;",
            },
            {
                "alias": "flight",
                "contents": "#auto-generated datasource from table/view flight\nimport aircraft as aircraft;\nimport carrier as carrier;\nimport airport as origin;\nimport airport as destination;\n\nproperty id2.flight_num string;\nproperty id2.flight_time int;\nproperty id2.dep_time datetime;\nproperty id2.arr_time datetime;\nproperty id2.dep_delay int;\nproperty id2.arr_delay int;\nproperty id2.taxi_out int;\nproperty id2.taxi_in int;\nproperty id2.distance int;\nproperty id2.cancelled string;\nproperty id2.diverted string;\nkey id2 int;\n\nauto count <-count(id2);\nauto total_distance <-sum(distance);\n\ndatasource flight (\n\tcarrier:carrier.code,\n\torigin:origin.code,\n\tdestination:destination.code,\n\tflight_num:flight_num,\n\tflight_time:flight_time,\n\ttail_num:aircraft.tail_num,\n\tdep_time:dep_time,\n\tarr_time:arr_time,\n\tdep_delay:dep_delay,\n\tarr_delay:arr_delay,\n\ttaxi_out:taxi_out,\n\ttaxi_in:taxi_in,\n\tdistance:distance,\n\tcancelled:cancelled,\n\tdiverted:diverted,\n\tid2:id2,\n)\ngrain (id2)\naddress flight;",
            },
            {
                "alias": "aircraft",
                "contents": "#auto-generated datasource from table/view aircraft\nimport aircraft_model as aircraft_model;\n\nkey id int;\nproperty id.tail_num string;\nproperty id.aircraft_serial string;\nproperty id.aircraft_engine_code string;\nproperty id.year_built int;\nproperty id.aircraft_type_id int;\nproperty id.aircraft_engine_type_id int;\nproperty id.registrant_type_id int;\nproperty id.name string;\nproperty id.address1 string;\nproperty id.address2 string;\nproperty id.city string;\nproperty id.state string;\nproperty id.zip string;\nproperty id.region string;\nproperty id.county string;\nproperty id.country string;\nproperty id.certification string;\nproperty id.status_code string;\nproperty id.mode_s_code string;\nproperty id.fract_owner string;\nproperty id.last_action_date date;\nproperty id.cert_issue_date date;\nproperty id.air_worth_date date;\n\ndatasource aircraft (\n\tid:id,\n\ttail_num:tail_num,\n\taircraft_serial:aircraft_serial,\n\taircraft_model_code:aircraft_model.aircraft_model_code,\n\taircraft_engine_code:aircraft_engine_code,\n\tyear_built:year_built,\n\taircraft_type_id:aircraft_type_id,\n\taircraft_engine_type_id:aircraft_engine_type_id,\n\tregistrant_type_id:registrant_type_id,\n\tname:name,\n\taddress1:address1,\n\taddress2:address2,\n\tcity:city,\n\tstate:state,\n\tzip:zip,\n\tregion:region,\n\tcounty:county,\n\tcountry:country,\n\tcertification:certification,\n\tstatus_code:status_code,\n\tmode_s_code:mode_s_code,\n\tfract_owner:fract_owner,\n\tlast_action_date:last_action_date,\n\tcert_issue_date:cert_issue_date,\n\tair_worth_date:air_worth_date,\n)\ngrain (id)\naddress aircraft;\n\n\ndatasource aircraft_tail_num (\n\tid:id,\n\ttail_num:tail_num,\n\taircraft_serial:aircraft_serial,\n\taircraft_model_code:aircraft_model.aircraft_model_code,\n\taircraft_engine_code:aircraft_engine_code,\n\tyear_built:year_built,\n\taircraft_type_id:aircraft_type_id,\n\taircraft_engine_type_id:aircraft_engine_type_id,\n\tregistrant_type_id:registrant_type_id,\n\tname:name,\n\taddress1:address1,\n\taddress2:address2,\n\tcity:city,\n\tstate:state,\n\tzip:zip,\n\tregion:region,\n\tcounty:county,\n\tcountry:country,\n\tcertification:certification,\n\tstatus_code:status_code,\n\tmode_s_code:mode_s_code,\n\tfract_owner:fract_owner,\n\tlast_action_date:last_action_date,\n\tcert_issue_date:cert_issue_date,\n\tair_worth_date:air_worth_date,\n)\ngrain (tail_num)\naddress aircraft;",
            },
            {
                "alias": "aircraft_model",
                "contents": "\nkey aircraft_model_code string;\nproperty aircraft_model_code.manufacturer string;\nproperty aircraft_model_code.model string;\nproperty aircraft_model_code.aircraft_type_id int;\nproperty aircraft_model_code.aircraft_engine_type_id int;\nproperty aircraft_model_code.aircraft_category_id int;\nproperty aircraft_model_code.amateur int;\nproperty aircraft_model_code.engines int;\nproperty aircraft_model_code.seats int;\nproperty aircraft_model_code.weight int;\nproperty aircraft_model_code.speed int;\n\ndatasource aircraft_model (\n\taircraft_model_code:aircraft_model_code,\n\tmanufacturer:manufacturer,\n\tmodel:model,\n\taircraft_type_id:aircraft_type_id,\n\taircraft_engine_type_id:aircraft_engine_type_id,\n\taircraft_category_id:aircraft_category_id,\n\tamateur:amateur,\n\tengines:engines,\n\tseats:seats,\n\tweight:weight,\n\tspeed:speed,\n)\ngrain (aircraft_model_code)\naddress aircraft_model;",
            },
            {
                "alias": "carrier",
                "contents": "\nkey code string; #short, two digit code for the airline - UA for United, for example.\nproperty code.name string;\nproperty code.nickname string;\n\ndatasource carrier (\n\tcode:code,\n\tname:name,\n\tnickname:nickname,\n)\ngrain (code)\naddress carrier;",
            },
        ],
    },
    "imports": [{"name": "flight", "alias": "flight"}],
    "extra_filters": ["flight.aircraft.aircraft_model.model = 'A319-112'"],
    # "parameters": {":param1": "A319-112"},
}


def test_parse_with_variables_two():
    query = QueryInSchema.model_validate(RAW_VARIABLE_REQUEST_TWO)
    dialect = get_dialect_generator(query.dialect)
    final, _, _ = generate_query_core(query, dialect)
    generated_sql = dialect.compile_statement(final)
    assert ":param1" not in generated_sql, generated_sql


INVALID_PARSE_DEBUG = {
    "query": "SELECT\r\nflight.origin.longitude,\r\nflight.origin.latitude,\r\nflight.origin.state,\r\nflight.count\r\norder by flight.count desc;",
    "dialect": "duckdb",
    "full_model": {
        "name": "",
        "sources": [
            {
                "alias": "airport",
                "contents": "#auto-generated datasource from table/view airport\nimport std.geography;\n\nkey id int;\nproperty id.code string;\nproperty id.site_number string;\nproperty id.fac_type string;\nproperty id.fac_use string;\nproperty id.faa_region string;\nproperty id.faa_dist string;\nproperty id.city string;\nproperty id.county string;\nproperty id.state string;\nproperty id.full_name string;\nproperty id.own_type string;\nproperty id.longitude float::longitude;\nproperty id.latitude float::latitude;\nproperty id.elevation int;\nproperty id.aero_cht string;\nproperty id.cbd_dist int;\nproperty id.cbd_dir string;\nproperty id.act_date string;\nproperty id.cert string;\nproperty id.fed_agree string;\nproperty id.cust_intl string;\nproperty id.c_ldg_rts string;\nproperty id.joint_use string;\nproperty id.mil_rts string;\nproperty id.cntl_twr string;\nproperty id.major string;\n\nauto count <- count(id);\n\ndatasource airport (\n\tid:id,\n\tcode:code,\n\tsite_number:site_number,\n\tfac_type:fac_type,\n\tfac_use:fac_use,\n\tfaa_region:faa_region,\n\tfaa_dist:faa_dist,\n\tcity:city,\n\tcounty:county,\n\tstate:state,\n\tfull_name:full_name,\n\town_type:own_type,\n\tlongitude:longitude,\n\tlatitude:latitude,\n\televation:elevation,\n\taero_cht:aero_cht,\n\tcbd_dist:cbd_dist,\n\tcbd_dir:cbd_dir,\n\tact_date:act_date,\n\tcert:cert,\n\tfed_agree:fed_agree,\n\tcust_intl:cust_intl,\n\tc_ldg_rts:c_ldg_rts,\n\tjoint_use:joint_use,\n\tmil_rts:mil_rts,\n\tcntl_twr:cntl_twr,\n\tmajor:major,\n)\ngrain(id)\naddress airport;",
            },
            {
                "alias": "flight",
                "contents": "#auto-generated datasource from table/view flight\nimport aircraft as aircraft;\nimport carrier as carrier;\nimport airport as origin;\nimport airport as destination;\n\nproperty id2.flight_num string;\nproperty id2.flight_time int;\nproperty id2.dep_time datetime;\nproperty id2.arr_time datetime;\nproperty id2.dep_delay int;\nproperty id2.arr_delay int;\nproperty id2.taxi_out int;\nproperty id2.taxi_in int;\nproperty id2.distance int;\nproperty id2.cancelled string;\nproperty id2.diverted string;\nkey id2 int;\n\nauto count <-count(id2);\nauto total_distance <-sum(distance);\n\ndatasource flight (\n\tcarrier:carrier.code,\n\torigin:origin.code,\n\tdestination:destination.code,\n\tflight_num:flight_num,\n\tflight_time:flight_time,\n\ttail_num:aircraft.tail_num,\n\tdep_time:dep_time,\n\tarr_time:arr_time,\n\tdep_delay:dep_delay,\n\tarr_delay:arr_delay,\n\ttaxi_out:taxi_out,\n\ttaxi_in:taxi_in,\n\tdistance:distance,\n\tcancelled:cancelled,\n\tdiverted:diverted,\n\tid2:id2,\n)\ngrain (id2)\naddress flight;",
            },
            {
                "alias": "aircraft",
                "contents": "#auto-generated datasource from table/view aircraft\nimport aircraft_model as aircraft_model;\n\nkey id int;\nproperty id.tail_num string;\nproperty id.aircraft_serial string;\nproperty id.aircraft_engine_code string;\nproperty id.year_built int;\nproperty id.aircraft_type_id int;\nproperty id.aircraft_engine_type_id int;\nproperty id.registrant_type_id int;\nproperty id.name string;\nproperty id.address1 string;\nproperty id.address2 string;\nproperty id.city string;\nproperty id.state string;\nproperty id.zip string;\nproperty id.region string;\nproperty id.county string;\nproperty id.country string;\nproperty id.certification string;\nproperty id.status_code string;\nproperty id.mode_s_code string;\nproperty id.fract_owner string;\nproperty id.last_action_date date;\nproperty id.cert_issue_date date;\nproperty id.air_worth_date date;\n\ndatasource aircraft (\n\tid:id,\n\ttail_num:tail_num,\n\taircraft_serial:aircraft_serial,\n\taircraft_model_code:aircraft_model.aircraft_model_code,\n\taircraft_engine_code:aircraft_engine_code,\n\tyear_built:year_built,\n\taircraft_type_id:aircraft_type_id,\n\taircraft_engine_type_id:aircraft_engine_type_id,\n\tregistrant_type_id:registrant_type_id,\n\tname:name,\n\taddress1:address1,\n\taddress2:address2,\n\tcity:city,\n\tstate:state,\n\tzip:zip,\n\tregion:region,\n\tcounty:county,\n\tcountry:country,\n\tcertification:certification,\n\tstatus_code:status_code,\n\tmode_s_code:mode_s_code,\n\tfract_owner:fract_owner,\n\tlast_action_date:last_action_date,\n\tcert_issue_date:cert_issue_date,\n\tair_worth_date:air_worth_date,\n)\ngrain (id)\naddress aircraft;\n\n\ndatasource aircraft_tail_num (\n\tid:id,\n\ttail_num:tail_num,\n\taircraft_serial:aircraft_serial,\n\taircraft_model_code:aircraft_model.aircraft_model_code,\n\taircraft_engine_code:aircraft_engine_code,\n\tyear_built:year_built,\n\taircraft_type_id:aircraft_type_id,\n\taircraft_engine_type_id:aircraft_engine_type_id,\n\tregistrant_type_id:registrant_type_id,\n\tname:name,\n\taddress1:address1,\n\taddress2:address2,\n\tcity:city,\n\tstate:state,\n\tzip:zip,\n\tregion:region,\n\tcounty:county,\n\tcountry:country,\n\tcertification:certification,\n\tstatus_code:status_code,\n\tmode_s_code:mode_s_code,\n\tfract_owner:fract_owner,\n\tlast_action_date:last_action_date,\n\tcert_issue_date:cert_issue_date,\n\tair_worth_date:air_worth_date,\n)\ngrain (tail_num)\naddress aircraft;",
            },
            {
                "alias": "aircraft_model",
                "contents": "\nkey aircraft_model_code string;\nproperty aircraft_model_code.manufacturer string;\nproperty aircraft_model_code.model string;\nproperty aircraft_model_code.aircraft_type_id int;\nproperty aircraft_model_code.aircraft_engine_type_id int;\nproperty aircraft_model_code.aircraft_category_id int;\nproperty aircraft_model_code.amateur int;\nproperty aircraft_model_code.engines int;\nproperty aircraft_model_code.seats int;\nproperty aircraft_model_code.weight int;\nproperty aircraft_model_code.speed int;\n\ndatasource aircraft_model (\n\taircraft_model_code:aircraft_model_code,\n\tmanufacturer:manufacturer,\n\tmodel:model,\n\taircraft_type_id:aircraft_type_id,\n\taircraft_engine_type_id:aircraft_engine_type_id,\n\taircraft_category_id:aircraft_category_id,\n\tamateur:amateur,\n\tengines:engines,\n\tseats:seats,\n\tweight:weight,\n\tspeed:speed,\n)\ngrain (aircraft_model_code)\naddress aircraft_model;",
            },
            {
                "alias": "carrier",
                "contents": "\nkey code string; #short, two digit code for the airline - UA for United, for example.\nproperty code.name string;\nproperty code.nickname string;\n\ndatasource carrier (\n\tcode:code,\n\tname:name,\n\tnickname:nickname,\n)\ngrain (code)\naddress carrier;",
            },
        ],
    },
    "imports": [{"name": "flight", "alias": "flight"}],
    "extra_filters": ["flight.aircraft.aircraft_model.model='''DC-9-82(MD-82)'''"],
    "parameters": {},
}


def test_parse_error():
    query = QueryInSchema.model_validate(INVALID_PARSE_DEBUG)
    dialect = get_dialect_generator(query.dialect)
    final, _, _ = generate_query_core(query, dialect)
    generated_sql = dialect.compile_statement(final)
    assert ":param1" not in generated_sql, generated_sql


MAP_DEBUG = {
    "query": """    const num_map <- {1: 10, 2: 21};

    SELECT
        num_map[1] -> num_map_1;
""",
    "dialect": "duckdb",
    "full_model": {
        "name": "",
        "sources": [],
    },
    "imports": [],
    "extra_filters": [],
    "parameters": {},
}


def test_map_access():
    query = QueryInSchema.model_validate(MAP_DEBUG)
    dialect = get_dialect_generator(query.dialect)
    final, columns, _ = generate_query_core(query, dialect)
    assert columns[0].datatype.value == "int"


def test_multi_query_basic():
    """Test basic multi-query execution with shared environment"""
    multi_query = {
        "imports": [{"name": "flight", "alias": "flight"}],
        "dialect": "duckdb",
        "full_model": {
            "name": "",
            "sources": [
                {
                    "alias": "flight",
                    "contents": """
key id2 int;
property id2.flight_num string;
property id2.distance int;
property id2.dep_delay int;

auto count <- count(id2);
auto total_distance <- sum(distance);

datasource flight (
    id2,
    flight_num,
    distance,
    dep_delay
)
grain (id2)
address flight;
""",
                }
            ],
        },
        "queries": [
            {
                "query": "SELECT count(flight.id2) as flight_count;",
                "label": "total_flights",
            },
            {"query": "SELECT flight.total_distance;", "label": "total_distance"},
            {
                "query": "SELECT avg(flight.dep_delay) as avg_delay;",
                "label": "average_delay",
            },
        ],
    }

    query = MultiQueryInSchema.model_validate(multi_query)
    dialect = get_dialect_generator(query.dialect)
    results = generate_multi_query_core(query, dialect)

    # Should return 3 results
    assert len(results) == 3

    # Each result should have generated SQL and columns
    for label, result, columns, values in results:
        assert result is not None
        assert len(columns) > 0

    # Check first query returns count
    assert results[0][2][0].name == "flight_count"
    assert "count" in dialect.compile_statement(results[0][1]).lower()


def test_multi_query_with_filters_and_params():
    """Test multi-query with different filters and parameters per query"""
    multi_query = {
        "imports": [{"name": "game", "alias": "game"}],
        "dialect": "bigquery",
        "full_model": {
            "name": "",
            "sources": [
                {
                    "alias": "game",
                    "contents": """
key id string;
property id.season int;
property id.home_market string;
property id.away_market string;
property id.attendance int;

metric count <- count_distinct(id);

datasource games_sr (
    game_id:id,
    season:season,
    h_market: home_market,
    a_market: away_market,
    attendance:attendance
)
grain (id)
address `bigquery-public-data.ncaa_basketball.mbb_games_sr`;
""",
                }
            ],
        },
        "queries": [
            {
                "query": "SELECT game.season, count(game.id) as game_count;",
                "label": "season_2023",
            },
            {
                "query": "SELECT game.home_market, avg(game.attendance) as avg_attendance;",
                "label": "duke_attendance",
            },
            {
                "query": "SELECT game.season, game.count order by game.season asc;",
                "label": "recent_seasons",
            },
        ],
        "extra_filters": ["game.season = 2023", "game.home_market = :team_name"],
        "parameters": {":team_name": "Duke"},
    }

    query = MultiQueryInSchema.model_validate(multi_query)
    dialect = get_dialect_generator(query.dialect)
    results = generate_multi_query_core(query, dialect)

    assert len(results) == 3

    # First query should have season filter
    sql1 = dialect.compile_statement(results[0][1])
    assert "2023" in sql1

    # Second query should have parameter
    sql2 = dialect.compile_statement(results[1][1])
    assert ":team_name" in sql2 or "Duke" in sql2

    # Third query should have multiple filters
    sql3 = dialect.compile_statement(results[2][1])
    assert "2023" in sql3


def test_multi_query_shared_imports():
    """Test that imports are shared across all queries in the batch"""
    multi_query = {
        "imports": [
            {"name": "flight", "alias": "f"},
            {"name": "airport", "alias": None},
        ],
        "dialect": "duckdb",
        "full_model": {
            "name": "",
            "sources": [
                {
                    "alias": "flight",
                    "contents": """
import airport as origin;
import airport as destination;

key id2 int;
property id2.distance int;

datasource flight (
    id2,
    origin:origin.code,
    destination:destination.code,
    distance
)
grain (id2)
address flight;
""",
                },
                {
                    "alias": "airport",
                    "contents": """
key code string;
property code.city string;
property code.state string;

datasource airport (
    code,
    city,
    state
)
grain(code)
address airport;
""",
                },
            ],
        },
        "queries": [
            {
                "query": "SELECT f.origin.city, count(f.id2) as flight_count;",
                "label": "using_alias",
            },
            {"query": "SELECT city, state;", "label": "direct_import"},
            {
                "query": "SELECT f.destination.state, sum(f.distance) as total_distance_2;",
                "label": "nested_reference",
            },
        ],
    }

    query = MultiQueryInSchema.model_validate(multi_query)
    dialect = get_dialect_generator(query.dialect)
    results = generate_multi_query_core(query, dialect)

    assert len(results) == 3

    # All queries should successfully compile
    for label, result, columns, _ in results:
        assert result is not None
        sql = dialect.compile_statement(result)
        assert sql is not None
        assert len(sql) > 0


def test_multi_query_common_def():
    """Test that in a multibatch, locally derived query concepts don't block other queries."""
    multi_query = {
        "imports": [
            {"name": "flight", "alias": "f"},
            {"name": "airport", "alias": None},
        ],
        "dialect": "duckdb",
        "full_model": {
            "name": "",
            "sources": [
                {
                    "alias": "flight",
                    "contents": """
import airport as origin;
import airport as destination;

key id2 int;
property id2.distance int;

datasource flight (
    id2,
    origin:origin.code,
    destination:destination.code,
    distance
)
grain (id2)
address flight;
""",
                },
                {
                    "alias": "airport",
                    "contents": """
key code string;
property code.city string;
property code.state string;

datasource airport (
    code,
    city,
    state
)
grain(code)
address airport;
""",
                },
            ],
        },
        "queries": [
            {
                "query": "SELECT f.destination.state, sum(f.distance) as total_distance_2;",
                "label": "nested_reference",
            },
            {"query": "SELECT city, state;", "label": "direct_import"},
            {
                "query": "SELECT f.destination.state, sum(f.distance) as total_distance_2;",
                "label": "nested_reference",
            },
            {
                "query": "SELECT f.destination.state, sum(f.distance) as total_distance_2;",
                "label": "nested_reference",
            },
        ],
    }

    query = MultiQueryInSchema.model_validate(multi_query)
    dialect = get_dialect_generator(query.dialect)
    results = generate_multi_query_core(query, dialect, cleanup_concepts=True)

    assert len(results) == 4

    # All queries should successfully compile
    for label, result, columns, _ in results:
        assert result is not None
        sql = dialect.compile_statement(result)
        assert sql is not None
        assert len(sql) > 0


def test_multi_query_with_constants():
    """Test multi-query with constant declarations"""
    multi_query = {
        "imports": [],
        "dialect": "duckdb",
        "full_model": {"name": "", "sources": []},
        "queries": [
            {
                "query": """
const tax_rate <- 0.08;
const base_price <- 100;

SELECT 
    base_price as price,
    base_price * tax_rate as tax,
    base_price * (1 + tax_rate) as total;
""",
                "label": "with_constants",
            },
            {
                "query": """
const states <- ['CA', 'NY', 'TX'];

SELECT 
    unnest(states) as state;
""",
                "label": "array_constant",
            },
            {
                "query": """
const config <- {'max': 100, 'min': 10};

SELECT 
    config['max'] as max_val,
    config['min'] as min_val;
""",
                "label": "map_constant",
            },
        ],
    }

    query = MultiQueryInSchema.model_validate(multi_query)
    dialect = get_dialect_generator(query.dialect)
    results = generate_multi_query_core(query, dialect)

    assert len(results) == 3

    # Check constants are properly handled
    assert results[0][2][0].name == "price"
    assert results[0][2][1].name == "tax"
    assert results[0][2][2].name == "total"

    assert results[1][2][0].name == "state"

    assert results[2][2][0].name == "max_val"
    assert results[2][2][1].name == "min_val"


def test_multi_query_mixed_statement_types():
    """Test multi-query with different statement types (SELECT, SHOW, PERSIST)"""
    multi_query = {
        "imports": [{"name": "flight", "alias": "flight"}],
        "dialect": "duckdb",
        "full_model": {
            "name": "",
            "sources": [
                {
                    "alias": "flight",
                    "contents": """
key id2 int;
property id2.flight_num string;
property id2.distance int;

datasource flight (
    id2:id2,
    flight_num:flight_num,
    distance:distance
)
grain (id2)
address flight;
""",
                }
            ],
        },
        "queries": [
            {"query": "SELECT count(flight.id2) as total;", "label": "select_query"},
            # {"query": "SHOW flight;", "label": "show_statement"},
            {
                "query": """
PERSIST  flight_summary into flight_summary FROM
SELECT 
    flight.flight_num,
    flight.distance
WHERE flight.distance > 500;
""",
                "label": "persist_statement",
            },
        ],
    }

    query = MultiQueryInSchema.model_validate(multi_query)
    dialect = get_dialect_generator(query.dialect)
    results = generate_multi_query_core(query, dialect)

    assert len(results) == 2

    # First should be a regular query
    assert isinstance(results[0][1], ProcessedQuery)

    assert isinstance(results[1][1], ProcessedQueryPersist)


def test_multi_query_error_handling():
    """Test that errors in one query don't affect others"""
    multi_query = {
        "imports": [
            {
                "name": "test",
                "alias": None,
            }
        ],
        "dialect": "duckdb",
        "full_model": {
            "name": "",
            "sources": [
                {
                    "alias": "test",
                    "contents": """
key id int;
property id.name string;

datasource test (
    id:id,
    name:name
)
grain (id)
address test_table;
""",
                }
            ],
        },
        "queries": [
            {"query": "SELECT name;", "label": "valid_query"},
            {
                "query": "SELECT nonexistent.field;",  # This should fail
                "label": "invalid_query",
            },
            {"query": "SELECT count(id);", "label": "another_valid_query"},
        ],
    }

    query = MultiQueryInSchema.model_validate(multi_query)
    dialect = get_dialect_generator(query.dialect)

    results = generate_multi_query_core(query, dialect)
    assert isinstance(
        results[1][1], UndefinedConceptException
    )  # The invalid query should not return a result


def test_multi_query_performance_logging():
    """Test that performance logging can be disabled"""
    multi_query = {
        "imports": [],
        "dialect": "duckdb",
        "full_model": {"name": "", "sources": []},
        "queries": [
            {"query": "SELECT 1 as num;", "label": "simple_1"},
            {"query": "SELECT 2 as num2;", "label": "simple_2"},
        ],
    }

    query = MultiQueryInSchema.model_validate(multi_query)
    dialect = get_dialect_generator(query.dialect)

    # Test with logging disabled
    results = generate_multi_query_core(
        query, dialect, enable_performance_logging=False
    )
    assert len(results) == 2

    # Test with logging enabled (default)
    results = generate_multi_query_core(query, dialect, enable_performance_logging=True)
    assert len(results) == 2


def test_multi_query_empty_queries():
    """Test handling of empty query list"""
    multi_query = {
        "imports": [],
        "dialect": "duckdb",
        "full_model": {"name": "", "sources": []},
        "queries": [],
    }

    query = MultiQueryInSchema.model_validate(multi_query)
    dialect = get_dialect_generator(query.dialect)
    results = generate_multi_query_core(query, dialect)

    # Should return empty list
    assert len(results) == 0
    assert results == []


def test_multi_query_complex_datatypes():
    """Test multi-query with complex datatypes like arrays and structs"""
    multi_query = {
        "imports": [
            {
                "name": "complex",
                "alias": "complex",
            }
        ],
        "dialect": "duckdb",
        "full_model": {
            "name": "",
            "sources": [
                {
                    "alias": "complex",
                    "contents": """
key id int;
property id.tags array<string>;
property id.metadata struct<name:string, value:int>;
property id.scores map<string, float>;

datasource complex (
    id:id,
    tags:tags,
    metadata:metadata,
    scores:scores
)
grain (id)
address complex_table;
""",
                }
            ],
        },
        "queries": [
            {"query": "SELECT complex.tags;", "label": "array_type"},
            {"query": "SELECT complex.metadata;", "label": "struct_type"},
            {"query": "SELECT complex.scores;", "label": "map_type"},
        ],
    }

    query = MultiQueryInSchema.model_validate(multi_query)
    dialect = get_dialect_generator(query.dialect)
    results = generate_multi_query_core(query, dialect)

    assert len(results) == 3

    # Check array type
    assert isinstance(results[0][2][0].datatype, ArrayType)

    # Check struct type
    assert isinstance(results[1][2][0].datatype, StructType)

    # Check map type
    assert isinstance(results[2][2][0].datatype, MapType)


def test_multi_query_with_calculations():
    """Test multi-query with calculated fields and aggregations"""
    multi_query = {
        "imports": [{"name": "game_event", "alias": "game_event"}],
        "dialect": "bigquery",
        "full_model": {
            "name": "",
            "sources": [
                {
                    "alias": "game_event",
                    "contents": """
key id int;
property id.type string;
property id.sub_type string;
property id.points_scored float;
property id.shot_made bool;

datasource game_events (
    event_id:id,
    event_type:type,
    type: sub_type,
    points_scored: points_scored,
    shot_made: shot_made
)
grain (id)
address `bigquery-public-data.ncaa_basketball.mbb_pbp_sr`;
""",
                }
            ],
        },
        "queries": [
            {
                "query": """
SELECT 
    game_event.type,
    count(game_event.id) as event_count,
    sum(game_event.points_scored) as total_points
order by total_points desc;
""",
                "label": "aggregations",
            },
            {
                "query": """
SELECT 
    game_event.type,
    game_event.shot_made,
    count(game_event.id) as attempts,
    count(game_event.id ? game_event.shot_made = true)  as made,
    made / attempts as percentage
order by attempts desc;
""",
                "label": "calculated_percentage",
            },
            {
                "query": """
SELECT 
    case 
        when game_event.points_scored = 3 then 'Three Pointer'
        when game_event.points_scored = 2 then 'Two Pointer'
        when game_event.points_scored = 1 then 'Free Throw'
        else 'Other'
    end as shot_type,
    count(game_event.id) as count
order by count desc;
""",
                "label": "case_statement",
            },
        ],
    }

    query = MultiQueryInSchema.model_validate(multi_query)
    dialect = get_dialect_generator(query.dialect)
    results = generate_multi_query_core(query, dialect)

    assert len(results) == 3

    # Check aggregation query
    assert "event_count" in [col.name for col in results[0][2]]
    assert "total_points" in [col.name for col in results[0][2]]

    # Check calculated percentage query
    assert "percentage" in [col.name for col in results[1][2]]

    # Check case statement query
    assert "shot_type" in [col.name for col in results[2][2]]
