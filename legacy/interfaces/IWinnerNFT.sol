pragma solidity ^0.8.4;

interface IWinnerNFT {
    function create(address _player, uint256 _issueId) external returns (uint256);

    function authorizeLottary(address _lottaryAddr) external;
}
