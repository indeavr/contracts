pragma solidity ^0.8.4;

import "hardhat/console.sol";

import "../interfaces/ILottary.sol";
import "../interfaces/IZep.sol";
import "../interfaces/IWinnerNFT.sol";
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

    function swapTokensForExactETH(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts);
}

contract Lottary is ILottary {
    address WBNB ;
    //    address WBNB;
    //    address ZEPPELIN__ADDRESS ;
    address deployer;

    IFomoRouterV1 internal fomoRouter;
    IWinnerNFT public winnerNFT;

    ICakeIRouter internal constant cakeRouter;
    //    ICakeIRouter internal constant cakeRouter;

    uint MAX_REFERRALS = 30;

    // VARS
    address[] participants;
    mapping(address => uint) public walletToEntries;
    mapping(address => uint) public walletToBnbSpent;
    mapping(address => uint) public walletToReferralTimes;
    uint256 totalBNBCollected;

    uint256 startBlock;
    uint256 finishBlock;

    uint256 issueId;
    mapping(uint256 => address[4]) public historyWinners;
    // issueId => (place => amounts) [issueId][place].push()
    mapping(uint256 => mapping(uint => uint256[])) public historyBasketAmounts;
    mapping(uint256 => address[]) public historyBasketTokens;

    // sorted
    address [4] public winningAddresses;
    uint256[4] public winningIndexes;

    uint256 public lastTimestamp;
    uint[] rewardDistribution;

    // EVENTS
    // TODO: add events
    event Entry(address indexed user, uint256 indexed amount);
    event WinnersChosen(uint256 indexed issueId, address[4] winningAddresses);
    event Reset(uint256 indexed issueId);

    constructor(
        address _winnerNFT,
        address fomoRouterAddr
    ) {
        deployer = msg.sender;
        lastTimestamp = block.timestamp;

        winnerNFT = IWinnerNFT(_winnerNFT);
        fomoRouter = IFomoRouterV1(fomoRouterAddr);

        fomoRouter.registerNewLottary(address(this));

        // Default percentages
        rewardDistribution.push(5000);
        rewardDistribution.push(2500);
        rewardDistribution.push(2500);
    }

    modifier onlyOwnerAndRouter {
        require(msg.sender == deployer || msg.sender == address(fomoRouter));
        _;
    }

    function isContract(address _addr) internal view returns (bool isContractR){
        uint32 size;
        assembly {
            size := extcodesize(_addr)
        }
        return (size > 0);
    }

    /* ENTER */
    function enter(address _sender, uint _amount, address _referredBy) external override payable {
        console.log("CALLED enter!", _amount, _amount == 1e18);

        require(isContract(_sender) == false, "No contracts can enter");
        // TODO: needed  ?
        require(_sender != address(0), "Null addr");
        require(
            _amount % 5 == 0
            && ((_amount >= 5e16 && _amount <= 5e17) || _amount == 1e18 || _amount == 5e18 || _amount == 1e19),
            "Please Enter Valid Amount");

        console.log("CALLED enter 2!");
        console.log("_amount:", _amount);

        uint256 entryTimes = 0;

        if (_amount == 5e16) entryTimes = 1;

        if (_amount == 10e16) entryTimes = 2;

        if (_amount == 15e16) entryTimes = 3;

        if (_amount == 20e16) entryTimes = 4;

        if (_amount == 25e16) entryTimes = 6;

        if (_amount == 30e16) entryTimes = 8;

        if (_amount == 35e16) entryTimes = 10;

        if (_amount == 40e16) entryTimes = 12;

        if (_amount == 45e16) entryTimes = 14;

        if (_amount == 5e17) entryTimes = 16;

        if (_amount == 1e18) entryTimes = 40;

        if (_amount == 5e18) entryTimes = 240;

        if (_amount == 1e19) entryTimes = 600;

        for (uint i = 0; i < entryTimes; i++) {
            participants.push(_sender);
        }

        // Referrals
        if (_referredBy != address(0)) {
            // TODO: Min Amount for referral elligibile =
            // TODO: a _referredBy divHolder = more tickets
            if (walletToEntries[_sender] == 0 && walletToEntries[_referredBy] > 0) {
                if (walletToReferralTimes[_referredBy] < MAX_REFERRALS) {
                    walletToReferralTimes[_referredBy]++;
                    participants.push(_referredBy);
                }
            }
        }

        relayToRouter(_amount, msg.sender);

        totalBNBCollected += _amount;
        walletToEntries[_sender] += entryTimes;
        walletToBnbSpent[_sender] += _amount;
    }

    // TODO: Entry with zep = +10% tickets
    // TODO: SLIPPAGE
    // todo: refund bnb which is left
    function swapTokensForBnbAndEnter(address token, uint256 bnbAmount) external override {
        // uTrade swap one day
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = address(WBNB);

        // TODO: fee
        uint256[] memory amounts = cakeRouter.swapTokensForExactETH(bnbAmount, 0, path, address(this), block.timestamp);
        this.enter(msg.sender, amounts[1], address(0));
    }

    //    function getAmountsOut(address token, uint256 amount) public view returns (uint256, uint256) {
    //        address[] memory path = new address[](2);
    //        path[0] = address(WBNB);
    //        path[1] = address(token);
    //
    //        return cakeRouter.getAmountsOut(amount, path)[1];
    //    }

    function relayToRouter(uint256 bnbAmount, address participant) internal {
        fomoRouter.invest{value : bnbAmount}(issueId, participant);
    }

    /* START FINISH */
    function start(uint blockPeriod) external override {
        require(msg.sender == deployer, "Not ownerr");
        require(startBlock == 0 && finishBlock == 0, "Must be clear to start");

        startBlock = block.number;
        finishBlock = startBlock + blockPeriod;
        issueId = startBlock;
    }

    function finish(uint256[] calldata _externalRandomNumbers, address[] calldata _tokensInBasket) external override onlyOwnerAndRouter {
        require(startBlock != 0 && finishBlock != 0, "Lottary Not Started !");
        // require(block.number > finishBlock, "Not time yet");
        require(participants.length >= 4, "Not enough participants");

        distributeReward(_externalRandomNumbers, _tokensInBasket);

        startBlock = 0;
        finishBlock = 0;
        lastTimestamp = block.timestamp;
        for (uint i = 0; i < participants.length; i++) {
            delete walletToEntries[participants[i]];
            delete walletToBnbSpent[participants[i]];
            // TODO: check if this is the most efficient way ? (won't it always keep the memory)
        }
        delete participants;
        totalBNBCollected = 0;
    }

    function distributeReward(uint256[] calldata _externalRandomNumbers, address[] calldata _tokensInBasket) internal {
        //        uint256 winIndex = this.generateRandom(participants.length / 1e18, address(this).balance / 1e18, block.difficulty / 1e18);
        bytes32 _structHash;
        uint256 randomNumber;
        bytes32 _blockhash = blockhash(block.number - 1);
        uint256 length = participants.length;

        console.log("CALLED distributeReward!", length);

        // waste some gas fee here
        for (uint i = 0; i < 9; i++) {
            getTotalParticipants(issueId);
        }
        uint256 gasleft = gasleft();

        uint256[] memory outherFactor = new uint256[](4);
        outherFactor[0] = block.difficulty;
        outherFactor[1] = address(this).balance / 1e18;
        outherFactor[2] = lastTimestamp;
        outherFactor[3] = participants.length;

        uint winIndex;
        uint count = 0;
        while (count < 4) {
            _structHash = keccak256(
                abi.encode(
                    _blockhash,
                    outherFactor[count],
                    gasleft,
                    _externalRandomNumbers[count]
                )
            );
            randomNumber = uint256(_structHash);
            winIndex = uint256(randomNumber % length);
            if (!alreadyWon(winIndex)) {
                winningIndexes[count] = winIndex;
                count++;
            }
        }

        console.log("============= Winners", winningIndexes[0], winningIndexes[1], winningIndexes[2]);
        console.log("============= Winners Last", winningIndexes[3]);

        // Rewards
        // 1,2,3
        for (uint i = 0; i < 3; i++) {
            address winner = participants[winningIndexes[i]];
            uint rewardPercent = rewardDistribution[i];

            uint256 reward;
            for (uint t = 0; i < _tokensInBasket.length; t++) {
                reward = IERC20(_tokensInBasket[t]).balanceOf(address(this)) * rewardPercent / 10000;
                payable(winner).transfer(reward);
                // lottoId -> winIndex -> tokenIndex
                historyBasketAmounts[issueId][i].push(reward);
            }
            winningAddresses[i] = winner;
        }
        console.log("So MANY transfers !!!");

        // 4
        // TODO: Add more royalty rewards.
        address nftWinner = participants[winningIndexes[3]];
        winnerNFT.create(nftWinner, issueId);
        winningAddresses[3] = nftWinner;

        historyWinners[issueId] = winningAddresses;
        historyBasketTokens[issueId] = _tokensInBasket;

        emit WinnersChosen(issueId, winningAddresses);
    }

    function alreadyWon(uint index) internal returns (bool){
        for (uint i = 0; i < winningIndexes.length; i++) {
            if (winningIndexes[i] == index) {
                return true;
            }
        }
        return false;
    }

    // used to randomize gasLeft
    function getTotalParticipants(uint256 _randomNumber) public view returns (address) {
        // TODO: pass _randomNumber
        address temp;
        if (issueId > 0) {
            uint cycle = _randomNumber % 7;
            for (uint i = 0; i < cycle; i++) {
                temp = historyWinners[issueId][_randomNumber % 3];
            }
        }
    }

    /* GETTERS */
    function getFinishBlock() external override view returns (uint256) {
        return finishBlock;
    }

    function active() public override view returns (bool) {
        return startBlock > 0;
    }

    /* SETTERS */
    function setRewardPercents(uint place, uint percent) public override {
        rewardDistribution[place] = percent;

        bool isValid = validateRewards();
        require(isValid, "More than 100% !");
    }

    function validateRewards() internal returns (bool){
        uint pSum = 0;
        for (uint i = 0; i < rewardDistribution.length; i++) {
            pSum += rewardDistribution[i];
        }

        return (pSum == 10000);
    }

    //Deal with BNB
    fallback() external payable {}

    receive() external payable {
        console.log("OPSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA !");
        require(startBlock != 0 && finishBlock != 0, "must have started");
        this.enter(msg.sender, msg.value, address(0));
    }
}
