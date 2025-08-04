export const SCORE_EQ_100 = ['==', ['get', 'Score_Recent'], 100]
export const SCORE_97_99 = ['all',
  ['>=', ['get', 'Score_Recent'], 97],
  ['<=', ['get', 'Score_Recent'], 99],
]
export const SCORE_90_96 = ['all',
  ['>=', ['get', 'Score_Recent'], 90],
  ['<=', ['get', 'Score_Recent'], 96],
]
export const SCORE_LT_90 = ['all',
  ['<', ['get', 'Score_Recent'], 90],
  ['!=', ['get', 'Score_Recent'], null],
]
export const SCORE_NULL = ['==', ['get', 'Score_Recent'], null]

// build MapLibre expression from those
export function getCircleColorExpression() {
  return [
    'case',
    SCORE_EQ_100, '#0f9d58',
    SCORE_97_99, '#34a853',
    SCORE_90_96, '#fbbc05',
    SCORE_LT_90, '#ea4335',
    SCORE_NULL, '#5865f2',
    // fallback
    '#657786',
  ]
}
