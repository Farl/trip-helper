import { test,expect, type APIRequestContext, type CDPSession, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { InviteResponse, Trip } from '../shared/types.js';
const trip=JSON.parse(await readFile('public/trips/taipei-2026-dec.json','utf8')) as Trip;
const admin=()=>({Authorization:`Bearer ${process.env.E2E_ADMIN_TOKEN}`});
async function makeInvite(request:APIRequestContext,name:string){const response=await request.post(`${process.env.E2E_API_URL}/api/trips/${trip.id}/invites`,{headers:admin(),data:{name}});expect(response.status()).toBe(201);return response.json() as Promise<InviteResponse>;}
function inviteCards(invite:InviteResponse){const ids=invite.participant.presentation?.cardIds ?? trip.cards.map(card=>card.id);return ids.map(id=>trip.cards.find(card=>card.id===id)!);}
async function waitForFeed(page:Page){await expect(page.locator('main.feed-page')).toHaveAttribute('aria-busy','false');await expect(page.locator('.experience-card[data-active="true"] h1')).toBeVisible();}
async function chooseFromMenu(page:Page,name:string){await page.getByRole('button',{name:/^(旅程選項|Trip options)$/}).click();await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();}
async function switchFeedLanguage(page:Page,name:string){await page.getByRole('button',{name:/^(旅程選項|Trip options)$/}).click();await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();await page.getByRole('button',{name:/^(關閉選項|Close options)$/}).click();}
async function touchSwipe(page:Page,client:CDPSession,direction:number){
 const box=await page.locator('.experience-card[data-active="true"]').boundingBox();const x=box!.x+box!.width/2,y=box!.y+box!.height*.4;
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let step=1;step<=6;step++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+direction*110*step/6,y}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
test('choice hints appear only during horizontal dragging and menu choices still advance',async({page},testInfo)=>{
 if(testInfo.project.name==='mobile')await page.setViewportSize({width:320,height:568});
 await page.goto(`/#/trip/${trip.id}`);const active=page.locator('.experience-card[data-active="true"]');await expect(active.locator('h1')).toHaveText(trip.cards[0].title);
 await expect(page.getByRole('button',{name:'有興趣',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'沒興趣',exact:true})).toHaveCount(0);await expect(page.locator('.gesture-choice')).toHaveCount(0);
 const box=await active.boundingBox();const x=box!.x+box!.width/2,y=box!.y+box!.height*.4;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+30,y,{steps:3});await expect(page.getByRole('img',{name:'有興趣',exact:true})).toBeVisible();await page.mouse.up();await expect(page.locator('.gesture-choice')).toHaveCount(0);await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-110,y,{steps:6});await expect(page.getByRole('img',{name:'沒興趣',exact:true})).toBeVisible();await page.mouse.up();await expect(active.locator('h1')).toHaveText(trip.cards[1].title);await expect(page.locator('.gesture-choice')).toHaveCount(0);
 const title=await active.locator('h1').boundingBox();expect(title!.width).toBeGreaterThanOrEqual(box!.width-50);expect(title!.y+title!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
 await page.getByRole('button',{name:'旅程選項',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'有興趣',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','2');await expect(active.locator('h1')).toHaveText(trip.cards[2].title);
 await page.screenshot({path:`test-results/${testInfo.project.name}-gesture-only.png`,fullPage:true});
});
test('every Traditional Chinese and English title fits a narrow phone without clipping',async({page},testInfo)=>{
 if(testInfo.project.name!=='mobile')test.skip();await page.setViewportSize({width:320,height:568});
 const english=JSON.parse(await readFile(`public/trips/locales/en/${trip.id}/${trip.version}.json`,'utf8'));
 for(const locale of ['zh-Hant','en']){
  if(locale==='zh-Hant')await page.goto(`/#/trip/${trip.id}`);else await page.reload();await waitForFeed(page);if(locale==='en')await switchFeedLanguage(page,'Switch to English');
  for(const [index,card] of trip.cards.entries()){
   const title=page.locator('.experience-card[data-active="true"] h1');await expect(title).toHaveText(locale==='en'?english.cards[card.id].title:card.title);
   const box=await title.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(320);expect(box!.y).toBeGreaterThanOrEqual(80);expect(box!.y+box!.height).toBeLessThanOrEqual(568);
   expect(await title.evaluate(element=>element.scrollHeight<=element.clientHeight)).toBe(true);
   if(index<trip.cards.length-1)await page.keyboard.press('ArrowDown');
  }
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');await page.screenshot({path:`test-results/narrow-titles-${locale}.png`,fullPage:true});
 }
});
test('text-only experiences show their actual description without generic landmark artwork',async({page},testInfo)=>{
 const pack=structuredClone(trip);delete pack.cards[0].image;delete pack.cards[0].video;
 await page.route(`**/trips/${trip.id}.json`,route=>route.fulfill({json:pack}));await page.goto(`/#/trip/${trip.id}`);await waitForFeed(page);
 const active=page.locator('.experience-card[data-active="true"]');await expect(active.locator('h1')).toHaveText(pack.cards[0].title);await expect(active.getByText(pack.cards[0].description,{exact:true})).toBeVisible();await expect(active.locator('img,.image-fallback')).toHaveCount(0);
 // Keep native-touch coverage even when the published pack becomes mostly photos.
 if(testInfo.project.name==='mobile'){
  const client=await page.context().newCDPSession(page);await touchSwipe(page,client,1);await client.detach();
 }else await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
 await page.getByRole('button',{name:'旅程選項',exact:true}).click();await page.getByRole('button',{name:'查看選擇',exact:true}).click();await expect(page.locator('.review-row').first().locator('.review-thumb svg,img')).toHaveCount(0);
});
test('binary full round, reload resume and raw export on mobile and desktop',async({page,request},testInfo)=>{
 const invite=await makeInvite(request,`${testInfo.project.name} test`);
 const cards=inviteCards(invite);
 await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);
 await waitForFeed(page);await chooseFromMenu(page,'有興趣');await page.keyboard.press('ArrowLeft');
 await expect(page.getByRole('progressbar',{name:'已回答進度'})).toHaveAttribute('aria-valuenow','2');
 await expect(page.getByRole('status').first()).toHaveText('已儲存');
 await page.reload();await waitForFeed(page);await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','2');
 await page.screenshot({path:`test-results/${testInfo.project.name}-swipe.png`,fullPage:true});
 for(let index=2;index<cards.length;index++)await page.keyboard.press(index%2?'ArrowLeft':'ArrowRight');
 await expect(page.getByRole('heading',{name:'你的喜歡，收到。'})).toBeVisible();
 // The local file adapter serializes full snapshots; 204 answers plus visits may still be draining.
 await expect(page.getByRole('status').first()).toHaveText('已儲存',{timeout:30000});
 const exported=await(await request.get(`${process.env.E2E_API_URL}/api/trips/${trip.id}/export`,{headers:admin()})).json();
 expect(exported.answers.filter((a:{participantId:string})=>a.participantId===invite.participant.id)).toHaveLength(cards.length);
 expect(exported.events.filter((a:{participantId:string})=>a.participantId===invite.participant.id)).toHaveLength(cards.length);
 expect(JSON.stringify(exported)).not.toContain(invite.token);
});
test('horizontal swipes and arrow keys record opposite binary choices',async({page,request})=>{
 const invite=await makeInvite(request,'Gesture test');await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);await waitForFeed(page);
 const cards=inviteCards(invite);
 const card=page.locator('.experience-card[data-active="true"]');
 await card.evaluate(element=>{const point=(x:number)=>new Touch({identifier:1,target:element,clientX:x,clientY:200});element.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,changedTouches:[point(100)]}));element.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[point(260)]}));});
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
 await page.keyboard.press('ArrowLeft');await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','2');await expect(page.getByRole('status').first()).toHaveText('已儲存');
 const session=await(await request.get(`${process.env.E2E_API_URL}/api/session`,{headers:{Authorization:`Bearer ${invite.token}`}})).json();
 expect(session.answers.find((a:{cardId:string})=>a.cardId===cards[0].id).choice).toBe('interested');expect(session.answers.find((a:{cardId:string})=>a.cardId===cards[1].id).choice).toBe('not_interested');
});
test('organizer creates an invitation, sees results and exports JSON',async({page},testInfo)=>{
 await page.goto(`/#/manage/${trip.id}`);await page.getByLabel('管理金鑰').fill(process.env.E2E_ADMIN_TOKEN!);await page.getByRole('button',{name:'載入管理資料'}).click();
 await expect(page.getByRole('heading',{name:'建立個人邀請'})).toBeVisible();
 await page.getByRole('textbox',{name:'參與者姓名'}).fill(`Organizer ${testInfo.project.name}`);await page.getByRole('button',{name:'建立邀請',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'邀請連結'})).toHaveValue(new RegExp(`#/trip/${trip.id}\\?invite=`));
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'匯出 JSON'}).click();expect((await download).suggestedFilename()).toContain(trip.id);
 await page.screenshot({path:`test-results/${testInfo.project.name}-manage.png`,fullPage:true});
});
test('simultaneous offline tabs retain both operations after reopening',async({page,context,request})=>{
 const invite=await makeInvite(request,'Offline tabs');const link=`/#/trip/${trip.id}?invite=${invite.token}`;
 await page.goto(link);await waitForFeed(page);
 const second=await context.newPage();await second.goto(link);await waitForFeed(second);await second.keyboard.press('ArrowDown');
 await context.setOffline(true);await page.keyboard.press('ArrowRight');await second.keyboard.press('ArrowLeft');
 await page.close();await second.close();await context.setOffline(false);const resumed=await context.newPage();await resumed.goto(link);
 await expect(resumed.getByRole('progressbar')).toHaveAttribute('aria-valuenow','2');await expect(resumed.getByRole('status').first()).toHaveText('已儲存');
 const session=await(await request.get(`${process.env.E2E_API_URL}/api/session`,{headers:{Authorization:`Bearer ${invite.token}`}})).json();expect(session.answers).toHaveLength(2);
});
test('valid invite uses its stored snapshot when public trip file is unavailable',async({page,request})=>{
 const invite=await makeInvite(request,'Snapshot test');await page.route(`**/trips/${trip.id}.json`,route=>route.fulfill({status:404,body:'Retired'}));await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);await waitForFeed(page);
});

