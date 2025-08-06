export const SCORE_EQ_100 = ['==', ['get', 'score'], 100];
export const SCORE_97_99 = ['all',
  ['>=', ['get', 'score'], 97],
  ['<=', ['get', 'score'], 99],
];
export const SCORE_90_96 = ['all',
  ['>=', ['get', 'score'], 90],
  ['<=', ['get', 'score'], 96],
];
// guard null first, then <25
export const SCORE_LT_25 = ['all',
  ['!=', ['get', 'score'], null],
  ['<',  ['get', 'score'], 25],
];
// guard null first, then <90
export const SCORE_LT_90 = ['all',
  ['!=', ['get', 'score'], null],
  ['<',  ['get', 'score'], 90],
];
export const SCORE_NULL  = ['==', ['get', 'score'], null];

export function getCircleColorExpression() {
  return [
    'case',
      SCORE_EQ_100, '#0f9d58',
      SCORE_97_99, '#34a853',
      SCORE_90_96, '#fbbc05',
      SCORE_LT_25, '#442f9cff',
      SCORE_LT_90, '#ea4335',
      SCORE_NULL,  '#657786',
    /* fallback */ '#657786'
  ];
}
