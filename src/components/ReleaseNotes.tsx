import { RELEASE_NOTES } from '../data/releaseNotes';

interface ReleaseNotesProps {
  onClose: () => void;
}

export function ReleaseNotes({ onClose }: ReleaseNotesProps) {
  return (
    <div className="releasenotes" role="dialog" aria-label="アップデート">
      <div className="releasenotes__header">
        <h2 className="releasenotes__title">🆕 アップデート</h2>
        <button
          type="button"
          className="releasenotes__close"
          onClick={onClose}
          aria-label="とじる"
        >
          ✕
        </button>
      </div>

      <div className="releasenotes__body">
        <ol className="releasenotes__list">
          {RELEASE_NOTES.map((note) => (
            <li key={note.date} className="release">
              <div className="release__head">
                <span className="release__emoji" aria-hidden="true">
                  {note.emoji}
                </span>
                <div className="release__titles">
                  <h3 className="release__title">{note.title}</h3>
                  <span className="release__date">
                    {note.date}
                    {note.version ? ` ・ ${note.version}` : ''}
                  </span>
                </div>
              </div>
              <ul className="release__items">
                {note.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
