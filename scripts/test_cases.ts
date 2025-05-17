import { BenchMarkQuery } from './types'
const TEST_CASES: BenchMarkQuery[] = [
  {
    id: 'test-basic-query',
    prompt: 'Analyze names in the southern USA in the 80s; find unique and common ones.',
    imports: ['names'],
    expected_keywords: [],
  },
  {
    id: 'test-star-wars',
    prompt: 'Create a report on the impact of Star Wars on baby names.',
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
  {
    id: 'test-home-vs-away',
    prompt: 'Which team has the biggest difference between win rate at home and away?',
    imports: ['game_tall'],
    data: ['team'],
    expected_keywords: [],
  },
]

export default TEST_CASES
