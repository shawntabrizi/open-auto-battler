// SPDX-License-Identifier: MIT
// Solidity interface for ABI generation only — not compiled by solc.
interface OabArena {
    function registerCard(bytes calldata data) external returns (bool);
    function registerSet(uint16 setId, bytes calldata data) external returns (bool);
    function startGame(uint16 setId, uint64 seedNonce) external returns (uint64);
    function submitTurn(bytes calldata action) external returns (uint8, uint8, uint8, uint8, uint64);
    function getGameState() external view returns (bytes memory);
    function abandonGame() external returns (bool);
    function endGame() external returns (bool);
    function getCard(uint16 cardId) external view returns (bytes memory);
    function getSet(uint16 setId) external view returns (bytes memory);
}
