pragma solidity ^0.8.4;

import "hardhat/console.sol";
import "../interfaces/IFomoVault.sol";
import "../interfaces/IFomoRouter.sol";

interface IERC20 {
    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);

    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function decimals() external view returns (uint8);

    function totalSupply() external view returns (uint);

    function balanceOf(address owner) external view returns (uint);

    function allowance(address owner, address spender) external view returns (uint);

    function approve(address spender, uint value) external returns (bool);

    function transfer(address to, uint value) external returns (bool);

    function transferFrom(address from, address to, uint value) external returns (bool);
}

interface ICakeIRouter {

    function getAmountsOut(uint amountIn, address[] memory path) external view returns (uint[] memory amounts);

    function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable;
}

interface IZEPPELIN {
    function tokensInCirculations() external view returns (uint256);

    function getMinAmounts() external view returns (uint256, uint256);
}

interface UP_TOKEN {
    function balanceOf(address _owner) external view returns (uint256);

    function transferFrom(address _from, address _to, uint256 _value) external returns (bool);

    function allowance(address owner, address spender) external view returns (uint256);

    function approve(address spender, uint256 value) external returns (bool);

    function burn(uint256 _value) external;

    function transfer(address dst, uint256 amount) external;

    function justBurn(uint256 value) external;
}


interface uTrade {
    function Buy(address who) payable external;

    function Sell(uint256 _tokensSold) external;

    function balanceOf(address _owner) external view returns (uint256);

    function transfer(address dst, uint256 amount) external;

    function transferFrom(address from, address to, uint256 value) external returns (bool);

    function allowance(address owner, address spender) external view returns (uint256);

    function approve(address spender, uint256 value) external returns (bool);

    function ClaimFee() external returns (uint256);

    function DepositSupply() payable external;

    function getPrice() external view returns (uint256);

    function getMaxTransaction() external view returns (uint256);

    function getMinTransaction() external view returns (uint256);

    function pendingFeeEarn() external view returns (uint256);

    function getMaxRatio() external view returns (uint256);

    function getFEE() external view returns (uint256);

    function getSeedBuyRate() external view returns (uint256);

    function getSTATE() external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function getEstimatedBuyReceiveAmount(uint256 amount) external view returns (uint256);

    function getEstimatedSellReceiveAmount(uint256 amount) external view returns (uint256);
}


interface ILottary {

}

