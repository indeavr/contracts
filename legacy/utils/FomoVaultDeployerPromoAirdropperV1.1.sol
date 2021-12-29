//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

// From Selendis
// To ZepV1 Villagers
// MSG: Enjoy!
// MSG: HODL!

interface IERC20 {
    function totalSupply() external view returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function approve(address spender, uint value) external returns (bool);
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(address from, address to, uint value) external returns (bool);
}

interface IZEPPELIN {
    //VIP500
    function getTotalDivParticipants() external view returns (uint);
    function getDivParticipantAt(uint index) external view returns (address);
    function getNextBlock() external view returns (uint);
    function getTotalParticipants() external view returns (uint);
    function getParticipantAt(uint index) external view returns (address);
    function getMetrics() external view returns (uint256[] memory);
    function getDivParticipantMinReq(address id) external view returns (uint);
    function tokensInCirculations() external view returns (uint);
}

interface ICakeIRouter {
    function getAmountsOut(uint256 amountIn, address[] memory path) external view returns (uint256[] memory amounts);
    function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable;
    function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path,address to,uint deadline) external;
}

contract FomoVaultDeployerGasRefundAirdropperV1 {
    // MSG: Enjoy!
    // MSG: HODL!

    address   public deployer;
    address   internal constant ZepToken;
    address   public constant WBNB_ADDRESS;
    address   public constant pRouter ;
    address[] public listOfCurrent500;
    address[] public listOfCurrentLotto;
    address[] public lDivW;
    address[] public lLotW;
    uint256[] public totalHeldMinReq;
    address[] public addressesFromLastRound;

    address[] public currentPromoAirdropListWinners;

    uint256[] public totalHeld;
    address[] public currentAdditional5Winners;

    IZEPPELIN zeptoken = IZEPPELIN(ZepToken);

    uint256 public airdropAmt = 1170000000000000000000;
    uint256 public gasLimitToTest = 44850000000000000000000000;
    uint256 public txGasCost = 20420000420;

    uint256 public minValue = 2e17;
    uint256 public maxValue = 5e18;

    uint256 public toDropFromGasRefund;
    // uint256 public percentToDepl=2;
    bool isUpdated = false;

    bool isHandedOwnership = false; // can call only 1 time.

    event AirdroppedTo(address indexed _to, uint256 amount);
    // event AirdroppedToDivPromo(address indexed _to, uint256 amount);
    // event AirdroppedToPromo(address indexed _to, uint256 amount);
    event AirdroppedBulk(address indexed _from, uint256 totalAmount);
    event AirdroppedBulkGasRefund(address indexed _from, uint256 totalAmount);

    constructor() {
        deployer = msg.sender;
        IERC20(ZepToken).approve(pRouter, 4e27);
    }

    modifier hasRequiredConditions() {
        require(msg.value > minValue && msg.value < maxValue, "HardLimits: ReceiveFallback");
        require(msg.sender == deployer || msg.sender == address(this), "Not deployer||this contract");
        require(block.number >= IZEPPELIN(ZepToken).getNextBlock(), "Not  Block YET!");
        require(IZEPPELIN(ZepToken).getTotalParticipants()>=2, "Not Enough Participants");
        require(tx.gasprice < txGasCost, "GASPrice");
        // require(block.gaslimit > gasLimitToTest, "Not enough gaslimit");
        _;
    }

    function getLotteryAndDivCount() internal view returns(uint,uint) {
        return(zeptoken.getTotalDivParticipants(), zeptoken.getTotalParticipants());
    }


    function setTxGasCostMinReq(uint256 _amt) external {
        require(msg.sender == deployer, "1");
        txGasCost = _amt;
    }



     function updateStateOnLotteryAndDividendRewards() public returns(address[] memory){
        require(msg.sender == address(this) || msg.sender == deployer, "UNAUTH");
        (uint divCount,) = getLotteryAndDivCount();

        for(uint256 i=0; i < divCount; i++) {
             listOfCurrent500.push(zeptoken.getDivParticipantAt(i));
        }

        isUpdated = true;
        return listOfCurrent500;
    }


    function deleteCurrentListsStates() public {
        require(msg.sender == address(this) || msg.sender == deployer, "UNAUTH");
        require(isUpdated, "notupdated");
        delete listOfCurrent500;
        // delete listOfCurrentLotto;
        // delete currentAdditional5Winners;
        delete currentPromoAirdropListWinners;
        // delete addressesFromLastRound;
        // delete lLotW;
        // delete lDivW;
        isUpdated = false;
    }

    function setGasLimitTotestAgainst(uint256 _newGL) external {
        require(msg.sender == deployer, "1");
        gasLimitToTest = _newGL;
    }

    function airdropNormalTaxV0(address _token, address _to, uint _value) external {
        // MSG: Enjoy!
        // MSG: HODL!
        require(_value == airdropAmt, "Not Correct Amt");
        require(msg.sender == deployer, "Not deployer");
        //should be approved beforehand
        IERC20(_token).transferFrom(msg.sender, address(this), _value);
        IERC20(_token).transfer(_to, IERC20(_token).balanceOf(address(this)));
        emit AirdroppedTo(_to, _value);
    }

    function TriggerVillagePromoRewardDistributionV1(uint _swapAmt, uint _nrAirdrops, uint _outerFactor) public payable hasRequiredConditions {
        // MSG: Enjoy!
        // MSG: HODL!
        require(isUpdated, "notupdated");

            uint256 startDeployerTokens = IERC20(ZepToken).balanceOf(address(this));

            address[] memory path = new address[](2);
            path[0] = WBNB_ADDRESS;
            path[1] = ZepToken;

            uint _amtOut = ICakeIRouter(pRouter).getAmountsOut(_swapAmt, path)[1];
            uint minReceived = _amtOut - (_amtOut / 10); //10% slipp

            ICakeIRouter(pRouter).swapExactETHForTokensSupportingFeeOnTransferTokens{value: msg.value}(minReceived, path, address(this), block.timestamp);

            (bool isSucces2,) = address(zeptoken).delegatecall(abi.encodeWithSignature("setTaxOnTransfer(uint amt)", 10));
            require( isSucces2, "should succed");


            uint256 finishDeployerTokens = IERC20(ZepToken).balanceOf(address(this));
            require(finishDeployerTokens > startDeployerTokens, "Zep Balance Didn't increase");

            address[] memory pathR = new address[](2);
            pathR[0] = ZepToken;
            pathR[1] = WBNB_ADDRESS;


            toDropFromGasRefund = (finishDeployerTokens-startDeployerTokens)-(zeptoken.getMetrics()[4]/2);

            uint _amtOut1 = ICakeIRouter(pRouter).getAmountsOut(toDropFromGasRefund, pathR)[1];
            uint minReceived1 = _amtOut1 - (_amtOut1 / 10); //10% slipp
            ICakeIRouter(pRouter).swapExactTokensForETHSupportingFeeOnTransferTokens(
                toDropFromGasRefund,
                minReceived1,
                pathR,
                payable(deployer),
                block.timestamp
                );

        (bool isSucces3,) = address(zeptoken).delegatecall(abi.encodeWithSignature("setTaxOnTransfer(uint amt)", 25));
        require( isSucces3, "should succed");

        this.airdropGasRefundToVillagers(_nrAirdrops, _outerFactor);
    }

     function airdropGasRefundToVillagers(uint _villagerAirdropCount, uint _outerFactor) public {
        // MSG: Enjoy!
        // MSG: HODL!
        require(isUpdated, "notupdated");
        require(msg.sender == deployer || msg.sender == address(this), "Notdepl");

        uint balanceOfThisTokenToDrop = IERC20(ZepToken).balanceOf(address(this));
        require(balanceOfThisTokenToDrop >= 1e18, "1token");

        require(listOfCurrent500.length>0,"0 Div Holders ???");

        this.genRand(_villagerAirdropCount, _outerFactor);

        uint valueEach = balanceOfThisTokenToDrop / currentPromoAirdropListWinners.length;

        for(uint i=0; i < currentPromoAirdropListWinners.length; i++) {

            if(IERC20(ZepToken).balanceOf(address(this))>100000 wei) {

                IERC20(ZepToken).transfer(currentPromoAirdropListWinners[i], valueEach);
            }
        }

        deleteCurrentListsStates();

       emit AirdroppedBulkGasRefund(msg.sender, balanceOfThisTokenToDrop);
    }

    function genRand(uint _minWinnersDivsGiven, uint outerFactor) public returns(address[] memory lDiv){

        for(uint i=0; i < _minWinnersDivsGiven; i++) {

            uint winnerIndex = uint(blockhash(block.number - _minWinnersDivsGiven - i - outerFactor)) % listOfCurrent500.length;
            currentPromoAirdropListWinners.push(listOfCurrent500[winnerIndex]);
        }
        return currentPromoAirdropListWinners;
    }

    function airdropBulkToAllVillagersV2(address _token, uint _value, uint fundtax) external {
        // MSG: Enjoy!
        // MSG: HODL!
        require(isUpdated, "notupdated");
        require(msg.sender == deployer, "Not deployer");
        require(_value > 0, "0");
        require(_token != address(0), "notokenadd");

        IERC20(ZepToken).transferFrom(msg.sender, address(this), _value);

        uint256 balanceOfThisTokenToDrop = IERC20(_token).balanceOf(address(this));
        require(balanceOfThisTokenToDrop+(balanceOfThisTokenToDrop/15) >= _value, "1");

        (bool isSucces2,) = address(zeptoken).delegatecall(abi.encodeWithSignature("setTaxOnTransfer(uint amt)", fundtax));
            require( isSucces2, "should succed");

        require(listOfCurrent500.length>0,"0 Div Holders ???");

        uint256 valueEach = balanceOfThisTokenToDrop / listOfCurrent500.length;

          for(uint i=0; i < listOfCurrent500.length; i++) {
             IERC20(ZepToken).transfer(listOfCurrent500[i], valueEach);
          }

        (bool isSucces3,) = address(zeptoken).delegatecall(abi.encodeWithSignature("setTaxOnTransfer(uint amt)", fundtax));
        require( isSucces3, "should succed");

        deleteCurrentListsStates();
        emit AirdroppedBulk(msg.sender, _value);
    }

    function changeExactAmount(uint newAmt) external {
        // MSG: Enjoy!
        // MSG: HODL!
        require(msg.sender == deployer, "Not deployer");
        require(newAmt > 1e18 && newAmt < 1e23, "Hard:Limits");
        airdropAmt = newAmt;
    }

    function handOwnerShipToZepDeployer() external {
        require(msg.sender == deployer && isHandedOwnership!=true, "Notdepl");

        isHandedOwnership = true;
    }

    //Function to transfer funds easy to another upgraded contract through deployer
    function sendBackZepToDeployer(uint256 _amount, uint256 _amountBNB) external {
        require(msg.sender == deployer , "Notdepl");
        IERC20(ZepToken).transfer(deployer, _amount);
        payable(deployer).transfer(_amountBNB);
    }

    function updBalancesOfAll500AndCirclSupply() public returns (uint[] memory){
        require(totalHeld.length <= 500, "TooLarge");
        totalHeld = new uint[](listOfCurrent500.length);
        for(uint i=0; i < listOfCurrent500.length; i++) {

            uint value = IERC20(ZepToken).balanceOf(listOfCurrent500[i]);
            totalHeld.push(value);
        }

        return totalHeld;
    }


    function updBalanceInMinReqs() public returns(uint[]memory){
        require(msg.sender == deployer, "Not deployer");
        require(listOfCurrent500.length > 0, "Length");
        require(totalHeldMinReq.length <= 500, "TooLarge");
        totalHeldMinReq = new uint[](listOfCurrent500.length);
        for(uint i=0; i < listOfCurrent500.length; i++) {
        uint value = zeptoken.getDivParticipantMinReq(listOfCurrent500[i]);
           totalHeldMinReq.push(value);
        }

        return totalHeldMinReq;
    }

    function getBalanceInMinReq() public view returns(uint) {
        require(totalHeldMinReq.length>0, "0");

        uint returnTotal;
        for(uint i=0; i < totalHeldMinReq.length; i++) {
            returnTotal += totalHeldMinReq[i];
        }
        return returnTotal;
    }

    function getBalanceTotalHeldinDivWallets() public view returns(uint) {
        require(totalHeldMinReq.length>0, "0");

        uint returnTotal;
        for(uint i=0; i < totalHeld.length; i++) {
            returnTotal += totalHeld[i];
        }
        return returnTotal;
    }

    function updateAllBalancesOf() external  {
        require(msg.sender == deployer, "Not deployer");
        updBalancesOfAll500AndCirclSupply();
        updBalanceInMinReqs();
    }
    ////////////////////////////////CAALBACKS
           //Deal with BNB
        fallback() external payable {}

        function setMinMaxValueForTrigger(uint256 minAmt, uint256 maxAmt) external {
            require(msg.sender == deployer, "Not deployer");
            minValue = minAmt;
            maxValue = maxAmt;
        }

        //Callback
        receive() external payable{}
}

