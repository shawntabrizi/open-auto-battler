# Mutation check of the arena tests. Run from the repo root:
#   python3 scripts/m3/mutate-arena.py
# Each mutation must make at least one test fail. The file is restored after.
import subprocess, sys, re
P='arena/src/main.rs'
orig=open(P).read()
muts={
 'M1 thin pool never mixes house ghosts': ('    if pool.len() < THIN_POOL {\n        candidates','    if false {\n        candidates'),
 'M2 bracket keeps oldest (no drop)': ('        pool.remove(0);','        // dropped'),
 'M3 player = msg.sender (ignore Identity answer)': ('Ok(player) if player.0 != [0u8; 20] => Ok(player.0),','Ok(player) if player.0 != [0u8; 20] => Ok(caller),'),
 'M4 start seed from msg.sender': ('let seed = self.derive_seed(&player, b"start"','let seed = self.derive_seed(&self.caller_bytes(), b"start"'),
 'M5 no hash check at cache time': ('if hash != pinned {','if false && hash != pinned {'),
 'M6 house round not clamped to cached rounds': ('let r = round.clamp(1, meta.house_rounds);','let r = round;'),
 'M7 ghost written before the turn is checked': ('            let out = oab_engine::resolve_turn(TurnInput {','            self.write_scale(DOM_GHOST, &bracket, &ghosts)?;\n            let out = oab_engine::resolve_turn(TurnInput {'),
 'M8 battle seed from the shop context': ('let battle_seed = self.derive_seed(&player, b"battle"','let battle_seed = self.derive_seed(&player, b"shop"'),
}
for name,(a,b) in muts.items():
    assert orig.count(a)==1, name
    open(P,'w').write(orig.replace(a,b))
    r=subprocess.run('CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path arena/Cargo.toml --features std 2>&1',shell=True,capture_output=True,text=True)
    fails=re.findall(r'^test (tests::\S+) \.\.\. FAILED',r.stdout,re.M)
    summ=re.findall(r'test result: .*',r.stdout)
    print(name,'->',len(fails),'failing:',', '.join(f.replace('tests::','') for f in fails) or ('NONE '+str(summ)))
open(P,'w').write(orig)