test('menu choice buttons fit the phone viewport without scrolling',async({page,request},testInfo)=>{
 if(testInfo.project.name!=='mobile')test.skip();
 const invite=await makeInvite(request,'Small phone');
 for(const viewport of [{width:393,height:852},{width:375,height:667},{width:320,height:568}]){
  await page.setViewportSize(viewport);await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);
  await waitForFeed(page);await page.getByRole('button',{name:'旅程選項',exact:true}).click();const button=page.getByRole('dialog').getByRole('button',{name:'有興趣',exact:true});await expect(button).toBeEnabled();await expect(button.locator('svg')).toBeVisible();const box=await button.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height);
  await page.keyboard.press('Escape');
 }
});

test('immersive feed fills the screen and vertical browsing does not vote',async({page,request},testInfo)=>{
 const invite=await makeInvite(request,'Immersive feed');
 const cards=inviteCards(invite);
 await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);
 const feed=page.locator('.feed-viewport');await expect(feed).toBeVisible({timeout:2000});
 const active=page.locator('.experience-card[data-active="true"]');const viewport=page.viewportSize()!;
 const frame=await feed.boundingBox();expect(frame!.height).toBeGreaterThanOrEqual(viewport.height*.95);
 if(testInfo.project.name==='mobile')expect(frame!.width).toBe(viewport.width);else expect(frame!.width).toBeLessThanOrEqual(560);
 const first=await active.boundingBox();expect(first!.height).toBeGreaterThanOrEqual(frame!.height-2);
 await expect(active.getByRole('heading',{name:cards[0].title,exact:true})).toBeVisible();
 await feed.evaluate(element=>element.scrollTo({top:element.clientHeight,behavior:'instant'}));
 await expect(active.getByRole('heading',{name:cards[1].title,exact:true})).toBeVisible();
 await expect(page.getByRole('progressbar',{name:'已回答進度'})).toHaveAttribute('aria-valuenow','0');
 const session=await(await request.get(`${process.env.E2E_API_URL}/api/session`,{headers:{Authorization:`Bearer ${invite.token}`}})).json();expect(session.answers).toHaveLength(0);
 await page.screenshot({path:`test-results/${testInfo.project.name}-immersive.png`,fullPage:true});
});
test('drag shows choice intent before release and records the choice on release',async({page,request})=>{
 const invite=await makeInvite(request,'Drag feedback');await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);await waitForFeed(page);
 const active=page.locator('.experience-card[data-active="true"]');const box=await active.boundingBox();const x=box!.x+box!.width/2,y=box!.y+box!.height*.35;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+110,y,{steps:6});
 await expect(active).toHaveAttribute('data-drag-intent','interested');await expect(page.getByRole('img',{name:'有興趣',exact:true})).toBeVisible();
 await expect(page.locator('.feed-progress')).toHaveAttribute('aria-valuenow','0');
 await page.mouse.up();await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');await expect(page.getByRole('status').first()).toHaveText('已儲存');
});

