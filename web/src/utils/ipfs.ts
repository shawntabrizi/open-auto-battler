const DEFAULT_GATEWAY = 'https://ipfs.io/ipfs/';

/** Resolve an ipfs:// URI to a gateway URL */
export function ipfsUrl(uri: string, gateway = DEFAULT_GATEWAY): string {
  if (!uri) return '';
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice('ipfs://'.length);
    return `${gateway}${cid}`;
  }
  // Already a full URL
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }
  // Bare CID
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
