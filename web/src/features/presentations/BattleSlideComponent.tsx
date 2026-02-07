import { useState, useEffect, useCallback } from 'react';
import { BattleArena } from '../../components/BattleArena';
import type { BattleOutput, SandboxUnit } from '../../types';

interface WasmModule {
  default: () => Promise<void>;
  run_sandbox_battle: (
    playerUnits: SandboxUnit[],
    enemyUnits: SandboxUnit[],
    seed: bigint
  ) => BattleOutput;
}

interface BattleSlideProps {
  playerUnits: string[];
  enemyUnits: string[];
  seed?: number;
}

let wasmModule: WasmModule | null = null;
let wasmInitialized = false;

export function BattleSlideComponent({ playerUnits, enemyUnits, seed = 42 }: BattleSlideProps) {
  const [battleOutput, setBattleOutput] = useState<BattleOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [battleKey, setBattleKey] = useState(0);
  const [battleEnded, setBattleEnded] = useState(false);

  const runBattle = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setBattleEnded(false);

      if (!wasmModule) {
        const wasm = (await import('manalimit-client')) as unknown as WasmModule;
        if (!wasmInitialized) {
          await wasm.default();
          wasmInitialized = true;
        }
        wasmModule = wasm;
      }

      const playerSandbox: SandboxUnit[] = playerUnits.map(id => ({ template_id: id }));
      const enemySandbox: SandboxUnit[] = enemyUnits.map(id => ({ template_id: id }));

      const output = wasmModule.run_sandbox_battle(playerSandbox, enemySandbox, BigInt(seed));
      setBattleOutput(output);
    } catch (err) {
      console.error('Failed to run battle:', err);
      setError(err instanceof Error ? err.message : 'Failed to run battle');
    } finally {
      setLoading(false);
    }
  }, [playerUnits, enemyUnits, seed]);

  useEffect(() => {
    runBattle();
  }, [runBattle]);

  const handleReplay = () => {
    setBattleKey(k => k + 1);
    setBattleEnded(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-gray-400 text-lg">Loading battle...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-red-400">Battle error: {error}</p>
      </div>
    );
  }

  if (!battleOutput) return null;

  return (
    <div className="battle-slide-container">
      <BattleArena
        key={battleKey}
        battleOutput={battleOutput}
        onBattleEnd={() => setBattleEnded(true)}
      />
      {battleEnded && (
        <div className="flex justify-center mt-4">
          <button
            onClick={handleReplay}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium"
          >
            Replay Battle
          </button>
        </div>
      )}
    </div>
  );
}
