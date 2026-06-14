import { useState, useEffect } from 'react';
import { ChatWidget } from './components/ChatWidget';
import { ChatProvider } from './context/ChatContext';

// ─── Configuration ───────────────────────────────────────────────────────────

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';
const DEFAULT_PERSONA = import.meta.env.VITE_DEFAULT_PERSONA || 'persona-budget-rahul';

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [persona, setPersona] = useState(DEFAULT_PERSONA);

  // Generate auth token
  useEffect(() => {
    const isLocal = WS_URL.includes('localhost');

    if (isLocal) {
      // Local dev: fetch JWT from Express auth endpoint
      fetch(`${API_BASE_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: persona }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Auth endpoint unavailable');
          return res.json();
        })
        .then((data) => setToken(data.token))
        .catch(() => setToken(persona));
    } else {
      // Production: use persona ID directly as token
      // The Lambda WebSocket auth validator accepts any non-empty string as userId
      setToken(persona);
    }
  }, [persona]);

  if (!token) {
    return (
      <div className="app">
        <h1>KiranaAI</h1>
        <p>Connecting...</p>
      </div>
    );
  }

  return (
    <ChatProvider wsUrl={WS_URL} token={token}>
      <div className="app">
        <header className="app-header">
          <h1>🛒 KiranaAI</h1>
          <p>Your neighborhood shopkeeper, reimagined for the digital age.</p>
          <div className="persona-switcher">
            <label>Demo Persona: </label>
            <select
              value={persona}
              aria-label="Demo persona selector"
              onChange={(e) => {
                setPersona(e.target.value);
                setToken(null); // Force re-auth
              }}
            >
              <option value="persona-budget-rahul">Rahul (Budget Optimizer)</option>
              <option value="persona-health-priya">Priya (Health-Conscious)</option>
            </select>
          </div>
        </header>

        <main className="app-demo">
          <div className="demo-card">
            <h3>💬 Try saying:</h3>
            <ul>
              <li><code>find me some milk</code></li>
              <li><code>add rice to cart</code></li>
              <li><code>show me bread options</code></li>
              <li><code>find a substitute for butter</code></li>
            </ul>
          </div>
          <div className="demo-card">
            <h3>🎯 What KiranaAI does:</h3>
            <ul>
              <li>Remembers your brand preferences</li>
              <li>Respects dietary restrictions</li>
              <li>Suggests basket completions</li>
              <li>Helps you reach free delivery</li>
            </ul>
          </div>
        </main>

        {/* Chat widget renders as a fixed overlay */}
        <ChatWidget />
      </div>
    </ChatProvider>
  );
}

export default App;
