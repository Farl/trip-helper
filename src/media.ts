// Fullscreen Taipei photos use the verified larger derivative of the same source image.
const variant = {
 host: import.meta.env.VITE_IMAGE_VARIANT_HOST ?? 'www.travel.taipei',
 sourceSize: import.meta.env.VITE_IMAGE_SOURCE_SIZE ?? '640x480',
 displaySize: import.meta.env.VITE_IMAGE_DISPLAY_SIZE ?? '1024x768',
};
export function preferredPhotoUrl(source:string):string {
 try {
  const url=new URL(source);
  if(url.hostname!==variant.host)return source;
  url.pathname=url.pathname.replace(`/${variant.sourceSize}_`,`/${variant.displaySize}_`);
  return url.href;
 }catch{return source;}
}
