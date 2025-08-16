import React, { useEffect, useState } from 'react';
import axios from 'axios';

type Repo = {
  name: string;
  dependencies: string[];
  last_commit: string;
  blast_radius: number;
};

const API_BASE = 'http://localhost:8080';

function App() {
  const [repos, setRepos] = useState<Repo[]>([]);

  useEffect(() => {
    axios.get(`${API_BASE}/repos`).then(res => setRepos(res.data));
  }, []);

  return (
    <div>
      <h1>DevSyncPro Dashboard (MVP)</h1>
      <table>
        <thead>
          <tr><th>Name</th><th>Dependencies</th><th>Commit</th><th>Blast Radius</th></tr>
        </thead>
        <tbody>
          {repos.map(r => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.dependencies.join(', ')}</td>
              <td>{r.last_commit}</td>
              <td>{r.blast_radius}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
