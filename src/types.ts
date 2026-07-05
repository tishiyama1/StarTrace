export interface Point {
  x: number;
  y: number;
}

export interface Constellation {
  id: string;
  nameJa: string;
  nameEn: string;
  latinName: string;
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
