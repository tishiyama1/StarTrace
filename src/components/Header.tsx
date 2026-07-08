interface HeaderProps {
  hint: string | null;
}

export function Header({ hint }: HeaderProps) {
  return (
    <header className="app-header">
      <h1 className="app-header__title">
        <span className="app-header__title-main">⭐ StarTrace</span>
        <span className="app-header__title-sub">ほしのなぞりがき</span>
      </h1>
      <p className="app-header__subtitle">
        {hint ?? 'ゆびで よぞらを なぞって、せいざを みつけよう!'}
      </p>
    </header>
  );
}
