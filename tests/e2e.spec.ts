import { test,expect, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Trip } from '../shared/types.js';
const trip=JSON.parse(await readFile('public/trips/taipei-2026-dec.json','utf8')) as Trip;
const admin=()=>({Authorization:`Bearer ${process.env.E2E_ADMIN_TOKEN}`});
async function makeInvite(request:APIRequestContext,name:string){const response=await request.post(`${process.env.E2E_API_URL}/api/trips/${trip.id}/invites`,{headers:admin(),data:{name}});expect(response.status()).toBe(201);return response.json();}
test('binary full round, reload resume and raw export on mobile and desktop',async({page,request},testInfo)=>{
 const invite=await makeInvite(request,`${testInfo.project.name} test`);
 await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);
 const yes=page.getByRole('button',{name:'有興趣',exact:true}),no=page.getByRole('button',{name:'沒興趣',exact:true});
 await expect(yes).toBeEnabled();await yes.click();await no.click();
 await expect(page.getByRole('progressbar',{name:'已回答進度'})).toHaveAttribute('aria-valuenow','2');
 await expect(page.getByRole('status').first()).toHaveText('已儲存');
 await page.reload();await expect(yes).toBeEnabled();await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','2');
 await page.screenshot({path:`test-results/${testInfo.project.name}-swipe.png`,fullPage:true});
 for(let index=2;index<trip.cards.length;index++)await(index%2?no:yes).click();
 await expect(page.getByRole('heading',{name:'你的喜歡，收到。'})).toBeVisible();
 await expect(page.getByRole('status').first()).toHaveText('已儲存');
 const exported=await(await request.get(`${process.env.E2E_API_URL}/api/trips/${trip.id}/export`,{headers:admin()})).json();
 expect(exported.answers.filter((a:{participantId:string})=>a.participantId===invite.participant.id)).toHaveLength(trip.cards.length);
 expect(exported.events.filter((a:{participantId:string})=>a.participantId===invite.participant.id)).toHaveLength(trip.cards.length);
 expect(JSON.stringify(exported)).not.toContain(invite.token);
});
test('horizontal swipes and arrow keys record opposite binary choices',async({page,request})=>{
 const invite=await makeInvite(request,'Gesture test');await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);await expect(page.getByRole('button',{name:'有興趣',exact:true})).toBeEnabled();
 const card=page.locator('.experience-card[data-active="true"]');
 await card.evaluate(element=>{const point=(x:number)=>new Touch({identifier:1,target:element,clientX:x,clientY:200});element.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,changedTouches:[point(100)]}));element.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[point(260)]}));});
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
 await page.keyboard.press('ArrowLeft');await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','2');await expect(page.getByRole('status').first()).toHaveText('已儲存');
 const session=await(await request.get(`${process.env.E2E_API_URL}/api/session`,{headers:{Authorization:`Bearer ${invite.token}`}})).json();
 expect(session.answers.find((a:{cardId:string})=>a.cardId===trip.cards[0].id).choice).toBe('interested');expect(session.answers.find((a:{cardId:string})=>a.cardId===trip.cards[1].id).choice).toBe('not_interested');
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
 await page.goto(link);await expect(page.getByRole('button',{name:'有興趣',exact:true})).toBeEnabled();
 const second=await context.newPage();await second.goto(link);await expect(second.getByRole('button',{name:'有興趣',exact:true})).toBeEnabled();await second.getByRole('button',{name:'下一張'}).click();
 await context.setOffline(true);await page.getByRole('button',{name:'有興趣',exact:true}).click();await second.getByRole('button',{name:'沒興趣',exact:true}).click();
 await page.close();await second.close();await context.setOffline(false);const resumed=await context.newPage();await resumed.goto(link);
 await expect(resumed.getByRole('progressbar')).toHaveAttribute('aria-valuenow','2');await expect(resumed.getByRole('status').first()).toHaveText('已儲存');
 const session=await(await request.get(`${process.env.E2E_API_URL}/api/session`,{headers:{Authorization:`Bearer ${invite.token}`}})).json();expect(session.answers).toHaveLength(2);
});
test('valid invite uses its stored snapshot when public trip file is unavailable',async({page,request})=>{
 const invite=await makeInvite(request,'Snapshot test');await page.route(`**/trips/${trip.id}.json`,route=>route.fulfill({status:404,body:'Retired'}));await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);await expect(page.getByRole('button',{name:'有興趣',exact:true})).toBeEnabled();
});

test('two answer buttons fit the phone viewport without scrolling',async({page,request},testInfo)=>{
 if(testInfo.project.name!=='mobile')test.skip();
 const invite=await makeInvite(request,'Small phone');
 for(const viewport of [{width:393,height:852},{width:375,height:667}]){
  await page.setViewportSize(viewport);await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);
  const button=page.getByRole('button',{name:'有興趣',exact:true});await expect(button).toBeEnabled();const box=await button.boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height);
 }
});

