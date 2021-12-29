pragma solidity ^0.8.4;

interface IFomoRouterV1 {
    function invest(uint lottoId, address participant) external payable;

    function createAllVaults(address[] calldata _vaultAddresses, uint[] calldata _percentages) external;

    function finishLottary(address _lottoAddr, uint256[] calldata _externalRandomNumbers, bool finalPrepare) external;

    function registerNewLottary(address _address) external;

    function setVaultPercent(uint _type, uint _percentage) external;

    function setVaultAddress(uint _type, address _address) external;

    function replaceVault(uint _type, address _address, uint _percentage) external;
}
