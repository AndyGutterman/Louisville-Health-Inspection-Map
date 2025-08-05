// exactly one feature property: score
export const SCORE_EQ_100 = ['==', ['get', 'score'], 100];
export const SCORE_97_99 = ['all',
  ['>=', ['get', 'score'], 97],
  ['<=', ['get', 'score'], 99],
];
export const SCORE_90_96 = ['all',
  ['>=', ['get', 'score'], 90],
  ['<=', ['get', 'score'], 96],
];
export const SCORE_LT_25 = ['all',
  ['<', ['get', 'score'], 25],
  ['!=', ['get', 'score'], null],
];
export const SCORE_LT_90 = ['all',
  ['<', ['get', 'score'], 90],
  ['!=', ['get', 'score'], null],
];

export const SCORE_NULL  = ['==', ['get', 'score'], null];

export function getCircleColorExpression() {
  return [
    'case',
      SCORE_EQ_100, '#0f9d58',   // dark green
      SCORE_97_99, '#34a853',    // medium green
      SCORE_90_96, '#fbbc05',    // yellow
      SCORE_LT_25, '#442f9cff',  // purple (scores less than 25, likely erroneous)
      SCORE_LT_90, '#ea4335',    // red
      SCORE_NULL,  '#657786',    // gray for no score
    /* fallback */ '#657786'
  ];
}