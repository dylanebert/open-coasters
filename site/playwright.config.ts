import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'**/*.e2e.ts',workers:1,use:{baseURL:'http://localhost:4190',headless:true,launchOptions:{executablePath:process.env.CHROMIUM_PATH}},webServer:{command:'bun scripts/serve.ts',port:4190,reuseExistingServer:false}});
