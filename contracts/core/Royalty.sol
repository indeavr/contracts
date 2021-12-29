//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {ERC721URIStorage} from '@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol';
import {ERC721} from '@openzeppelin/contracts/token/ERC721/ERC721.sol';

interface IUFactory {
    function allPairs(uint256) external view returns (address pair);

    function allPairsLength() external view returns (uint256);
}

interface IZeppelin {
    function burn(uint256 _amount) external;

    function receiveFunds(uint256 _amount) external;

    function balanceOf(address account) external view returns (uint256);

    function transfer(address recipient, uint256 amount)
        external
        returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
}

interface IKeeper {
    function deposit(uint256 _zepAmount, uint256 _royalId) external;
}

interface IRewardNft {
    function create(address _account, uint256 _royaltyId) external;
}

interface IURouter {
    function getAmountsIn(uint256 amountOut, address[] memory path)
        external
        view
        returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] memory path)
        external
        view
        returns (uint256[] memory amounts);
}

contract RoyaltyNft is ERC721URIStorage {
    uint256 public tokenCounter;
    IZeppelin public ZeppelinContract;
    IKeeper public KeeperContract;
    IRewardNft public RewardsContract;

    address public ZEN_NFT_ADDRESS;
    address public MARKETPLACE_ADDRESS;

    address public U_ROUTER;
    address public U_FACTORY_ADDRESS;
    address public WETH_ADDRESS;

    IURouter internal uRouter = IURouter(U_ROUTER);
    IUFactory internal uFactory = IUFactory(U_FACTORY_ADDRESS);

    uint256 internal constant MAX_SPOTS = 3000;

    address public YIELD_AGGREGATOR_ADDRESS;
    uint256 public rewardFund;

    enum Rank {
        PRIVATE,
        MAJOR,
        COLONEL,
        COMMANDER,
        GENERAL,
        ADMIRAL,
        GRAND_ADMIRAL,
        THE_SUPREME
    }

    struct RoyalInfo {
        uint256 id;
        address owner;
        Rank rank;
        uint256 level;
        address minter;
        uint256 buyVolume; // in ETH
        uint256 lastBlockClaimed;
        uint256 claimedRewards;
        uint256 lastSpeedUpVolume;
        uint256 buyVolumeInTokens;
    }

    /* Each Rank Has Certain Rights */
    struct Rights {
        uint256 giveawayWeight;
        uint256 feeReduction;
        string uri;
        uint256 minLevel;
    }

    mapping(uint256 => RoyalInfo) public royaltySpots;
    mapping(address => uint256) public accountToId;
    mapping(Rank => Rights) public rToR;

    uint256 internal lastMintBlock;

    /* Burn = send to pair */
    uint256[] public burnedIds;
    uint256 public burnIndex;

    uint256 public MIN_CLAIM_BLOCKS = 28800;
    uint256 internal constant CLAIM_COOLDOWN = 86400; // [72h]
    uint256 internal constant LEVELS = 10000;
    uint256 internal constant LEVEL_UP_AMOUNT = 3e15;
    uint256 internal constant REDUCTION_PER_LEVEL = 9;
    uint256 public mintPriceETH = 2e17; // 0.2

    uint256 public claimFee = 9000;
    uint256 public EXACT_GAS_CLAIM = 5e9;

    // Tax Distribution
    uint256 public FOR_FOMO_FUND = 4000;
    uint256 public FOR_LP = 5000;
    uint256 public FOR_BURN = 1000;

    uint256 public rewardElligibleCount;

    uint256 public gadmirals;
    uint256 public constant MAX_GRAND_ADMIRALS = 12;

    uint256 public SUPREME_VOLUME = 5e20;
    uint256 public constant GA_VOLUME = 2e20;

    uint256 public supremeId;
    uint256[12] public gaIds;

    /* TheSupreme Contest */
    uint256 public currentTopId;
    uint256 public supremeConEBlock;
    uint256 public supremeConDur = 604800; // = (21 days)
    bool public supreme;

    event TheSupremeWasBorn(
        uint256 _tokenId,
        address _account,
        uint256 volumeETH
    );
    event GACreated(uint256 _tokenId, address _account);

    event TheSupremeDied(uint256 _tokenId, address _account);
    event GADestroyed(uint256 _tokenId, address _account);

    event FeeAmountWasTooLow();
    event SpeededUpClaimTime(uint256 _tokenId, uint256 _blocks);

    //Supply Management
    event NFTMinted(address _to, uint256 _tokenId);
    event ReceivedRewards(uint256 _rewardsAdded, uint256 _newTotal);

    //Evolution
    event EvolvedRarityArt(
        address _from,
        uint256 _tokenId,
        uint256 blockNr,
        Rank _fromRank,
        Rank _toRank
    );
    event SpeededRarityEvolution(
        address _from,
        uint256 _tokenId,
        uint256 blocksSpeeded,
        uint256 amountSpent
    );
    event Evolved(
        address _account,
        uint256 _tokenId,
        bool _rankedUp,
        uint256 _newRank
    );
    event Devolved(address _account, uint256 _tokenId, uint256 _newRank);

    address deployer;

    constructor(address _zepV2Addr) ERC721('RoyalNFT', 'RoayltyNFT') {
        tokenCounter = 0;
        rewardFund = 0;
        deployer = msg.sender;

        ZeppelinContract = IZeppelin(_zepV2Addr);

        /* NORMAL RANKS */
        rToR[Rank.PRIVATE] = Rights({
            giveawayWeight: 0,
            feeReduction: 0,
            minLevel: 0,
            uri: ''
        });
        rToR[Rank.MAJOR] = Rights({
            giveawayWeight: 0,
            feeReduction: 0,
            minLevel: 800,
            uri: ''
        });
        rToR[Rank.COLONEL] = Rights({
            giveawayWeight: 0,
            feeReduction: 1000,
            minLevel: 2000,
            uri: ''
        });
        rToR[Rank.COMMANDER] = Rights({
            giveawayWeight: 1,
            feeReduction: 2500,
            minLevel: 4000,
            uri: ''
        });
        rToR[Rank.GENERAL] = Rights({
            giveawayWeight: 2,
            feeReduction: 4500,
            minLevel: 7000,
            uri: ''
        });
        rToR[Rank.ADMIRAL] = Rights({
            giveawayWeight: 3,
            feeReduction: 7000,
            minLevel: 9600,
            uri: ''
        });

        /* SPECIAL RANKS */
        // 4% of Total Max Voting Power ( 0.3 % Each )
        rToR[Rank.GRAND_ADMIRAL] = Rights({
            giveawayWeight: 20,
            feeReduction: 8500,
            minLevel: LEVELS,
            uri: ''
        });
        // 5% of Total Max Voting Power
        rToR[Rank.THE_SUPREME] = Rights({
            giveawayWeight: 50,
            feeReduction: 9500,
            minLevel: LEVELS,
            uri: ''
        });
        // 7days
        supremeConEBlock = block.number + supremeConDur;
    }

    modifier onlyOwner() {
        require(deployer == msg.sender, 'UnAuth');
        _;
    }

    modifier onlyNftHolders() {
        require(
            this.balanceOf(msg.sender) == 1 && accountToId[msg.sender] != 0,
            'No NFT !'
        );
        _;
    }

    modifier onlyZep() {
        require(msg.sender == address(ZeppelinContract), 'UnAuth');
        _;
    }

    modifier onlyKeeper() {
        require(msg.sender == address(KeeperContract), 'UnAuth');
        _;
    }

    modifier onlyYieldAggregatorAndZep() {
        require(
            msg.sender == address(YIELD_AGGREGATOR_ADDRESS) ||
                msg.sender == address(ZeppelinContract),
            'UnAuth'
        );
        _;
    }

    uint256 private unlocked = 1;
    modifier antiReentrant() {
        require(unlocked == 1, 'ERROR: Anti-Reentrant');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    function create(
        address _account,
        uint256 _buyVolumeETH,
        uint256 _inTokens
    ) external onlyZep returns (uint256 tokenId) {
        if (this.canMint(_account)) {
            return _createBuyerRoyaltyNFT(_account, _buyVolumeETH, _inTokens);
        }
        return 0;
    }

    function _createBuyerRoyaltyNFT(
        address _account,
        uint256 _buyAmount,
        uint256 _inTokens
    ) internal returns (uint256) {
        uint256 newItemId = tokenCounter + 1;
        uint256 level = _buyAmount / LEVEL_UP_AMOUNT;
        RoyalInfo memory nftInfo = RoyalInfo({
            id: newItemId,
            owner: _account,
            rank: Rank.PRIVATE,
            level: level,
            minter: _account,
            buyVolume: _buyAmount,
            lastBlockClaimed: block.number,
            claimedRewards: 0,
            lastSpeedUpVolume: 0,
            buyVolumeInTokens: _inTokens
        });

        royaltySpots[newItemId] = nftInfo;
        accountToId[_account] = newItemId;
        tokenCounter++;
        mintPriceETH = getNextMintPriceETH();
        lastMintBlock = block.number;

        super._safeMint(_account, newItemId);
        super._setTokenURI(newItemId, rToR[Rank.PRIVATE].uri);

        RewardsContract.create(_account, newItemId);

        emit NFTMinted(_account, newItemId);

        return newItemId;
    }

    // requires approval of zep to this contract
    function evolve()
        external
        onlyNftHolders
        antiReentrant
        returns (bool _success, uint256 _newRank)
    {
        RoyalInfo memory nftInfo = royaltySpots[accountToId[msg.sender]];

        if (nftInfo.rank == Rank.ADMIRAL) {
            return (false, uint256(Rank.ADMIRAL));
        }

        (bool success, uint256 newRankNumber) = getPotentialRank(
            nftInfo.level,
            uint256(nftInfo.rank)
        );

        if (!success) {
            return (false, uint256(nftInfo.rank));
        }

        // Get Token Equivalent of Rank Difference
        uint256 evolveTokensRequired = this.getTokensRequiredForEvolve(
            uint256(nftInfo.rank),
            newRankNumber
        );

        if (ZeppelinContract.balanceOf(msg.sender) < evolveTokensRequired) {
            return (false, uint256(nftInfo.rank));
        }

        Rank newRank = Rank(newRankNumber);

        royaltySpots[nftInfo.id].rank = newRank;
        super._setTokenURI(nftInfo.id, rToR[newRank].uri);

        if (nftInfo.rank == Rank.PRIVATE) {
            rewardElligibleCount++;
        }
        // Requires Approval of at least _evolveTokensRequired from nft owner to Royalty
        KeeperContract.deposit(evolveTokensRequired, nftInfo.id);
        ZeppelinContract.transferFrom(
            nftInfo.owner,
            address(this),
            evolveTokensRequired
        );
        ZeppelinContract.transfer(
            address(KeeperContract),
            evolveTokensRequired
        );

        emit Evolved(msg.sender, nftInfo.id, success, newRankNumber);

        return (true, newRankNumber);
    }

    function getTokensRequiredForEvolve(
        uint256 _currentRankNumber,
        uint256 _newRankNumber
    ) public view returns (uint256 tokensRequired) {
        require(_currentRankNumber < _newRankNumber, 'new rank must be more');
        address[] memory path = new address[](2);
        path[0] = WETH_ADDRESS;
        path[1] = address(ZeppelinContract);

        uint256 evolveETHRequired = (rToR[Rank(_newRankNumber)].minLevel -
            rToR[Rank(_currentRankNumber)].minLevel) * LEVEL_UP_AMOUNT;

        uint256 evolveTokensRequired = uRouter.getAmountsOut(
            evolveETHRequired,
            path
        )[1];

        return evolveTokensRequired;
    }

    function getPotentialRank(uint256 level, uint256 currentRank)
        public
        view
        returns (bool success, uint256 newRank)
    {
        uint256 rankedUp = 0;
        uint256 nextRankNumber = currentRank + 1;

        Rights memory nextRights;
        for (uint256 r = nextRankNumber; r <= uint256(Rank.ADMIRAL); r++) {
            nextRights = rToR[Rank(r)];

            // Enough Level
            if (level >= nextRights.minLevel) {
                rankedUp++;
            } else {
                break;
            }
        }

        if (rankedUp == 0) {
            return (false, currentRank);
        }

        return (true, currentRank + rankedUp);
    }

    // requires approval of this
    function royalEvolve() external onlyNftHolders antiReentrant {
        bool royalCourtComplete = gadmirals == MAX_GRAND_ADMIRALS && supreme;
        require(!royalCourtComplete, 'Royal Court already complete !');

        RoyalInfo memory nftInfo = royaltySpots[accountToId[msg.sender]];

        require(nftInfo.rank == Rank.PRIVATE, 'Must be Recruit !');

        /* THE_SUPREME */
        (
            bool wonContest,
            bool enoughTokens,
            uint256 tokensRequired
        ) = canBeSupreme(accountToId[msg.sender]);
        if (wonContest && enoughTokens) {
            KeeperContract.deposit(tokensRequired, nftInfo.id);

            // Requires Approval of at least currentTopBuyVolumeInTokens from nftInfoOwner
            // Tax evasion
            ZeppelinContract.transferFrom(
                nftInfo.owner,
                address(this),
                tokensRequired
            );
            ZeppelinContract.transfer(address(KeeperContract), tokensRequired);

            onSupremeBorn(nftInfo.id);
            return;
        }

        /* GRAND_ADMIRAL */
        (
            bool enoughVolume,
            bool enoughTokensGA,
            uint256 tokensRequiredGA
        ) = canBeGA(accountToId[msg.sender]);
        if (enoughVolume && enoughTokensGA) {
            KeeperContract.deposit(tokensRequiredGA, nftInfo.id);

            // Requires Approval of at least  nftInfo.buyVolumeInTokens from nftInfo.Owner
            ZeppelinContract.transferFrom(
                nftInfo.owner,
                address(this),
                tokensRequiredGA
            );
            ZeppelinContract.transfer(
                address(KeeperContract),
                tokensRequiredGA
            );

            royaltySpots[nftInfo.id].rank = Rank.GRAND_ADMIRAL;
            super._setTokenURI(nftInfo.id, rToR[Rank.GRAND_ADMIRAL].uri);

            uint256 count = MAX_GRAND_ADMIRALS;
            for (uint256 i = 0; i < count; i++) {
                if (gaIds[i] == 0) {
                    gaIds[i] = nftInfo.id;
                    gadmirals++;
                    rewardElligibleCount++;
                    break;
                }
            }

            emit GACreated(nftInfo.id, msg.sender);
        }
    }

    function canBeSupreme(uint256 _tokenId)
        public
        view
        returns (
            bool wonContest,
            bool enoughTokens,
            uint256 tokensRequired
        )
    {
        RoyalInfo memory nftInfo = royaltySpots[_tokenId];

        wonContest =
            !supreme &&
            nftInfo.buyVolume >= SUPREME_VOLUME &&
            nftInfo.id == currentTopId &&
            block.number >= supremeConEBlock;

        enoughTokens =
            ZeppelinContract.balanceOf(nftInfo.owner) >=
            nftInfo.buyVolumeInTokens;

        return (wonContest, enoughTokens, nftInfo.buyVolumeInTokens);
    }

    function canBeGA(uint256 _tokenId)
        public
        view
        returns (
            bool enoughVolume,
            bool enoughTokens,
            uint256 tokensRequired
        )
    {
        RoyalInfo memory nftInfo = royaltySpots[_tokenId];

        enoughVolume =
            gadmirals != MAX_GRAND_ADMIRALS &&
            nftInfo.buyVolume >= GA_VOLUME;

        enoughTokens =
            ZeppelinContract.balanceOf(nftInfo.owner) >=
            nftInfo.buyVolumeInTokens;

        return (enoughVolume, enoughTokens, nftInfo.buyVolumeInTokens);
    }

    function onSupremeBorn(uint256 _tokenId) internal {
        royaltySpots[_tokenId].rank = Rank.THE_SUPREME;
        rewardElligibleCount++;

        super._setTokenURI(_tokenId, rToR[Rank.THE_SUPREME].uri);

        supreme = true;
        supremeId = _tokenId;

        SUPREME_VOLUME = royaltySpots[currentTopId].buyVolume;
        delete currentTopId;

        emit TheSupremeWasBorn(_tokenId, msg.sender, SUPREME_VOLUME);
    }

    function claim() external onlyNftHolders antiReentrant returns (bool) {
        require(rewardFund > 1e18, 'Not enough fund !');
        require(this.canClaim(msg.sender), "Can't claim yet !");

        if (tx.gasprice != EXACT_GAS_CLAIM) {
            return false;
        }

        RoyalInfo memory nftInfo = royaltySpots[accountToId[msg.sender]];
        if (nftInfo.rank == Rank.PRIVATE) {
            return false;
        }

        uint256 fullClaimAmount = rewardFund / rewardElligibleCount;
        uint256 feeReduction = rToR[nftInfo.rank].feeReduction;
        uint256 feeAfterReduction = claimFee -
            ((claimFee * feeReduction) / 10000);
        uint256 feeAmount = (fullClaimAmount * feeAfterReduction) / 10000;

        uint256 claimAmount = fullClaimAmount - feeAmount;

        rewardFund -= fullClaimAmount;

        royaltySpots[nftInfo.id].claimedRewards += claimAmount;
        royaltySpots[nftInfo.id].lastBlockClaimed = block.number;

        ZeppelinContract.transfer(nftInfo.owner, claimAmount);

        // Inject back to fund
        if (feeAmount > 1e5) {
            if (FOR_BURN > 0) {
                uint256 forBurn = (feeAmount * FOR_BURN) / 10000;
                ZeppelinContract.burn(forBurn);
            }
            if (FOR_FOMO_FUND > 0) {
                uint256 fomoAmount = (feeAmount * FOR_FOMO_FUND) / 10000;
                ZeppelinContract.burn(fomoAmount);
                ZeppelinContract.receiveFunds(fomoAmount);
            }
            if (FOR_LP > 0) {
                ZeppelinContract.transfer(
                    YIELD_AGGREGATOR_ADDRESS,
                    (feeAmount * FOR_LP) / 10000
                );
            }
        } else {
            emit FeeAmountWasTooLow();
        }

        return true;
    }

    function canMint(address _account) public view returns (bool) {
        if (balanceOf(_account) == 0) {
            return
                (tokenCounter < MAX_SPOTS && block.number > lastMintBlock) ||
                tokenCounter == 0;
        }

        return false;
    }

    function canEvolve(address _account) public view returns (bool) {
        RoyalInfo memory nftInfo = getNftInfo(_account);
        Rights memory nextRights = rToR[Rank(uint256(nftInfo.rank) + 1)];

        bool enoughLevel = nftInfo.level >= nextRights.minLevel;

        return enoughLevel;
    }

    function canEvolveToZen(address _account) public view returns (bool) {
        if (this.balanceOf(_account) == 1) {
            RoyalInfo memory nftInfo = getNftInfo(_account);
            if (nftInfo.rank == Rank.PRIVATE) {
                return true;
            }
        }
        return false;
    }

    function canClaim(address _account) public view returns (bool) {
        return (getBlocksUntilClaim(_account) == 0);
    }

    function receiveRewards(uint256 _reward)
        external
        onlyYieldAggregatorAndZep
    {
        rewardFund += _reward;
        emit ReceivedRewards(_reward, rewardFund);
    }

    function handleBuy(
        address _account,
        uint256 _ETHAmount,
        uint256 _tokensReceived
    ) external onlyZep {
        RoyalInfo memory nftInfo = royaltySpots[accountToId[_account]];

        royaltySpots[nftInfo.id].buyVolume += _ETHAmount;
        royaltySpots[nftInfo.id].buyVolumeInTokens += _tokensReceived;

        if (_ETHAmount >= LEVEL_UP_AMOUNT) {
            uint256 gainedLevels = _ETHAmount / LEVEL_UP_AMOUNT;
            royaltySpots[nftInfo.id].level += gainedLevels;
        }

        uint256 claimBlock = nftInfo.lastBlockClaimed + CLAIM_COOLDOWN;

        if (claimBlock > block.number) {
            uint256 blocksLeft = claimBlock - block.number;
            if (blocksLeft > MIN_CLAIM_BLOCKS) {
                uint256 maxReduction = blocksLeft - MIN_CLAIM_BLOCKS;
                uint256 gainedLevels = _ETHAmount / LEVEL_UP_AMOUNT;
                uint256 reduction = gainedLevels * REDUCTION_PER_LEVEL;
                if (reduction < maxReduction) {
                    royaltySpots[nftInfo.id].lastBlockClaimed -= reduction;
                } else {
                    royaltySpots[nftInfo.id].lastBlockClaimed -= maxReduction;
                }
            }
        }

        if (
            !supreme &&
            royaltySpots[nftInfo.id].buyVolume >
            royaltySpots[currentTopId].buyVolume
        ) {
            currentTopId = nftInfo.id;
        }
    }

    function onLeaveVillage(address _account) external onlyKeeper {
        /* RESTART GAME */
        uint256 id = accountToId[_account];

        delete royaltySpots[id].buyVolume;
        delete royaltySpots[id].lastSpeedUpVolume;
        delete royaltySpots[id].buyVolumeInTokens;
        delete royaltySpots[id].level;

        if (royaltySpots[id].rank == Rank.GRAND_ADMIRAL) {
            onGALost(id, _account);
        } else if (royaltySpots[id].rank == Rank.THE_SUPREME) {
            onSupremeLost(id, _account);
        }

        royaltySpots[id].rank = Rank.PRIVATE;
        super._setTokenURI(id, rToR[Rank.PRIVATE].uri);

        if (rewardElligibleCount > 0) {
            rewardElligibleCount--;
        }

        emit Devolved(_account, id, 0);
    }

    /* On Keeper withdraw */
    function onSupremeLost(uint256 _id, address _account) internal {
        delete supremeId;
        supreme = false;

        uint256 oldDuration = supremeConDur;
        if (oldDuration > 28800) {
            supremeConDur = (oldDuration / 2);
            supremeConEBlock = block.number + supremeConDur;
        } else {
            supremeConEBlock = block.number + 28800;
        }

        emit TheSupremeDied(_id, _account);
    }

    /* On Keeper withdraw */
    function onGALost(uint256 _id, address _account) internal {
        gadmirals--;

        uint256 count = MAX_GRAND_ADMIRALS;
        for (uint256 i = 0; i < count; i++) {
            if (gaIds[i] == _id) {
                delete gaIds[i];
                break;
            }
        }

        emit GADestroyed(_id, _account);
    }

    /* If the degen doesn't royalEvolve() in 3 days Deployers can reset the competition */
    function resetSupreme(uint256 _contestBlocks) external onlyOwner {
        uint256 requiredBlocksNotBornAfterRace = 86400;
        if (
            !supreme &&
            block.number >= supremeConEBlock + requiredBlocksNotBornAfterRace
        ) {
            supremeConEBlock = block.number + _contestBlocks;
            delete currentTopId;
        }
    }

    function theGreatBurn(address _account) external {
        require(
            msg.sender == ZEN_NFT_ADDRESS ||
                msg.sender == address(KeeperContract),
            'Only Zen & Keeper'
        );
        address burnPairAddress = getNextBurnA();

        uint256 id = accountToId[_account];
        burnedIds.push(id);
        // Auto-Marketing
        _transfer(_account, burnPairAddress, id);

        burnIndex = 0;
    }

    function getNextBurnA() public view returns (address) {
        uint256 nextCount;
        if (burnIndex != 0) {
            nextCount = burnIndex;
        } else {
            nextCount = burnedIds.length;
        }
        address pair = uFactory.allPairs(nextCount);
        return pair;
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721) {
        require(accountToId[to] == 0, '1 per account !');
        super._transfer(from, to, tokenId);
        delete accountToId[from];
        accountToId[to] = tokenId;
        royaltySpots[tokenId].owner = to;
    }

    function marketTransfer(
        address _from,
        address _to,
        uint256 _nftId
    ) external {
        require(msg.sender == MARKETPLACE_ADDRESS, 'UnAuth');
        _transfer(_from, _to, _nftId);
    }

    function getClaimBlock(address _account) public view returns (uint256) {
        uint256 value = royaltySpots[accountToId[_account]].lastBlockClaimed +
            CLAIM_COOLDOWN;

        return value;
    }

    function getBlocksUntilClaim(address _account)
        public
        view
        returns (uint256)
    {
        uint256 claimBlock = getClaimBlock(_account);

        if (claimBlock > block.number) {
            return (claimBlock - block.number);
        }

        return 0;
    }

    function getNextMintPriceETH() public view returns (uint256) {
        uint256 minInETH = mintPriceETH;
        uint256 supply = this.totalSupply();
        if (supply < 1000) {
            minInETH += 7e14;
        } else if (supply < 2000) {
            minInETH += 1e15;
        } else if (supply < 2500) {
            minInETH += 8e15;
        } else if (supply < 2750) {
            minInETH += 56e15;
        } else if (supply < 2980) {
            minInETH += 13e16;
        } else {
            minInETH += 275e17;
        }

        return minInETH;
    }

    function totalSupply() public view returns (uint256) {
        return tokenCounter;
    }

    function getNftInfo(address _account)
        internal
        view
        returns (RoyalInfo memory)
    {
        return royaltySpots[accountToId[_account]];
    }

    /* GETTERS EXTERNAL */
    function getMinter(uint256 _tokenId) external view returns (address) {
        return royaltySpots[_tokenId].minter;
    }

    function getMintPriceETH() external view returns (uint256) {
        return mintPriceETH;
    }

    function getIdForAccount(address _acc) external view returns (uint256) {
        return accountToId[_acc];
    }

    function myInfo()
        external
        view
        returns (
            uint256 rank,
            uint256 level,
            uint256 id,
            uint256 possibleClaimAmount,
            uint256 blocksLeftToClaim,
            uint256 buyVolumeETH,
            uint256 buyVolumeInTokens,
            uint256 lastSpeedUpVolume,
            uint256 claimedRewards
        )
    {
        return getInfo(msg.sender);
    }

    function getInfo(address _account)
        public
        view
        returns (
            uint256 rank,
            uint256 level,
            uint256 id,
            uint256 possibleClaimAmount,
            uint256 blocksLeftToClaim,
            uint256 buyVolumeETH,
            uint256 buyVolumeInTokens,
            uint256 lastSpeedUpVolume,
            uint256 claimedRewards
        )
    {
        RoyalInfo memory nftInfo = getNftInfo(_account);

        if (rewardElligibleCount != 0) {
            uint256 claimBlock = nftInfo.lastBlockClaimed + CLAIM_COOLDOWN;
            blocksLeftToClaim = claimBlock > block.number
                ? claimBlock - block.number
                : 0;
            possibleClaimAmount = rewardFund / rewardElligibleCount;
        }

        return (
            uint256(nftInfo.rank),
            nftInfo.level,
            nftInfo.id,
            possibleClaimAmount,
            blocksLeftToClaim,
            nftInfo.buyVolume,
            nftInfo.buyVolumeInTokens,
            nftInfo.lastSpeedUpVolume,
            nftInfo.claimedRewards
        );
    }

    /* SETTERS */
    function setMinClaimBlocks(uint256 _newMin) external onlyOwner {
        require(_newMin <= 72000, 'Hardlimits');
        MIN_CLAIM_BLOCKS = _newMin;
    }

    function setY(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        ZeppelinContract = IZeppelin(_addy);
    }

    function setA(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        RewardsContract = IRewardNft(_addy);
    }

    function setLp(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        YIELD_AGGREGATOR_ADDRESS = _addy;
    }

    function setD(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        ZEN_NFT_ADDRESS = _addy;
    }

    function setK(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        KeeperContract = IKeeper(_addy);
    }

    function setM(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address !');
        MARKETPLACE_ADDRESS = _addy;
    }

    function setBurnIndex(uint256 _next) external {
        require(
            msg.sender == deployer && _next < uFactory.allPairsLength(),
            'Not Authorized Caller!'
        );
        burnIndex = _next;
    }

    function setClaimFee(uint256 _newFee) external onlyOwner {
        // 70%-90%
        require(_newFee >= 7000 && _newFee <= 9000, 'Hardlimits !');
        claimFee = _newFee;
    }

    function setClaimTaxDistribution(
        uint256 _fomo,
        uint256 _burnA,
        uint256 _lp
    ) external onlyOwner {
        require(_fomo + _burnA + _lp == 10000, 'Not adding up to 100%');
        FOR_FOMO_FUND = _fomo;
        FOR_LP = _lp;
        FOR_BURN = _burnA;
    }

    function setMaxGasClaim(uint256 _newGP) external onlyOwner {
        require(_newGP >= 1e9);
        EXACT_GAS_CLAIM = _newGP;
    }

    function setUAddrs(address _rAdd, address _facAdd) external onlyOwner {
        U_ROUTER = _rAdd;
        U_FACTORY_ADDRESS = _facAdd;

        uRouter = IURouter(U_ROUTER);
        uFactory = IUFactory(U_FACTORY_ADDRESS);
    }

    function syncFund() external {
        rewardFund = ZeppelinContract.balanceOf(address(this));
    }

    function transferOwnership(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address !');
        deployer = _addy;
    }
}
