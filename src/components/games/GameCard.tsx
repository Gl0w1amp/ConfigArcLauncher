import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Game, ConfigProfile } from '../../types/games';
import './games.css';

type Props = {
  game: Game;
  profiles: ConfigProfile[];
  isActive?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onLaunch: (profileId?: string) => void;
  onActivate: (profileId?: string) => void;
  onApplyProfile: (profileId: string) => void;
};

function GameCard({ game, profiles, isActive, onEdit, onDelete, onLaunch, onActivate, onApplyProfile }: Props) {
  const { t } = useTranslation();
  const [profileId, setProfileId] = useState<string>('');

  const handleProfileChange = (value: string) => {
    setProfileId(value);
    if (value) {
      onApplyProfile(value);
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
