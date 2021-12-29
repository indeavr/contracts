pragma solidity ^0.8.4;

import "hardhat/console.sol";

import "./FomoVault.sol";
import "../interfaces/ILottoVault.sol";

contract LottoVault is FomoVault, ILottoVault {
    ICakeIRouter internal constant cakeRouter;
    //    ICakeIRouter internal constant cakeRouter;

    // lotto address -> amount
    mapping(address => uint256) basketAmountsBnb;
    mapping(address => uint256) rewardFundsBnb;

    address[] activeLottos;

    struct TokenInBasket {
        address token;
        uint percent;
    }

    // TODO: different tokens in basket for every lottary
    mapping(address => TokenInBasket) tokensInBasket;
    TokenInBasket[] allTokensInBasket;

    constructor (address _fomoRouterAddr) {
        super.setRouter(_fomoRouterAddr);
    }

    /* CREATION */
    function addToBasket(address _token, uint _percent) public override onlyOwnerAndRouter {
        TokenInBasket memory tInB = TokenInBasket({token : _token, percent : _percent});
        allTokensInBasket.push(tInB);

        tokensInBasket[_token] = tInB;
        bool isValid = validateBasket();
        require(isValid, "More than 100% !");
    }

    function changeBasketPercent(address _token, uint _percent) public override onlyOwnerAndRouter {
        tokensInBasket[_token].percent = _percent;
        bool isValid = validateBasket();
        require(isValid, "More than 100% !");
    }

    function validateBasket() internal returns (bool){
        uint pSum = 0;
        for (uint i = 0; i < allTokensInBasket.length; i++) {
            pSum += allTokensInBasket[i].percent;
        }

        return (pSum == 10000);
    }


    /* IN */
    function receiveBnb(address _lottaryAddr, address _fromAccount) public override payable {
        console.log("# receiveBnb LV");
        rewardFundsBnb[_lottaryAddr] += msg.value;

        super._receiveBnb(msg.value, _lottaryAddr, _fromAccount);
    }

    /* OUT */
    /*
        @percentOfAll = to avoid giga swaps.
    */
    function prepareBasket(address _lottoAddr, uint percentOfAll) public override onlyOwnerAndRouter {
        uint256 amountDiff = percentOfAll * (rewardFundsBnb[_lottoAddr] - basketAmountsBnb[_lottoAddr]) / 1000;
        if (amountDiff > 0) {
            for (uint i = 0; i < allTokensInBasket.length; i++) {
                uint256 bnb = amountDiff * allTokensInBasket[i].percent / 10000;
                buyBack(allTokensInBasket[i].token, bnb, _lottoAddr);
            }
        }
    }

    function buyBack(address _token, uint256 _bnbAmount, address _to) internal {
        address[] memory path = new address[](2);
        path[0] = address(WBNB);
        path[1] = address(_token);

        cakeRouter.swapExactETHForTokensSupportingFeeOnTransferTokens{value : _bnbAmount}(0, path, _to, block.timestamp);
    }

    function clearInfo(address _lottoAddr) external override onlyOwnerAndRouter {
        delete rewardFundsBnb[_lottoAddr];
        delete basketAmountsBnb[_lottoAddr];
        // TODO: find and remove activeLottos
    }


    function harvestFarmAndAddToPot(address _lottoAddr) public override {
        uint256 uUpClaimed = super.claim();
        uint256 bnbFarm = super.harvestFarm(uUpClaimed / 2, uUpClaimed / 2);

        rewardFundsBnb[_lottoAddr] += bnbFarm;
    }

    /* GETTERS */

    function getTokensInBasket() public override view returns (address[] memory){
        address[] memory tokens = new address[](allTokensInBasket.length);

        for (uint i = 0; i < allTokensInBasket.length; i++) {
            tokens[i] = allTokensInBasket[i].token;
        }

        return tokens;
    }

    function getInfo() public override view returns (address[] memory tokens, uint[] memory percents){
        uint[]  memory percents = new uint[](allTokensInBasket.length);
        address[]  memory tokens = new address[](allTokensInBasket.length);

        for (uint i = 0; i < allTokensInBasket.length; i++) {
            percents[i] = allTokensInBasket[i].percent;
            tokens[i] = allTokensInBasket[i].token;
        }

        return (tokens, percents);
    }

    // TODO:
    //    function getAllLottos() public view returns (uint[]){
    //        //        uint[] lotoAddrs = new uint[]();
    //        // TODO: activeLottos
    //    }
    //
    //    function getTotalRewardsDaily(address _lotoAddr) public view returns (uint){
    //        return totalReceivedBnb;
    //    }
    //
    //    function getAmountInBasketDaily(address _lotoAddr) public view returns (uint){
    //        return bnbAmountInBasketDaily;
    //    }
    //
    //    function getSyncAmountInBasketDaily(address _lotoAddr) public view returns (uint){
    //        return totalReceivedBnb - bnbAmountInBasketDaily;
    //    }


}
