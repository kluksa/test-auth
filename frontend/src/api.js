import axios from 'axios';

function normalizeUrl(url) {
  if (!url) return url;
  const trimmed = url.replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return 'https://' + trimmed;
}

const api = axios.create({
  baseURL: normalizeUrl(import.meta.env.VITE_API_URL),
  withCredentials: true,
});

export const getUser = () => api.get('/api/user').then(r => r.data);
export const getHello = () => api.get('/api/hello').then(r => r.data);
export const postHello = (body) => api.post('/api/hello', body).then(r => r.data);
