// API Base URL configuration
// In local development, defaults to '' (uses Vite proxy) or http://localhost:5000
// In production on Vercel, uses VITE_API_URL or relative path /api
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';
