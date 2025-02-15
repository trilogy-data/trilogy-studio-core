export const QUERY_LINE_ITEM = `import lineitem as line_item;

auto discounted_price <- line_item.extended_price * (1-line_item.discount);
auto charge_price <- discounted_price * (1+line_item.tax);

where line_item.ship_date <= '1998-12-01'::date 
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
    count(line_item.id) as count_order
order BY    
    line_item.return_flag desc,
    line_item.line_status desc
;`