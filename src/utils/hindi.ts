export async function suggestHindiName(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return '';
  try {
    const url = `https://inputtools.google.com/request?text=${encodeURIComponent(trimmed)}&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=test`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return '';
    const json = await res.json();
    if (json && json[0] === 'SUCCESS' && json[1]?.[0]?.[1]?.[0]) {
      return json[1][0][1][0].trim();
    }
    return '';
  } catch (err) {
    // Graceful fallback when offline or request fails
    return '';
  }
}
