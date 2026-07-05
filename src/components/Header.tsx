interface HeaderProps {
  hint: string | null;
}

export function Header({ hint }: HeaderProps) {
  return (
    <header className="app-header">
      <h1 className="app-header__title">⭐ StarTrace ほしのなぞりがき</h1>
      <p className="app-header__subtitle">
        {hint ?? 'ゆびで よぞらを なぞって、せいざを みつけよう!'}
      </p>
    </header>
  );
}
