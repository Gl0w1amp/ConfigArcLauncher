import { useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import RightRail from './RightRail';
import './layout.css';

type Props = {
  children: React.ReactNode;
};

function AppLayout({ children }: Props) {
  const location = useLocation();

  return (
    <div className="app-shell">
      <div className="app-background" aria-hidden="true" />
      <div className="app-overlay" aria-hidden="true" />
      <div className="app-sparkle" aria-hidden="true" />
      <Header />
      <div className="app-body">
        <Sidebar />
        <main className="app-content">
          <div className="app-content-surface">
            <div key={location.pathname} className="app-page">
              {children}
            </div>
          </div>
        </main>
        <RightRail />
      </div>
    </div>
  );
}

export default AppLayout;