test('language switch translates the whole card and keeps progress across reload',async({page,request},testInfo)=>{
 const invite=await makeInvite(request,'Bilingual test');await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);
 const cards=inviteCards(invite);
 await waitForFeed(page);
 await switchFeedLanguage(page,'Switch to English');
 const active=page.locator('.experience-card[data-active="true"]');
 const english=JSON.parse(await readFile(`public/trips/locales/en/${trip.id}/${trip.version}.json`,'utf8'));
 await expect(active.getByRole('heading',{name:english.cards[cards[0].id].title,exact:true})).toBeVisible();
 await waitForFeed(page);
 await page.getByRole('button',{name:'Details and sources',exact:true}).click();await expect(page.getByRole('dialog')).toContainText(english.cards[cards[0].id].facts.duration);await expect(page.getByRole('dialog')).toContainText(english.cards[cards[0].id].sourceTitle);await page.getByRole('button',{name:'Close details'}).click();
 await chooseFromMenu(page,'Interested');await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');await expect(page.getByRole('status').first()).toHaveText('Saved');
 await page.reload();await waitForFeed(page);await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
 await page.screenshot({path:`test-results/${testInfo.project.name}-english.png`,fullPage:true});
 await switchFeedLanguage(page,'切換為正體中文');await waitForFeed(page);await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
 const exported=await(await request.get(`${process.env.E2E_API_URL}/api/trips/${trip.id}/export`,{headers:admin()})).json();const events=exported.events.filter((e:{participantId:string})=>e.participantId===invite.participant.id);expect(events).toHaveLength(1);expect(events[0].cardId).toBe(cards[0].id);expect(events[0].displayLocale).toBe('en');
});
test('English organizer and localized errors work without changing raw data',async({page})=>{
 await page.goto(`/#/manage/${trip.id}`);await page.getByRole('button',{name:'Switch to English',exact:true}).click();
 const input=page.getByLabel('Organizer key');await input.fill('wrong-key');await page.getByRole('button',{name:'Load organizer data',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText(/organizer key/i);
 await input.fill(process.env.E2E_ADMIN_TOKEN!);await page.getByRole('button',{name:'Load organizer data',exact:true}).click();await expect(page.getByRole('heading',{name:/Create.*invitation/i})).toBeVisible();
 const english=JSON.parse(await readFile(`public/trips/locales/en/${trip.id}/${trip.version}.json`,'utf8'));await expect(page.locator('tbody')).toContainText(english.cards[trip.cards[0].id].title);
});
test('English controls fit a small phone and cached malformed copy falls back safely',async({page,request},testInfo)=>{
 if(testInfo.project.name!=='mobile')test.skip();await page.setViewportSize({width:375,height:667});
 const invite=await makeInvite(request,'Small English phone');await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);await switchFeedLanguage(page,'Switch to English');
 const cards=inviteCards(invite);
 const english=JSON.parse(await readFile(`public/trips/locales/en/${trip.id}/${trip.version}.json`,'utf8'));await expect(page.locator('.experience-card[data-active="true"] h1')).toHaveText(english.cards[cards[0].id].title);
 await page.getByRole('button',{name:'Trip options',exact:true}).click();const button=page.getByRole('dialog').getByRole('button',{name:'Not interested',exact:true});const box=await button.boundingBox();const text=await button.locator('span').last().boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(667);expect(text!.x).toBeGreaterThanOrEqual(box!.x);expect(text!.x+text!.width).toBeLessThanOrEqual(box!.x+box!.width);
 await page.keyboard.press('Escape');await page.screenshot({path:'test-results/small-phone-english.png',fullPage:true});
 // Seed before bootstrap in an isolated context so another tab's successful
 // translation fetch cannot replace the deliberately damaged cache.
 const context=await page.context().browser()!.newContext({locale:'en',viewport:{width:375,height:667}});
 await context.addInitScript(({tripId,version,copy})=>{copy.cards[Object.keys(copy.cards)[0]].title={invalid:'value'};localStorage.setItem('trip-helper:locale','en');localStorage.setItem(`trip-helper:translation:${tripId}:${version}:en`,JSON.stringify(copy));},{tripId:trip.id,version:trip.version,copy:english});
 const preview=await context.newPage();await preview.route(`**/trips/locales/en/${trip.id}/${trip.version}.json`,route=>route.fulfill({status:404,body:'Unavailable'}));await preview.goto(`${new URL(page.url()).origin}/#/trip/${trip.id}`);
 await expect(preview.locator('.experience-card[data-active="true"] h1')).toHaveText(trip.cards[0].title);await expect(preview.locator('.feed-alerts')).toContainText('English is unavailable');
 await context.close();
});
test('minimal feed keeps trip utilities in a sheet and browsing context survives opening them',async({page,request},testInfo)=>{
 const invite=await makeInvite(request,'Quiet feed');await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);
 const cards=inviteCards(invite);
 await waitForFeed(page);
 const active=page.locator('.experience-card[data-active="true"]');
 // The fast decision surface leaves all routine text except the title hidden.
 await expect(active.locator('.feed-card-meta, .card-navigation')).toHaveCount(0);
 if(cards[0].image||cards[0].video)await expect(active.locator('.feed-copy > p')).toHaveCount(0);
 await expect(page.getByText('Quiet feed',{exact:true})).not.toBeVisible();
 await page.keyboard.press('ArrowDown');await expect(active.locator('h1')).toHaveText(cards[1].title);
 await page.getByRole('button',{name:'旅程選項',exact:true}).click();
 const sheet=page.getByRole('dialog',{name:'旅程選項'});await expect(sheet).toBeVisible();await expect(sheet).toContainText('Quiet feed');
 await sheet.getByRole('button',{name:'Switch to English',exact:true}).click();
 await page.screenshot({path:`test-results/${testInfo.project.name}-options.png`,fullPage:true});
 await page.getByRole('dialog',{name:'Trip options'}).getByRole('button',{name:'Close options',exact:true}).click();
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');
 const english=JSON.parse(await readFile(`public/trips/locales/en/${trip.id}/${trip.version}.json`,'utf8'));await expect(active.locator('h1')).toHaveText(english.cards[cards[1].id].title);
 await page.getByRole('button',{name:'Details and sources',exact:true}).click();await expect(page.getByRole('dialog')).toContainText(english.cards[cards[1].id].description);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Trip options',exact:true}).click();await page.getByRole('button',{name:'Review choices',exact:true}).click();await expect(page.getByRole('heading',{name:'My choices',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Trip options',exact:true}).click();await page.getByRole('button',{name:'Back to cards',exact:true}).click();await expect(active.locator('h1')).toHaveText(english.cards[cards[1].id].title);
 await page.screenshot({path:`test-results/${testInfo.project.name}-minimal.png`,fullPage:true});
 const session=await(await request.get(`${process.env.E2E_API_URL}/api/session`,{headers:{Authorization:`Bearer ${invite.token}`}})).json();expect(session.answers).toHaveLength(0);
});
test('a trip without an invitation supports trial swipes without sending or retaining answers',async({page})=>{
 const answerRequests:string[]=[];page.on('request',request=>{if(/\/api\/(session|trips\/[^/]+\/answers)/.test(request.url()))answerRequests.push(request.url());});
 await page.goto(`/#/trip/${trip.id}`);await waitForFeed(page);
 const active=page.locator('.experience-card[data-active="true"]');
 for(const [direction,index] of [[1,1],[-1,2]]){
  const box=await active.boundingBox();const x=box!.x+box!.width/2,y=box!.y+box!.height*.4;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+direction*110,y,{steps:6});await page.mouse.up();
  await expect(active.locator('h1')).toHaveText(trip.cards[index].title);await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow',String(index));
 }
 await chooseFromMenu(page,'有興趣');await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','3');
 await page.keyboard.press('ArrowLeft');await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','4');
 for(let index=4;index<trip.cards.length;index++)await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('heading',{name:'已看完這些旅行靈感。'})).toBeVisible();await expect(page.locator('.completion-panel')).toContainText('試玩選擇不會儲存');await expect(page.locator('.completion-panel')).not.toContainText('你的選擇已儲存');
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('trip-helper:session:')))).toEqual([]);
 await page.reload();await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');await expect(active.locator('h1')).toHaveText(trip.cards[0].title);expect(answerRequests).toEqual([]);
});

