// Resolve public resources from index.html, including when hosted in a subdirectory.
// Workers receive this base explicitly because their own URL lives under assets/.
export function appAssetUrl(path: string, pageUrl = document.baseURI): string {
  return new URL(path.replace(/^\/+/, ''), new URL('.', pageUrl)).href;
}
