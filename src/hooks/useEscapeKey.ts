import { useEffect } from 'react';

/** Escapeキーが押されたときに onClose を呼ぶ。ダイアログ系のオーバーレイで使う。 */
export function useEscapeKey(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
}
