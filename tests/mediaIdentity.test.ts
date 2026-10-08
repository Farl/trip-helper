import { it,expect } from 'vitest';
import { imageIdentityUrl } from '../shared/mediaIdentity.js';
it('distinguishes query-addressed assets while recognizing resized copies of the same photo',()=>{
 expect(imageIdentityUrl('https://venue.test/Download.ashx?id=photo-a&lang=zh')).not.toBe(imageIdentityUrl('https://venue.test/Download.ashx?id=photo-b&lang=zh'));
 expect(imageIdentityUrl('https://venue.test/Download.ashx?lang=zh&id=photo-a')).toBe(imageIdentityUrl('https://venue.test/Download.ashx?id=photo-a&lang=zh#preview'));
 expect(imageIdentityUrl('https://www.travel.taipei/photos/640x480_scene.jpg')).toBe(imageIdentityUrl('https://travel.taipei/photos/1024x768_scene.jpg'));
});
