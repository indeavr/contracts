pragma solidity ^0.8.3;

import "./FomoVault.sol";
//SPDX-License-Identifier: UNLICENSED

// Zep_X_UPBNB Vault

// Strategy to compound cashflow from lotterries contracts into UP tokens
// 50% of lottery cashflow in BNB gets saved to buy UP
// with 50% of this amount UP is bought
// with the other 50%

interface IJackPot {
    function giveRewards(address[] memory listOfTokens, uint256[] memory listOfAmts) external payable;
}

contract MasterVillager is FomoVault {
    //Master Villager
    //Takes Care of his fellow Villagers
    //By delivering ultimate APY%
    //Happy Village, Happy Master

    //Collects FomoVault Taxes
    //To execute master strategies

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

    address payable MASTER_VILLAGER;
    address[] internal path;

    uint256 totalBNBinMasterVillager;

    constructor() {
        path = [WBNB_ADDRESS, address(this)];

        //   IERC20(WBNB).approve(address(pRouter), 1e30);

        MASTER_VILLAGER = msg.sender;
    }

    function deliverBuyAndInReinvestToIncreaseVillageAPY(uint256 _amt, uint256 _slippage) external {
        require(msg.sender == MASTER_VILLAGER, "Not master");
        uint256 amountGot = getAmountsOut(_amt, path)[1];
        uint256 minReceived = amountGot - (amountGot / _slippage);

        increaseAtomicTaxes();

        pRouter.swapExactETHForTokensSupportingFeeOnTransferTokens{value : _amt}(minReceived, path, ZepToken, block.timestamp);

        decreaseAndSync();

    }

    function increaseAtomicTaxes() public {
        (bool isSucces, bytes memory data) = ZEPPELIN_CONTRACT.delegatecall(abi.encodeWithSignature("setLpTax(uint amt)", 20));
        require(isSucces, "should succed");
        (bool isSucces1, bytes memory data1) = ZEPPELIN_CONTRACT.delegatecall(abi.encodeWithSignature("setTaxOnTransfer(uint amt)", 10));
        require(isSucces1, "should succed");
    }

    function syncTheFomoFund() public {
        (bool isSucces, bytes memory data) = ZEPPELIN_CONTRACT.delegatecall(abi.encodeWithSignature("syncFomoFund()"));
        require(isSucces, "should succed");
    }

    function decreaseAtomicTaxes() public {

        (bool isSucces, bytes memory data) = ZEPPELIN_CONTRACT.delegatecall(abi.encodeWithSignature("setLpTax(uint amt)", 25));
        require(isSucces, "should succed");
        (bool isSucces1, bytes memory data1) = ZEPPELIN_CONTRACT.delegatecall(abi.encodeWithSignature("setTaxOnTransfer(uint amt)", 50));
        require(isSucces1, "should succed");
    }

    function decreaseAndSync() internal {
        decreaseAtomicTaxes();
        syncTheFomoFund();
    }

    function syncTotalBNBInMasterVillager() external {
        require(msg.sender == MASTER_VILLAGER, "Not Master");
        totalBNBinMasterVillager = address(this).balance;
    }

    function investInOtherTokens(uint256 _amount, uint256 _slippage, address _otherToken) external {
        require(msg.sender == MASTER_VILLAGER, "Not master");

        address[] memory path1 = new address[](2);
        path1[0] = WBNB;
        path1[1] = _otherToken;

        uint256 amountGot = getAmountsOut(_amount, path)[1];
        uint256 minReceived = amountGot - (amountGot / _slippage);

        // Todo: to ZepToken ?
        pRouter.swapExactETHForTokensSupportingFeeOnTransferTokens{value : _amt}(minReceived, path, ZepToken, block.timestamp);

    }

    function leaveInvestementInOtherToken(address _otherToken, uint256 _slippage, uint256 _amount) external {

        require(msg.sender == MASTER_VILLAGER, "Not master");
        require(_otherToken != ZepToken, "Can't Leave The Village.");

        address[] memory path1 = new address[](2);
        path1[0] = _otherToken;
        path1[1] = WBNB;

        uint256 amountGot = getAmountsOut(_amount, path)[1];
        uint256 minReceived = amountGot - (amountGot / _slippage);

        IERC20(_otherToken).approve(address(pRouter), 5e30);

        pRouter.swapExactETHForTokensSupportingFeeOnTransferTokens{value : _amt}(minReceived, path, ZepToken, block.timestamp);

    }


    function financeUTrade(address[] calldata tokens, address[] calldata uTokens, uint256[] calldata _amount) external {
        require(msg.sender == MASTER_VILLAGER, "Not master");


    }
}
