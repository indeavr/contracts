pragma solidity ^0.8.4;

interface ILottary {
    function start(uint blockPeriod) external;

    function finish(uint256[] calldata _externalRandomNumbers, address[] calldata _tokensInBasket) external;

    function swapTokensForBnbAndEnter(address token, uint256 bnbAmount) external;

    function enter(address _sender, uint _amount, address _referredBy) external payable;

    function getFinishBlock() external view returns (uint256);

    function active() external view returns (bool);

    function setRewardPercents(uint place, uint percent) external;
}
