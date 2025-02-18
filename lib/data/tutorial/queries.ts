export const CUSTOMER_CONTENT = `
import nation as nation;

key id int;
property id.name string;
property id.address string;
property id.phone string;
property id.account_balance float;
property id.market_segment string;
property id.comment string;

datasource customers (
    c_custkey:id,
    c_name:name,
    c_address:address,
    c_nationkey:nation.id,
    c_phone:phone,
    c_acctbal:account_balance,
    c_mktsegment:market_segment,
    c_comment:comment
)
grain (id)
address \`https://shell.duckdb.org/data/tpch/0_01/parquet/customer.parquet\`;
`

export const ORDER_CONTENT = `
import customer as customer;

key id int; #order key
property id.status string;
property id.total_price float;
property id.date date;
property id.priority string;
property id.clerk string;
property id.ship_priority string;
property id.comment string;

datasource orders(
    o_orderkey:id,
    o_custkey:customer.id,
    o_orderstatus: status,
    o_totalprice: total_price,
    o_orderdate: date,
    o_orderpriority:priority,
    o_clerk:clerk,
    o_comment:comment,
    o_shippriority:ship_priority
)
grain (id)
address \`https://shell.duckdb.org/data/tpch/0_01/parquet/order.parquet\`;
`

export const NATION_CONTENT = `
import region as region;

key id int;
property id.name string;
property id.comment string;

datasource nation (
    n_nationkey:id,
    n_name:name,
    n_regionkey:region.id,
    n_comment:comment
)
grain(id)
address \`https://shell.duckdb.org/data/tpch/0_01/parquet/nation.parquet\`;
`

export const REGION_CONTENT = `
key id int;
property id.name string;
property id.comment string;

datasource region (
    r_regionkey:id,
    r_name:name,
    r_comment:comment
)
grain(id)
address \`https://shell.duckdb.org/data/tpch/0_01/parquet/region.parquet\`;
`

export const PART_CONTENT = `
import supplier as supplier;

key id int;
property id.name string;
property id.manufacturer string;
property id.brand string;
property id.type string;
property id.size int;
property id.container string;
property id.retail_price float;
property id.comment string;

datasource part (
    p_partkey:id,
    p_name:name,
    p_mfgr: manufacturer,
    p_brand:brand,
    p_type:type,
    p_size:size,
    p_container:container,
    p_retailprice:retail_price,
    p_comment:comment
)
grain(id)
address \`https://shell.duckdb.org/data/tpch/0_01/parquet/part.parquet\`;

property <id,supplier.id>.available_quantity float;
property <id,supplier.id>.supply_cost float; 
property <id,supplier.id>.supplier_comment string;

datasource partsupp (
    ps_partkey:id,
    ps_suppkey:supplier.id,
    ps_availqty: available_quantity,
    ps_supplycost:supply_cost,
    ps_comment:supplier_comment
)
grain (id, supplier.id)
address \`https://shell.duckdb.org/data/tpch/0_01/parquet/partsupp.parquet\`;
`

export const SUPPLIER_CONTENT = `
import nation as nation;
key id int;
property id.name string;
property id.address string;
property id.phone string;
property id.account_balance string;
property id.comment string;

datasource supplier (
    s_suppkey:id,
    s_name:name,
    s_address:address,
    s_nationkey:nation.id,
    s_phone:phone,
    s_acctbal:account_balance,
    s_comment:comment
)
grain (id)
address \`https://shell.duckdb.org/data/tpch/0_01/parquet/supplier.parquet\`;
`

export const LINE_ITEM_CONTENT = `
import order as order;
import supplier as supplier;
import part as part;

key id int;
property id.quantity float;
property id.extended_price float;
property id.discount float;
property id.tax float;
property id.return_flag string;
property id.line_status string;
property id.ship_date date;
property id.commit_date date;
property id.receipt_date date;
property id.ship_instruct string;
property id.ship_mode string;
property id.comment string;


datasource lineitem(
    l_orderkey: order.id,
    l_partkey: part.id,
    l_suppkey: supplier.id,
    l_linenumber:id,
    l_quantity:quantity,
    l_extendedprice: extended_price,
    l_discount:discount,
    l_tax:tax,
    l_returnflag:return_flag,
    l_linestatus: line_status,
    l_shipdate: ship_date,
    l_commitdate: commit_date,
    l_receiptdate:receipt_date,
    l_shipinstruct:ship_instruct,
    l_shipmode: ship_mode,
    l_comment:comment
)
grain(id)
address \`https://shell.duckdb.org/data/tpch/0_01/parquet/lineitem.parquet\`;
`
