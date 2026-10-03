export interface MicrophonePermissionRequest {
  isMainWindow: boolean;
  isMainFrame: boolean;
  requestingUrl: string;
  mediaTypes: string[];
}

export function isTrustedRendererUrl(url: string, developmentUrl?: string): boolean {
  try {
    const requested = new URL(url);
    if (developmentUrl) return requested.origin === new URL(developmentUrl).origin;
    return requested.protocol === 'file:' && requested.pathname.endsWith('/renderer/index.html');
  } catch {
    return false;
  }
}

export function mayAccessMicrophone(
  request: MicrophonePermissionRequest,
  developmentUrl?: string
): boolean {
  return request.isMainWindow
    && request.isMainFrame
    && request.mediaTypes.length > 0
    && request.mediaTypes.every((type) => type === 'audio')
    && isTrustedRendererUrl(request.requestingUrl, developmentUrl);
}
