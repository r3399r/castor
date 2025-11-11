export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent;
  // Common in-app browsers
  if (
    ua.includes('FBAN') ||
    ua.includes('FBAV') || // Facebook
    ua.includes('Instagram') || // Instagram
    ua.includes('Line') || // LINE
    ua.includes('Messenger') || // Facebook Messenger
    ua.includes('Twitter') || // Twitter
    ua.includes('WhatsApp') || // WhatsApp
    ua.includes('Snapchat') // Snapchat
  )
    return true;

  // Add more checks as needed
  return false;
}
