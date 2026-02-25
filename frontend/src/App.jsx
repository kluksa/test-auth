import { useEffect, useState } from 'react';
import { getUser, getHello, postHello } from './api';
import './App.css';

function normalizeUrl(url) {
  if (!url) return url;
  const trimmed = url.replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return 'https://' + trimmed;
}

const BACKEND_URL = normalizeUrl(import.meta.env.VITE_API_URL);

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [helloData, setHelloData] = useState(null);
  const [postResult, setPostResult] = useState(null);
  const [postInput, setPostInput] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    getUser()
      .then(data => setUser(data.authenticated ? data : null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = () => {
    window.location.href = `${BACKEND_URL}/oauth2/authorization/google`;
  };

  const handleLogout = () => {
    window.location.href = `${BACKEND_URL}/logout`;
  };

  const handleGetHello = async () => {
    try {
      setError(null);
      const data = await getHello();
      setHelloData(data);
    } catch (e) {
      setError('GET /api/hello failed: ' + (e.response?.status ?? e.message));
    }
  };

  const handlePostHello = async () => {
    try {
      setError(null);
      const data = await postHello({ message: postInput });
      setPostResult(data);
    } catch (e) {
      setError('POST /api/hello failed: ' + (e.response?.status ?? e.message));
    }
  };

  if (loading) return <div className="center">Loading...</div>;

  return (
    <div className="app">
      <h1>Google OAuth2 Demo</h1>

      {!user ? (
        <div className="card">
          <p>You are not logged in.</p>
          <button onClick={handleLogin} className="btn-primary">
            Sign in with Google
          </button>
        </div>
      ) : (
        <>
          <div className="card user-card">
            <img src={user.picture} alt="avatar" className="avatar" />
            <div>
              <p><strong>{user.name}</strong></p>
              <p>{user.email}</p>
            </div>
            <button onClick={handleLogout} className="btn-secondary">
              Logout
            </button>
          </div>

          <div className="card">
            <h2>GET /api/hello</h2>
            <button onClick={handleGetHello} className="btn-primary">Send GET</button>
            {helloData && <pre>{JSON.stringify(helloData, null, 2)}</pre>}
          </div>

          <div className="card">
            <h2>POST /api/hello</h2>
            <input
              type="text"
              value={postInput}
              onChange={e => setPostInput(e.target.value)}
              placeholder="Enter a message"
            />
            <button onClick={handlePostHello} className="btn-primary">Send POST</button>
            {postResult && <pre>{JSON.stringify(postResult, null, 2)}</pre>}
          </div>

          {error && <div className="error">{error}</div>}
        </>
      )}
    </div>
  );
}
