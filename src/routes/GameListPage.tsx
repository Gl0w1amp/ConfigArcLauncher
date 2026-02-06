import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import GameEditorDialog from '../components/games/GameEditorDialog';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { AlertDialog } from '../components/common/AlertDialog';
import { useGamesState } from '../state/gamesStore';
import { ConfigProfile, Game } from '../types/games';
import { applyProfileToGame, launchGame } from '../api/gamesApi';
import { listProfiles } from '../api/configApi';
import { formatError } from '../errors';
import './GameListPage.css';

type LaunchProgress = {
  game_id: string;
  stage: string;
};

const emptyGame = (): Game => ({
  id: crypto.randomUUID ? crypto.randomUUID() : `game-${Date.now()}`,
  name: '',
  executable_path: '',
  working_dir: '',
  launch_args: [],
  enabled: true,
  tags: [],
  launch_mode: 'folder',
});

function GameListPage() {
  const { t } = useTranslation();
  const { games, loading, error, activeGameId, reload, saveGame, deleteGame, activateGame } = useGamesState();
  const [editing, setEditing] = useState<Game | null>(null);
  const [editingField, setEditingField] = useState<'execPath' | 'workdir' | 'launchArgs' | 'baseVhdPath' | 'patchVhdPath' | null>(null);
  const [gameToDelete, setGameToDelete] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [launchProgress, setLaunchProgress] = useState<LaunchProgress | null>(null);
  const [launchProgressClosing, setLaunchProgressClosing] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profileId, setProfileId] = useState('');
  const launchExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchRemoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<LaunchProgress>('launch-progress', (event) => {
      setLaunchProgress(event.payload);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(console.error);

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const clearLaunchTimers = useCallback(() => {
    if (launchExitTimerRef.current) {
      clearTimeout(launchExitTimerRef.current);
      launchExitTimerRef.current = null;
    }
    if (launchRemoveTimerRef.current) {
      clearTimeout(launchRemoveTimerRef.current);
      launchRemoveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!launchProgress) {
      clearLaunchTimers();
      setLaunchProgressClosing(false);
      return;
    }

    clearLaunchTimers();
    setLaunchProgressClosing(false);

    if (launchProgress.stage === 'started' || launchProgress.stage === 'error') {
      const exitDelayMs = 1200;
      const exitDurationMs = 280;
      launchExitTimerRef.current = setTimeout(() => {
        setLaunchProgressClosing(true);
        launchRemoveTimerRef.current = setTimeout(() => {
          setLaunchProgress(null);
          setLaunchProgressClosing(false);
        }, exitDurationMs);
      }, exitDelayMs);
    }
  }, [launchProgress, clearLaunchTimers]);

  useEffect(() => {
    return () => {
      clearLaunchTimers();
    };
  }, [clearLaunchTimers]);

  const sortedGames = useMemo(() => [...games].sort((a, b) => a.name.localeCompare(b.name)), [games]);
  const selectedGame = useMemo(
    () => (selectedGameId ? sortedGames.find((game) => game.id === selectedGameId) ?? null : null),
    [sortedGames, selectedGameId]
  );

  useEffect(() => {
    if (!sortedGames.length) {
      setSelectedGameId(null);
      return;
    }
    if (selectedGameId && sortedGames.some((game) => game.id === selectedGameId)) {
      return;
    }
    setSelectedGameId(activeGameId ?? sortedGames[0].id);
  }, [sortedGames, activeGameId, selectedGameId]);

  useEffect(() => {
    if (!selectedGameId) {
      setProfiles([]);
      setProfileId('');
      return;
    }
    const storageKey = `lastProfile:${selectedGameId}`;
    setProfileId(localStorage.getItem(storageKey) ?? '');
    setProfilesLoading(true);
    listProfiles(selectedGameId)
      .then(setProfiles)
      .catch(console.error)
      .finally(() => setProfilesLoading(false));
  }, [selectedGameId]);

  const handleSave = async (game: Game) => {
    await saveGame(game);
    setEditing(null);
    setEditingField(null);
  };

  const handleLaunch = async (gameId: string, profileId?: string) => {
    try {
      await launchGame(gameId, profileId);
    } catch (err) {
      console.error(err);
      setAlertMessage(t('games.launchFailed', { error: formatError(t, err) }));
      setLaunchProgress(null);
    }
  };

  const handleApplyProfile = async (gameId: string, profileId: string) => {
    try {
      await applyProfileToGame(gameId, profileId);
    } catch (err) {
      console.error(err);
      setAlertMessage(t('games.launchFailed', { error: formatError(t, err) }));
    }
  };

  const handleDeleteRequest = (id: string) => {
    setGameToDelete(id);
  };

  const handleConfirmDelete = async () => {
    if (gameToDelete) {
      await deleteGame(gameToDelete);
      setGameToDelete(null);
    }
  };

  const handleProfileChange = (value: string) => {
    if (!selectedGameId) return;
    const storageKey = `lastProfile:${selectedGameId}`;
    setProfileId(value);
    if (value) {
      localStorage.setItem(storageKey, value);
      handleApplyProfile(selectedGameId, value);
    } else {
      localStorage.removeItem(storageKey);
    }
  };

  const handleLaunchSelected = () => {
    if (!selectedGameId) return;
    handleLaunch(selectedGameId, profileId || undefined);
  };

  const handleEditDetail = (field: 'execPath' | 'workdir' | 'launchArgs' | 'baseVhdPath' | 'patchVhdPath') => {
    if (!selectedGame) return;
    setEditing(selectedGame);
    setEditingField(field);
  };

  const handleDeleteSelected = () => {
    if (selectedGame) {
      handleDeleteRequest(selectedGame.id);
    }
  };

  const launchingGame = launchProgress ? games.find(g => g.id === launchProgress.game_id) : undefined;
  const launchMessage = (() => {
    if (!launchProgress) return '';
    switch (launchProgress.stage) {
      case 'mounting':
        return t('games.launchProgress.mounting');
      case 'detecting':
        return t('games.launchProgress.detecting');
      case 'configuring':
        return t('games.launchProgress.configuring');
      case 'launching':
        return t('games.launchProgress.launching');
      case 'started':
        return t('games.launchProgress.started');
      case 'error':
        return t('games.launchProgress.error');
      default:
        return launchProgress.stage;
    }
  })();

  const isVhd = (selectedGame?.launch_mode ?? 'folder') === 'vhd';
  const detailItems: {
    key: string;
    label: string;
    value: string;
    editable: boolean;
    field?: 'execPath' | 'workdir' | 'launchArgs' | 'baseVhdPath' | 'patchVhdPath';
  }[] = selectedGame ? [
    {
      key: 'mode',
      label: t('games.mode'),
      value: isVhd ? t('games.modeVhd') : t('games.modeFolder'),
      editable: false,
    },
    {
      key: 'exec',
      label: isVhd ? t('games.vhdBase') : t('games.exec'),
      value: selectedGame.executable_path || '-',
      editable: true,
      field: isVhd ? 'baseVhdPath' : 'execPath',
    },
    {
      key: 'workdir',
      label: t('games.workdir'),
      value: selectedGame.working_dir || '-',
      editable: true,
      field: 'workdir',
    },
    {
      key: 'args',
      label: t('games.args'),
      value: selectedGame.launch_args.length ? selectedGame.launch_args.join(' ') : '-',
      editable: !isVhd,
      field: 'launchArgs',
    },
  ] : [];

  const newsItems: Array<{ title: string; meta: string; imageLabel: string }> = [
    { title: 'Planned update: profile sync', meta: 'Jan 28, 2025', imageLabel: 'PLANNED UPDATE' },
  ];
  const hasNews = newsItems.length > 0;

  return (
    <div className="games-view">
      <header className="games-header">
        <div className="games-title-block">
          <span className="games-title-accent" aria-hidden="true" />
          <div>
            <h2 className="games-title">{selectedGame?.name ?? t('games.title')}</h2>
            <p className="games-subtitle">{selectedGame ? t('games.subtitle') : t('games.noGames')}</p>
          </div>
        </div>
        <div className="games-header-actions">
          <button onClick={() => {
            setEditing(emptyGame());
            setEditingField(null);
          }}>{t('games.add')}</button>
          <button onClick={() => reload(false)}>Refresh</button>
        </div>
      </header>

      {launchProgress && (
        <div
          className={[
            'games-launch-progress',
            launchProgressClosing ? 'is-exiting' : '',
            launchProgress.stage === 'started' ? 'is-success' : '',
          ].filter(Boolean).join(' ')}
        >
          <strong>{t('games.launchProgress.title', { name: launchingGame?.name ?? '' })}</strong>
          <div className="games-launch-message">{launchMessage}</div>
        </div>
      )}

      <div className={`games-layout ${hasNews ? 'has-news' : 'no-news'}`}>
        <aside className="games-library">
          <div className="games-library-header">
            <div className="games-library-title">Library</div>
            <div className="games-library-count">{sortedGames.length}</div>
          </div>
          {loading && <div className="games-state">{t('common.loading')}</div>}
          {error && <div className="games-state error">{formatError(t, error)}</div>}
          <div className="games-library-list">
            {!sortedGames.length && !loading && (
              <div className="games-library-empty">{t('games.noGames')}</div>
            )}
            {sortedGames.map((game) => (
              <button
                key={game.id}
                type="button"
                className={`games-library-item ${selectedGameId === game.id ? 'selected' : ''} ${!game.enabled ? 'disabled' : ''}`}
                onClick={() => {
                  setSelectedGameId(game.id);
                  const storedProfile = localStorage.getItem(`lastProfile:${game.id}`) ?? '';
                  activateGame(game.id, storedProfile || undefined).catch(console.error);
                }}
              >
                <span className="games-library-name">{game.name}</span>
                {activeGameId === game.id && <span className="games-library-badge">{t('common.active')}</span>}
              </button>
            ))}
          </div>
        </aside>

        <section className="games-panel games-overview">
          {selectedGame ? (
            <>
              <div className="games-panel-header">
                <div className="games-panel-title">Overview</div>
              </div>
              <div className="games-overview-body">
                <div className="games-detail-grid">
                  {detailItems.map((detail) => {
                    const content = (
                      <>
                        <div className="games-detail-label">{detail.label}</div>
                        <div className="games-detail-value">{detail.value}</div>
                      </>
                    );
                    if (detail.editable && detail.field) {
                      return (
                        <div
                          key={detail.key}
                          className="games-detail-card interactive"
                          title={detail.value}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleEditDetail(detail.field!)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleEditDetail(detail.field!);
                            }
                          }}
                        >
                          {content}
                        </div>
                      );
                    }
                    return (
                      <div key={detail.key} className="games-detail-card" title={detail.value}>
                        {content}
                      </div>
                    );
                  })}
                </div>
                <div className="games-profile-row">
                  <div className="games-profile-label">Profile</div>
                  <select
                    className="games-launch-select"
                    value={profileId}
                    onChange={(e) => handleProfileChange(e.target.value)}
                    disabled={profilesLoading || !selectedGame}
                  >
                    <option value="">{profilesLoading ? t('common.loading') : t('games.currentFile')}</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="games-overview-footer">
                <div className="games-status-row">
                  {!selectedGame.enabled && <span className="games-status disabled">{t('common.disabled')}</span>}
                  {activeGameId === selectedGame.id && <span className="games-status active">{t('common.active')}</span>}
                </div>
                <div className="games-overview-actions">
                  <button className="danger" onClick={handleDeleteSelected}>{t('common.delete')}</button>
                </div>
              </div>
            </>
          ) : (
            <div className="games-panel-empty">{t('games.noGames')}</div>
          )}
        </section>
        {hasNews && (
          <section className="games-panel games-news">
            <div className="games-news-header">
              <div className="games-panel-title">News</div>
              <button
                type="button"
                className="games-news-link"
                aria-label="Open news"
                onClick={() => setNewsOpen(true)}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M7.5 5l5 5-5 5" />
                </svg>
              </button>
            </div>
            <div className="games-news-list">
              {newsItems.slice(0, 1).map((item) => (
                <div key={item.title} className="games-news-item">
                  <div className="games-news-image" aria-hidden="true">
                    {item.imageLabel}
                  </div>
                  <div className="games-news-title">{item.title}</div>
                  <div className="games-news-meta">{item.meta}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="games-launch-cta">
        <button className="primary games-launch-main" onClick={handleLaunchSelected} disabled={!selectedGame}>
          {t('common.launch')}
        </button>
        <button className="ghost-button games-launch-extra" disabled aria-label="Extra">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="6" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="18" cy="12" r="2" />
          </svg>
        </button>
      </div>

      {editing && (
        <GameEditorDialog
          game={editing}
          onSave={handleSave}
          onCancel={() => {
            setEditing(null);
            setEditingField(null);
          }}
          initialField={editingField ?? undefined}
          lockMode={games.some((game) => game.id === editing.id)}
        />
      )}
      {gameToDelete && (
        <ConfirmDialog
          title={t('games.deleteConfirmTitle')}
          message={t('games.deleteConfirmMessage')}
          onConfirm={handleConfirmDelete}
          onCancel={() => setGameToDelete(null)}
          isDangerous={true}
        />
      )}
      {alertMessage && (
        <AlertDialog
          title={t('common.error')}
          message={alertMessage}
          onClose={() => setAlertMessage(null)}
        />
      )}
      {newsOpen && (
        <AlertDialog
          title="News"
          message="News reader is not available yet."
          onClose={() => setNewsOpen(false)}
        />
      )}
    </div>
  );
}

export default GameListPage;
