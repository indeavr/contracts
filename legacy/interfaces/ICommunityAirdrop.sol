pragma solidity ^0.8.4;

interface IComunityAirdrop {
    function distributeRewards(uint[] calldata _externalRandomNumbers) external;
}
