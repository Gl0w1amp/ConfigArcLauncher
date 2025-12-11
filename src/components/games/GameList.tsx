import { Game, ConfigProfile } from '../../types/games';
import GameCard from './GameCard';
import './games.css';

type Props = {
  games: Game[];
  profiles: ConfigProfile[];
  activeGameId?: string;
  onEdit: (game: Game) => void;
  onDelete: (id: string) => Promise<void>;
  onLaunch: (id: string, profileId?: string) => void;
  onActivate: (id: string) => Promise<void>;
  onRefresh: () => void;
};

function GameList({ games, profiles, activeGameId, onEdit, onDelete, onLaunch, onActivate }: Props) {
  if (!games.length) {
    return <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>No games added yet.</p>;
  }

  return (
    <div className="game-list">
      {games.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          profiles={profiles}
          isActive={activeGameId === game.id}
          onEdit={() => onEdit(game)}
          onDelete={() => onDelete(game.id)}
          onLaunch={(profileId) => onLaunch(game.id, profileId)}
          onActivate={() => onActivate(game.id)}
        />
      ))}
    </div>
  );
}

export default GameList;
