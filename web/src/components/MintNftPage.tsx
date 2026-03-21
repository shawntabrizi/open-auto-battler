import React, { useState, useRef } from 'react';
import { useArenaStore } from '../store/arenaStore';
import { useIsSubmitting } from '../store/txStore';
import { toast } from 'react-hot-toast';
import { uploadToPinata, ipfsUrl } from '../utils/ipfs';
import { submitTx } from '../utils/tx';
import { IpfsImage } from './IpfsImage';
import { TopBar } from './TopBar';
import { DesktopRecommendedBanner } from './DesktopRecommendedBanner';
import { Binary } from 'polkadot-api';
import type { CustomizationType } from '../store/customizationStore';

const TYPE_OPTIONS: { value: CustomizationType; label: string; specs: string }[] = [
  { value: 'board_bg', label: 'Board Background', specs: '16:9, 1920x1080, PNG/WebP, max 2 MB' },
  { value: 'hand_bg', label: 'Hand Background', specs: '5:1, 1920x384, PNG/WebP, max 1 MB' },
  {
    value: 'card_style',
    label: 'Card Style Frame',
    specs: '3:4, 256x352, PNG with alpha, max 500 KB',
  },
  { value: 'avatar', label: 'Player Avatar', specs: '1:1, 256x256, PNG/WebP, max 500 KB' },
];

const PINATA_KEY_STORAGE = 'oab_pinata_key';

