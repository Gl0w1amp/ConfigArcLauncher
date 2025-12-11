import { useState } from 'react';
import { Game, ConfigProfile } from '../../types/games';
import './games.css';

type Props = {
  game: Game;
  profiles: ConfigProfile[];
  isActive?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onLaunch: (profileId?: string) => void;
  onActivate: () => void;
};

function GameCard({ game, profiles, isActive, onEdit, onDelete, onLaunch, onActivate }: Props) {
  const [profileId, setProfileId] = useState<string>('');

  return (
    <div className="game-card">
      <div className="game-card-header">
        <div className="game-title">
          {game.name}
          {isActive && <span className="game-status active">Active</span>}
          {!game.enabled && <span className="game-status disabled">Disabled</span>}
        </div>
        <div className="game-actions">
          <button onClick={onActivate}>{isActive ? 'Active' : 'Activate'}</button>
          <button onClick={onEdit}>Edit</button>
          <button className="danger" onClick={onDelete}>Delete</button>
        </div>
      </div>
      <div className="game-details">
        <div>Exec: {game.executable_path}</div>
        {game.working_dir && <div>Workdir: {game.working_dir}</div>}
        {game.launch_args.length > 0 && <div>Args: {game.launch_args.join(' ')}</div>}
      </div>
      <div className="game-launch-area">
        <select 
          className="game-launch-select"
          value={profileId} 
          onChange={(e) => setProfileId(e.target.value)}
        >
          <option value="">Current File (segatools.ini)</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="primary" onClick={() => onLaunch(profileId || undefined)}>Launch</button>
      </div>
    </div>
  );
}

export default GameCard;
