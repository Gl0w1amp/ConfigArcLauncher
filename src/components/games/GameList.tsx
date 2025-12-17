import { useTranslation } from 'react-i18next';
import { Game, ConfigProfile } from '../../types/games';
import GameCard from './GameCard';
import './games.css';

type Props = {
  games: Game[];
  profiles: ConfigProfile[];
  profilesLoading: boolean;
  activeGameId?: string;
  onEdit: (game: Game) => void;
  onDelete: (id: string) => Promise<void>;
  onLaunch: (id: string, profileId?: string) => void;
  onActivate: (id: string, profileId?: string) => Promise<void>;
  onApplyProfile: (id: string, profileId: string) => Promise<void>;
  onRefresh: () => void;
};

function GameList({ games, profiles, profilesLoading, activeGameId, onEdit, onDelete, onLaunch, onActivate, onApplyProfile }: Props) {
  const { t } = useTranslation();

  if (!games.length) {
    return <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>{t('games.noGames')}</p>;
  }

  return (
    <div className="game-list">
      {games.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          profiles={profiles}
          profilesLoading={profilesLoading}
          isActive={activeGameId === game.id}
          onEdit={() => onEdit(game)}
          onDelete={() => onDelete(game.id)}
          onLaunch={(profileId) => onLaunch(game.id, profileId)}
          onActivate={(profileId) => onActivate(game.id, profileId)}
          onApplyProfile={(profileId) => profileId ? onApplyProfile(game.id, profileId) : Promise.resolve()}
        />
      ))}
    </div>
  );
}

export default GameList;