test('real phone touch swipes work in trial and invited modes',async({page,request},testInfo)=>{
 if(testInfo.project.name!=='mobile')test.skip();
 const invite=await makeInvite(request,'Touch swipe regression');const client=await page.context().newCDPSession(page);
 for(const token of ['',invite.token]){
  const cards=token ? inviteCards(invite) : trip.cards;
  await page.goto(`/#/trip/${trip.id}${token ? `?invite=${token}` : ''}`);await waitForFeed(page);
  const active=page.locator('.experience-card[data-active="true"]');
  for(const [direction,index] of [[1,1],[-1,2]]){
   await touchSwipe(page,client,direction);
   await expect(active.locator('h1')).toHaveText(cards[index].title);await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow',String(index));
  }
 }
 await expect(page.getByRole('status').first()).toHaveText('已儲存');
 const session=await(await request.get(`${process.env.E2E_API_URL}/api/session`,{headers:{Authorization:`Bearer ${invite.token}`}})).json();expect(session.answers).toHaveLength(2);expect(session.answers.find((a:{cardId:string})=>a.cardId===inviteCards(invite)[0].id).choice).toBe('interested');expect(session.answers.find((a:{cardId:string})=>a.cardId===inviteCards(invite)[1].id).choice).toBe('not_interested');
 await client.detach();
});

