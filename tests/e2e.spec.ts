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
