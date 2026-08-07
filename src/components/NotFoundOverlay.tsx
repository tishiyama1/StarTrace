interface NotFoundOverlayProps {
  /** 「みつからないね」判定時の matchResult.score(0〜100)。指定が無ければ現状の文言のみ表示する */
  score?: number;
  onRetry: () => void;
  onOpenZukan: () => void;
}

/** 「おしい」寄りの文言を出す下限スコア(NOT_FOUND_SCORE_THRESHOLD=65 未満だが近い範囲) */
const CLOSE_SCORE_THRESHOLD = 55;

/**
 * なぞった形がどの星座にも十分似ていなかったとき(マッチ度が閾値未満)の表示。
 * 否定的になりすぎず、再挑戦とヒント(図鑑)へ誘導する。
 * score が閾値に近い「おしい」場合は、大きく外れている場合と文言を出し分ける。
 */
export function NotFoundOverlay({ score, onRetry, onOpenZukan }: NotFoundOverlayProps) {
  const isClose = score !== undefined && score >= CLOSE_SCORE_THRESHOLD;
  return (
    <div className="result-panel result-panel--notfound">
      <div className="notfound__emoji" aria-hidden="true">
        🔭
      </div>
      <h2 className="notfound__title">
        {isClose ? 'おしい!もうちょっとだ!' : 'うーん、みつからないね…'}
      </h2>
      <p className="notfound__text">
        {isClose ? (
          <>
            いいかんじの かたちだったよ!
            <br />
            もうすこし おおきく、ゆっくり なぞると みつかるかも!
          </>
        ) : (
          <>
            よぞらに その かたちの せいざは なさそう。
            <br />
            ずかんの ヒントを みて、もういちど ゆっくり なぞってみよう!
          </>
        )}
      </p>

      <div className="result-panel__actions">
        <button type="button" className="result-panel__retry" onClick={onRetry}>
          もういちど なぞる
        </button>
        <button type="button" className="result-panel__zukan" onClick={onOpenZukan}>
          💡 ヒントを みる
        </button>
      </div>
    </div>
  );
}
