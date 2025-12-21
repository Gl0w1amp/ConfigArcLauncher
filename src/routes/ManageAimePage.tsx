import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGamesState } from '../state/gamesStore';
import { AimeEntry } from '../types/manage';
import { applyAimeToActive, deleteAime, getActiveAime, listAimes, saveAime, updateAime } from '../api/manageApi';
import { useToast, ToastContainer } from '../components/common/Toast';
import './ManageAimePage.css';

const normalizeAime = (value: string) => value.replace(/\s+/g, '');
const buildRandomAime = () => {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(20);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => (b % 10).toString()).join('');
  }
  return Array.from({ length: 20 }, () => Math.floor(Math.random() * 10).toString()).join('');
};

// Simple SVG Icons
const Icons = {
  Refresh: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  Plus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Magic: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4 4-4-4"/><path d="m17 21 4-4"/><path d="M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="m15 13-3 3"/><path d="M2 12h4"/><path d="M4 10v4"/><path d="m8 21-4-4 4-4"/><path d="m4 17 4 4"/></svg>,
  Card: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
  Save: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  Pencil: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  X: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Tag: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>,
};

function ManageAimePage() {
  const { t } = useTranslation();
  const { games, activeGameId } = useGamesState();
  const activeGame = useMemo(() => games.find((g) => g.id === activeGameId), [games, activeGameId]);
  const { toasts, showToast } = useToast();

  const [entries, setEntries] = useState<AimeEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [number, setNumber] = useState<string>('');
  const [activeAimeNumber, setActiveAimeNumber] = useState<string | null>(null);
  const [activeAimeName, setActiveAimeName] = useState<string>('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editNumber, setEditNumber] = useState<string>('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const list = await listAimes();
      setEntries(list);
    } catch (err) {
      showToast(t('manage.aime.loadError', { error: String(err) }), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const loadActiveAime = async () => {
    if (!activeGameId) {
      setActiveAimeNumber(null);
      return;
    }
    try {
      const current = await getActiveAime();
      setActiveAimeNumber(current);
    } catch (err) {
      showToast(t('manage.aime.activeLoadError', { error: String(err) }), 'error');
      setActiveAimeNumber(null);
    }
  };

  useEffect(() => {
    loadActiveAime();
  }, [activeGameId]);

  const handleAdd = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast(t('manage.aime.nameRequired'), 'error');
      return;
    }
    const cleaned = normalizeAime(number);
    if (!/^\d{20}$/.test(cleaned)) {
      showToast(t('manage.aime.invalidNumber'), 'error');
      return;
    }
    try {
      await saveAime(trimmedName, cleaned);
      setName('');
      setNumber('');
      await loadEntries();
      showToast(t('manage.aime.addOk'), 'success');
    } catch (err) {
      showToast(t('manage.aime.addError', { error: String(err) }), 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAime(id);
      await loadEntries();
      showToast(t('manage.aime.deleteOk'), 'success');
    } catch (err) {
      showToast(t('manage.aime.deleteError', { error: String(err) }), 'error');
    }
  };

  const handleApply = async (id: string) => {
    if (!activeGameId) {
      showToast(t('manage.aime.noActiveGame'), 'error');
      return;
    }
    try {
      await applyAimeToActive(id);
      await loadActiveAime();
      showToast(t('manage.aime.applyOk'), 'success');
    } catch (err) {
      showToast(t('manage.aime.applyError', { error: String(err) }), 'error');
    }
  };

  const handleSaveCurrent = async () => {
    if (!activeAimeNumber) return;
    const trimmedName = activeAimeName.trim();
    if (!trimmedName) {
      showToast(t('manage.aime.nameRequired'), 'error');
      return;
    }
    try {
      await saveAime(trimmedName, activeAimeNumber);
      setActiveAimeName('');
      await loadEntries();
      showToast(t('manage.aime.addOk'), 'success');
    } catch (err) {
      showToast(t('manage.aime.addError', { error: String(err) }), 'error');
    }
  };

  const handleGenerate = () => {
    setNumber(buildRandomAime());
  };

  const handleEdit = (entry: AimeEntry) => {
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditNumber(entry.number);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditNumber('');
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      showToast(t('manage.aime.nameRequired'), 'error');
      return;
    }
    const cleaned = normalizeAime(editNumber);
    if (!/^\d{20}$/.test(cleaned)) {
      showToast(t('manage.aime.invalidNumber'), 'error');
      return;
    }
    try {
      await updateAime(editingId, trimmedName, cleaned);
      setEditingId(null);
      await loadEntries();
      showToast(t('manage.aime.addOk'), 'success');
    } catch (err) {
      showToast(t('manage.aime.addError', { error: String(err) }), 'error');
    }
  };

  const activeMatch = activeAimeNumber
    ? entries.find((entry) => entry.number === activeAimeNumber)
    : undefined;
  const hasActive = Boolean(activeAimeNumber);

  useEffect(() => {
    if (!activeAimeNumber) return;
    if (activeMatch) return;
    const prefix = activeGame?.name ? `${activeGame.name} ` : '';
    setActiveAimeName(`${prefix}${t('manage.aime.currentDefaultName')}`);
  }, [activeAimeNumber, activeMatch, activeGame?.name, t]);

  const isRainbow = useMemo(
    () => entries.some((e) => {
      const name = e.name.toLowerCase();
      return name === 'imgay' || name === 'jeb_';
    }),
    [entries]
  );
  const isDinnerbone = useMemo(() => entries.some(e => e.name.toLowerCase() === 'dinnerbone'), [entries]);
  const isJohnny = useMemo(() => entries.some(e => e.name.toLowerCase() === 'johnny'), [entries]);
  const isToast = useMemo(() => entries.some(e => e.name.toLowerCase() === 'toast'), [entries]);

  useEffect(() => {
    if (isDinnerbone) {
      document.body.classList.add('dinnerbone-mode');
    } else {
      document.body.classList.remove('dinnerbone-mode');
    }
    if (isJohnny) {
      document.body.classList.add('johnny-mode');
    } else {
      document.body.classList.remove('johnny-mode');
    }
    if (isToast) {
      document.body.classList.add('toast-mode');
    } else {
      document.body.classList.remove('toast-mode');
    }
    if (isRainbow) {
      document.body.classList.add('rainbow-mode');
    } else {
      document.body.classList.remove('rainbow-mode');
    }
    return () => {
      document.body.classList.remove('dinnerbone-mode');
      document.body.classList.remove('johnny-mode');
      document.body.classList.remove('toast-mode');
      document.body.classList.remove('rainbow-mode');
    };
  }, [isDinnerbone, isJohnny, isToast, isRainbow]);

  useEffect(() => {
    if (!isJohnny) return;
    const container = containerRef.current;
    if (!container) return;
    const states = new WeakMap<HTMLButtonElement, { x: number; y: number; vx: number; vy: number }>();
    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const maxSpeed = 14;
    const friction = 0.88;
    const wander = 0.35;
    const forceStrength = 220;
    const padding = 8;
    let rafId = 0;
    let running = true;

    const updateButtons = () => {
      if (!running) return;
      const buttons = container.querySelectorAll<HTMLButtonElement>('button');
      buttons.forEach((button) => {
        const rect = button.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          return;
        }
        const boundaryElement = button.closest('.aime-item') as HTMLElement | null;
        const boundary = boundaryElement || container;
        const boundaryRect = boundary.getBoundingClientRect();
        const bounds = {
          left: boundaryRect.left + padding,
          right: boundaryRect.right - padding,
          top: boundaryRect.top + padding,
          bottom: boundaryRect.bottom - padding,
        };
        const pointerInBounds =
          pointer.x >= bounds.left &&
          pointer.x <= bounds.right &&
          pointer.y >= bounds.top &&
          pointer.y <= bounds.bottom;
        let state = states.get(button);
        if (!state) {
          state = { x: 0, y: 0, vx: 0, vy: 0 };
          states.set(button, state);
        }

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let dx = centerX - pointer.x;
        let dy = centerY - pointer.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 1) {
          dx = 1;
          dy = 0;
          distance = 1;
        }
        if (pointerInBounds) {
          const force = Math.min(3.5, forceStrength / (distance + 40));
          state.vx += (dx / distance) * force;
          state.vy += (dy / distance) * force;
        }
        state.vx += (Math.random() - 0.5) * wander;
        state.vy += (Math.random() - 0.5) * wander;

        const speed = Math.hypot(state.vx, state.vy);
        if (speed > maxSpeed) {
          state.vx = (state.vx / speed) * maxSpeed;
          state.vy = (state.vy / speed) * maxSpeed;
        }

        const nextX = state.x + state.vx;
        const nextY = state.y + state.vy;
        let adjustedX = nextX;
        let adjustedY = nextY;
        const deltaX = nextX - state.x;
        const deltaY = nextY - state.y;

        const nextLeft = rect.left + deltaX;
        const nextRight = rect.right + deltaX;
        const nextTop = rect.top + deltaY;
        const nextBottom = rect.bottom + deltaY;

        if (nextLeft < bounds.left) {
          adjustedX += bounds.left - nextLeft;
          state.vx = Math.abs(state.vx) * 0.5;
        } else if (nextRight > bounds.right) {
          adjustedX -= nextRight - bounds.right;
          state.vx = -Math.abs(state.vx) * 0.5;
        }

        if (nextTop < bounds.top) {
          adjustedY += bounds.top - nextTop;
          state.vy = Math.abs(state.vy) * 0.5;
        } else if (nextBottom > bounds.bottom) {
          adjustedY -= nextBottom - bounds.bottom;
          state.vy = -Math.abs(state.vy) * 0.5;
        }

        state.x = adjustedX;
        state.y = adjustedY;
        state.vx *= friction;
        state.vy *= friction;

        button.style.setProperty('--johnny-x', `${state.x.toFixed(2)}px`);
        button.style.setProperty('--johnny-y', `${state.y.toFixed(2)}px`);
      });

      rafId = window.requestAnimationFrame(updateButtons);
    };

    const handleMove = (event: MouseEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };

    document.addEventListener('mousemove', handleMove);
    rafId = window.requestAnimationFrame(updateButtons);
    return () => {
      running = false;
      document.removeEventListener('mousemove', handleMove);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      const buttons = container.querySelectorAll<HTMLButtonElement>('button');
      buttons.forEach((button) => {
        button.style.removeProperty('--johnny-x');
        button.style.removeProperty('--johnny-y');
      });
    };
  }, [isJohnny]);

  if (loading) {
    return (
      <div className="empty-state">
        <h3>{t('common.loading')}</h3>
      </div>
    );
  }

  return (
    <div className="aime-page" ref={containerRef}>
      <div className="aime-header">
        <div>
          <h2>{t('manage.aime.title')}{activeGame ? ` · ${activeGame.name}` : ''}</h2>
          <small>{t('manage.aime.subtitle')}</small>
        </div>
        <button className="icon-btn" onClick={loadEntries} title={t('manage.aime.refresh')}>
          <Icons.Refresh />
        </button>
      </div>

      {!activeGameId && (
        <div className="aime-card">
          <h3><span className="icon-title"><Icons.Card /> {t('manage.aime.currentTitle')}</span></h3>
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center', 
            alignItems: 'center', 
            textAlign: 'center',
            color: 'var(--text-muted)',
            padding: 'var(--spacing-md) 0',
            minHeight: 100
          }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: 500 }}>{t('manage.aime.noActiveGame')}</p>
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.8, maxWidth: '90%' }}>{t('manage.aime.noActiveGameHint')}</p>
          </div>
        </div>
      )}

      {activeGameId && !hasActive && (
        <div className="aime-card">
          <h3><span className="icon-title"><Icons.Card /> {t('manage.aime.currentTitle')}</span></h3>
          <p className="hint-text">{t('manage.aime.currentMissing')}</p>
        </div>
      )}

      {activeGameId && hasActive && (
        <div className="aime-card active-card">
          <h3>
            <span className="icon-title"><Icons.Card /> {t('manage.aime.currentTitle')}</span>
            {activeMatch && <span className="status-badge">{t('common.active')}</span>}
          </h3>
          <div className="aime-current-info">
            <div className="aime-number-display">{activeAimeNumber}</div>
            {activeMatch && (
              <div className="aime-active-name-right">
                <Icons.Tag />
                {activeMatch.name}
              </div>
            )}
          </div>
          {!activeMatch && (
            <div className="aime-save-current">
              <div className="hint-text" style={{ marginBottom: 8 }}>{t('manage.aime.currentNotSaved')}</div>
              <div className="aime-save-row">
                <input
                  value={activeAimeName}
                  onChange={(e) => setActiveAimeName(e.target.value)}
                  placeholder={t('manage.aime.currentNamePlaceholder')}
                />
                <button type="button" className="btn-primary" onClick={handleSaveCurrent}>
                  <Icons.Save /> {t('common.save')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="aime-card">
        <h3><span className="icon-title"><Icons.Plus /> {t('manage.aime.addTitle')}</span></h3>
        <div className="aime-input-group">
          <div className="aime-input-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('manage.aime.addName')}
            />
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={t('manage.aime.addNumber')}
            />
          </div>
          <div className="aime-actions">
            <button className="btn-primary" onClick={handleAdd}><Icons.Plus /> {t('manage.aime.addButton')}</button>
            <button type="button" onClick={handleGenerate}><Icons.Magic /> {t('manage.aime.generate')}</button>
          </div>
          <small className="hint-text">{t('manage.aime.targetHint')}</small>
        </div>
      </div>

      <div className="aime-card" style={{ gridColumn: '1 / -1' }}>
        <h3>
          <span className="icon-title"><Icons.Card /> {t('manage.aime.listTitle')}</span>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{entries.length}</span>
        </h3>
        <div className="aime-list">
          {entries.length === 0 && (
            <div className="hint-text" style={{ textAlign: 'center', padding: '20px' }}>{t('manage.aime.empty')}</div>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="aime-item">
              {editingId === entry.id ? (
                <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={t('manage.aime.addName')}
                    style={{ flex: 1 }}
                  />
                  <input
                    value={editNumber}
                    onChange={(e) => setEditNumber(e.target.value)}
                    placeholder={t('manage.aime.addNumber')}
                    style={{ flex: 1, fontFamily: 'monospace' }}
                  />
                  <button className="icon-btn" onClick={handleSaveEdit} title={t('common.save')}>
                    <Icons.Save />
                  </button>
                  <button className="icon-btn" onClick={handleCancelEdit} title={t('common.cancel')}>
                    <Icons.X />
                  </button>
                </div>
              ) : (
                <>
                  <div className="aime-item-info">
                    <div className="aime-item-name">
                      {entry.name}
                      {activeAimeNumber === entry.number && (
                        <span className="status-badge" style={{ marginLeft: 8 }}>{t('common.active')}</span>
                      )}
                    </div>
                    <div className="aime-item-number">{entry.number}</div>
                  </div>
                  <div className="aime-item-actions">
                    <button className="icon-btn" onClick={() => handleApply(entry.id)} disabled={!activeGameId} title={t('manage.aime.apply')}>
                      <Icons.Check />
                    </button>
                    <button className="icon-btn" onClick={() => handleEdit(entry)} title={t('common.edit')}>
                      <Icons.Pencil />
                    </button>
                    <button className="icon-btn danger" onClick={() => handleDelete(entry.id)} title={t('common.delete')}>
                      <Icons.Trash />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <ToastContainer toasts={toasts} />
    </div>
  );
}

export default ManageAimePage;
