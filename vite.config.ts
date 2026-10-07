import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:process.env.VITE_BASE_PATH || './',server:{proxy:{'/api':process.env.DEV_API_URL || 'http://127.0.0.1:8080'}}});
