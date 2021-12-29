pragma solidity ^0.8.3;

import "hardhat/console.sol";

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

interface IWEEKLY {
    function addFromDaily(uint _amt) external payable;
}

interface IFomoRouter {
    // get in -> send money -> receive money from lottery
    // parse tokens

    // gets all amounts for id. each lottary should have a random id
    function parseRewards();

    function parse();
}

interface IFomoVault {

}

interface IZEPPELIN {
    function tokensInCirculations() external view returns (uint256);

    function getMinAmounts() external view returns (uint256, uint256);
}

interface IWinnerNFT {
    function create(address _player, uint256 _issueId) external returns (uint256);
}

contract JackpotLottary is IJackpotLottary {
    ICakeIRouter internal constant pRouter;
    address WBNB ;
    address deployer;
    address ZEPPELIN__ADDRESS ;
    IERC20 Zep;
    IERC20 Token;
    IFomoRouter  internal constant fomoRouter;
    IERC20 internal constant ZEPPELIN = IERC20(ZepToken);

    // The Lottery NFT for tickets
    IWinnerNFT public winnerNFT;

    address[] participants;
    mapping(address => uint) public walletToEntries;
    mapping(address => uint) public walletToBnbSpent;
    uint256 totalBNBCollected;

    uint256 startBlock;
    uint256 finishBlock;

    uint256 issueId;
    mapping(uint256 => address[4]) public historyWinners;
    // issueId => [bnbReward, zepReward, tokenReward]
    mapping(uint256 => mapping(uint => uint256[])) public historyBasketAmounts;
    mapping(uint256 => address[]) public historyBasketTokens;

    // sorted
    address [4] public winningAddresses;
    uint256[4] public winningIndexes;

    uint256 public lastTimestamp;
    uint[] rewardDistribution;

    // EVENTS
    event Entry(address indexed user, uint256 indexed amount);
    event WinnersChosen(uint256 indexed issueId, address[4] winningAddresses);
    event Reset(uint256 indexed issueId);

    constructor(
        address _tokenAddress,
        address _winnerNFT,
        address fomoRouterAddr
    ) {
        deployer = msg.sender;
        lastTimestamp = block.timestamp;

        lastBasketBnbValue = 0;

        Token = IERC20(_tokenAddress);
        winnerNFT = IWinnerNFT(_winnerNFT);
        this.fomoRouter = IFomoRouter(fomoRouterAddr);

        this.fomoRouter.createLottary(address(this));

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
    function swapTokensForBnbAndEnter(address token, uint256 bnbAmount) external {
        // uTrade swap one day
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = address(WBNB);

        uint256[] amounts = cRouter.swapTokensForExactETH(bnbAmount, 0, path, address(this), block.timestamp);
        enter(msg.sender, amounts[1]);
    }

    function enter(address _sender, uint _amount) external payable {
        console.log("CALLED enter!", _amount, _amount == 1e18);

        require(isContract(_sender) == false, "No contracts can enter");
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

        relayToRouter(msg.value, msg.sender);

        totalBNBCollected += _amount;
        walletToEntries[_sender] += entryTimes;
        walletToBnbSpent[_sender] += _amount;
    }

    function relayToRouter(uint256 bnbAmount, address participant) internal {
        this.fomoRouter.invest{value : bnbAmount}(issueId, participant);
    }

    /* START FINISH */
    function start(uint blockPeriod) external {
        require(msg.sender == deployer, "Not ownerr");
        require(startBlock == 0 && finishBlock == 0, "Must be clear to start");

        startBlock = block.number;
        finishBlock = startBlock + blockPeriod;
        issueId = startBlock;
    }

    function finish(uint256 _externalRandomNumber, address[] calldata _tokensInBasket) external onlyOwnerAndRouter {
        require(startBlock != 0 && finishBlock != 0, "Lottary Not Started !");
        // require(block.number > finishBlock, "Not time yet");
        require(participants.length >= 4, "Not enough participants");

        distributeReward(_externalRandomNumber, _tokensInBasket);

        startBlock = 0;
        finishBlock = 0;
        lastTimestamp = block.timestamp;
        delete participants;
        delete walletToEntries;
        delete walletToBnbSpent;
        totalBNBCollected = 0;
    }

    function distributeReward(uint256 _externalRandomNumber, address[] _tokensInBasket) internal {
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

        // TODO: do this 100 times & keep counter of ALL participants EVER ??! --> should be done inside Vault ! we dont need this !
        for (uint i = 0; i < 4; i++) {
            _structHash = keccak256(
                abi.encode(
                    _blockhash,
                    outherFactor[i],
                    gasleft,
                    _externalRandomNumber
                )
            );
            randomNumber = uint256(_structHash);
            winningIndexes[i] = uint256(randomNumber % length);
        }

        console.log("============= Winners", winningIndexes[0], winningIndexes[1], winningIndexes[2]);
        console.log("============= Winners Last", winningIndexes[3]);

        // Rewards
        // 1,2,3
        for (uint i = 0; i < 3; i++) {
            address winner = participants[winningIndexes[i]];
            uint rewardPercent = rewardDistribution[i];

            for (uint t = 0; i < _tokensInBasket.length; t++) {
                uint256 reward = IERC20(_tokensInBasket[t]).balanceOf(this) * rewardPercent / 10000;
                payable(winner).transfer(reward);
                // lottoId -> winIndex -> tokenIndex
                historyBasketAmounts[issueId][i][t].push(reward);
            }
            winningAddresses[i] = winner;
        }

        // 4
        address nftWinner = participants[winningIndexes[3]];
        winnerNFT.create(nftWinner, issueId);
        winningAddresses[3] = nftWinner;

        historyWinners[issueId] = winningAddresses;
        historyBasketTokens[issueId] = _tokensInBasket;

        emit WinnersChosen(issueId, winningAddresses);
    }

    // used to randomize gasLeft
    function getTotalParticipants(uint256 _randomNumber) public view returns (address) {
        address temp;
        if (issueId > 0) {
            uint cycle = _randomNumber % 7;
            for (uint i = 0; i < cycle; i++) {
                temp = historyWinners[issueId][_randomNumber % 3];
            }
        }
    }

    /* GETTERS */
    function getFinishBlock() external view returns (uint256) {
        return finishBlock;
    }

    function active() public view returns (bool) {
        return startBlock > 0;
    }

    /* SETTERS */
    function setRewardPercents(uint place, uint percent){
        rewardDistribution[place] = percent;

        require(validateRewards() == true, "More than 100% !");
    }

    function validateRewards(){
        uint pSum = 0;
        for (uint i = 0; i < rewardDistribution.length; i++) {
            pSum += rewardDistribution[i];
        }

        return pSum == 10000;
    }

    //Deal with BNB
    fallback() external payable {}

    receive() external payable {
        console.log("OPSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA !");
        require(startBlock != 0 && finishBlock != 0, "must have started");
        this.enter(msg.sender, msg.value);
    }
}