test('video cards start muted, pause for utilities and allow touch swipes across the media',async({page},testInfo)=>{
 const pack=structuredClone(trip);
 // Four seconds of synthetic colour, generated with ffmpeg; this is test media only.
 const nativeUrl='https://video.example.test/clip.mp4';
 await page.route(nativeUrl,route=>route.fulfill({path:'tests/fixtures/swipe-video.mp4',contentType:'video/mp4'}));
 pack.cards[0].video={url:nativeUrl,kind:'file',startSeconds:0,endSeconds:8};
 pack.cards[1].video={url:'https://www.youtube.com/watch?v=dkr12ZWDd9Y',kind:'embed',startSeconds:3,endSeconds:18};
 await page.route(`**/trips/${trip.id}.json`,route=>route.fulfill({json:pack}));
 // Provider behavior is isolated here; real published videos receive a separate live playback inspection.
 await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'application/javascript',body:`window.YT={Player:class{constructor(el,options){this.el=document.createElement('iframe');this.el.src='https://www.youtube-nocookie.com/embed/'+options.videoId;el.replaceWith(this.el);this.options=options;setTimeout(()=>options.events.onReady({target:this}),0);}mute(){}unMute(){}playVideo(){this.options.events.onStateChange({data:1,target:this});}pauseVideo(){this.options.events.onStateChange({data:2,target:this});}loadVideoById(){this.playVideo();}destroy(){this.el.remove();}}};window.onYouTubeIframeAPIReady();`}));
 await page.route('https://www.youtube-nocookie.com/embed/**',route=>route.fulfill({contentType:'text/html',body:'<body style="background:#000">Provider fixture</body>'}));
 await page.goto(`/#/trip/${trip.id}`);await waitForFeed(page);
 const active=page.locator('.experience-card[data-active="true"]');
 const video=active.locator('video');await expect(video).toHaveAttribute('autoplay','');expect(await video.evaluate((el:HTMLVideoElement)=>el.muted)).toBe(true);
 await expect(active.getByRole('button',{name:'暫停影片',exact:true})).toBeVisible();
 await expect.poll(()=>video.evaluate((el:HTMLVideoElement)=>el.currentTime)).toBeGreaterThan(0);
 await active.getByRole('button',{name:'開啟聲音',exact:true}).click();expect(await video.evaluate((el:HTMLVideoElement)=>el.muted)).toBe(false);
 await page.getByRole('button',{name:'旅程選項',exact:true}).click();await expect.poll(()=>video.evaluate((el:HTMLVideoElement)=>el.paused)).toBe(true);
 await page.getByRole('button',{name:'關閉選項',exact:true}).click();await expect.poll(()=>video.evaluate((el:HTMLVideoElement)=>el.muted)).toBe(true);
 if(testInfo.project.name==='mobile'){const client=await page.context().newCDPSession(page);await touchSwipe(page,client,1);await client.detach();}else await page.keyboard.press('ArrowRight');
 await expect(active.locator('iframe')).toHaveCount(1);await expect(page.locator('iframe')).toHaveCount(1);
 await expect(active.getByRole('button',{name:'暫停影片',exact:true})).toBeVisible();
 await active.getByRole('button',{name:'暫停影片',exact:true}).click();await expect(active.getByRole('button',{name:'播放影片',exact:true})).toBeVisible();
 if(testInfo.project.name==='mobile'){const client=await page.context().newCDPSession(page);await touchSwipe(page,client,-1);await client.detach();}else await page.keyboard.press('ArrowLeft');
 await expect(page.locator('iframe')).toHaveCount(0);await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','2');
});

test('failed original photos show an honest neutral state instead of fabricated landmark art',async({page})=>{
 const pack=structuredClone(trip);delete pack.cards[0].video;
 pack.cards[0].image??={url:'https://image.example.test/verified.jpg',alt:'Verified source image',credit:'Original source',sourceUrl:'https://image.example.test/source'};
 await page.route(`**/trips/${trip.id}.json`,route=>route.fulfill({json:pack}));
 await page.route('**/*',route=>route.request().resourceType()==='image'?route.abort():route.continue());
 await page.goto(`/#/trip/${trip.id}`);await waitForFeed(page);
 const fallback=page.locator('.experience-card[data-active="true"] .image-fallback');await expect(fallback).toBeVisible();await expect(fallback.locator('svg')).toHaveCount(0);await expect(fallback).toHaveText('圖片暫時無法載入');
 await expect(page.locator('.experience-card[data-active="true"] h1')).toHaveText(trip.cards[0].title);
});

test('personal order persists across devices and browsing resumes without voting',async({page,request,browser},testInfo)=>{
 const invite=await makeInvite(request,'Personal resume');const other=await makeInvite(request,'Different order');
 const order=invite.participant.presentation!.cardIds as string[];
 expect(order).toHaveLength(trip.cards.length);expect(new Set(order).size).toBe(trip.cards.length);
 expect(order).not.toEqual(other.participant.presentation!.cardIds);
 const link=`/#/trip/${trip.id}?invite=${invite.token}`;
 await page.goto(link);await waitForFeed(page);const active=page.locator('.experience-card[data-active="true"]');
 await expect(active).toHaveAttribute('data-card-id',order[0]);
 await page.keyboard.press('ArrowRight');await expect(page.getByRole('status').first()).toHaveText('已儲存');await page.keyboard.press('ArrowDown');
 await expect(active).toHaveAttribute('data-card-id',order[2]);await expect(page.getByRole('status').first()).toHaveText('已儲存');
 await page.reload();await waitForFeed(page);await expect(active).toHaveAttribute('data-card-id',order[2]);
 const context=await browser.newContext({locale:'zh-TW',viewport:testInfo.project.use.viewport});const second=await context.newPage();
 await second.goto(new URL(link,page.url()).href);await waitForFeed(second);
 await expect(second.locator('.experience-card[data-active="true"]')).toHaveAttribute('data-card-id',order[2]);
 await switchFeedLanguage(second,'Switch to English');await expect(second.locator('.experience-card[data-active="true"]')).toHaveAttribute('data-card-id',order[2]);
 await second.keyboard.press('ArrowDown');await expect(second.getByRole('status').first()).toHaveText('Saved');
 const data=await(await request.get(`${process.env.E2E_API_URL}/api/trips/${trip.id}/export`,{headers:admin()})).json();
 const visits=data.visits.filter((v:{participantId:string})=>v.participantId===invite.participant.id);
 expect(visits.map((v:{cardId:string})=>v.cardId)).toEqual(expect.arrayContaining(order.slice(0,4)));
 expect(new Set(visits.map((v:{sessionId:string})=>v.sessionId)).size).toBeGreaterThanOrEqual(3);
 const answers=data.answers.filter((a:{participantId:string})=>a.participantId===invite.participant.id);
 expect(answers).toHaveLength(1);expect(answers[0].cardId).toBe(order[0]);expect(visits.some((v:{position:number,cardId:string})=>v.position===3&&v.cardId===order[3])).toBe(true);
 await context.close();
});

