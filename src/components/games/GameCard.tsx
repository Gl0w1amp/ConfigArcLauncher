import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Game, ConfigProfile } from '../../types/games';
import { listProfiles } from '../../api/configApi';
import './games.css';

type Props = {
  game: Game;
  profiles?: ConfigProfile[]; // Optional, if provided from parent
  profilesLoading?: boolean;
  isActive?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onLaunch: (profileId?: string) => void;
  onActivate: (profileId?: string) => void;
  onApplyProfile: (profileId: string) => void;
};

function GameCard({ game, isActive, onEdit, onDelete, onLaunch, onActivate, onApplyProfile }: Props) {
  const { t } = useTranslation();
  const storageKey = `lastProfile:${game.id}`;
  const [profileId, setProfileId] = useState<string>(() => localStorage.getItem(storageKey) ?? '');
  
  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    listProfiles(game.id)
      .then(setProfiles)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [game.id]);

  useEffect(() => {
    // Removed auto-clearing logic to prevent race conditions when switching games.
    // If a profile ID is invalid, it will simply not match any option in the select box (showing empty or first option),
    // or the launch will fail with a clear error.
  }, []);

  const handleProfileChange = (value: string) => {
    setProfileId(value);
    if (value) {
      localStorage.setItem(storageKey, value);
      onApplyProfile(value);
    } else {
      localStorage.removeItem(storageKey);
    }
  };

  return (
    <div className="game-card">
      <div className="game-card-header">
        <div className="game-title">
          {game.name}
          {isActive && <span className="game-status active">{t('common.active')}</span>}
          {!game.enabled && <span className="game-status disabled">{t('common.disabled')}</span>}
        </div>
        <div className="game-actions">
          <button onClick={() => onActivate(profileId || undefined)}>{isActive ? t('common.active') : t('common.activate')}</button>
          <button onClick={onEdit}>{t('common.edit')}</button>
          <button className="danger" onClick={onDelete}>{t('common.delete')}</button>
        </div>
      </div>
      <div className="game-details">
        <div>{t('games.exec')}: {game.executable_path}</div>
        {game.working_dir && <div>{t('games.workdir')}: {game.working_dir}</div>}
        {game.launch_args.length > 0 && <div>{t('games.args')}: {game.launch_args.join(' ')}</div>}
      </div>
      <div className="game-launch-area">
        <select 
          className="game-launch-select"
          value={profileId} 
          onChange={(e) => handleProfileChange(e.target.value)}
          disabled={loading}
        >
          <option value="">{t('games.currentFile')}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="primary" onClick={() => onLaunch(profileId || undefined)}>{t('common.launch')}</button>
      </div>
    </div>
  );
}

export default GameCard;
