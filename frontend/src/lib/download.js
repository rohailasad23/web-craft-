import api from './api';

/**
 * Pull the most useful message out of a failed request.
 *
 * With `responseType: 'blob'` the server's JSON error arrives as a Blob, so
 * getErrorMessage() in lib/api.js cannot see it -- this handles both shapes.
 */
async function messageOf(error, fallback) {
  const data = error?.response?.data;

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.error) return parsed.error;
    } catch {
      /* body was not JSON (a proxy error page, an HTML 500) -- fall through */
    }
  }
  if (data?.error) return data.error;
  if (error?.code === 'ERR_NETWORK') {
    return 'Cannot reach the server. Is the backend running?';
  }
  return fallback;
}

/**
 * Download a template archive.
 *
 * The API sends the bytes from an authenticated route (which is also where the
 * download is recorded), so we cannot just point an <a> at it -- fetch with the
 * token, turn the response into an object URL, and let the browser save it.
 */
export async function downloadTemplate(template) {
  const slug = typeof template === 'string' ? template : template?.slug;
  if (!slug) throw new Error('This template has no download link.');

  try {
    const res = await api.post(
      `/api/templates/${encodeURIComponent(slug)}/download`,
      {},
      { responseType: 'blob' }
    );

    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}.zip`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoke after the browser has had time to start the transfer.
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    return true;
  } catch (error) {
    throw new Error(await messageOf(error, 'Download failed. Please try again.'));
  }
}
