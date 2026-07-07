interface NotFoundOverlayProps {
  onRetry: () => void;
  onOpenZukan: () => void;
}

/**
 * なぞった形がどの星座にも十分似ていなかったとき(マッチ度が閾値未満)の表示。
 * 否定的になりすぎず、再挑戦とヒント(図鑑)へ誘導する。
 */
export function NotFoundOverlay({ onRetry, onOpenZukan }: NotFoundOverlayProps) {
  return (
    <div className="result-panel result-panel--notfound">
      <div className="notfound__emoji" aria-hidden="true">
        🔭
      </div>
      <h2 className="notfound__title">うーん、みつからないね…</h2>
      <p className="notfound__text">
        よぞらに その かたちの せいざは なさそう。
        <br />
        ずかんの ヒントを みて、もういちど ゆっくり なぞってみよう!
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
