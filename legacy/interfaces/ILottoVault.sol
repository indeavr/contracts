pragma solidity ^0.8.4;

import "./IFomoVault.sol";

interface ILottoVault {
    function addToBasket(address _token, uint _percent) external;

    function changeBasketPercent(address _token, uint _percent) external;

    function prepareBasket(address _lottoAddr, uint percentOfAll) external;

    function harvestFarmAndAddToPot(address _lottoAddr) external;

    function clearInfo(address _lottoAddr) external;

    function getTokensInBasket() external view returns (address[] memory);

    function getInfo() external view returns (address[] memory, uint[] memory);
}