test('offline views survive reopening and cannot rewind another device cursor',async({page,context,request,browser})=>{
 const invite=await makeInvite(request,'Offline browsing');const order=invite.participant.presentation!.cardIds as string[];
 const link=`/#/trip/${trip.id}?invite=${invite.token}`;
 await page.goto(link);await waitForFeed(page);await expect(page.getByRole('status').first()).toHaveText('已儲存');
 await context.setOffline(true);await page.keyboard.press('ArrowDown');await expect(page.getByRole('status').first()).toHaveText(/筆待傳送/);await page.keyboard.press('ArrowDown');await expect(page.getByRole('status').first()).toHaveText(/筆待傳送/);
 await expect(page.locator('.experience-card[data-active="true"]')).toHaveAttribute('data-card-id',order[2]);
 const remote=await browser.newContext({locale:'zh-TW'});const fresh=await remote.newPage();await fresh.goto(new URL(link,page.url()).href);await waitForFeed(fresh);
 for(let step=0;step<4;step++){await fresh.keyboard.press('ArrowDown');await expect(fresh.getByRole('status').first()).toHaveText('已儲存');}
 await page.close();await context.setOffline(false);const reopened=await context.newPage();await reopened.goto(link);await waitForFeed(reopened);
 await expect(reopened.getByRole('status').first()).toHaveText('已儲存');
 const session=await(await request.get(`${process.env.E2E_API_URL}/api/session`,{headers:{Authorization:`Bearer ${invite.token}`}})).json();
 expect(session.answers).toHaveLength(0);expect(session.progress.cardId).toBe(order[4]);
 const data=await(await request.get(`${process.env.E2E_API_URL}/api/trips/${trip.id}/export`,{headers:admin()})).json();
 expect(data.visits.filter((v:{participantId:string})=>v.participantId===invite.participant.id).map((v:{cardId:string})=>v.cardId)).toEqual(expect.arrayContaining(order.slice(0,5)));
 await remote.close();
});

test('only settled browsing cards become visits while explicit fast choices remain recorded',async({page,request})=>{
 const invite=await makeInvite(request,'Settled views');const order=invite.participant.presentation!.cardIds;
 await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);await waitForFeed(page);await expect(page.getByRole('status').first()).toHaveText('已儲存');
 await page.locator('.feed-viewport').evaluate(async element=>{for(const position of [1,2,3]){element.scrollTop=element.clientHeight*position;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}});
 await expect(page.locator('.experience-card[data-active="true"]')).toHaveAttribute('data-card-id',order[3]);
 await expect.poll(async()=>{const response=await request.get(`${process.env.E2E_API_URL}/api/session`,{headers:{Authorization:`Bearer ${invite.token}`}});return (await response.json()).progress?.cardId;}).toBe(order[3]);
 const data=await(await request.get(`${process.env.E2E_API_URL}/api/trips/${trip.id}/export`,{headers:admin()})).json();const views=data.visits.filter((v:{participantId:string})=>v.participantId===invite.participant.id).map((v:{cardId:string})=>v.cardId);
 expect(views).not.toContain(order[1]);expect(views).not.toContain(order[2]);expect(data.answers.filter((a:{participantId:string})=>a.participantId===invite.participant.id)).toHaveLength(0);
 await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','2');await expect(page.getByRole('status').first()).toHaveText('已儲存');
 const final=await(await request.get(`${process.env.E2E_API_URL}/api/trips/${trip.id}/export`,{headers:admin()})).json();expect(final.visits.filter((v:{participantId:string})=>v.participantId===invite.participant.id).map((v:{cardId:string})=>v.cardId)).toEqual(expect.arrayContaining([order[3],order[4]]));
});

test('acknowledged local cursor survives an API-offline reopening',async({page,request})=>{
 const invite=await makeInvite(request,'Cached cursor');const order=invite.participant.presentation!.cardIds;
 await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);await waitForFeed(page);await expect(page.getByRole('status').first()).toHaveText('已儲存');
 await page.reload();await waitForFeed(page);await expect(page.getByRole('status').first()).toHaveText('已儲存');
 await page.keyboard.press('ArrowDown');await expect(page.locator('.experience-card[data-active="true"]')).toHaveAttribute('data-card-id',order[1]);await expect(page.getByRole('status').first()).toHaveText('已儲存');
 await page.route('**/api/**',route=>route.abort());await page.reload();await waitForFeed(page);
 await expect(page.locator('.experience-card[data-active="true"]')).toHaveAttribute('data-card-id',order[1]);
});