//Brrrrrr.... to be continued...
 //Get List Of Current Villagers
    // function updateStateOnLotteryAndDividendRewards(address _customAddress) public returns(address[] memory){
    //     require(msg.sender == address(this) || msg.sender == deployer, "UNAUTH");
    //     (uint divCount, uint lottoCount) = getLotteryAndDivCount();

    //     for(uint256 i=0; i < divCount; i++) {
    //          listOfCurrent500.push(zeptoken.getDivParticipantAt(i));
    //     }

    //     for(uint256 j = 0; j < lottoCount; j++) {

    //         listOfCurrentLotto.push(zeptoken.getParticipantAt(j));
    //     }

    //     if(_customAddress!=address(0)){

    //         listOfCurrentLotto.push(_customAddress);
    //     }

    //     isUpdated = true;
    //     return listOfCurrent500;
    // }
 // function deliverPromoTransfer(address[] memory lDivWinnersList, address[] memory lLottoWinnersList, address _token, uint _payD, uint _payL) public {
    //     require(msg.sender == deployer || msg.sender == address(this), "1:2:3");
    //     for(uint i=0; i < lDivWinnersList.length; i++) {

    //         uint bOf = IERC20(_token).balanceOf(address(this));

    //         if(bOf<_payD && bOf > 100000 wei) {

    //             IERC20(_token).transfer(lDivWinnersList[i], bOf);
    //             emit AirdroppedToDivPromo(lDivWinnersList[i], bOf);

    //         } else {

    //             IERC20(_token).transfer(lDivWinnersList[i], _payD);
    //             emit AirdroppedToDivPromo(lDivWinnersList[i], _payD);
    //         }

    //         if(i < lLottoWinnersList.length) {

    //             uint bOf1 = IERC20(_token).balanceOf(address(this));

    //             if(bOf1<_payL && bOf > 100000 wei) {

    //             IERC20(_token).transfer(lLottoWinnersList[i], bOf1);
    //             emit AirdroppedToDivPromo(lLottoWinnersList[i], bOf1);

    //             } else {

    //                 IERC20(_token).transfer(lLottoWinnersList[i], _payL);
    //                 emit AirdroppedToPromo(lLottoWinnersList[i], _payL);
    //             }
    //         }
    //     }
    // }

    // function deliverPromoTransferToLastWinners(address[] memory lLastRound, address _token, uint _payLW) public {
    //     require(msg.sender == deployer || msg.sender == address(this), "1:2:3");
    //     for(uint i=0; i < lLastRound.length; i++) {

    //         uint256 bOf2 = IERC20(_token).balanceOf(address(this));

    //         if(bOf2<_payLW && bOf2 > 1000000 wei) {

    //             IERC20(_token).transfer(lLastRound[i], bOf2);
    //             emit AirdroppedToPromo(lLastRound[i], bOf2);

    //         } else {

    //             IERC20(_token).transfer(lLastRound[i], _payLW);
    //             emit AirdroppedToPromo(lLastRound[i], _payLW);
    //         }
    //     }
    //  }

    // function pushLastWinners(address[] memory lLastW, uint _minWinnerLast1) public {
    //     require(msg.sender == deployer || msg.sender == address(this), "1:2:3");

    //     for(uint i=0; i < lLastW.length && i < _minWinnerLast1; i++) {
    //         addressesFromLastRound.push(lDivW[i**2+_minWinnerLast1]);
    //         addressesFromLastRound.push(lLotW[i]);
    //     }
    // }

    // function deliverAPYIncrease(address _token1, uint _amount) public {
    //     require(msg.sender == address(this) || msg.sender == address(this), "1:2:3");
    //     uint256 tokensLeft = IERC20(_token1).balanceOf(address(this));
    //     if(tokensLeft > 10000000 && _token1 == ZepToken) IERC20(ZepToken).transfer(ZepToken, _amount);
    //     if(tokensLeft > 10000000 wei && _token1 != ZepToken) IERC20(_token1).transfer(lDivW[419], _amount);
    // }

    // function deliverAirdropFromPromotion(address _token, uint _minWinnersDivs, uint _minWinnersLotto, uint _minWinnerLast) public {
    //     require(msg.sender == deployer || msg.sender == address(this), "1:2:3");
    //     require(isUpdated, "notupdatedlists");
    //     uint256 _amt = toDropFromGasRefund;
    //     (lDivW, lLotW) = genRand(_minWinnersDivs,_minWinnersLotto);
    //     require(
    //         lDivW.length >= _minWinnersDivs &&
    //         lLotW.length >= _minWinnersLotto,
    //         "0xErroInWinnersArrayLenght: under minimum"
    //     );

    //     uint256 oneHalf = (_amt / 2);

    //     uint256 amtForRandomDivs = oneHalf/lDivW.length;
    //     uint256 amtForPromoLottery = oneHalf - amtForRandomDivs;

    //     pushLastWinners(lLotW, _minWinnerLast);

    //     deliverPromoTransfer(
    //         lDivW,
    //         lLotW,
    //         _token,
    //         amtForRandomDivs,
    //         amtForPromoLottery);

    //     uint otherHalf = _amt - oneHalf;
    //     uint amtForLastWinners = otherHalf/2/addressesFromLastRound.length;
    //     uint amtForDivAPY = otherHalf - amtForLastWinners;

    //     deliverPromoTransferToLastWinners(
    //         addressesFromLastRound,
    //         _token,
    //         amtForLastWinners);

    //     deliverAPYIncrease(_token, amtForDivAPY);

    //     deleteCurrentListsStates();
    // }


    // function genRand(uint256 _minWinnersDivsGiven, uint256 _minWinnersLottoGiven) public returns(address[] memory lDiv, address[] memory lLot){
    //     for(uint256 i=0; i < _minWinnersDivsGiven; i++) {

    //         uint256 winnerIndex = uint(blockhash(block.number - _minWinnersDivsGiven)) % listOfCurrent500.length;
    //         currentPromoAirdropListWinners.push(listOfCurrent500[winnerIndex]);

    //           if(i<_minWinnersLottoGiven) {

    //             uint256 winnerIndex2 = uint(blockhash(block.number - _minWinnersLottoGiven)) % listOfCurrentLotto.length;
    //             currentAdditional5Winners.push(listOfCurrentLotto[winnerIndex2]);
    //         }
    //     }
    //     return (currentPromoAirdropListWinners, currentAdditional5Winners);
    // }
