use frame::{
    deps::{frame_support::weights::constants::RocksDbWeight, frame_system::GenesisConfig},
    prelude::*,
    runtime::prelude::*,
    testing_prelude::*,
};

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
}

#[derive_impl(frame_system::config_preludes::TestDefaultConfig)]
impl frame_system::Config for Test {
    type Nonce = u64;
    type Block = MockBlock<Test>;
    type BlockHashCount = ConstU64<250>;
    type DbWeight = RocksDbWeight;
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

impl crate::Config for Test {
    type RuntimeEvent = RuntimeEvent;
    type Randomness = MockRandomness;
    type MaxBagSize = ConstU32<100>;
    type MaxBoardSize = ConstU32<5>;
    type MaxHandActions = ConstU32<10>;
    type MaxAbilities = ConstU32<5>;
    type MaxStringLen = ConstU32<32>;
    type MaxConditions = ConstU32<5>;
    type MaxGhostsPerBracket = ConstU32<10>;
}

// Build genesis storage according to the mock runtime.
pub fn new_test_ext() -> TestState {
    GenesisConfig::<Test>::default()
        .build_storage()
        .unwrap()
        .into()
}
