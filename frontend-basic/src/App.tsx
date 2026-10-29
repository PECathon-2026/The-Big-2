import { Route, Routes } from 'react-router-dom';
import { TopBar } from './components/TopBar';
import Tonight from './pages/Tonight';
import Watchtower from './pages/Watchtower';
import Scroll from './pages/Scroll';
import Lens from './pages/Lens';
import Science from './pages/Science';
import Transients from './pages/Transients';

export default function App() {
  return (
    <>
      <TopBar />
      <Routes>
        <Route path="/" element={<Tonight />} />
        <Route path="/watchtower" element={<Watchtower />} />
        <Route path="/scroll" element={<Scroll />} />
        <Route path="/lens" element={<Lens />} />
        <Route path="/transients" element={<Transients />} />
        <Route path="/science" element={<Science />} />
        <Route
          path="*"
          element={
            <main className="page">
              <div className="status">No such page.</div>
            </main>
          }
        />
      </Routes>
    </>
  );
}
