/** Copies SDK cookie headers verbatim, preserving their security attributes. */
export function appendSetCookies(target: Headers, source: Headers): void {
  for (const cookie of source.getSetCookie()) {
    target.append('set-cookie', cookie);
  }
}
