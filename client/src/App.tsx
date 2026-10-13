import { Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { useHealth } from './lib/hooks';
import { CommandCenter } from './pages/CommandCenter';
import { ExperienceMemory } from './pages/ExperienceMemory';
import { TaskHistory } from './pages/TaskHistory';
import { Workspace } from './pages/Workspace';

export default function App() {
  const health = useHealth();
  return (
    <div className="app">
      <Sidebar health={health} />
      <main className="main">
        <Routes>
          <Route path="/" element={<CommandCenter health={health.data} />} />
          <Route path="/tasks/:id" element={<Workspace health={health.data} />} />
          <Route path="/memory" element={<ExperienceMemory />} />
          <Route path="/history" element={<TaskHistory />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
