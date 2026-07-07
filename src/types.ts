export interface Point {
  x: number;
  y: number;
}

/**
 * 星座のカテゴリ。
 * - `real`: 実際に夜空にある星座
 * - `fun`: このアプリのオリジナルの「おはなしの星座」(非実在のふざけた星座)
 */
export type ConstellationCategory = 'real' | 'fun';

export interface Constellation {
  id: string;
  nameJa: string;
  nameEn: string;
  latinName: string;
  /** 実在の星座か、オリジナルの「おはなしの星座」か。 */
  category: ConstellationCategory;
  /** 図鑑カードなどに添える絵文字。 */
  emoji: string;
  /** 未発見の図鑑カードに出す、なぞる形のヒント(答えは明かしすぎない範囲で)。 */
  hint: string;
  /** 結果画面・図鑑で表示する、子供向けの簡単な星座紹介文。 */
  description: string;
  /** なぞる順に星を直線で結んだ座標列(1ストローク分)。任意単位の 0〜100 相対座標。 */
  path: Point[];
}

export interface MatchResult {
  constellation: Constellation;
  /** 0〜100 のマッチ度 */
  score: number;
  /** 正規化空間での平均距離(デバッグ・テスト用) */
  distance: number;
}
