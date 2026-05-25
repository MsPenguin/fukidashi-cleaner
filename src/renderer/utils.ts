export function toFileUrlFromPath(p: string) {
  let s = p.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(s)) s = "/" + s;
  return `file://${encodeURI(s)}`;
}