// A deferred card must remain unanswered, and an initially vertical gesture may turn sideways.
test('defer button preserves answers and diagonal swipes recover from vertical starts',async({page},testInfo)=>{
 await page.goto(`/#/trip/${trip.id}`);await waitForFeed(page);
 const active=page.locator('.experience-card[data-active="true"]');
 await page.getByRole('button',{name:'稍後決定',exact:true}).click();
 await expect(active.locator('h1')).toHaveText(trip.cards[1].title);
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');
 await page.getByRole('button',{name:'旅程選項',exact:true}).click();await page.getByRole('button',{name:'上一張',exact:true}).click();
 await expect(active.locator('h1')).toHaveText(trip.cards[0].title);
 const box=await active.boundingBox();const x=box!.x+box!.width/2,y=box!.y+box!.height*.4;
 const client=await page.context().newCDPSession(page);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+2,y:y+25}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+110,y:y+100}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect(active.locator('h1')).toHaveText(trip.cards[1].title);
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+180}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect(active.locator('h1')).toHaveText(trip.cards[1].title);
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
 const skip=await page.getByRole('button',{name:'稍後決定',exact:true}).boundingBox();
 expect(skip!.height).toBeGreaterThanOrEqual(44);expect(skip!.x+skip!.width).toBeLessThanOrEqual(box!.x+box!.width);
 await page.screenshot({path:`test-results/${testInfo.project.name}-defer-button.png`});
});

test('deferred round lists only unanswered cards and the Japanese card shows the persistent button',async({page},testInfo)=>{
 const japan=JSON.parse(await readFile('public/trips/kyoto-tokyo-2026-dec.json','utf8')) as Trip;
 const pack={...japan,cards:japan.cards.slice(0,3)};
 await page.route(`**/trips/${japan.id}.json`,route=>route.fulfill({json:pack}));
 await page.goto(`/#/trip/${japan.id}`);await waitForFeed(page);
 const active=page.locator('.experience-card[data-active="true"]');
 await expect(active.locator('img')).toBeVisible();
 await expect.poll(()=>active.locator('img').evaluate((image:HTMLImageElement)=>image.complete && image.naturalWidth>0)).toBe(true);
 await page.screenshot({path:`test-results/${testInfo.project.name}-japan-defer.png`});
 await page.getByRole('button',{name:'稍後決定',exact:true}).click();
 await expect(active.locator('h1')).toHaveText(pack.cards[1].title);
 await page.keyboard.press('ArrowRight');
 await page.getByRole('button',{name:'稍後決定',exact:true}).click();
 await page.getByRole('button',{name:'看看尚未決定的體驗',exact:true}).click();
 await expect(page.locator('.review-row')).toHaveCount(2);
 await expect(page.locator('.review-row')).not.toContainText([pack.cards[1].title]);
 await page.locator('.review-row').first().click();
 await expect(active.locator('h1')).toHaveText(pack.cards[0].title);
 await switchFeedLanguage(page,'Switch to English');
 await expect(page.getByRole('button',{name:'Decide later',exact:true})).toBeVisible();
});
test('formal deferral creates no negative answer and preserves a prior choice',async({page,request})=>{
 const invite=await makeInvite(request,'Deferral regression');const cards=inviteCards(invite);
 const answers=async()=>{const response=await request.get(`${process.env.E2E_API_URL}/api/session`,{headers:{Authorization:`Bearer ${invite.token}`}});return (await response.json()).answers;};
 await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);await waitForFeed(page);
 await page.getByRole('button',{name:'稍後決定',exact:true}).click();
 expect(await answers()).toHaveLength(0);
 await expect(page.locator('.experience-card[data-active="true"]')).toHaveAttribute('data-card-id',cards[1].id);
 await page.getByRole('button',{name:'旅程選項',exact:true}).click();await page.getByRole('button',{name:'上一張',exact:true}).click();await page.keyboard.press('ArrowRight');
 await expect.poll(answers).toEqual([expect.objectContaining({cardId:cards[0].id,choice:'interested'})]);
 await page.getByRole('button',{name:'旅程選項',exact:true}).click();await page.getByRole('button',{name:'上一張',exact:true}).click();
 await page.getByRole('button',{name:'稍後決定',exact:true}).click();
 expect(await answers()).toEqual([expect.objectContaining({cardId:cards[0].id,choice:'interested'})]);
});

test('deferral shrinks into a rounded card without an obstructing toast',async({page},testInfo)=>{
 await page.goto(`/#/trip/${trip.id}`);await waitForFeed(page);
 const active=page.locator('.experience-card[data-active="true"]');
 await page.getByRole('button',{name:'稍後決定',exact:true}).click();
 await expect(active).toHaveClass(/is-deferring/,{timeout:1000});
 await expect(page.getByRole('button',{name:'旅程選項',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'活動詳情與來源',exact:true})).toBeDisabled();
 await expect.poll(()=>active.evaluate(element=>{
   const style=getComputedStyle(element);
   return parseFloat(style.borderRadius)>20 && new DOMMatrixReadOnly(style.transform).a<.97;
 }),{intervals:[16],timeout:1000}).toBe(true);
 await expect(page.locator('.defer-toast')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'稍後決定',exact:true})).toBeDisabled();
 await expect(active.locator('h1')).toHaveText(trip.cards[1].title);
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');
});