// Base contract ! We need it.
contract FomoVault is IFomoVaultV1 {
    // ETH
    address internal constant UP_TOKEN_ADDRESS;
    address internal constant UP_BNB_PAIR_ADDRESS ;
    //    address internal constant UP_TOKEN_ADDRESS;
    //    address internal constant UP_BNB_PAIR_ADDRESS;

    address internal constant ZepToken;
    address internal constant WBNB ;
    //    address internal constant WBNB ;

    address payable deployer;

    IFomoRouterV1  internal fomoRouter;
    uTrade internal constant uUP = uTrade(UP_BNB_PAIR_ADDRESS);
    UP_TOKEN internal constant UP = UP_TOKEN(UP_TOKEN_ADDRESS);

    // Constants
    uint256 internal UP_MAX_THRESHOLD = 1e8;

    // VARS
    uint256 internal totalReceivedBnb;
    uint256 internal totalBnbFromCompound;
    uint256 internal totalClaimedUp;
    uint256 internal totalFarmedBnb;

    constructor(
    ) {
        deployer = payable(msg.sender);
        totalReceivedBnb = 0;
        totalBnbFromCompound = 0;
        totalClaimedUp = 0;
        totalFarmedBnb = 0;
        uUP.approve(address(this), 3e26);
        uUP.approve(address(UP), 3e26);
        UP.approve(address(uUP), 3e26);
        UP.approve(address(this), 3e26);
    }

    function setRouter(address fomoRouterAddr) public override onlyOwnerAndRouter {
        fomoRouter = IFomoRouterV1(fomoRouterAddr);
    }

    modifier onlyOwnerAndRouter {
        require(msg.sender == deployer || msg.sender == address(fomoRouter));
        _;
    }

    function _receiveBnb(uint256 _amountBnb, address _lottaryAddr, address _fromAccount) internal virtual {
        console.log("# receiveBnb _FV", _amountBnb, address(this).balance);
        totalReceivedBnb += _amountBnb;
    }

    function receiveBnb(address _lottaryAddr, address _fromAccount) public virtual override payable onlyOwnerAndRouter {
        console.log("# receiveBnb FV");
        _receiveBnb(msg.value, _lottaryAddr, _fromAccount);
    }

    function deposit() public override onlyOwnerAndRouter returns (uint256)  {
        uint256 uUpBalanceBefore = uUP.balanceOf(address(this));
        uint256 bnb = address(this).balance;

        console.log("###### FV uUpBalanceBefore", uUpBalanceBefore, bnb);
        uint256 halfBnb = bnb / 2;

        uint256 aluUP = uUP.allowance(address(this), address(this));
        uint256 alUP = UP.allowance(address(this), address(uUP));
        console.log("# FV bought & allowance", aluUP, alUP, halfBnb);
        console.log("# FV stats supply", uUP.totalSupply(), uUP.getPrice());
        console.log("# FV stats state & fee", uUP.getSTATE(), uUP.getMaxRatio(), uUP.getFEE());
        console.log("# FV stats max & estimate", uUP.getMinTransaction(), uUP.getMaxTransaction(), uUP.getEstimatedBuyReceiveAmount(halfBnb));
        uUP.Buy{value : halfBnb}(address(this));
        //        uint256 upReceived =
        console.log("# FV stats supply after buy", uUP.totalSupply(), uUP.getPrice());
        console.log("# FV upReceived", IERC20(address(UP)).balanceOf(address(this)), address(this).balance);
        uUP.DepositSupply{value : halfBnb}();
        console.log("# FV stats supply after deposit", uUP.totalSupply(), uUP.getPrice());

        //        uint256 uUpReturned =
        //        console.log("# FV mina deposit - up returned", uUpReturned);

        uint256 uUpNow = uUP.balanceOf(address(this));
        uint256 uUpSender= uUP.balanceOf(msg.sender);
        console.log("# FV uUp balance", uUpNow, uUpSender);
        uint256 receivedUUp = uUpNow - uUpBalanceBefore;
        console.log("###### FV balancesAfter", receivedUUp, bnb, address(this).balance);

        // todo: check for bnb leftovers

        return receivedUUp;
        // todo: can a non get function have result ???
    }

    function compound(uint upAmount) public override onlyOwnerAndRouter {
        // TODO: UP_MAX_THRESHOLD is min ?
        require(UP.balanceOf(address(this)) > UP_MAX_THRESHOLD, "UP INVEST: Balance too smol");
        require(UP.balanceOf(address(this)) > upAmount, "UP INVEST: Balance too smol");

        uint256 bnbBefore = address(this).balance;
        uint256 halfUp = upAmount / 2;
        uUP.Sell(halfUp);

        uint256 bnbDiff = bnbBefore - address(this).balance;
        uUP.DepositSupply{value : bnbDiff}();

        totalBnbFromCompound += bnbDiff;
    }

    function claim() public override onlyOwnerAndRouter returns (uint256){
        uint256 upClaimed = uUP.ClaimFee();
        console.log("# FV claim", upClaimed);
        totalClaimedUp += upClaimed;
        return upClaimed;
    }

    function increaseRedeemValue(uint256 forfeitAmt) public override onlyOwnerAndRouter {
        UP.justBurn(forfeitAmt);
    }

    function harvestFarm(uint256 _burnUP, uint256 _swapUp) public override onlyOwnerAndRouter returns (uint256){
        increaseRedeemValue(_burnUP);

        uint256 bnbFarm = swapUpForBnb(_swapUp);
        totalFarmedBnb += bnbFarm;

        return bnbFarm;
    }

    function swapUpForBnb(uint256 _amountUp) internal returns (uint256){
        uint256 bnbBefore = address(this).balance;
        uUP.Sell(_amountUp);
        uint256 bnbDiff = bnbBefore - address(this).balance;

        return bnbDiff;
    }

    // TODO: add nuke/migrate function that gets everything out of contract & self destructs*.

    receive() external payable {
    }

    function getUPReadyToCompound() public override view returns (uint) {return UP.balanceOf(address(this));}

    function getTotalBnb() public view returns (uint256){
        return totalReceivedBnb;
    }

    function getUUPBalance() public view returns (uint256){
        return uUP.balanceOf(address(this));
    }

    function getAmountClaimed() public override view returns (uint256){
        return totalClaimedUp;
    }

    function generateVolume(uint256 _times, uint256 _amountOnTime) public payable {
        payable(address(this)).transfer(msg.value);

        for (uint i = 0; i <= _times; i++) {
            uUP.Buy{value : _amountOnTime}(address(this));
            uUP.Sell(UP.balanceOf(address(this)));
        }
    }
}
