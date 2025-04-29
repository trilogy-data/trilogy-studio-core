import { Article, Paragraph } from './docTypes.ts'

export const functionPage = new Article('Functions', [
      new Paragraph(
        'Defining Functions',
        'Functions are reusable snippets of code. Functions are defined using the def keyword and have a list of arguments and are mapped to an expression. Any argument alias will be locally scoped within the function, but external concepts can be referenced as well. The below function will multiple the input concept by itself and then by whatever the value of the global scale_factor is. Functions are called with the @ prefix.',
      ),
      new Paragraph(
        'Example',
        `const scale_factor<-2;\ndef square_scale(x) -> x * x *scale_factor;\n\nSELECT\n    number,\n    @square_scale(number) AS squared;`,
        'code',
      ),
      new Paragraph('Defining Functions', 'Functions may have optional defaults'),
      new Paragraph(
        'Example',
        `def pretty_percent(x, digits=2) ->  round(x*100, digits)::string || '%';\nconst number<-.4555;\n\nSELECT\n    number,\n  @pretty_percent(number) AS percent\n  @pretty_percent(number,3) AS three_percent;`,
        'code',
      ),
    ])