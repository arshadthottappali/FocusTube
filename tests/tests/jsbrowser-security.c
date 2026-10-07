// Usage: NODE_PATH=/path/to/playwright/node_modules node tests/browser-security.cjs
// Serves only local files. All non-local requests are blocked or replaced with stubs.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res) => {
    const filename = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!filename.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
    try {res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(fs.readFileSync(filename));} catch {res.writeHead(404).end();}
});
const firebaseStub = `window.__cloudWrites=[];window.firebase={initializeApp(){},firestore:()=>({collection:name=>{if(name!=='users')throw Error('Unexpected shared collection access');return {doc:uid=>({set:async data=>window.__cloudWrites.push({uid,data})})}}}),auth:Object.assign(()=>({currentUser:null,onAuthStateChanged(){},signOut:async()=>{}}),{GoogleAuthProvider:function(){}})};`;
const ytStub = `window.YT={Player:function(){return {getCurrentTime:()=>0,getDuration:()=>60,pauseVideo(){},playVideoAt(){},seekTo(){},playVideo(){},destroy(){}}}};`;
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome', headless:true, args:['--no-sandbox']});
    try {
        const page = await browser.newPage({viewport:{width:1280,height:900}});
        const errors=[]; page.on('pageerror', error=>errors.push(error.message));
        await page.route('**/*', route => {
            const url = route.request().url();
            if(url.startsWith(origin)) return route.continue();
            if(url.includes('firebase-app.js')) return route.fulfill({contentType:'text/javascript',body:firebaseStub});
            if(url.includes('firebase-auth.js') || url.includes('firebase-firestore.js') || url.includes('confetti')) return route.fulfill({contentType:'text/javascript',body:''});
            if(url.includes('youtube.com/iframe_api')) return route.fulfill({contentType:'text/javascript',body:ytStub});
            return route.abort();
        });
        const payload = '<img src=x onerror="window.__xss=1"> " onmouseover="window.__xss=2';
        const seed={userName:'Regression Learner',maxCourses:1,supportLink:'javascript:window.__xss=3',courses:{PL_test:{title:payload,videos:[{id:'abcdefghijk',title:payload}],videosProgress:{},notes:{abcdefghijk:[{time:'0);window.__xss=4;//',text:payload}]}}}};
        await page.addInitScript(data=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('playlearn_data',JSON.stringify(data));sessionStorage.setItem('seeded','1');}},seed);
        await page.goto(origin); await page.waitForSelector('#welcome-screen.active');
        assert.equal(await page.locator('.course-card-title').textContent(),payload);
        assert.equal(await page.locator('.course-card-title').getAttribute('title'),payload);
        assert.equal(await page.locator('#footer-support-link').getAttribute('href'),'https://ko-fi.com/focustube');
        assert.equal(await page.locator('#dashboard-course-grid img').count(),0);
        await page.waitForTimeout(700); await page.screenshot({path:'/tmp/focus-dashboard-desktop.png',fullPage:true});
        await page.locator('.course-card').click();
        assert.equal(await page.locator('.video-title').textContent(),payload);
        assert.equal(await page.locator('.note-text').textContent(),payload);
        assert.equal(await page.locator('.note-timestamp').textContent(),'0:00');
        assert.equal(await page.locator('.note-timestamp').getAttribute('onclick'),null);
        assert.equal(await page.locator('#video-list img, #notes-list img').count(),0);
        await page.waitForTimeout(700); await page.screenshot({path:'/tmp/focus-course-desktop.png',fullPage:true});
        await page.evaluate(()=>showFocusWarning());
        assert.equal(await page.locator('.focus-course-title').textContent(),payload);
        assert.equal(await page.locator('#focus-course-list img').count(),0);
        await page.locator('#close-focus-warning-btn').click();
        await page.setViewportSize({width:390,height:844});
        await page.waitForTimeout(700); await page.screenshot({path:'/tmp/focus-course-mobile.png',fullPage:true});
        await page.evaluate(()=>renderDashboard());
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= 390));
        await page.waitForTimeout(700); await page.screenshot({path:'/tmp/focus-dashboard-mobile.png',fullPage:true});
        assert.equal(await page.evaluate(()=>window.__xss),undefined);
        const sharing = await page.evaluate(async () => {
            const messages=[];
            for(const fn of [CreatorService.createCourse,CreatorService.loadSharedCourse]) {
                try {await fn();}catch(error){messages.push(error.message);}
            }
            await CreatorService.incrementAccess('old-course');
            return messages;
        });
        assert.equal(sharing.length,2);
        assert.equal(await page.locator('#create-course-btn').isDisabled(),true);
        const alerts=[]; page.on('dialog', async dialog=>{alerts.push(dialog.message()); await dialog.accept();});
        await page.goto(origin+'/?course=legacy');
        await page.waitForSelector('#welcome-screen.active');
        assert.equal(alerts.length,1); assert.ok(alerts[0].includes('temporarily unavailable'));
        assert.equal(new URL(page.url()).search,'');
        await page.evaluate(()=>AuthService.syncDataToCloud('test-owner'));
        assert.equal(await page.evaluate(()=>window.__cloudWrites[0].uid),'test-owner');
        // Exercise real backup input: invalid data must not replace local state.
        const before = await page.evaluate(()=>localStorage.getItem('playlearn_data'));
        await page.locator('#restore-input').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"courses":[]}')});
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(()=>localStorage.getItem('playlearn_data')),before);
        const backup={userName:'Restored Learner', courses:{PL_restored:{title:'Restored course', videos:[{id:'abcdefghijk',title:'Lesson'}], notes:{abcdefghijk:[{time:12,text:'Retained note'}]}, videosProgress:{abcdefghijk:{watchTime:12,completed:true}}}}};
        await page.locator('#restore-input').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
        await page.waitForTimeout(100);
        assert.ok(alerts.some(message=>message.includes('OVERWRITE')));
        await page.waitForSelector('.course-card-title');
        assert.equal(await page.locator('.course-card-title').textContent(),'Restored course');
        const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('playlearn_data')));
        assert.equal(restored.courses.PL_restored.notes.abcdefghijk[0].text,'Retained note');
        assert.equal(restored.courses.PL_restored.videosProgress.abcdefghijk.completed,true);
        await page.evaluate(async ()=>{
            firebase.auth=()=>({currentUser:{uid:'test-owner',displayName:'Test Creator'}});
            await initCreatorDashboard();
        });
        await page.waitForTimeout(700); await page.screenshot({path:'/tmp/focus-sharing-paused-mobile.png',fullPage:true});
        assert.equal(await page.locator('#creator-new-form').isVisible(),false);
        assert.equal(await page.locator('#creator-content-title').textContent(),'Shared courses temporarily unavailable');
        assert.deepEqual(errors,[]);
        console.log('PASS: XSS and link regressions; backup reject/restore; sharing disabled without database reads; stubbed owner sync; desktop/mobile renders; no page errors; all external services stubbed/blocked.');
    } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
