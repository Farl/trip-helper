import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';
const apiPort=Number(process.env.E2E_API_PORT??29100),webPort=Number(process.env.E2E_WEB_PORT??29101);
const apiUrl=`http://127.0.0.1:${apiPort}`,webUrl=`http://127.0.0.1:${webPort}`;
process.env.E2E_ADMIN_TOKEN??=randomBytes(32).toString('base64url');
process.env.E2E_API_URL=apiUrl;
export default defineConfig({testDir:'tests',testMatch:'e2e.spec.ts',timeout:60000,fullyParallel:false,workers:1,reporter:'list',use:{baseURL:webUrl,locale:'zh-TW',channel:process.env.PLAYWRIGHT_CHANNEL??'chrome',trace:'retain-on-failure'},projects:[{name:'mobile',use:{viewport:{width:393,height:852},hasTouch:true}},{name:'desktop',use:{viewport:{width:1440,height:1000}}}],webServer:[{command:'npm start',url:`${apiUrl}/api/health`,reuseExistingServer:false,env:{PORT:String(apiPort),API_HOST:'127.0.0.1',ADMIN_TOKEN:process.env.E2E_ADMIN_TOKEN,ALLOWED_ORIGINS:webUrl,DATA_DIRECTORY:'.data/e2e'}},{command:`npm run dev:web -- --port ${webPort} --strictPort`,url:webUrl,reuseExistingServer:false,env:{DEV_API_URL:apiUrl}}]});
