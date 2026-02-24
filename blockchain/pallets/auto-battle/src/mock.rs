use frame::{
    deps::{frame_support::weights::constants::RocksDbWeight, frame_system::GenesisConfig},
    prelude::*,
    runtime::prelude::*,
    testing_prelude::*,
};
use polkadot_sdk::pallet_balances;

// Configure a mock runtime to test the pallet.
#[frame_construct_runtime]
mod test_runtime {
    #[runtime::runtime]
    #[runtime::derive(
        RuntimeCall,
        RuntimeEvent,
        RuntimeError,
        RuntimeOrigin,
        RuntimeFreezeReason,
        RuntimeHoldReason,
        RuntimeSlashReason,
        RuntimeLockId,
        RuntimeTask,
        RuntimeViewFunction
    )]
    pub struct Test;

    #[runtime::pallet_index(0)]
    pub type System = frame_system;
    #[runtime::pallet_index(1)]
    pub type AutoBattle = crate;
    #[runtime::pallet_index(2)]
    pub type Balances = pallet_balances;
}

#[derive_impl(frame_system::config_preludes::TestDefaultConfig)]
impl frame_system::Config for Test {
    type Nonce = u64;
    type Block = MockBlock<Test>;
    type BlockHashCount = ConstU64<250>;
    type DbWeight = RocksDbWeight;
    type AccountData = pallet_balances::AccountData<u64>;
}

impl pallet_balances::Config for Test {
    type Balance = u64;
    type RuntimeEvent = RuntimeEvent;
    type DustRemoval = ();
    type ExistentialDeposit = ConstU64<1>;
    type AccountStore = System;
    type MaxLocks = ConstU32<50>;
    type MaxReserves = ConstU32<50>;
    type ReserveIdentifier = [u8; 8];
    type WeightInfo = ();
    type RuntimeHoldReason = RuntimeHoldReason;
    type RuntimeFreezeReason = RuntimeFreezeReason;
    type FreezeIdentifier = RuntimeFreezeReason;
    type MaxFreezes = ConstU32<0>;
    type DoneSlashHandler = ();
}

pub struct MockRandomness;
impl
    frame::deps::frame_support::traits::Randomness<
        <Test as frame_system::Config>::Hash,
        BlockNumberFor<Test>,
    > for MockRandomness
{
    fn random(_subject: &[u8]) -> (<Test as frame_system::Config>::Hash, BlockNumberFor<Test>) {
        (Default::default(), 0)
    }
}

frame::deps::frame_support::parameter_types! {
    pub const AutoBattlePalletId: frame::deps::frame_support::PalletId =
        frame::deps::frame_support::PalletId(*b"autobttl");
}

impl crate::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type Randomness = MockRandomness;
    type MaxBagSize = ConstU32<50>;
    type MaxBoardSize = ConstU32<5>;
    type MaxHandActions = ConstU32<10>;
    type MaxAbilities = ConstU32<5>;
    type MaxStringLen = ConstU32<32>;
    type MaxConditions = ConstU32<5>;
    type MaxGhostsPerBracket = ConstU32<10>;
    type MaxSetSize = ConstU32<100>;
    type Currency = Balances;
    type TournamentOrigin = frame_system::EnsureRoot<u64>;
    type PalletId = AutoBattlePalletId;
}

// Build genesis storage according to the mock runtime.
pub fn new_test_ext() -> TestState {
    let mut t = GenesisConfig::<Test>::default().build_storage().unwrap();

    // Fund test accounts
    pallet_balances::GenesisConfig::<Test> {
        balances: vec![
            (1, 10_000),
            (2, 10_000),
            (3, 10_000),
            (4, 10_000),
            (5, 10_000),
        ],
        dev_accounts: None,
    }
    .assimilate_storage(&mut t)
    .unwrap();

    // Initialize AutoBattle genesis
    crate::GenesisConfig::<Test> {
        _phantom: Default::default(),
    }
    .assimilate_storage(&mut t)
    .unwrap();

    t.into()
}
