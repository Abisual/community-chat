export interface MicrophonePermissionRequest {
  isMainWindow: boolean;
  isMainFrame: boolean;
  requestingUrl: string;
  mediaTypes: string[];
}

export interface ScreenCaptureRequest {
  isMainWindow: boolean;
  isMainFrame: boolean;
  requestingUrl: string;
  videoRequested: boolean;
  userGesture: boolean;
  selectedSourceAvailable: boolean;
}

export interface MediaPermissionRequest {
  isMainWindow: boolean;
  isMainFrame: boolean;
  requestingUrl: string;
  mediaTypes: string[];
  selectedSourceAvailable: boolean;
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

export function mayAccessMedia(
  request: MediaPermissionRequest,
  developmentUrl?: string
): boolean {
  if (!request.isMainWindow || !request.isMainFrame || !isTrustedRendererUrl(request.requestingUrl, developmentUrl)) {
    return false;
  }
  if (request.mediaTypes.length === 0) return request.selectedSourceAvailable;
  if (request.mediaTypes.length !== 1) return false;
  if (request.mediaTypes[0] === 'audio') return true;
  return request.mediaTypes[0] === 'video' && request.selectedSourceAvailable;
}

export function mayCaptureScreen(request: ScreenCaptureRequest, developmentUrl?: string): boolean {
  return request.isMainWindow
    && request.isMainFrame
    && request.videoRequested
    && request.userGesture
    && request.selectedSourceAvailable
    && isTrustedRendererUrl(request.requestingUrl, developmentUrl);
}