export const MintNftPage: React.FC = () => {
  const { isConnected, connect, api, selectedAccount } = useArenaStore();

  const [nftType, setNftType] = useState<CustomizationType>('board_bg');
  const [uploadTab, setUploadTab] = useState<'pinata' | 'manual'>('manual');
  const [cid, setCid] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [collectionId, setCollectionId] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const isSubmitting = useIsSubmitting();
  const [collectionExists, setCollectionExists] = useState<boolean | null>(null);
  const [pinataKey, setPinataKey] = useState(() => {
    try {
      return localStorage.getItem(PINATA_KEY_STORAGE) || '';
    } catch {
      return '';
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if the collection exists when collectionId or api changes
  React.useEffect(() => {
    if (!api || !isConnected) return;
    setCollectionExists(null);
    api.query.Nfts.Collection.getValue(collectionId)
      .then((val: any) => setCollectionExists(val !== undefined && val !== null))
      .catch(() => setCollectionExists(false));
  }, [api, isConnected, collectionId]);

  const handleCreateCollection = async () => {
    if (!api || !selectedAccount) return;
    try {
      // pallet-nfts uses INVERTED bitflags:
      //   BitFlags::EMPTY (0) = all settings ENABLED
      //   A set bit = that setting is DISABLED
      // So 0n = fully permissive (transferable, unlocked metadata, etc.)
      const tx = api.tx.Nfts.create({
        admin: { type: 'Id', value: selectedAccount.address },
        config: {
          settings: 0n,
          max_supply: undefined,
          mint_settings: {
            mint_type: { type: 'Public' },
            price: undefined,
            start_block: undefined,
            end_block: undefined,
            default_item_settings: 0n,
          },
        },
      });
      await submitTx(tx, selectedAccount.polkadotSigner, 'Create collection');
      toast.success(`Collection created!`);
      setCollectionExists(true);
    } catch {
      // submitTx already logs and toasts
    }
  };

  const selectedType = TYPE_OPTIONS.find((t) => t.value === nftType)!;
  const resolvedImageUrl = cid ? ipfsUrl(cid.startsWith('ipfs://') ? cid : `ipfs://${cid}`) : '';

  const handlePinataKeyChange = (key: string) => {
    setPinataKey(key);
    try {
      localStorage.setItem(PINATA_KEY_STORAGE, key);
    } catch {}
  };

  const handleFileUpload = async (file: File) => {
    if (!pinataKey) {
      toast.error('Pinata API key is required');
      return;
    }
    setIsUploading(true);
    try {
      const hash = await uploadToPinata(file, pinataKey);
      setCid(hash);
      toast.success('Uploaded to IPFS!');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFileUpload(file);
  };

  const handleMint = async () => {
    if (!api || !selectedAccount) {
      toast.error('Connect wallet first');
      return;
    }
    if (!cid) {
      toast.error('Image CID is required');
      return;
    }
    if (!name) {
      toast.error('Name is required');
      return;
    }

    try {
      // Build metadata JSON
      const metadata = JSON.stringify({
        type: nftType,
        name,
        image: `ipfs://${cid.replace('ipfs://', '')}`,
        description,
      });

      if (metadata.length > 256) {
        toast.error('Metadata exceeds 256 byte limit. Shorten name/description.');
        return;
      }

      // Get next available item ID by querying collection items
      // For simplicity, use a timestamp-based ID
      const itemId = Date.now() % 1000000;

      // 1. Mint the NFT
      const mintTx = api.tx.Nfts.mint({
        collection: collectionId,
        item: itemId,
        mint_to: { type: 'Id', value: selectedAccount.address },
        witness_data: undefined,
      });
      await submitTx(
        mintTx,
        selectedAccount.polkadotSigner,
        `Nfts.mint(collection=${collectionId}, item=${itemId})`
      );

      // 2. Set metadata
      const metadataTx = api.tx.Nfts.set_metadata({
        collection: collectionId,
        item: itemId,
        data: Binary.fromText(metadata),
      });
      await submitTx(
        metadataTx,
        selectedAccount.polkadotSigner,
        `Nfts.set_metadata(collection=${collectionId}, item=${itemId})`
      );

      toast.success(`NFT minted! Item #${itemId}`);

      // Reset form
      setCid('');
      setName('');
      setDescription('');
    } catch {
      // submitTx already logs and toasts
    }
  };

  if (!isConnected) {
    return (
      <div className="app-shell min-h-screen flex flex-col text-white">
        <TopBar backTo="/creator" backLabel="Creator" title="Mint NFT" />
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
          <h1 className="theme-title-text text-2xl lg:text-4xl font-black mb-6 lg:mb-8 italic tracking-tighter text-transparent bg-clip-text uppercase">
            Mint NFT
          </h1>
          <button
            onClick={connect}
            className="theme-button btn-primary font-bold py-3 px-6 lg:py-4 lg:px-8 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105"
          >
            CONNECT WALLET TO START
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen text-warm-200 flex flex-col">
      <TopBar backTo="/creator" backLabel="Creator" title="Mint NFT" />
      <DesktopRecommendedBanner />
      <div className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Left: Form */}
            <div className="space-y-6">
              {/* Type selector */}
              <div className="theme-panel bg-warm-900/50 border border-white/5 rounded-2xl p-4 lg:p-6 backdrop-blur-sm">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="text-gold">01</span> Type
                </h2>
                <select
                  value={nftType}
                  onChange={(e) => setNftType(e.target.value as CustomizationType)}
                  className="theme-input w-full bg-warm-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-gold/50"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-warm-500 mt-2">{selectedType.specs}</p>
              </div>

              {/* Image upload */}
              <div className="theme-panel bg-warm-900/50 border border-white/5 rounded-2xl p-4 lg:p-6 backdrop-blur-sm">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="text-gold">02</span> Image
                </h2>

                {/* Upload tabs */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setUploadTab('pinata')}
                    className={`theme-button px-3 py-1.5 rounded text-xs font-bold transition-all ${
                      uploadTab === 'pinata'
                        ? 'theme-selected-button border'
                        : 'theme-surface-button border'
                    }`}
                  >
                    Pinata Upload
                  </button>
                  <button
                    onClick={() => setUploadTab('manual')}
                    className={`theme-button px-3 py-1.5 rounded text-xs font-bold transition-all ${
                      uploadTab === 'manual'
                        ? 'theme-selected-button border'
                        : 'theme-surface-button border'
                    }`}
                  >
                    Manual CID
                  </button>
                </div>

                {uploadTab === 'pinata' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-warm-500 uppercase mb-1">
                        Pinata API Key (JWT)
                      </label>
                      <input
                        type="password"
                        value={pinataKey}
                        onChange={(e) => handlePinataKeyChange(e.target.value)}
                        placeholder="eyJhbGciOi..."
                        className="theme-input w-full bg-warm-800 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/50"
                      />
                    </div>
                    <div
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => fileInputRef.current?.click()}
                      className="theme-panel border-2 border-dashed border-white/10 rounded-xl p-8 text-center cursor-pointer hover:border-gold/30 transition-colors"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleFileUpload(file);
                        }}
                      />
                      {isUploading ? (
                        <p className="text-gold text-sm">Uploading...</p>
                      ) : (
                        <>
                          <p className="text-warm-400 text-sm">
                            Drop image here or click to select
                          </p>
                          <p className="text-warm-600 text-xs mt-1">PNG or WebP</p>
                        </>
                      )}
                    </div>
                    {cid && (
                      <div className="theme-panel bg-warm-800/50 rounded-lg px-3 py-2 text-xs font-mono text-victory-green break-all">
                        CID: {cid}
                      </div>
                    )}
                  </div>
                )}

                {uploadTab === 'manual' && (
                  <div>
                    <label className="block text-xs font-bold text-warm-500 uppercase mb-1">
                      IPFS CID
                    </label>
                    <input
                      type="text"
                      value={cid}
                      onChange={(e) => setCid(e.target.value.trim())}
                      placeholder="bafybeih5..."
                      className="theme-input w-full bg-warm-800 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/50 font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Name & Description */}
              <div className="theme-panel bg-warm-900/50 border border-white/5 rounded-2xl p-4 lg:p-6 backdrop-blur-sm">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="text-gold">03</span> Details
                </h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-warm-500 uppercase mb-1">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Galaxy Arena"
                      className="theme-input w-full bg-warm-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-gold/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-warm-500 uppercase mb-1">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="A cosmic galaxy board background"
                      className="theme-input w-full bg-warm-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-gold/50 h-16 resize-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-warm-500 uppercase mb-1">
                      Collection ID
                    </label>
                    <input
                      type="number"
                      value={collectionId}
                      onChange={(e) => setCollectionId(parseInt(e.target.value) || 0)}
                      className="theme-input w-full bg-warm-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-gold/50"
                      min="0"
                    />
                    {/* Collection status */}
                    {collectionExists === null && (
                      <p className="text-[10px] text-warm-600 mt-1">Checking collection...</p>
                    )}
                    {collectionExists === true && (
                      <p className="text-[10px] text-green-500 mt-1">Collection exists</p>
                    )}
                    {collectionExists === false && (
                      <div className="theme-panel mt-2 p-3 bg-gold/10 border border-gold/20 rounded-lg">
                        <p className="text-xs text-gold mb-2">
                          Collection {collectionId} does not exist. Create it first to mint items.
                        </p>
                        <button
                          onClick={handleCreateCollection}
                          disabled={isSubmitting}
                          className="theme-button theme-surface-button font-bold py-2 px-4 rounded-lg text-xs transition-all disabled:opacity-50"
                        >
                          Create Collection
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Mint button */}
              <button
                onClick={handleMint}
                disabled={isSubmitting || !cid || !name}
                className="theme-button btn-primary w-full font-black py-4 rounded-xl transition-all disabled:opacity-50 uppercase tracking-wider"
              >
                MINT NFT ON-CHAIN
              </button>
            </div>

            {/* Right: Image Preview */}
            <div>
              <div className="sticky top-8">
                <div className="theme-panel bg-warm-900/50 border border-white/5 rounded-2xl p-4 lg:p-6 backdrop-blur-sm">
                  <h3 className="text-sm font-bold text-warm-400 uppercase mb-3">Image Preview</h3>
                  {resolvedImageUrl ? (
                    <div className="rounded-xl overflow-hidden border border-white/10">
                      <IpfsImage
                        src={resolvedImageUrl}
                        alt={name || 'Preview'}
                        className="w-full"
                        fallback={
                          <div className="w-full aspect-video bg-warm-800 flex items-center justify-center text-warm-500 text-sm">
                            Failed to load image
                          </div>
                        }
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-video bg-warm-800/50 rounded-xl border border-white/5 flex items-center justify-center">
                      <span className="text-warm-600 text-sm">No image set</span>
                    </div>
                  )}

                  {/* Metadata preview */}
                  {(cid || name) && (
                    <div className="mt-4">
                      <h4 className="text-xs font-bold text-warm-500 uppercase mb-2">
                        Metadata JSON
                      </h4>
                      <pre className="bg-warm-950 border border-white/10 rounded-lg p-3 text-[10px] font-mono text-mana-blue overflow-auto max-h-32">
                        {JSON.stringify(
                          {
                            type: nftType,
                            name: name || '...',
                            image: cid ? `ipfs://${cid.replace('ipfs://', '')}` : '...',
                            description: description || undefined,
                          },
                          null,
                          2
                        )}
                      </pre>
                      <p
                        className={`text-[10px] mt-1 ${
                          JSON.stringify({
                            type: nftType,
                            name,
                            image: `ipfs://${cid}`,
                            description,
                          }).length > 256
                            ? 'text-red-500'
                            : 'text-warm-600'
                        }`}
                      >
                        {
                          JSON.stringify({
                            type: nftType,
                            name,
                            image: `ipfs://${cid}`,
                            description,
                          }).length
                        }
                        /256 bytes
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
