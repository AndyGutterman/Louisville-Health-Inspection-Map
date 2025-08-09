export const SCORE_EQ_100 = ['==', ['get', 'score'], 100];
export const SCORE_96_99 = ['all',
  ['>=', ['get', 'score'], 96],
  ['<=', ['get', 'score'], 99],
];
export const SCORE_90_95 = ['all',
  ['>=', ['get', 'score'], 90],
  ['<=', ['get', 'score'], 95],
];
export const SCORE_LT_25 = ['all',
  ['!=', ['get', 'score'], null],
  ['<',  ['get', 'score'], 25],
];
export const SCORE_LT_90 = ['all',
  ['!=', ['get', 'score'], null],
  ['<',  ['get', 'score'], 90],
];
export const SCORE_NULL  = ['==', ['get', 'score'], null];

export function getCircleColorExpression() {
  return [
    'case',
      SCORE_EQ_100, '#0f9d58',
      SCORE_96_99, '#34a853',
      SCORE_90_95, '#fbbc05',
      SCORE_LT_25, '#442f9cff',
      SCORE_LT_90, '#ea4335',
      SCORE_NULL,  '#657786',
    '#657786'
  ];
}

export function buildBandsFromCurrentStyle() {
  const GET = ['get', 'score'];

  const greenExpr   = ['any', SCORE_EQ_100, SCORE_96_99];                     // 97-100
  const yellowExpr  = SCORE_90_95;                                            // 90-96
  const redExpr     = ['all', ['!=', GET, null], ['>=', GET, 25], ['<', GET, 90]]; // 25-89
  const veryLowExpr = ['all', SCORE_LT_25, ['!=', GET, 0]];                   // 1-24
  const zeroExpr    = ['==', GET, 0];                                         // 0
  const nullExpr    = SCORE_NULL;                                             // null

  return [
    { key: 'green',   label: 'Green (96-100)',  expr: greenExpr },
    { key: 'yellow',  label: 'Yellow (90-95)',  expr: yellowExpr },
    { key: 'red',     label: 'Red (25-89)',     expr: redExpr },
    { key: 'verylow', label: 'Very low (1-24)', expr: veryLowExpr },
    { key: 'zero',    label: 'Zero (0)',        expr: zeroExpr },
    { key: 'null',    label: 'Unscored (null)', expr: nullExpr },
  ];
}
