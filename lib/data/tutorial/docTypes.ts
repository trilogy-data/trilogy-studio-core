export interface TutorialPrompt {
  title: string
  description: string
  validationFn: (results: any) => boolean
  example?: string
  hints?: string[]
}

export class DocData {
  prompts?: TutorialPrompt[] | undefined
  context?: string | undefined
}
export class Paragraph {
  title: string
  content: string
  type: string | null
  data: DocData
  constructor(
    title: string,
    content: string,
    type: string | null = null,
    data: object | null = null,
  ) {
    this.title = title
    this.content = content
    this.type = type
    this.data = data || {}
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
