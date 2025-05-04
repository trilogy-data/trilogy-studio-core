import { BenchMarkQuery } from './types'
const TEST_CASES: BenchMarkQuery[] = [
  {
    id: 'test-basic-query',
    prompt: 'Analyze names in the southern USA in the 80s; find unique and common ones.',
    imports: ['names'],
    expected_keywords: [],
  },
  {
    id: 'test-abstract-question',
    prompt: 'Do teams with colors associated with aggression win more games?',
    imports: ['game_tall'],
    data: ['team'],
    expected_keywords: [],
  },
]

export default TEST_CASES
