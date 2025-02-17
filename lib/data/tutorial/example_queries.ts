export const QUERY_LINE_ITEM = `
# trilogy models run on imports to reuse logic
import lineitem as line_item;

# you can define new concepts in line 
auto discounted_price <- line_item.extended_price * (1-line_item.discount); #the discounted price is off the extended privce
auto charge_price <- discounted_price * (1+line_item.tax); #charged price includes taxes

# and then use them in queries
# use the run button or ctrl-enter to run this
WHERE line_item.ship_date <= '1998-12-01'::date 
SELECT
    line_item.return_flag,
    line_item.line_status,
    sum(line_item.quantity)-> sum_qty,
    sum(line_item.extended_price)-> base_price,
    sum(discounted_price) as sum_disc_price,
    sum(charge_price) as sum_charge,
    avg(line_item.quantity)-> avg_qty,
    avg(line_item.extended_price)-> avg_price,
    avg(line_item.discount)->discount,
    # you can reuse a concept immediately in the same query
    avg_price-discounted_price as avg_disc,
    count(line_item.id) as count_order
ORDER BY   
    line_item.return_flag desc,
    line_item.line_status desc
;

# check out the generated sql
# the second tutorial editor will have a more complicated joins scheme
# use the browser on the left to navigate to the other editor under the demo connection
`

export const QUERY_JOIN = `
import part as part;

WHERE part.supplier.nation.region.name = 'EUROPE'
SELECT
	part.supplier.account_balance,
	part.supplier.name,
	part.supplier.nation.name,
	part.id,
	part.manufacturer,
	part.supplier.address,
	part.supplier.phone,
	part.supplier.comment,
	--part.supply_cost,
	min(part.supply_cost) by part.id as min_part_cost,
HAVING
	part.supply_cost = min_part_cost
ORDER BY
	part.id asc;
`