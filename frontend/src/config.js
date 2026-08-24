// In development: uses Vite proxy ('') to localhost:5000
// In production on Vercel: connects directly to the live backend
export const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'https://backend-peach-three-50.vercel.app');