test('dragged cards shrink with round corners and reuse the menu choice icons',async({page},testInfo)=>{
 const japan=JSON.parse(await readFile('public/trips/kyoto-tokyo-2026-dec.json','utf8')) as Trip;
 await page.goto(`/#/trip/${japan.id}`);await waitForFeed(page);
 const active=page.locator('.experience-card[data-active="true"]');
 await expect.poll(()=>active.locator('img').evaluate((image:HTMLImageElement)=>image.complete && image.naturalWidth>0),{timeout:15000}).toBe(true);
 const box=await active.boundingBox();const x=box!.x+box!.width/2,y=box!.y+box!.height*.4;
 for(const [distance,label] of [[40,'有興趣'],[-40,'沒興趣']] as const){
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+distance,y,{steps:4});
  const feedback=page.getByRole('img',{name:label,exact:true});await expect(feedback).toHaveAttribute('aria-label',label,{timeout:1000});
  await expect(feedback.locator('svg')).toBeVisible();await expect(feedback).toHaveText('');
  expect(await active.evaluate(element=>parseFloat(getComputedStyle(element).borderRadius))).toBeGreaterThan(0);
  const dragPath=await feedback.locator('path').getAttribute('d');
  const shrunk=await active.boundingBox();expect(shrunk!.height).toBeLessThan(box!.height);
  const left=page.getByRole('img',{name:'沒興趣',exact:true}),right=page.getByRole('img',{name:'有興趣',exact:true});
  const leftBox=await left.boundingBox(),rightBox=await right.boundingBox();expect(leftBox!.x).toBeLessThan(rightBox!.x);
  const brightness=async(name:string)=>page.getByRole('img',{name,exact:true}).evaluate(element=>Number(getComputedStyle(element).opacity));
  expect(await brightness(label)).toBeGreaterThan(await brightness(distance>0?'沒興趣':'有興趣'));
  await page.mouse.move(x,y);
  await expect(left).toBeVisible();await expect(right).toBeVisible();
  expect(await brightness('沒興趣')).toBe(await brightness('有興趣'));
  await page.mouse.move(x+distance,y);
  await page.screenshot({path:`test-results/${testInfo.project.name}-drag-${distance>0?'heart':'cross'}.png`});
  await page.mouse.up();await expect(feedback).toHaveCount(0);
  await page.getByRole('button',{name:'旅程選項',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('button',{name:label,exact:true}).locator('path')).toHaveAttribute('d',dragPath!);
  await page.keyboard.press('Escape');
 }
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');
});

test('decide later stays at the bottom when titles change or the card moves',async({page})=>{
 await page.goto(`/#/trip/${trip.id}`);await waitForFeed(page);
 const button=page.getByRole('button',{name:'稍後決定',exact:true});const before=await button.boundingBox();
 expect(before!.y).toBeGreaterThan(page.viewportSize()!.height*.88);
 const active=page.locator('.experience-card[data-active="true"]');const box=await active.boundingBox();
 const x=box!.x+box!.width/2,y=box!.y+box!.height*.4;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y,{steps:4});
 await expect(button).toBeHidden();
 await page.mouse.up();await button.click();await expect(active.locator('h1')).toHaveText(trip.cards[1].title);
 const after=await button.boundingBox();expect(after!.x).toBeCloseTo(before!.x,1);expect(after!.y).toBeCloseTo(before!.y,1);
 const title=await active.locator('h1').boundingBox();expect(title!.y+title!.height).toBeLessThan(after!.y);
});

test('holding keeps content visible and shows the commit threshold using only icons',async({page})=>{
 await page.goto(`/#/trip/${trip.id}`);await waitForFeed(page);
 const active=page.locator('.experience-card[data-active="true"]');const box=await active.boundingBox();
 const x=box!.x+box!.width/2,y=box!.y+box!.height*.4;
 await page.mouse.move(x,y);await page.mouse.down();
 await expect(active.locator('.feed-copy')).toBeVisible();
 await expect.poll(()=>active.evaluate(element=>parseFloat(getComputedStyle(element).scale)<1 && parseFloat(getComputedStyle(element).borderRadius)>0),{timeout:1000}).toBe(true);
 await expect(page.locator('.release-result')).toHaveText('放開不會作答');
 await expect(page.locator('.feed-hud')).toBeHidden();await expect(page.locator('.defer-row')).toBeHidden();
 await page.mouse.move(x+40,y,{steps:4});await expect(page.locator('.gesture-choice.is-ready')).toHaveCount(0);
 await page.mouse.move(x+110,y,{steps:4});await expect(page.locator('.gesture-choice.yes')).toHaveClass(/is-ready/);await expect(page.locator('.release-result')).toHaveCount(0);
 await page.mouse.move(x,y,{steps:4});await expect(page.locator('.gesture-choice.is-ready')).toHaveCount(0);await expect(page.locator('.release-result')).toHaveText('放開不會作答');
 await page.mouse.move(x-110,y,{steps:4});await expect(page.locator('.gesture-choice.no')).toHaveClass(/is-ready/);
 await page.mouse.up();await expect(page.locator('.gesture-choice')).toHaveCount(0);await expect(page.locator('.feed-hud')).toBeVisible();await expect(active.locator('.feed-copy')).toBeVisible();await expect(page.locator('.defer-row')).toBeVisible();
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');await expect(active.locator('h1')).toHaveText(trip.cards[1].title);
 await page.getByRole('button',{name:'旅程選項',exact:true}).click();await page.getByRole('button',{name:'查看選擇',exact:true}).click();
 await expect(page.locator('.review-row').first().locator('.review-choice')).toHaveText('沒興趣');
});

test('organizer home lists catalog trips and is reachable without remembering a trip URL',async({page},testInfo)=>{
 await page.goto('/');await page.getByRole('link',{name:'旅程管理',exact:true}).click();
 await expect(page).toHaveURL(/#\/manage$/);await expect(page.getByRole('heading',{name:'旅程管理',exact:true})).toBeVisible();
 const catalog=JSON.parse(await readFile('public/trips/index.json','utf8'));
 for(const summary of catalog.trips)await expect(page.locator(`a.trip-tile[href="#/manage/${summary.id}"]`)).toBeVisible();
 await page.locator(`a.trip-tile[href="#/manage/${trip.id}"]`).click();await expect(page.getByLabel('管理金鑰')).toBeVisible();
 await page.getByRole('link',{name:'回管理首頁',exact:true}).click();await expect(page).toHaveURL(/#\/manage$/);
 await page.reload();await expect(page.getByRole('heading',{name:'旅程管理',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Switch to English',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Trip organizer',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Back to trips',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/${testInfo.project.name}-manage-home.png`});
});
