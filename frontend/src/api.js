import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

export const getUser = () => api.get('/api/user').then(r => r.data);
export const getHello = () => api.get('/api/hello').then(r => r.data);
export const postHello = (body) => api.post('/api/hello', body).then(r => r.data);
