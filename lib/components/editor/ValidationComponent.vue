<template>
  <div class="debug-container">
    <!-- Left side: Test Details -->
    <div class="test-details-container">
      <div class="section-header">
        Data Validation Results
        <span class="text-faint text-small">
          Review test execution results and data quality checks.
        </span>
      </div>

      <div class="validation-info">
        <div class="info-item"><strong>Label:</strong> {{ testData.label }}</div>
        <div class="info-item" v-if="testData.generated_sql">
          <strong>Generated SQL:</strong>
          <code class="sql-snippet">{{ testData.generated_sql }}</code>
        </div>
        <div class="info-item" v-if="testData.error">
          <strong>Error:</strong>
          <span class="error-text">{{ testData.error }}</span>
        </div>
      </div>

      <!-- Column Information -->
      <div class="columns-section" v-if="testData.columns && testData.columns.length > 0">
        <h3>Schema Information</h3>
        <div class="columns-list">
          <div v-for="(column, index) in testData.columns" :key="index" class="column-item">
            <div class="column-name">{{ column.name }}</div>
            <div class="column-details">
              <span class="column-datatype">{{ column.datatype }}</span>
              <span class="column-purpose">{{ column.purpose }}</span>
              <span v-if="column.description" class="column-description">
                {{ column.description }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right side: Test Results -->
    <div class="tests-container">
      <div class="section-header">
        Test Results
        <div class="header-controls">
          <button @click="runAllTests" :disabled="isRunningTests" class="run-all-button">
            {{ isRunningTests ? 'Running...' : 'Run All Tests' }}
          </button>
          <span class="pass-indicator text-small" v-if="allTestsPassed"> ✓ All tests passed! </span>
        </div>
      </div>

      <div class="tests-list">
        <div
          v-for="(test, index) in testData.generated_output"
          :key="index"
          :class="['test-item', getTestStatusClass(test)]"
          @click="runSingleTest(index)"
        >
          <div class="test-header">
            <div class="test-name">
              {{ getTestDisplayName(test) }}
            </div>
            <div class="test-status-indicator">
              <span v-if="test.ran && test.result === null" class="pass-indicator">✓</span>
              <span v-else-if="test.ran && test.result !== null" class="fail-indicator">✗</span>
              <span v-else class="pending-indicator">○</span>
            </div>
          </div>

          <div class="test-details">
            <div class="test-type"><strong>Type:</strong> {{ test.check_type }}</div>
            <div class="test-expected" v-if="test.expected">
              <strong>Expected:</strong> {{ test.expected }}
            </div>
            <div class="test-status">
              <strong>Status:</strong>
              <span :class="getStatusTextClass(test)">
                {{ getStatusText(test) }}
              </span>
            </div>
          </div>

          <!-- Error Display -->
          <div v-if="test.ran && test.result !== null" class="test-error">
            <strong>Error:</strong> {{ test.result }}
          </div>

          <!-- Query Preview -->
          <div v-if="test.query && test.query.trim()" class="query-preview">
            <strong>Query:</strong>
            <pre class="query-text">{{ formatQuery(test.query) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, type PropType } from 'vue'

interface Column {
  name: string
  datatype: string
  purpose: string
  traits: string | null
  description: string | null
}

interface TestResult {
  check_type: string
  expected: string | null
  result: string | null
  ran: boolean
  query: string
}

interface TestData {
  generated_sql: string
  columns: Column[]
  generated_output: TestResult[]
  error: string | null
  label: string
}

const sampleTestData: TestData = {
  generated_sql: 'select 1;',
  columns: [
    {
      name: 'check_type',
      datatype: 'string',
      purpose: 'key',
      traits: null,
      description: null,
    },
    {
      name: 'expected',
      datatype: 'string',
      purpose: 'key',
      traits: null,
      description: null,
    },
    {
      name: 'result',
      datatype: 'string',
      purpose: 'key',
      traits: null,
      description: null,
    },
    {
      name: 'ran',
      datatype: 'string',
      purpose: 'key',
      traits: null,
      description: null,
    },
    {
      name: 'query',
      datatype: 'string',
      purpose: 'key',
      traits: null,
      description: null,
    },
  ],
  generated_output: [
    {
      check_type: 'logical',
      expected: 'datatype_match',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_platform_info_base as (\nSELECT\n    "platform_platform_info"."Class" as "platform_class",\n    "platform_platform_info"."Code" as "platform_code",\n    "platform_platform_info"."EName" as "platform_e_name",\n    "platform_platform_info"."Error" as "platform_error",\n    "platform_platform_info"."Latitude" as "platform_latitude",\n    "platform_platform_info"."Location" as "platform_location",\n    "platform_platform_info"."Longitude" as "platform_longitude",\n    "platform_platform_info"."Name" as "platform_name",\n    "platform_platform_info"."Parent" as "platform_parent",\n    "platform_platform_info"."ShortEName" as "platform_short_e_name",\n    "platform_platform_info"."ShortName" as "platform_short_name",\n    "platform_platform_info"."StateCode" as "platform_state_code",\n    "platform_platform_info"."TStart" as "platform_t_start",\n    "platform_platform_info"."TStop" as "platform_t_stop",\n    "platform_platform_info"."Type" as "platform_type",\n    "platform_platform_info"."UCode" as "platform_u_code",\n    "platform_platform_info"."UName" as "platform_u_name",\n    "platform_platform_info"."VClass" as "platform_v_class",\n    "platform_platform_info"."VClassID" as "platform_v_class_id",\n    "platform_platform_info"."VID" as "platform_v_id"\nFROM\n    "platform_info" as "platform_platform_info"\nGROUP BY \n    "platform_platform_info"."Class",\n    "platform_platform_info"."Code",\n    "platform_platform_info"."EName",\n    "platform_platform_info"."Error",\n    "platform_platform_info"."Latitude",\n    "platform_platform_info"."Location",\n    "platform_platform_info"."Longitude",\n    "platform_platform_info"."Name",\n    "platform_platform_info"."Parent",\n    "platform_platform_info"."ShortEName",\n    "platform_platform_info"."ShortName",\n    "platform_platform_info"."StateCode",\n    "platform_platform_info"."TStart",\n    "platform_platform_info"."TStop",\n    "platform_platform_info"."Type",\n    "platform_platform_info"."UCode",\n    "platform_platform_info"."UName",\n    "platform_platform_info"."VClass",\n    "platform_platform_info"."VClassID",\n    "platform_platform_info"."VID")\nSELECT\n    "datasource_platform_info_base"."platform_code" as "platform_code",\n    "datasource_platform_info_base"."platform_u_code" as "platform_u_code",\n    "datasource_platform_info_base"."platform_state_code" as "platform_state_code",\n    "datasource_platform_info_base"."platform_type" as "platform_type",\n    "datasource_platform_info_base"."platform_class" as "platform_class",\n    "datasource_platform_info_base"."platform_t_start" as "platform_t_start",\n    "datasource_platform_info_base"."platform_t_stop" as "platform_t_stop",\n    "datasource_platform_info_base"."platform_short_name" as "platform_short_name",\n    "datasource_platform_info_base"."platform_name" as "platform_name",\n    "datasource_platform_info_base"."platform_location" as "platform_location",\n    "datasource_platform_info_base"."platform_longitude" as "platform_longitude",\n    "datasource_platform_info_base"."platform_latitude" as "platform_latitude",\n    "datasource_platform_info_base"."platform_error" as "platform_error",\n    "datasource_platform_info_base"."platform_parent" as "platform_parent",\n    "datasource_platform_info_base"."platform_short_e_name" as "platform_short_e_name",\n    "datasource_platform_info_base"."platform_e_name" as "platform_e_name",\n    "datasource_platform_info_base"."platform_v_class" as "platform_v_class",\n    "datasource_platform_info_base"."platform_v_class_id" as "platform_v_class_id",\n    "datasource_platform_info_base"."platform_v_id" as "platform_v_id",\n    "datasource_platform_info_base"."platform_u_name" as "platform_u_name"\nFROM\n    "datasource_platform_info_base"\nORDER BY \n    CASE\n\tWHEN "datasource_platform_info_base"."platform_code" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (100)',
    },
    {
      check_type: 'logical',
      expected: 'datatype_match',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_lv_info_base as (\nSELECT\n    "vehicle_lv_info"."Apogee" as "vehicle_apogee",\n    "vehicle_lv_info"."Class" as "vehicle_class",\n    "vehicle_lv_info"."DFlag" as "vehicle_dflag",\n    "vehicle_lv_info"."Diameter" as "vehicle_diameter",\n    "vehicle_lv_info"."GTO_Capacity" as "vehicle_gto_capacity",\n    "vehicle_lv_info"."LEO_Capacity" as "vehicle_leo_capacity",\n    "vehicle_lv_info"."LFlag" as "vehicle_lflag",\n    "vehicle_lv_info"."LV_Alias" as "vehicle_alias",\n    "vehicle_lv_info"."LV_Family" as "vehicle_family",\n    "vehicle_lv_info"."LV_Manufacturer" as "vehicle_manufacturer",\n    "vehicle_lv_info"."LV_Max_Stage" as "vehicle_max_stage",\n    "vehicle_lv_info"."LV_Min_Stage" as "vehicle_min_stage",\n    "vehicle_lv_info"."LV_Name" as "vehicle_name",\n    "vehicle_lv_info"."LV_Variant" as "vehicle_variant",\n    "vehicle_lv_info"."Launch_Mass" as "vehicle_launch_mass",\n    "vehicle_lv_info"."Length" as "vehicle_length",\n    "vehicle_lv_info"."MFlag" as "vehicle_mflag",\n    "vehicle_lv_info"."Range" as "vehicle_range",\n    "vehicle_lv_info"."TO_Thrust" as "vehicle_to_thrust"\nFROM\n    "lv_info" as "vehicle_lv_info"\nGROUP BY \n    "vehicle_lv_info"."Apogee",\n    "vehicle_lv_info"."Class",\n    "vehicle_lv_info"."DFlag",\n    "vehicle_lv_info"."Diameter",\n    "vehicle_lv_info"."GTO_Capacity",\n    "vehicle_lv_info"."LEO_Capacity",\n    "vehicle_lv_info"."LFlag",\n    "vehicle_lv_info"."LV_Alias",\n    "vehicle_lv_info"."LV_Family",\n    "vehicle_lv_info"."LV_Manufacturer",\n    "vehicle_lv_info"."LV_Max_Stage",\n    "vehicle_lv_info"."LV_Min_Stage",\n    "vehicle_lv_info"."LV_Name",\n    "vehicle_lv_info"."LV_Variant",\n    "vehicle_lv_info"."Launch_Mass",\n    "vehicle_lv_info"."Length",\n    "vehicle_lv_info"."MFlag",\n    "vehicle_lv_info"."Range",\n    "vehicle_lv_info"."TO_Thrust")\nSELECT\n    "datasource_lv_info_base"."vehicle_name" as "vehicle_name",\n    "datasource_lv_info_base"."vehicle_family" as "vehicle_family",\n    "datasource_lv_info_base"."vehicle_manufacturer" as "vehicle_manufacturer",\n    "datasource_lv_info_base"."vehicle_variant" as "vehicle_variant",\n    "datasource_lv_info_base"."vehicle_alias" as "vehicle_alias",\n    "datasource_lv_info_base"."vehicle_min_stage" as "vehicle_min_stage",\n    "datasource_lv_info_base"."vehicle_max_stage" as "vehicle_max_stage",\n    "datasource_lv_info_base"."vehicle_length" as "vehicle_length",\n    "datasource_lv_info_base"."vehicle_lflag" as "vehicle_lflag",\n    "datasource_lv_info_base"."vehicle_diameter" as "vehicle_diameter",\n    "datasource_lv_info_base"."vehicle_dflag" as "vehicle_dflag",\n    "datasource_lv_info_base"."vehicle_launch_mass" as "vehicle_launch_mass",\n    "datasource_lv_info_base"."vehicle_mflag" as "vehicle_mflag",\n    "datasource_lv_info_base"."vehicle_leo_capacity" as "vehicle_leo_capacity",\n    "datasource_lv_info_base"."vehicle_gto_capacity" as "vehicle_gto_capacity",\n    "datasource_lv_info_base"."vehicle_to_thrust" as "vehicle_to_thrust",\n    "datasource_lv_info_base"."vehicle_class" as "vehicle_class",\n    "datasource_lv_info_base"."vehicle_apogee" as "vehicle_apogee",\n    "datasource_lv_info_base"."vehicle_range" as "vehicle_range"\nFROM\n    "datasource_lv_info_base"\nORDER BY \n    CASE\n\tWHEN "datasource_lv_info_base"."vehicle_name" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (100)',
    },
    {
      check_type: 'logical',
      expected: 'datatype_match',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_launch_sites_base as (\nSELECT\n    "site_launch_sites"."Code" as "site_code",\n    "site_launch_sites"."EName" as "site_e_name",\n    "site_launch_sites"."Error" as "site_error",\n    "site_launch_sites"."Location" as "site_location",\n    "site_launch_sites"."Name" as "site_name",\n    "site_launch_sites"."Parent" as "site_parent",\n    "site_launch_sites"."ShortName" as "site_short_name",\n    "site_launch_sites"."Site" as "site_key",\n    "site_launch_sites"."StateCode" as "site_state_code",\n    "site_launch_sites"."TStart" as "site_t_start",\n    "site_launch_sites"."TStop" as "site_t_stop",\n    "site_launch_sites"."Type" as "site_type",\n    "site_launch_sites"."UCode" as "site_u_code",\n    "site_launch_sites"."UName" as "site_u_name",\n    "site_launch_sites"."latitude" as "site_latitude",\n    "site_launch_sites"."longitude" as "site_longitude"\nFROM\n    "launch_sites" as "site_launch_sites"\nGROUP BY \n    "site_launch_sites"."Code",\n    "site_launch_sites"."EName",\n    "site_launch_sites"."Error",\n    "site_launch_sites"."Location",\n    "site_launch_sites"."Name",\n    "site_launch_sites"."Parent",\n    "site_launch_sites"."ShortName",\n    "site_launch_sites"."Site",\n    "site_launch_sites"."StateCode",\n    "site_launch_sites"."TStart",\n    "site_launch_sites"."TStop",\n    "site_launch_sites"."Type",\n    "site_launch_sites"."UCode",\n    "site_launch_sites"."UName",\n    "site_launch_sites"."latitude",\n    "site_launch_sites"."longitude")\nSELECT\n    "datasource_launch_sites_base"."site_key" as "site_key",\n    "datasource_launch_sites_base"."site_code" as "site_code",\n    "datasource_launch_sites_base"."site_u_code" as "site_u_code",\n    "datasource_launch_sites_base"."site_type" as "site_type",\n    "datasource_launch_sites_base"."site_state_code" as "site_state_code",\n    "datasource_launch_sites_base"."site_t_start" as "site_t_start",\n    "datasource_launch_sites_base"."site_t_stop" as "site_t_stop",\n    "datasource_launch_sites_base"."site_short_name" as "site_short_name",\n    "datasource_launch_sites_base"."site_name" as "site_name",\n    "datasource_launch_sites_base"."site_location" as "site_location",\n    "datasource_launch_sites_base"."site_longitude" as "site_longitude",\n    "datasource_launch_sites_base"."site_latitude" as "site_latitude",\n    "datasource_launch_sites_base"."site_error" as "site_error",\n    "datasource_launch_sites_base"."site_parent" as "site_parent",\n    "datasource_launch_sites_base"."site_e_name" as "site_e_name",\n    "datasource_launch_sites_base"."site_u_name" as "site_u_name"\nFROM\n    "datasource_launch_sites_base"\nORDER BY \n    CASE\n\tWHEN "datasource_launch_sites_base"."site_key" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (100)',
    },
    {
      check_type: 'logical',
      expected: 'datatype_match',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_organizations_base as (\nSELECT\n    "org_organizations"."Class" as "org_class",\n    "org_organizations"."Code" as "org_code",\n    "org_organizations"."EName" as "org_e_name",\n    "org_organizations"."Error" as "org_error",\n    "org_organizations"."Latitude" as "org_latitude",\n    "org_organizations"."Location" as "org_location",\n    "org_organizations"."Longitude" as "org_longitude",\n    "org_organizations"."Name" as "org_name",\n    "org_organizations"."Parent" as "org_parent",\n    "org_organizations"."ShortEName" as "org_short_e_name",\n    "org_organizations"."ShortName" as "org_short_name",\n    "org_organizations"."StateCode" as "org_state_code",\n    "org_organizations"."TStart" as "org_t_start",\n    "org_organizations"."TStop" as "org_t_stop",\n    "org_organizations"."Type" as "org_type",\n    "org_organizations"."UCode" as "org_u_code",\n    "org_organizations"."UName" as "org_u_name"\nFROM\n    "organizations" as "org_organizations"\nGROUP BY \n    "org_organizations"."Class",\n    "org_organizations"."Code",\n    "org_organizations"."EName",\n    "org_organizations"."Error",\n    "org_organizations"."Latitude",\n    "org_organizations"."Location",\n    "org_organizations"."Longitude",\n    "org_organizations"."Name",\n    "org_organizations"."Parent",\n    "org_organizations"."ShortEName",\n    "org_organizations"."ShortName",\n    "org_organizations"."StateCode",\n    "org_organizations"."TStart",\n    "org_organizations"."TStop",\n    "org_organizations"."Type",\n    "org_organizations"."UCode",\n    "org_organizations"."UName")\nSELECT\n    "datasource_organizations_base"."org_code" as "org_code",\n    "datasource_organizations_base"."org_u_code" as "org_u_code",\n    "datasource_organizations_base"."org_state_code" as "org_state_code",\n    "datasource_organizations_base"."org_type" as "org_type",\n    "datasource_organizations_base"."org_class" as "org_class",\n    "datasource_organizations_base"."org_t_start" as "org_t_start",\n    "datasource_organizations_base"."org_t_stop" as "org_t_stop",\n    "datasource_organizations_base"."org_short_name" as "org_short_name",\n    "datasource_organizations_base"."org_name" as "org_name",\n    "datasource_organizations_base"."org_location" as "org_location",\n    "datasource_organizations_base"."org_longitude" as "org_longitude",\n    "datasource_organizations_base"."org_latitude" as "org_latitude",\n    "datasource_organizations_base"."org_error" as "org_error",\n    "datasource_organizations_base"."org_parent" as "org_parent",\n    "datasource_organizations_base"."org_short_e_name" as "org_short_e_name",\n    "datasource_organizations_base"."org_e_name" as "org_e_name",\n    "datasource_organizations_base"."org_u_name" as "org_u_name"\nFROM\n    "datasource_organizations_base"\nORDER BY \n    CASE\n\tWHEN "datasource_organizations_base"."org_code" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (100)',
    },
    {
      check_type: 'logical',
      expected: 'datatype_match',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_satcat_base as (\nSELECT\n    "payload_satcat"."AF" as "payload_af",\n    "payload_satcat"."AltNames" as "payload_alt_names",\n    "payload_satcat"."Apogee" as "payload_apogee",\n    "payload_satcat"."Bus" as "payload_bus",\n    "payload_satcat"."DDate" as "payload_d_date",\n    "payload_satcat"."DFlag" as "payload_d_flag",\n    "payload_satcat"."Dest" as "payload_dest",\n    "payload_satcat"."Diameter" as "payload_diameter",\n    "payload_satcat"."DryFlag" as "payload_dry_flag",\n    "payload_satcat"."DryMass" as "payload_dry_mass",\n    "payload_satcat"."IF" as "payload_if",\n    "payload_satcat"."Inc" as "payload_inc",\n    "payload_satcat"."JCAT" as "payload_jcat",\n    "payload_satcat"."LDate" as "payload_l_date",\n    "payload_satcat"."LFlag" as "payload_l_flag",\n    "payload_satcat"."Launch_Tag" as "launch_tag",\n    "payload_satcat"."Length" as "payload_length",\n    "payload_satcat"."Manufacturer" as "payload_manufacturer",\n    "payload_satcat"."Mass" as "payload_mass",\n    "payload_satcat"."MassFlag" as "payload_mass_flag",\n    "payload_satcat"."Motor" as "payload_motor",\n    "payload_satcat"."Name" as "payload_name",\n    "payload_satcat"."ODate" as "payload_o_date",\n    "payload_satcat"."OQUAL" as "payload_oqual",\n    "payload_satcat"."OpOrbit" as "payload_op_orbit",\n    "payload_satcat"."Owner" as "payload_owner",\n    "payload_satcat"."PF" as "payload_pf",\n    "payload_satcat"."PLName" as "payload_pl_name",\n    "payload_satcat"."Parent" as "payload_parent",\n    "payload_satcat"."Perigee" as "payload_perigee",\n    "payload_satcat"."Piece" as "payload_piece",\n    "payload_satcat"."Primary" as "payload_primary",\n    "payload_satcat"."SDate" as "payload_s_date",\n    "payload_satcat"."Satcat" as "payload_satcat",\n    "payload_satcat"."Shape" as "payload_shape",\n    "payload_satcat"."Span" as "payload_span",\n    "payload_satcat"."SpanFlag" as "payload_span_flag",\n    "payload_satcat"."State" as "payload_state",\n    "payload_satcat"."Status" as "payload_status",\n    "payload_satcat"."TotFlag" as "payload_tot_flag",\n    "payload_satcat"."TotMass" as "payload_tot_mass",\n    "payload_satcat"."Type" as "payload_type"\nFROM\n    "satcat" as "payload_satcat"\nGROUP BY \n    "payload_satcat"."AF",\n    "payload_satcat"."AltNames",\n    "payload_satcat"."Apogee",\n    "payload_satcat"."Bus",\n    "payload_satcat"."DDate",\n    "payload_satcat"."DFlag",\n    "payload_satcat"."Dest",\n    "payload_satcat"."Diameter",\n    "payload_satcat"."DryFlag",\n    "payload_satcat"."DryMass",\n    "payload_satcat"."IF",\n    "payload_satcat"."Inc",\n    "payload_satcat"."JCAT",\n    "payload_satcat"."LDate",\n    "payload_satcat"."LFlag",\n    "payload_satcat"."Launch_Tag",\n    "payload_satcat"."Length",\n    "payload_satcat"."Manufacturer",\n    "payload_satcat"."Mass",\n    "payload_satcat"."MassFlag",\n    "payload_satcat"."Motor",\n    "payload_satcat"."Name",\n    "payload_satcat"."ODate",\n    "payload_satcat"."OQUAL",\n    "payload_satcat"."OpOrbit",\n    "payload_satcat"."Owner",\n    "payload_satcat"."PF",\n    "payload_satcat"."PLName",\n    "payload_satcat"."Parent",\n    "payload_satcat"."Perigee",\n    "payload_satcat"."Piece",\n    "payload_satcat"."Primary",\n    "payload_satcat"."SDate",\n    "payload_satcat"."Satcat",\n    "payload_satcat"."Shape",\n    "payload_satcat"."Span",\n    "payload_satcat"."SpanFlag",\n    "payload_satcat"."State",\n    "payload_satcat"."Status",\n    "payload_satcat"."TotFlag",\n    "payload_satcat"."TotMass",\n    "payload_satcat"."Type")\nSELECT\n    "datasource_satcat_base"."payload_jcat" as "payload_jcat",\n    "datasource_satcat_base"."payload_satcat" as "payload_satcat",\n    "datasource_satcat_base"."payload_piece" as "payload_piece",\n    "datasource_satcat_base"."payload_type" as "payload_type",\n    "datasource_satcat_base"."payload_name" as "payload_name",\n    "datasource_satcat_base"."payload_pl_name" as "payload_pl_name",\n    "datasource_satcat_base"."payload_l_date" as "payload_l_date",\n    "datasource_satcat_base"."payload_parent" as "payload_parent",\n    "datasource_satcat_base"."payload_s_date" as "payload_s_date",\n    "datasource_satcat_base"."payload_primary" as "payload_primary",\n    "datasource_satcat_base"."payload_d_date" as "payload_d_date",\n    "datasource_satcat_base"."payload_status" as "payload_status",\n    "datasource_satcat_base"."payload_dest" as "payload_dest",\n    "datasource_satcat_base"."payload_owner" as "payload_owner",\n    "datasource_satcat_base"."payload_state" as "payload_state",\n    "datasource_satcat_base"."payload_manufacturer" as "payload_manufacturer",\n    "datasource_satcat_base"."payload_bus" as "payload_bus",\n    "datasource_satcat_base"."payload_motor" as "payload_motor",\n    "datasource_satcat_base"."payload_mass" as "payload_mass",\n    "datasource_satcat_base"."payload_mass_flag" as "payload_mass_flag",\n    "datasource_satcat_base"."payload_dry_mass" as "payload_dry_mass",\n    "datasource_satcat_base"."payload_dry_flag" as "payload_dry_flag",\n    "datasource_satcat_base"."payload_tot_mass" as "payload_tot_mass",\n    "datasource_satcat_base"."payload_tot_flag" as "payload_tot_flag",\n    "datasource_satcat_base"."payload_length" as "payload_length",\n    "datasource_satcat_base"."payload_l_flag" as "payload_l_flag",\n    "datasource_satcat_base"."payload_diameter" as "payload_diameter",\n    "datasource_satcat_base"."payload_d_flag" as "payload_d_flag",\n    "datasource_satcat_base"."payload_span" as "payload_span",\n    "datasource_satcat_base"."payload_span_flag" as "payload_span_flag",\n    "datasource_satcat_base"."payload_shape" as "payload_shape",\n    "datasource_satcat_base"."payload_o_date" as "payload_o_date",\n    "datasource_satcat_base"."payload_perigee" as "payload_perigee",\n    "datasource_satcat_base"."payload_pf" as "payload_pf",\n    "datasource_satcat_base"."payload_apogee" as "payload_apogee",\n    "datasource_satcat_base"."payload_af" as "payload_af",\n    "datasource_satcat_base"."payload_inc" as "payload_inc",\n    "datasource_satcat_base"."payload_if" as "payload_if",\n    "datasource_satcat_base"."payload_op_orbit" as "payload_op_orbit",\n    "datasource_satcat_base"."payload_oqual" as "payload_oqual",\n    "datasource_satcat_base"."payload_alt_names" as "payload_alt_names",\n    "datasource_satcat_base"."launch_tag" as "launch_tag"\nFROM\n    "datasource_satcat_base"\nORDER BY \n    CASE\n\tWHEN "datasource_satcat_base"."payload_jcat" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (100)',
    },
    {
      check_type: 'logical',
      expected: 'datatype_match',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_launch_info_base as (\nSELECT\n    "launch_info"."Agency" as "org_code",\n    "launch_info"."Apoflag" as "apo_flag",\n    "launch_info"."Apogee" as "apogee",\n    "launch_info"."Ascent_Pad" as "ascent_pad",\n    "launch_info"."Ascent_Site" as "ascent_site",\n    "launch_info"."Category" as "category",\n    "launch_info"."Cite" as "cite",\n    "launch_info"."Dest" as "dest",\n    "launch_info"."FailCode" as "fail_code",\n    "launch_info"."Flight" as "flight",\n    "launch_info"."FlightCode" as "flight_code",\n    "launch_info"."Flight_ID" as "flight_id",\n    "launch_info"."LTCite" as "lt_cite",\n    "launch_info"."LV_Type" as "vehicle_name",\n    "launch_info"."LaunchCode" as "_launch_code",\n    "launch_info"."Launch_JD" as "launch_jd",\n    "launch_info"."Launch_Pad" as "launch_pad",\n    "launch_info"."Launch_Site" as "site_key",\n    "launch_info"."Launch_Tag" as "launch_tag",\n    "launch_info"."Mission" as "mission",\n    "launch_info"."Notes" as "notes",\n    "launch_info"."OrbPay" as "orb_pay",\n    "launch_info"."Platform" as "platform_code",\n    "launch_info"."Range" as "range",\n    "launch_info"."RangeFlag" as "range_flag",\n    "launch_info"."Variant" as "vehicle_variant"\nFROM\n    "launch_info"\nGROUP BY \n    "launch_info"."Agency",\n    "launch_info"."Apoflag",\n    "launch_info"."Apogee",\n    "launch_info"."Ascent_Pad",\n    "launch_info"."Ascent_Site",\n    "launch_info"."Category",\n    "launch_info"."Cite",\n    "launch_info"."Dest",\n    "launch_info"."FailCode",\n    "launch_info"."Flight",\n    "launch_info"."FlightCode",\n    "launch_info"."Flight_ID",\n    "launch_info"."LTCite",\n    "launch_info"."LV_Type",\n    "launch_info"."LaunchCode",\n    "launch_info"."Launch_JD",\n    "launch_info"."Launch_Pad",\n    "launch_info"."Launch_Site",\n    "launch_info"."Launch_Tag",\n    "launch_info"."Mission",\n    "launch_info"."Notes",\n    "launch_info"."OrbPay",\n    "launch_info"."Platform",\n    "launch_info"."Range",\n    "launch_info"."RangeFlag",\n    "launch_info"."Variant")\nSELECT\n    "datasource_launch_info_base"."launch_tag" as "launch_tag",\n    "datasource_launch_info_base"."launch_jd" as "launch_jd",\n    "datasource_launch_info_base"."vehicle_name" as "vehicle_name",\n    "datasource_launch_info_base"."vehicle_variant" as "vehicle_variant",\n    "datasource_launch_info_base"."flight_id" as "flight_id",\n    "datasource_launch_info_base"."flight" as "flight",\n    "datasource_launch_info_base"."mission" as "mission",\n    "datasource_launch_info_base"."flight_code" as "flight_code",\n    "datasource_launch_info_base"."platform_code" as "platform_code",\n    "datasource_launch_info_base"."site_key" as "site_key",\n    "datasource_launch_info_base"."launch_pad" as "launch_pad",\n    "datasource_launch_info_base"."ascent_site" as "ascent_site",\n    "datasource_launch_info_base"."ascent_pad" as "ascent_pad",\n    "datasource_launch_info_base"."apogee" as "apogee",\n    "datasource_launch_info_base"."apo_flag" as "apo_flag",\n    "datasource_launch_info_base"."range" as "range",\n    "datasource_launch_info_base"."range_flag" as "range_flag",\n    "datasource_launch_info_base"."dest" as "dest",\n    "datasource_launch_info_base"."orb_pay" as "orb_pay",\n    "datasource_launch_info_base"."org_code" as "org_code",\n    "datasource_launch_info_base"."_launch_code" as "_launch_code",\n    "datasource_launch_info_base"."fail_code" as "fail_code",\n    "datasource_launch_info_base"."category" as "category",\n    "datasource_launch_info_base"."lt_cite" as "lt_cite",\n    "datasource_launch_info_base"."cite" as "cite",\n    "datasource_launch_info_base"."notes" as "notes"\nFROM\n    "datasource_launch_info_base"\nORDER BY \n    CASE\n\tWHEN "datasource_launch_info_base"."launch_tag" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (100)',
    },
    {
      check_type: 'rowcount',
      expected: 'equal_max_platform_code',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_platform_info_base as (\nSELECT\n    count(distinct "platform_platform_info"."Code") as "grain_check_platform_code"\nFROM\n    "platform_info" as "platform_platform_info")\nSELECT\n    "datasource_platform_info_base"."grain_check_platform_code" as "grain_check_platform_code"\nFROM\n    "datasource_platform_info_base"\nORDER BY \n    CASE\n\tWHEN "datasource_platform_info_base"."grain_check_platform_code" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (1)',
    },
    {
      check_type: 'rowcount',
      expected: 'equal_max_vehicle_name',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_lv_info_base as (\nSELECT\n    count(distinct "vehicle_lv_info"."LV_Name") as "grain_check_vehicle_name"\nFROM\n    "lv_info" as "vehicle_lv_info")\nSELECT\n    "datasource_lv_info_base"."grain_check_vehicle_name" as "grain_check_vehicle_name"\nFROM\n    "datasource_lv_info_base"\nORDER BY \n    CASE\n\tWHEN "datasource_lv_info_base"."grain_check_vehicle_name" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (1)',
    },
    {
      check_type: 'rowcount',
      expected: 'equal_max_vehicle_variant',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_lv_info_base as (\nSELECT\n    count(distinct "vehicle_lv_info"."LV_Variant") as "grain_check_vehicle_variant"\nFROM\n    "lv_info" as "vehicle_lv_info")\nSELECT\n    "datasource_lv_info_base"."grain_check_vehicle_variant" as "grain_check_vehicle_variant"\nFROM\n    "datasource_lv_info_base"\nORDER BY \n    CASE\n\tWHEN "datasource_lv_info_base"."grain_check_vehicle_variant" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (1)',
    },
    {
      check_type: 'rowcount',
      expected: 'equal_max_site_key',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_launch_sites_base as (\nSELECT\n    count(distinct "site_launch_sites"."Site") as "grain_check_site_key"\nFROM\n    "launch_sites" as "site_launch_sites")\nSELECT\n    "datasource_launch_sites_base"."grain_check_site_key" as "grain_check_site_key"\nFROM\n    "datasource_launch_sites_base"\nORDER BY \n    CASE\n\tWHEN "datasource_launch_sites_base"."grain_check_site_key" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (1)',
    },
    {
      check_type: 'rowcount',
      expected: 'equal_max_org_code',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_organizations_base as (\nSELECT\n    count(distinct "org_organizations"."Code") as "grain_check_org_code"\nFROM\n    "organizations" as "org_organizations")\nSELECT\n    "datasource_organizations_base"."grain_check_org_code" as "grain_check_org_code"\nFROM\n    "datasource_organizations_base"\nORDER BY \n    CASE\n\tWHEN "datasource_organizations_base"."grain_check_org_code" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (1)',
    },
    {
      check_type: 'rowcount',
      expected: 'equal_max_launch_tag',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_launch_info_base as (\nSELECT\n    count(distinct "launch_info"."Launch_Tag") as "grain_check_launch_tag"\nFROM\n    "launch_info")\nSELECT\n    "datasource_launch_info_base"."grain_check_launch_tag" as "grain_check_launch_tag"\nFROM\n    "datasource_launch_info_base"\nORDER BY \n    CASE\n\tWHEN "datasource_launch_info_base"."grain_check_launch_tag" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (1)',
    },
    {
      check_type: 'rowcount',
      expected: 'equal_max_launch_tag',
      result: null,
      ran: false,
      query:
        '\nWITH \ndatasource_launch_info_base as (\nSELECT\n    count(distinct "launch_info"."Launch_Tag") as "grain_check_launch_tag"\nFROM\n    "launch_info")\nSELECT\n    "datasource_launch_info_base"."grain_check_launch_tag" as "grain_check_launch_tag"\nFROM\n    "datasource_launch_info_base"\nORDER BY \n    CASE\n\tWHEN "datasource_launch_info_base"."grain_check_launch_tag" is null THEN 1\n\tELSE 0\n\tEND desc\nLIMIT (1)',
    },
    {
      check_type: 'logical',
      expected: null,
      result:
        "(ConceptModelValidationError(...), 'Concept local.agency is a root concept but has no datasources bound')",
      ran: true,
      query: '',
    },
  ],
  error: null,
  label: 'default',
}

export default defineComponent({
  name: 'DataValidationComponent',

  props: {
    testData: {
      type: Object as PropType<TestData>,
      required: true,
      default: sampleTestData,
    },
  },

  setup(props) {
    const isRunningTests = ref(false)

    // Computed properties
    const allTestsPassed = computed(() => {
      const ranTests = props.testData.generated_output.filter((test) => test.ran)
      return ranTests.length > 0 && ranTests.every((test) => test.result === null)
    })

    // Methods
    const getTestDisplayName = (test: TestResult): string => {
      if (test.expected) {
        return `${test.check_type}: ${test.expected}`
      }
      return test.check_type
    }

    const getTestStatusClass = (test: TestResult): string => {
      if (!test.ran) return 'pending'
      return test.result === null ? 'passed' : 'failed'
    }

    const getStatusText = (test: TestResult): string => {
      if (!test.ran) return 'Not Run'
      return test.result === null ? 'Passed' : 'Failed'
    }

    const getStatusTextClass = (test: TestResult): string => {
      if (!test.ran) return 'status-pending'
      return test.result === null ? 'status-passed' : 'status-failed'
    }

    const formatQuery = (query: string): string => {
      // Trim whitespace and limit display length for preview
      const trimmed = query.trim()
      if (trimmed.length > 200) {
        return trimmed.substring(0, 200) + '...'
      }
      return trimmed
    }

    const runSingleTest = async (index: number) => {
      // Placeholder for running a single test
      console.log(`Running test ${index}`)
      // TODO: Implement test execution logic
    }

    const runAllTests = async () => {
      if (isRunningTests.value) return

      isRunningTests.value = true

      try {
        // Placeholder for running all tests
        console.log('Running all tests')
        // TODO: Implement test execution logic

        // Simulate test execution delay
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        console.error('Error running tests:', error)
      } finally {
        isRunningTests.value = false
      }
    }

    return {
      isRunningTests,
      allTestsPassed,
      getTestDisplayName,
      getTestStatusClass,
      getStatusText,
      getStatusTextClass,
      formatQuery,
      runSingleTest,
      runAllTests,
    }
  },
})
</script>

<style scoped>
.debug-container {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.section-header {
  font-size: 1.2em;
  font-weight: bold;
  padding: 10px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
}

.text-small {
  font-size: 0.8em;
  font-weight: 500;
}

.text-faint {
  color: var(--text-muted);
}

.test-details-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 40%;
  border: 1px solid var(--border-color);
  overflow-y: auto;
}

.tests-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 60%;
  border-right: 1px solid var(--border-color);
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  overflow: hidden;
}

.validation-info {
  padding: 15px;
  border-bottom: 1px solid var(--border-color);
}

.info-item {
  margin-bottom: 10px;
}

.sql-snippet {
  background-color: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.9em;
}

.error-text {
  color: #f44336;
  font-weight: 500;
}

.columns-section {
  padding: 15px;
  border-bottom: 1px solid var(--border-color);
}

.columns-section h3 {
  margin: 0 0 10px 0;
  font-size: 1.1em;
}

.columns-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.column-item {
  padding: 8px;
  background-color: rgba(0, 0, 0, 0.02);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.column-name {
  font-weight: bold;
  margin-bottom: 4px;
}

.column-details {
  display: flex;
  gap: 10px;
  font-size: 0.9em;
}

.column-datatype {
  color: #2196f3;
  font-weight: 500;
}

.column-purpose {
  color: var(--text-muted);
}

.column-description {
  color: var(--text-muted);
  font-style: italic;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.run-all-button {
  padding: 5px 15px;
  background-color: #2196f3;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 0.9em;
}

.run-all-button:hover:not(:disabled) {
  background-color: #0d8aee;
}

.run-all-button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.tests-list {
  overflow-y: auto;
  height: 100%;
}

.test-item {
  padding: 15px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s;
}

.test-item:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.test-item.passed {
  background-color: rgba(76, 175, 80, 0.1);
  border-left: 4px solid #4caf50;
}

.test-item.failed {
  background-color: rgba(244, 67, 54, 0.1);
  border-left: 4px solid #f44336;
}

.test-item.pending {
  background-color: rgba(255, 193, 7, 0.1);
  border-left: 4px solid #ffc107;
}

.test-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.test-name {
  font-weight: bold;
  font-size: 1.1em;
}

.test-status-indicator {
  font-size: 1.2em;
}

.pass-indicator {
  color: #4caf50;
}

.fail-indicator {
  color: #f44336;
}

.pending-indicator {
  color: #ffc107;
}

.test-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 0.9em;
}

.status-passed {
  color: #4caf50;
  font-weight: 500;
}

.status-failed {
  color: #f44336;
  font-weight: 500;
}

.status-pending {
  color: #ffc107;
  font-weight: 500;
}

.test-error {
  background-color: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.3);
  border-radius: 4px;
  padding: 8px;
  margin-top: 8px;
  font-size: 0.9em;
  color: #c62828;
}

.query-preview {
  margin-top: 8px;
  font-size: 0.85em;
}

.query-text {
  background-color: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 8px;
  margin-top: 4px;
  font-family: monospace;
  font-size: 0.9em;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 100px;
  overflow-y: auto;
}
</style>
