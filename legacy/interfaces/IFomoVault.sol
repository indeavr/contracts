pragma solidity ^0.8.4;

interface IFomoVaultV1 {
    function setRouter(address fomoRouterAddr) external;

    function receiveBnb(address _lottaryAddr, address _fromAccount) external payable;

    function deposit() external returns (uint256);

    function compound(uint upAmount) external;

    function increaseRedeemValue(uint256 forfeitAmt) external;

    function claim() external returns (uint256);

    function harvestFarm(uint256 _burnUP, uint256 _swapUp) external returns (uint256);

    function getUPReadyToCompound() external view returns (uint);

    function getAmountClaimed() external view returns (uint256);
}
