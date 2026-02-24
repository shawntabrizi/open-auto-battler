export const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://flk-ipfs.xyz/ipfs/',
  'https://w3s.link/ipfs/',
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

/** Upload a file to Pinata and return the IPFS CID */
export async function uploadToPinata(file: File, apiKey: string): Promise<string> {
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
