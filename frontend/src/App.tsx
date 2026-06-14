import { useState, useEffect } from 'react';
import { ChatWidget } from './components/ChatWidget';
import { ChatProvider } from './context/ChatContext';

function App() {
  const [token, setToken] = useState<string | null>(null);

  // Auto-generate a local dev token on startup
  useEffect(() => {
    fetch('http://localhost:3000/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'persona-budget-rahul' }),
    })
      .then((res) => res.json())
      .then((data) => setToken(data.token))
      .catch(() => setToken('demo-fallback-token'));
  }, []);

  if (!token) {
    return (
      <div className="app">
        <h1>KiranaAI</h1>
        <p>Connecting...</p>
      </div>
    );
  }

  return (
    <ChatProvider wsUrl="ws://localhost:3000/ws" token={token}>
      <div className="app">
        <h1>KiranaAI</h1>
        <p>Conversational commerce agent for quick-commerce platforms.</p>

        {/* Chat widget renders as a fixed overlay — does not obstruct page content */}
        <ChatWidget />
      </div>
    </ChatProvider>
  );
}

export default App;
