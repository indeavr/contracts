//SPDX-License-Identifier: UNLICENSED

// Zep_X_UPBNB Vault

// Strategy to compound cashflow from lotterries contracts into UP tokens
// 50% of lottery cashflow in BNB gets saved to buy UP
// with 50% of this amount UP is bought
// with the other 50%


pragma solidity ^0.8.4;

import "./FomoVault.sol";

interface IJackPot {
    function giveRewards(address[] memory listOfTokens, uint256[] memory listOfAmts) external payable;
}

contract RedeemReserveOnTopOfAnotherRedeemReserve is FomoVault {
    // <3 UP && UNFI
    // Inherited tokenomics
    // Tahnks UNFI Team, For inventing something trully unique

    uint256 balanceOfUUPInReserve;
    uint256 redeemRate;

    uint256 totalZepBurned;
    uint256 totalZepLockedInDivRewards;

    //==================ADDRESSES==========================//
    ICakeIRouter internal constant pRouter;
    address internal constant UP_TOKEN_ADDRESS;
    address internal constant UP_BNB_PAIR_ADDRESS;
    address internal constant ZepToken;
    address internal constant WBNB;
    //IFACEs
    uTrade internal constant uUP = uTrade(UP_BNB_PAIR_ADDRESS);
    UP_TOKEN internal constant UP_CONTRACT = UP_TOKEN(UP_TOKEN_ADDRESS);

    IERC20 internal ZEPPELIN_CONTRACT = IERC20(ZepToken);
    IZEPPELIN internal IFACEZEPPELIN = IZEPPELIN(ZepToken);
    address payable deployer;
    address payable MASTER_STRATEGIST;

    constructor() {
        balanceOfUUPInReserve = 0;
        redeemRate = 0;
        totalZepBurned = 0;
        totalZepLockedInDivRewards = 0;
        deployer = payable(msg.sender);
        MASTER_STRATEGIST = deployer;
    }

    function updateUUPReserve() external {
        require(msg.sender == MASTER_STRATEGIST, "Not Strategist");
        balanceOfUUPInReserve = uUP.balanceOf(address(this));
        redeemRate = (IZEPPELIN(ZepToken).tokensInCirculations()) / balanceOfUUPInReserve;
        redeemRate = uint256(uUP.balanceOf(address(this))) / IZEPPELIN(ZepToken).tokensInCirculations();
    }

    function redeemZepForUUP(uint256 _amount) external {
        require(_amount > 1e18, "Can't redeem less than 1 token");
        // require(uu)
        (,uint256 minAmountToBeAbleToRedeem) = IFACEZEPPELIN.getMinAmounts();
        require(_amount > minAmountToBeAbleToRedeem * 2, "Can redeem only bulk: Not enough tokens");

        uint256 startZepInContract = ZEPPELIN_CONTRACT.balanceOf(address(this));
        uint256 startUUP = uUP.balanceOf(address(this));
        this.updateUUPReserve();


        uint256 amountToRedeem = getRedeemPrice();

        ZEPPELIN_CONTRACT.transferFrom(msg.sender, address(this), _amount);
        uUP.transfer(msg.sender, amountToRedeem);

        this.updateUUPReserve();
        uint256 finishZepInContract = ZEPPELIN_CONTRACT.balanceOf(address(this));
        uint256 finishUUP = uUP.balanceOf(address(this));

        //changes in amts
        uint256 zepDiff = finishZepInContract - startZepInContract;
        uint256 uUPDiff = finishUUP - startUUP;

        require(zepDiff > 0 && uUPDiff > 0);

        injectZepForRewardFund(zepDiff / 2);
        burnSomeZep(zepDiff / 2);
        this.updateUUPReserve();
    }

    function getRedeemPrice() public returns (uint256){
        this.updateUUPReserve();
        return redeemRate;
    }

    function injectZepForRewardFund(uint256 _amt) internal {
        ZEPPELIN_CONTRACT.transfer(address(ZEPPELIN_CONTRACT), _amt);
    }

    function burnSomeZep(uint256 _amt) internal {
        ZEPPELIN_CONTRACT.transfer(0x000000000000000000000000000000000000dEaD, _amt);
    }

    fallback() external payable {}

    receive() external payable {}
}
