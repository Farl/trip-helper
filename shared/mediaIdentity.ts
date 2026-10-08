/** Resize derivatives may share an asset; query-addressed downloads must retain their asset key. */
export function imageIdentityUrl(source:string):string {
 const url=new URL(source);
 url.searchParams.sort();
 const path=url.pathname.replace(/@\d+x\d+(?=\.)/g,'').replace(/\d+x\d+_/g,'');
 return `${url.hostname.replace(/^www\./,'')}${path}${url.search}`;
}
