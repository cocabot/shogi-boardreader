import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e', fullyParallel:true, retries:0, workers:2, timeout:45000,
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:8000/shogi-boardreader/',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'webkit-iphone',use:{...devices['iPhone 13'],defaultBrowserType:'webkit'}},
 {name:'chromium-mobile',use:{...devices['Pixel 7'],defaultBrowserType:'chromium'}}],
 webServer:{command:'node tests/serve.mjs',url:'http://127.0.0.1:8000/shogi-boardreader/',reuseExistingServer:!process.env.CI},
});
