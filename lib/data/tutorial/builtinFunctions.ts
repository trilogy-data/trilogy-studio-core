import { Article, Paragraph } from './docTypes.ts'

export const builtinFunctions= new Article('Functions', [
      new Paragraph(
        'Defining Functions',
        'Trilogy has a number of built in functions, which closely map to standard sql functions.' ,
      ),
      new Paragraph(
        'Example',
        `select sum(revenue) as total_revenue, count_distinct(customer_id) as unique_customers;`,
        'code',
      ),
      new Paragraph(
        'Defining Functions',
        'Below is a list of builtin functions as a reference.' ,
      ),
      // TODO - have a description and an example for each builtin function
      new Paragraph(
        'SUM',
        'Sum is an aggregate function taking a single argument. It returns the sum of all values in the group. As an aggregate function, it inherits the grouping of the select and can optionally be grouped independently by a specific field list.',
      ),
      new Paragraph(
        'Example',
        `select sum(revenue) as customer_revenue, sum(revenue) by state as state_revenue ,customer.id;`,
        'code',
      ),
    ])