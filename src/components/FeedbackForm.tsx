import { useState } from 'react';
import { submitFeedback, type FeedbackCategory } from '../lib/api';

interface FeedbackFormProps {
  clientId: string;
  onClose: () => void;
}

const MAX_LENGTH = 500;

const CATEGORIES: { key: FeedbackCategory; label: string; emoji: string }[] = [
  { key: 'star', label: 'ほしい せいざ', emoji: '⭐' },
  { key: 'visual', label: 'みため・えんしゅつ', emoji: '🎨' },
  { key: 'bug', label: 'うまく うごかない', emoji: '🐛' },
  { key: 'other', label: 'そのほか', emoji: '💬' },
];

const PLACEHOLDER: Record<FeedbackCategory, string> = {
  star: 'れい: ドラゴンざが ほしい! / ◯◯ざも つくって!',
  visual: 'れい: てんのがわを もっと みたい / ロケットを とばして!',
  bug: 'れい: ボタンが おせない / えが ずれる',
  other: 'おもったこと を じゆうに かいてね',
};

type Status = 'editing' | 'sending' | 'done' | 'error';

export function FeedbackForm({ clientId, onClose }: FeedbackFormProps) {
  const [category, setCategory] = useState<FeedbackCategory>('star');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('editing');

  const trimmed = message.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_LENGTH && status !== 'sending';

  const handleSubmit = async () => {
    if (!canSend) return;
    setStatus('sending');
    const ok = await submitFeedback(clientId, trimmed, category);
    setStatus(ok ? 'done' : 'error');
  };

  return (
    <div className="feedback" role="dialog" aria-label="いけん・かんそう">
      <div className="feedback__header">
        <h2 className="feedback__title">💌 いけんを おくる</h2>
        <button type="button" className="feedback__close" onClick={onClose} aria-label="とじる">
          ✕
        </button>
      </div>

      {status === 'done' ? (
        <div className="feedback__thanks">
          <div className="feedback__thanks-emoji" aria-hidden="true">🎉</div>
          <p className="feedback__thanks-text">おくってくれて ありがとう!</p>
          <p className="feedback__thanks-sub">きみの いけんで もっと たのしくなるよ。</p>
          <button type="button" className="feedback__primary" onClick={onClose}>
            とじる
          </button>
        </div>
      ) : (
        <div className="feedback__body">
          <p className="feedback__lead">
            「◯◯ざが ほしい」「てんのがわが みたい」など、なんでも おしえてね!
          </p>

          <div className="feedback__categories">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`feedback__chip${category === c.key ? ' feedback__chip--active' : ''}`}
                aria-pressed={category === c.key}
                onClick={() => setCategory(c.key)}
              >
                <span aria-hidden="true">{c.emoji}</span> {c.label}
              </button>
            ))}
          </div>

          <textarea
            className="feedback__textarea"
            value={message}
            maxLength={MAX_LENGTH}
            placeholder={PLACEHOLDER[category]}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
          <div className="feedback__meta">
            <span className="feedback__count">
              {trimmed.length}/{MAX_LENGTH}
            </span>
          </div>

          {status === 'error' && (
            <p className="feedback__error">おくれなかったよ。もういちど ためしてね。</p>
          )}

          <button
            type="button"
            className="feedback__primary"
            disabled={!canSend}
            onClick={handleSubmit}
          >
            {status === 'sending' ? 'おくっているよ…' : 'おくる'}
          </button>
          <p className="feedback__privacy">
            なまえや れんらくさきは あつめないよ(あんしんして つかってね)。
          </p>
        </div>
      )}
    </div>
  );
}
