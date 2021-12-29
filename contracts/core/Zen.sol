//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {ERC721URIStorage} from '@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol';
import {ERC721} from '@openzeppelin/contracts/token/ERC721/ERC721.sol';

interface IZeppelinToken {
    function burn(uint256 _amount) external;

    function mint(address _account, uint256 _amount) external;

    function receiveFunds(uint256 _amount) external;

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount)
        external
        returns (bool);

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
}

interface IURouter {
    function getAmountsOut(uint256 amountIn, address[] memory path)
        external
        view
        returns (uint256[] memory amounts);
}

interface IMilesNFT {
    function create(address _account, uint256 _zenSpotId) external;

    function balanceOf(address account) external view returns (uint256);
}

interface IRoyalSpotNFT {
    function theGreatBurn(address _account) external;

    function canEvolveToZen(address _account) external view returns (bool);
}

contract ZenNft is ERC721URIStorage, Ownable {
    uint256 public tokenCounter;
    uint256 public tokenSupply;

    // ETH-Add
    address public UROUTER;
    address public WETH_ADDRESS;

    IZeppelinToken public ZeppelinTokenContract;
    IMilesNFT public MilesNftContract;
    IRoyalSpotNFT public RoyaltyNftContract;
    address public MARKETPLACE_ADDRESS;
    address public YIELD_AGGREGATOR_ADDRESS;

    IURouter public uRouter = IURouter(UROUTER);

    enum Rank {
        COMMON,
        RARE,
        EPIC,
        LEGENDARY
    }

    struct ZenSpotInfo {
        uint256 totalAmount;
        uint256 startMinReq;
        Rank rank;
        address owner;
        address minter;
        uint256 id;
        uint256 mintBlock;
    }

    mapping(uint256 => ZenSpotInfo) public zenSpots;
    mapping(address => uint256) public accountToId;
    // index to tokenId
    uint256[] public allZenSpots;

    struct Rights {
        uint256 feeReduction;
        uint256 votingPower;
        uint256 bonusPercent;
        string uri;
        uint256 evolveBlocks;
    }

    uint256 public totalTokenValue;
    uint256 public totalRewards;

    //Record Last Minted Block
    uint256 public lastMintBlock;
    uint256 public mintCooldown = 1;
    uint256 public claimFee = 2000; // 20%

    uint256 public FOR_FOMO_FUND = 4000;
    uint256 public FOR_LP = 6000;

    mapping(Rank => Rights) public rankToRights;

    address[] internal pathToETH;

    /* MilesNFT */
    struct MilesInfo {
        uint256 totalAmount;
        uint256 amount;
        address owner;
        uint256 zenSpotId;
    }

    uint256 public totalSpeedUp;
    uint256 public milesCycle;

    // zenId
    mapping(uint256 => MilesInfo) public miles;
    uint256[] public allMiles;
    MilesInfo[][3] public historyWinners;

    uint256 public constant SPEEDUP_BLOCK_PER_ETH = 1200; // 0.01 ETH 1е16 = 1200 blocks [1h]
    uint256 public constant MIN_ETH_FOR_SPEEDUP = 33e16;
    uint256 public SPEED_FOR_LP = 8000;

    /* EVENTS */
    // Supply Management
    event NFTMinted(address _to, uint256 _tokenId);
    event NFTBurned(address _from, uint256 _tokenId, uint256 _rank);
    event ReceivedRewards(
        uint256 _rewardsAdded,
        uint256 _newTotal,
        uint256 _totalBonuses
    );

    // Evolution
    event EvolvedRarityArtAndYield(
        address _from,
        uint256 _tokenId,
        uint256 blockNr,
        uint256 _fromRank,
        uint256 _toRank
    );
    event SpeededUpEvolution(
        address _from,
        uint256 _tokenId,
        uint256 blocksSpeeded,
        uint256 amountSpent,
        uint256 ETHSpent
    );

    event SpeedUp(address _owner, uint256 _amountETH);
    event CycleConcluded(address[3] _top3, uint256 _totalAmount);

    constructor(address _zepV2Addr, address _milesNftAddr)
        ERC721('ZenNFT', 'ZenNFT')
    {
        tokenCounter = 0;
        tokenSupply = 0;

        ZeppelinTokenContract = IZeppelinToken(_zepV2Addr);
        MilesNftContract = IMilesNFT(_milesNftAddr);

        totalTokenValue = 0;
        totalRewards = 0;

        lastMintBlock = block.number;

        totalSpeedUp = 0;
        milesCycle = 0;
        pathToETH = [_zepV2Addr, WETH_ADDRESS];

        rankToRights[Rank.COMMON] = Rights({
            feeReduction: 0,
            votingPower: 1,
            bonusPercent: 1,
            evolveBlocks: 0,
            uri: ''
        });
        // 10 days
        rankToRights[Rank.RARE] = Rights({
            feeReduction: 3000,
            votingPower: 5,
            bonusPercent: 80,
            evolveBlocks: 8800,
            uri: ''
        });
        // 30 days
        rankToRights[Rank.EPIC] = Rights({
            feeReduction: 5000,
            votingPower: 13,
            bonusPercent: 300,
            evolveBlocks: 16400,
            uri: ''
        });
        // 60 days
        rankToRights[Rank.LEGENDARY] = Rights({
            feeReduction: 7000,
            votingPower: 30,
            bonusPercent: 500,
            evolveBlocks: 272800,
            uri: ''
        });
    }

    modifier onlyZeppelin() {
        require(
            msg.sender == address(ZeppelinTokenContract) ||
                msg.sender == owner(),
            'UnAuth'
        );
        _;
    }

    modifier onlyYieldAndZeppelin() {
        require(
            msg.sender == YIELD_AGGREGATOR_ADDRESS ||
                msg.sender == address(ZeppelinTokenContract),
            'UnAuth'
        );
        _;
    }

    modifier onlyNftHolders() {
        require(
            this.balanceOf(msg.sender) == 1 && accountToId[msg.sender] != 0,
            'No NFT !'
        );
        _;
    }

    modifier onlyYieldAggregatorAndOwner() {
        require(
            msg.sender == YIELD_AGGREGATOR_ADDRESS || msg.sender == owner(),
            'UnAuth'
        );
        _;
    }

    modifier onlyMarketplace() {
        require(msg.sender == MARKETPLACE_ADDRESS, 'UnAuth');
        _;
    }

    uint256 private unlocked = 1;
    modifier antiReentrant() {
        require(unlocked == 1, 'ERROR: Anti-Reentrant');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    function createZenSpot(address _account, uint256 _minReq)
        external
        onlyZeppelin
        returns (uint256)
    {
        if (this.canMint(_account)) {
            return _createZenSpot(_account, _minReq);
        }
        return 0;
    }

    function _createZenSpot(address _account, uint256 _minReq)
        internal
        returns (uint256)
    {
        uint256 newItemId = tokenCounter + 1;

        ZenSpotInfo memory nftInfo = ZenSpotInfo({
            totalAmount: _minReq,
            startMinReq: _minReq,
            rank: Rank.COMMON,
            owner: _account,
            minter: _account,
            id: newItemId,
            mintBlock: block.number
        });

        allZenSpots.push(newItemId);

        zenSpots[newItemId] = nftInfo;
        accountToId[_account] = newItemId;
        tokenCounter++;
        tokenSupply++;
        totalTokenValue += _minReq;
        lastMintBlock = block.number;

        super._safeMint(_account, newItemId);
        super._setTokenURI(newItemId, rankToRights[nftInfo.rank].uri);

        if (newItemId > 500) {
            RoyaltyNftContract.theGreatBurn(_account);
            emit NFTMinted(_account, newItemId);
        }
        return newItemId;
    }

    function receiveRewards(uint256 _dividendRewards)
        external
        onlyYieldAndZeppelin
    {
        uint256 nftCount = this.totalSupply();

        uint256 reward = _dividendRewards / nftCount;

        uint256 totalBonuses;
        uint256 bonus;
        for (uint256 i = 0; i < nftCount; i++) {
            bonus =
                (reward *
                    rankToRights[zenSpots[allZenSpots[i]].rank].bonusPercent) /
                10000;
            totalBonuses += bonus;
            zenSpots[allZenSpots[i]].totalAmount += reward + bonus;
        }
        totalRewards += _dividendRewards + totalBonuses;
        totalTokenValue += _dividendRewards + totalBonuses;

        ZeppelinTokenContract.mint(address(this), totalBonuses);

        emit ReceivedRewards(_dividendRewards, totalRewards, totalBonuses);
    }

    function burnToClaim() external onlyNftHolders antiReentrant {
        ZenSpotInfo memory nftInfo = zenSpots[accountToId[msg.sender]];

        uint256 underlyingZep = nftInfo.totalAmount;

        uint256 feeReduction = rankToRights[nftInfo.rank].feeReduction;
        uint256 feeAfterReduction = claimFee -
            ((claimFee * feeReduction) / 10000);
        uint256 feedVillageFee = (underlyingZep * feeAfterReduction) / 10000;

        // others on total
        if (FOR_FOMO_FUND > 0) {
            uint256 forFomo = (feedVillageFee * FOR_FOMO_FUND) / 10000;
            ZeppelinTokenContract.burn(forFomo);
            ZeppelinTokenContract.receiveFunds(forFomo);
        }
        if (FOR_LP > 0) {
            uint256 forLp = (feedVillageFee * FOR_LP) / 10000;
            ZeppelinTokenContract.transfer(YIELD_AGGREGATOR_ADDRESS, forLp);
        }

        ZeppelinTokenContract.transfer(
            msg.sender,
            underlyingZep - feedVillageFee
        );

        totalTokenValue -= underlyingZep;
        totalRewards -= (underlyingZep - nftInfo.startMinReq);
        delete zenSpots[nftInfo.id];
        removeZenSpotAt(nftInfo.id);
        delete accountToId[msg.sender];

        tokenSupply--;

        super._burn(nftInfo.id);

        emit NFTBurned(msg.sender, nftInfo.id, uint256(nftInfo.rank));
    }

    function removeZenSpotAt(uint256 _tokenId) internal returns (bool) {
        uint256 length = allZenSpots.length;

        if (allZenSpots[length - 1] == _tokenId) {
            allZenSpots.pop();
            return true;
        }

        bool found = false;
        for (uint256 i = 0; i < length - 1; i++) {
            if (_tokenId == allZenSpots[i]) {
                found = true;
            }
            if (found) {
                allZenSpots[i] = allZenSpots[i + 1];
            }
        }
        if (found) {
            allZenSpots.pop();
        }
        return found;
    }

    function evolve() external onlyNftHolders antiReentrant returns (bool) {
        return _evolve(msg.sender);
    }

    function _evolve(address _account) internal returns (bool) {
        ZenSpotInfo memory nftInfo = zenSpots[accountToId[_account]];
        require(nftInfo.rank != Rank.LEGENDARY, 'Already LEGENDARY ! Bows.');

        if (!canEvolve(msg.sender)) {
            return false;
        }

        uint256 nextRankNumber = uint256(nftInfo.rank) + 1;

        Rights memory currRights;
        for (uint256 i = uint256(Rank.LEGENDARY); i >= nextRankNumber; i--) {
            currRights = rankToRights[Rank(i)];
            if (block.number >= nftInfo.mintBlock + currRights.evolveBlocks) {
                zenSpots[nftInfo.id].rank = Rank(i);
                super._setTokenURI(nftInfo.id, currRights.uri);

                emit EvolvedRarityArtAndYield(
                    msg.sender,
                    nftInfo.id,
                    block.number,
                    uint256(nftInfo.rank),
                    i
                );
                return true;
            }
        }

        return false;
    }

    function canEvolve(address _account) public view returns (bool _canEvolve) {
        ZenSpotInfo memory nftInfo = zenSpots[accountToId[_account]];
        require(nftInfo.rank != Rank.LEGENDARY, 'Already LEGENDARY ! Bows.');

        Rank nextRank = Rank(uint256(nftInfo.rank) + 1);
        Rights memory nextRights = rankToRights[nextRank];

        return block.number >= nftInfo.mintBlock + nextRights.evolveBlocks;
    }

    // Requires Approval from msg.sender to this contract of at least _zenAmountForFund
    function speedUpEvolution(uint256 _zepAmountForFund)
        external
        onlyNftHolders
        antiReentrant
        returns (uint256 newMintBlock)
    {
        ZenSpotInfo memory nftInfo = zenSpots[accountToId[msg.sender]];
        require(nftInfo.rank != Rank.LEGENDARY, 'Already Max Rank');

        // Will revert if token amounts < 0.33 ETH
        // 1ETH / 0.01 --> 100 * 864 = 3 days
        (uint256 blocksToSpeedUp, uint256 ETH) = getReductionBlocksPerZep(
            _zepAmountForFund
        );
        zenSpots[nftInfo.id].mintBlock -= blocksToSpeedUp;

        // try and evolve
        _evolve(msg.sender);

        uint256 zenId = nftInfo.id;

        // Store speedup leaderboard from all ranks and users
        if (miles[zenId].owner == address(0)) {
            _createMiles(msg.sender, ETH, zenId);
        } else {
            miles[zenId].amount += ETH;
            miles[zenId].totalAmount += ETH;
        }

        // Min. 14.4 ETH worth of tokens to get MILES NFT
        // FCFS basis
        if (nftInfo.rank == Rank.COMMON && ETH >= 14.4e18) {
            MilesNftContract.create(msg.sender, zenId);
        }

        // Transfers full amount (tax excl.)
        ZeppelinTokenContract.transferFrom(
            msg.sender,
            address(this),
            _zepAmountForFund
        );

        uint256 forYieldAggregator = (_zepAmountForFund * SPEED_FOR_LP) / 10000;
        uint256 forFomoFund = _zepAmountForFund - forYieldAggregator;

        ZeppelinTokenContract.burn(forFomoFund);
        ZeppelinTokenContract.receiveFunds(forFomoFund);

        ZeppelinTokenContract.transfer(
            YIELD_AGGREGATOR_ADDRESS,
            forYieldAggregator
        );

        emit SpeededUpEvolution(
            msg.sender,
            nftInfo.id,
            blocksToSpeedUp,
            _zepAmountForFund,
            ETH
        );
        return zenSpots[nftInfo.id].mintBlock;
    }

    function _createMiles(
        address _account,
        uint256 _amountETH,
        uint256 _zenSpotId
    ) internal {
        MilesInfo memory nftInfo = MilesInfo({
            amount: _amountETH,
            totalAmount: _amountETH,
            owner: _account,
            zenSpotId: _zenSpotId
        });

        allMiles.push(_zenSpotId);
        miles[_zenSpotId] = nftInfo;

        totalSpeedUp += _amountETH;

        emit SpeedUp(_account, _amountETH);
    }

    //Get how much blocks will be reduced per _zepAmount provided
    function getReductionBlocksPerZep(uint256 _zepAmount)
        public
        view
        returns (uint256 blocksReduced, uint256 ETH)
    {
        ETH = uRouter.getAmountsOut(_zepAmount, pathToETH)[1];

        require(ETH >= MIN_ETH_FOR_SPEEDUP, 'Under min. value: < 0.33 ETH');
        blocksReduced = (ETH * SPEEDUP_BLOCK_PER_ETH) / 1e16;

        return (blocksReduced, ETH);
    }

    function concludeMilesCycle(address[3] calldata _top3) external onlyOwner {
        historyWinners[milesCycle].push(miles[accountToId[_top3[0]]]);
        historyWinners[milesCycle].push(miles[accountToId[_top3[1]]]);
        historyWinners[milesCycle].push(miles[accountToId[_top3[2]]]);

        for (uint256 i = 0; i < allMiles.length; i++) {
            miles[allMiles[i]].amount = 0;
        }
        milesCycle++;
        totalSpeedUp = 0;
        emit CycleConcluded(_top3, totalSpeedUp);
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721) {
        require(
            balanceOf(to) == 0 && accountToId[to] == 0,
            'Ownership limited to 1 per account !'
        );

        super._transfer(from, to, tokenId);

        delete accountToId[from];
        accountToId[to] = tokenId;
        zenSpots[tokenId].owner = to;
    }

    function marketTransfer(
        address _from,
        address _to,
        uint256 _nftId
    ) external onlyMarketplace {
        _transfer(_from, _to, _nftId);
    }

    function canMint(address _account) public view returns (bool) {
        if (super.balanceOf(_account) == 0) {
            if (
                tokenSupply < 500 &&
                block.number >= lastMintBlock + mintCooldown &&
                RoyaltyNftContract.canEvolveToZen(_account)
            ) {
                return true;
            } else if (tokenCounter < 500) {
                /* Initial 500 have no cooldown */
                return true;
            }
        }
        return false;
    }

    function getNftInfo(address _account)
        internal
        view
        returns (ZenSpotInfo memory)
    {
        return zenSpots[accountToId[_account]];
    }

    function totalSupply() public view returns (uint256) {
        return tokenSupply;
    }

    /* GETTERS EXTERNAL */
    function getIds() external view returns (uint256[] memory) {
        return allZenSpots;
    }

    function getOpenZenSpotsCount() external view returns (uint256) {
        return 500 - this.totalSupply();
    }

    function getBlocksTillFullEvolution(uint256 _tokenId)
        external
        view
        returns (uint256)
    {
        uint256 endAt = zenSpots[_tokenId].mintBlock +
            rankToRights[zenSpots[_tokenId].rank].evolveBlocks;
        if (endAt <= block.number) {
            return 0;
        }
        return endAt - block.number;
    }

    function getfeeReduction(uint256 _tokenId) external view returns (uint256) {
        return rankToRights[zenSpots[_tokenId].rank].feeReduction;
    }

    function getMinReq(uint256 _tokenId) external view returns (uint256) {
        return zenSpots[_tokenId].totalAmount;
    }

    function getRank(uint256 _tokenId) external view returns (uint256) {
        return uint256(zenSpots[_tokenId].rank);
    }

    function getIdForAccount(address _acc) external view returns (uint256) {
        return accountToId[_acc];
    }

    function getRights(uint256 _tokenId)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        Rights memory rights = rankToRights[zenSpots[_tokenId].rank];

        return (
            rights.feeReduction,
            rights.votingPower,
            rights.bonusPercent,
            rights.evolveBlocks
        );
    }

    function getNextMintBlock() external view returns (uint256) {
        return lastMintBlock + mintCooldown;
    }

    function getOwnerOfNftID(uint256 _tokenId) external view returns (address) {
        return zenSpots[_tokenId].owner;
    }

    function myInfo()
        external
        view
        returns (
            uint256 rank,
            uint256 rewards,
            uint256 startMinReq,
            uint256 id,
            uint256 mintBlock
        )
    {
        return getInfo(msg.sender);
    }

    function getInfo(address _account)
        public
        view
        returns (
            uint256 rank,
            uint256 rewards,
            uint256 startMinReq,
            uint256 id,
            uint256 mintBlock
        )
    {
        ZenSpotInfo memory nftInfo = getNftInfo(_account);

        return (
            uint256(nftInfo.rank),
            nftInfo.totalAmount,
            nftInfo.startMinReq,
            nftInfo.id,
            nftInfo.mintBlock
        );
    }

    function getMinter(uint256 _tokenId) external view returns (address) {
        return zenSpots[_tokenId].minter;
    }

    /* SETTERS */
    function setZepContract(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        ZeppelinTokenContract = IZeppelinToken(_addy);
    }

    function setMilesContract(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        MilesNftContract = IMilesNFT(_addy);
    }

    function setClaimFee(uint256 _newFee) external onlyOwner {
        require(_newFee >= 1000 && _newFee <= 3000, 'Hardlimits !');
        claimFee = _newFee;
    }

    function setClaimTaxDistribution(uint256 _fomo, uint256 _lp)
        external
        onlyOwner
    {
        require(_fomo + _lp == 10000, 'Not adding up to 100%');
        FOR_FOMO_FUND = _fomo;
        FOR_LP = _lp;
    }

    function setSpeedDistribution(uint256 _lp) external onlyOwner {
        require(_lp <= 10000, 'Not adding up to 100%');
        SPEED_FOR_LP = _lp;
    }

    function setMintCooldown(uint256 _newCd) external onlyOwner {
        // 2h
        require(_newCd <= 2400, 'Hardlimits !');
        mintCooldown = _newCd;
    }

    function setYieldAggregatorAddress(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        YIELD_AGGREGATOR_ADDRESS = _addy;
    }

    function setRoyalContract(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        RoyaltyNftContract = IRoyalSpotNFT(_addy);
    }

    function setMarketplaceAddress(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address !');
        MARKETPLACE_ADDRESS = _addy;
    }

    function setUAddr(address _rAdd) external onlyOwner {
        UROUTER = _rAdd;
        uRouter = IURouter(UROUTER);
    }

    function syncFund() external onlyYieldAggregatorAndOwner returns (bool) {
        if (totalTokenValue > ZeppelinTokenContract.balanceOf(address(this))) {
            totalTokenValue = ZeppelinTokenContract.balanceOf(address(this));
            return true;
        }

        uint256 diff = ZeppelinTokenContract.balanceOf(address(this)) -
            totalTokenValue;

        if (diff < 1e18) {
            return false;
        }

        uint256 nftCount = totalSupply();
        uint256 bonus = diff / nftCount;

        for (uint256 i = 0; i < nftCount; i++) {
            zenSpots[allZenSpots[i]].totalAmount += bonus;
        }

        totalTokenValue += diff;
        return true;
    }
}
