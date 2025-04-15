from io_models import QueryInSchema
from trilogy.parser import parse_text

from env_helpers import parse_env_from_full_model
from trilogy.render import get_dialect_generator
from main import generate_query_core

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
                "contents": "import std.geography;\n#auto-generated datasource from table/view airport\n\nkey id int;\nproperty key.code string;\nproperty key.site_number string;\nproperty key.fac_type string;\nproperty key.fac_use string;\nproperty key.faa_region string;\nproperty key.faa_dist string;\nproperty key.city string;\nproperty key.county string;\nproperty key.state string;\nproperty key.full_name string;\nproperty key.own_type string;\nproperty key.longitude float::longitude;\nproperty key.latitude float::latitude;\nproperty key.elevation int;\nproperty key.aero_cht string;\nproperty key.cbd_dist int;\nproperty key.cbd_dir string;\nproperty key.act_date string;\nproperty key.cert string;\nproperty key.fed_agree string;\nproperty key.cust_intl string;\nproperty key.c_ldg_rts string;\nproperty key.joint_use string;\nproperty key.mil_rts string;\nproperty key.cntl_twr string;\nproperty key.major string;\n\nauto count <- count(id);\n\ndatasource airport (\n\tid:id,\n\tcode:code,\n\tsite_number:site_number,\n\tfac_type:fac_type,\n\tfac_use:fac_use,\n\tfaa_region:faa_region,\n\tfaa_dist:faa_dist,\n\tcity:city,\n\tcounty:county,\n\tstate:state,\n\tfull_name:full_name,\n\town_type:own_type,\n\tlongitude:longitude,\n\tlatitude:latitude,\n\televation:elevation,\n\taero_cht:aero_cht,\n\tcbd_dist:cbd_dist,\n\tcbd_dir:cbd_dir,\n\tact_date:act_date,\n\tcert:cert,\n\tfed_agree:fed_agree,\n\tcust_intl:cust_intl,\n\tc_ldg_rts:c_ldg_rts,\n\tjoint_use:joint_use,\n\tmil_rts:mil_rts,\n\tcntl_twr:cntl_twr,\n\tmajor:major,\n)\ngrain(id)\naddress airport;",
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
    final, columns = generate_query_core(query)
    dialect = get_dialect_generator(query.dialect)
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
                "contents": "#auto-generated datasource from table/view airport\nimport std.geography;\n\nkey id int;\nproperty key.code string;\nproperty key.site_number string;\nproperty key.fac_type string;\nproperty key.fac_use string;\nproperty key.faa_region string;\nproperty key.faa_dist string;\nproperty key.city string;\nproperty key.county string;\nproperty key.state string;\nproperty key.full_name string;\nproperty key.own_type string;\nproperty key.longitude float::longitude;\nproperty key.latitude float::latitude;\nproperty key.elevation int;\nproperty key.aero_cht string;\nproperty key.cbd_dist int;\nproperty key.cbd_dir string;\nproperty key.act_date string;\nproperty key.cert string;\nproperty key.fed_agree string;\nproperty key.cust_intl string;\nproperty key.c_ldg_rts string;\nproperty key.joint_use string;\nproperty key.mil_rts string;\nproperty key.cntl_twr string;\nproperty key.major string;\n\nauto count <- count(id);\n\ndatasource airport (\n\tid:id,\n\tcode:code,\n\tsite_number:site_number,\n\tfac_type:fac_type,\n\tfac_use:fac_use,\n\tfaa_region:faa_region,\n\tfaa_dist:faa_dist,\n\tcity:city,\n\tcounty:county,\n\tstate:state,\n\tfull_name:full_name,\n\town_type:own_type,\n\tlongitude:longitude,\n\tlatitude:latitude,\n\televation:elevation,\n\taero_cht:aero_cht,\n\tcbd_dist:cbd_dist,\n\tcbd_dir:cbd_dir,\n\tact_date:act_date,\n\tcert:cert,\n\tfed_agree:fed_agree,\n\tcust_intl:cust_intl,\n\tc_ldg_rts:c_ldg_rts,\n\tjoint_use:joint_use,\n\tmil_rts:mil_rts,\n\tcntl_twr:cntl_twr,\n\tmajor:major,\n)\ngrain(id)\naddress airport;",
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
    final, columns = generate_query_core(query)
    dialect = get_dialect_generator(query.dialect)
    generated_sql = dialect.compile_statement(final)
    assert ":param1" not in generated_sql, generated_sql