test('immersive feed fills the screen and vertical browsing does not vote',async({page,request},testInfo)=>{
 const invite=await makeInvite(request,'Immersive feed');
 await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);
 const feed=page.locator('.feed-viewport');await expect(feed).toBeVisible({timeout:2000});
 const active=page.locator('.experience-card[data-active="true"]');const viewport=page.viewportSize()!;
 const frame=await feed.boundingBox();expect(frame!.height).toBeGreaterThanOrEqual(viewport.height*.95);
 if(testInfo.project.name==='mobile')expect(frame!.width).toBe(viewport.width);else expect(frame!.width).toBeLessThanOrEqual(560);
 const first=await active.boundingBox();expect(first!.height).toBeGreaterThanOrEqual(frame!.height-2);
 await expect(active.getByRole('heading',{name:trip.cards[0].title,exact:true})).toBeVisible();
 await feed.evaluate(element=>element.scrollTo({top:element.clientHeight,behavior:'instant'}));
 await expect(active.getByRole('heading',{name:trip.cards[1].title,exact:true})).toBeVisible();
 await expect(page.getByRole('progressbar',{name:'已回答進度'})).toHaveAttribute('aria-valuenow','0');
 const session=await(await request.get(`${process.env.E2E_API_URL}/api/session`,{headers:{Authorization:`Bearer ${invite.token}`}})).json();expect(session.answers).toHaveLength(0);
 await page.screenshot({path:`test-results/${testInfo.project.name}-immersive.png`,fullPage:true});
});
test('drag shows choice intent before release and records the choice on release',async({page,request})=>{
 const invite=await makeInvite(request,'Drag feedback');await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);await expect(page.getByRole('button',{name:'有興趣',exact:true})).toBeEnabled();
 const active=page.locator('.experience-card[data-active="true"]');const box=await active.boundingBox();const x=box!.x+box!.width/2,y=box!.y+box!.height*.35;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+110,y,{steps:6});
 await expect(active).toHaveAttribute('data-drag-intent','interested');await expect(page.locator('.gesture-stamp')).toHaveText('有興趣');
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');
 await page.mouse.up();await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');await expect(page.getByRole('status').first()).toHaveText('已儲存');
});

test('language switch translates the whole card and keeps progress across reload',async({page,request},testInfo)=>{
 const invite=await makeInvite(request,'Bilingual test');await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);
 await expect(page.getByRole('button',{name:'有興趣',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Switch to English',exact:true}).click();
 const active=page.locator('.experience-card[data-active="true"]');
 const english=JSON.parse(await readFile(`public/trips/locales/en/${trip.id}/${trip.version}.json`,'utf8'));
 await expect(active.getByRole('heading',{name:english.cards[trip.cards[0].id].title,exact:true})).toBeVisible();
 const yes=page.getByRole('button',{name:'Interested',exact:true});await expect(yes).toBeEnabled();
 await page.getByRole('button',{name:'Details and sources',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Planning estimate');await expect(page.getByRole('dialog')).toContainText('Source');await page.getByRole('button',{name:'Close details'}).click();
 await yes.click();await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');await expect(page.getByRole('status').first()).toHaveText('Saved');
 await page.reload();await expect(page.getByRole('button',{name:'Interested',exact:true})).toBeEnabled();await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
 await page.screenshot({path:`test-results/${testInfo.project.name}-english.png`,fullPage:true});
 await page.getByRole('button',{name:'切換為正體中文',exact:true}).click();await expect(page.getByRole('button',{name:'有興趣',exact:true})).toBeEnabled();await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
 const exported=await(await request.get(`${process.env.E2E_API_URL}/api/trips/${trip.id}/export`,{headers:admin()})).json();const events=exported.events.filter((e:{participantId:string})=>e.participantId===invite.participant.id);expect(events).toHaveLength(1);expect(events[0].cardId).toBe(trip.cards[0].id);expect(events[0].displayLocale).toBe('en');
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
 const invite=await makeInvite(request,'Small English phone');await page.goto(`/#/trip/${trip.id}?invite=${invite.token}`);await page.getByRole('button',{name:'Switch to English',exact:true}).click();
 const english=JSON.parse(await readFile(`public/trips/locales/en/${trip.id}/${trip.version}.json`,'utf8'));await expect(page.locator('.experience-card[data-active="true"] h1')).toHaveText(english.cards[trip.cards[0].id].title);
 const button=page.getByRole('button',{name:'Not interested',exact:true});const box=await button.boundingBox();const text=await button.locator('span').boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(667);expect(text!.x).toBeGreaterThanOrEqual(box!.x);expect(text!.x+text!.width).toBeLessThanOrEqual(box!.x+box!.width);
 await page.screenshot({path:'test-results/small-phone-english.png',fullPage:true});
 // Seed before bootstrap in an isolated context so another tab's successful
 // translation fetch cannot replace the deliberately damaged cache.
 const context=await page.context().browser()!.newContext({locale:'en',viewport:{width:375,height:667}});
 await context.addInitScript(({tripId,version,copy})=>{copy.cards[Object.keys(copy.cards)[0]].title={invalid:'value'};localStorage.setItem('trip-helper:locale','en');localStorage.setItem(`trip-helper:translation:${tripId}:${version}:en`,JSON.stringify(copy));},{tripId:trip.id,version:trip.version,copy:english});
 const preview=await context.newPage();await preview.route(`**/trips/locales/en/${trip.id}/${trip.version}.json`,route=>route.fulfill({status:404,body:'Unavailable'}));await preview.goto(`${new URL(page.url()).origin}/#/trip/${trip.id}`);
 await expect(preview.locator('.experience-card[data-active="true"] h1')).toHaveText(trip.cards[0].title);await expect(preview.locator('.feed-alerts')).toContainText('English is unavailable');
 await context.close();
});
