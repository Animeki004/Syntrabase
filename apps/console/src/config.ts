export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? `${window.location.protocol}//api.${window.location.hostname.replace(/^(console|admin)\./, '')}`
    : 'http://localhost:4000');
