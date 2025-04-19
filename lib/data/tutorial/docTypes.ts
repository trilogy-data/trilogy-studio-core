export class Paragraph {
  title: string
  content: string
  type: string | null
  constructor(title: string, content: string, type: string | null = null) {
    this.title = title
    this.content = content
    this.type = type
  }
}

export class Article {
  title: string
  paragraphs: Paragraph[]
  displayName: string | undefined

  constructor(title: string, paragraphs: Paragraph[], displayName: string | undefined = undefined) {
    this.title = title
    this.paragraphs = paragraphs
    this.displayName = displayName
  }
}

export class DocumentationNode {
  title: string
  articles: Article[]

  constructor(title: string, articles: Article[]) {
    this.title = title
    this.articles = articles
  }
}
