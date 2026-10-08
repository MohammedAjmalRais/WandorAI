// Resilient API client with multiple host fallback support

const ENDPOINT_CANDIDATES = [
  '/plan',
  'http://localhost:8000/plan',
  'http://127.0.0.1:8000/plan'
];

export async function fetchPlan(payload: any): Promise<Response> {
  let lastError: any = null;

  for (const url of ENDPOINT_CANDIDATES) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Unable to connect to the backend server. Please verify the server is running.');
}

export function getChatBaseUrl(): string {
  return '';
}
