import { isInHost } from '../services/hostEnvironment';

export const IPFS_GATEWAYS = [
  'https://w3s.link/ipfs/',
  'https://dweb.link/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://flk-ipfs.xyz/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

const DEFAULT_GATEWAY = IPFS_GATEWAYS[0];

/** Extract the bare CID (+ path) from an ipfs:// URI, gateway URL, or bare CID */
export function extractCid(uri: string): string | null {
  if (!uri) return null;
  if (uri.startsWith('ipfs://')) return uri.slice('ipfs://'.length);
  for (const gw of IPFS_GATEWAYS) {
    if (uri.startsWith(gw)) return uri.slice(gw.length);
  }
  // Already a bare CID (starts with Qm or bafy)
  if (/^(Qm|bafy)/i.test(uri)) return uri;
  return null;
}

/** Resolve an ipfs:// URI to a gateway URL */
export function ipfsUrl(uri: string, gateway = DEFAULT_GATEWAY): string {
  if (!uri) return '';
  const cid = extractCid(uri);
  if (cid) return `${gateway}${cid}`;
  // Already a full non-IPFS URL
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  return `${gateway}${uri}`;
}

/** Fetch JSON from IPFS, trying multiple gateways until one succeeds.
 *  Some gateways (w3s.link, dweb.link) redirect to subdomain-style URLs
 *  which break fetch() due to CORS. This helper falls back through the list. */
export async function fetchIpfsJson(uri: string): Promise<unknown> {
  const cid = extractCid(uri);
  if (!cid) throw new Error(`Invalid IPFS URI: ${uri}`);

  for (const gw of IPFS_GATEWAYS) {
    try {
      const res = await fetch(`${gw}${cid}`);
      if (!res.ok) continue;
      return await res.json();
    } catch {
      // Gateway failed (CORS, network, etc.) — try next
    }
  }
  throw new Error(`All IPFS gateways failed for ${cid}`);
}

/** Upload a file to Pinata and return the IPFS CID.
 *  Not available in Triangle host mode (fetch is sandboxed). */
export async function uploadToPinata(file: File, apiKey: string): Promise<string> {
  if (isInHost()) {
    throw new Error('File uploads are not available in the Triangle host environment.');
  }
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata upload failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.IpfsHash as string;
}
