pragma solidity 0.8.10;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';

interface IZeppelinSpotNFT {
    function getLastMintBlock() external view returns (uint256);

    function getIdForAccount(address _acc) external view returns (uint256);

    function receiveRewards(uint256 _dividendRewards) external;

    function burnToClaim() external;

    function create(address _account, uint256 _minReq)
        external
        returns (uint256);

    function getUnclaimed(address _account) external returns (uint256);

    function canMint(address _account) external view returns (bool);

    function getMinReq(uint256 _tokenId) external returns (uint256);

    function getIds() external view returns (uint256[] memory);

    function balanceOf(address owner) external view returns (uint256 balance);

    function ownerOf(uint256 tokenId) external view returns (address owner);

    function totalSupply() external view returns (uint256);

    function getOpenZeppelinSpotSpotsCount() external view returns (uint256);

    function getZeppelinSpotSpotAt(uint256 _tokenId)
        external
        view
        returns (
            uint256,
            uint256,
            address,
            uint256,
            uint256
        );

    function myInfo()
        external
        view
        returns (
            uint256 rank,
            uint256 rewards,
            uint256 startMinReq,
            uint256 id,
            uint256 mintBlock
        );
}

interface ILoyaZeppelinlNFT {
    function handleBuy(
        address _account,
        uint256 _amountEth,
        uint256 _tokenAmount
    ) external;

    function handleSold(address _account) external;

    function claim() external;

    function balanceOf(address owner) external view returns (uint256 balance);

    function totalSupply() external view returns (uint256);

    function ownerOf(uint256 tokenId) external view returns (address owner);

    function receiveRewards(uint256 _reward) external;

    function myInfoFull()
        external
        view
        returns (
            uint256 rank,
            uint256 level,
            uint256 possibleClaimAmount,
            uint256 blocksLeftToClaim,
            uint256 buyVolumeEth,
            uint256 sellVolumeEth,
            uint256 lastLevelUpVolume,
            uint256 claimedRewards
        );

    function getIdForAccount(address _acc) external view returns (uint256);

    function getBlocksUntilClaim(address _account) external returns (uint256);

    function getRights(uint256 _tokenId)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );

    function getNextRankRights(uint256 _tokenId)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );

    function canEvolve(address _account) external returns (bool);

    function getClaimBlock(address _account) external returns (uint256);

    function canMint(address _account) external view returns (bool);

    function create(
        address _account,
        uint256 _buyVolume,
        uint256 _zeppelinAmount
    ) external returns (uint256 tokenId);

    function getMintPriceEth() external view returns (uint256);

    function getNextMintPriceEth() external view returns (uint256);

    function syncFund() external;
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

    function removeLiquidityETHSupportingFeeOnTransferTokens(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountETH);

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        external
        payable
        returns (
            uint256 amountToken,
            uint256 amountETH,
            uint256 liquidity
        );

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;
}

interface IUFactory {
    function createPair(address tokenA, address tokenB)
        external
        returns (address pair);
}

interface ILPLock {
    function setLpToken(address lpTokenAdd) external;
}

interface IKeeper {
    function onReceive(
        address _account,
        uint256 _ethAmountIn,
        uint256 _zeppelinAmount
    ) external;

    function onTransfer(address _account, uint256 _zeppelin) external;

    function withdraw(uint256 _zeppelinAmount) external;
}

contract ZeppelinToken is ERC20('ZeppelinToken', 'Zeppelin'), Ownable {
    uint256 public zeppelinFund;
    address public U_ROUTER;
    address public U_FACTORY_ADDRESS;
    address public WETH_ADDRESS;

    IZeppelinSpotNFT public ZeppelinSpotNftContract;
    ILoyaZeppelinlNFT public LoyalNftContract;
    IKeeper public KeeperContract;

    address[] internal path;
    address[] internal pathToEth;
    address public FOMOV2_ETH_PAIR;
    address public PORTAL_ADDRESS;
    address public LP_GROWER_ADDRESS;
    address public ZEPPELIN_ROUTER_ADDRESS;

    IURouter internal uRouter = IURouter(U_ROUTER);
    IUFactory internal uFactory = IUFactory(U_FACTORY_ADDRESS);

    /* Tax & Metrics */
    uint256 internal FOMO_TAX = 400;
    uint256 internal LP_TAX = 200;

    uint256 public initialMinEthforZeppelinSpot = 1e19; // 10.0 ETH
    uint256 internal constant initialMinEthforLoyal = 2e17; // 0.2 ETH
    uint256 public lastLoyalMintPriceEth = 2e17;

    uint256 internal gasRefund;
    uint256 public scaleAmount;
    uint256 public scaleBasis;
    uint256 public lpLockFeePercent;
    uint256 public startTimestamp;

    mapping(address => bool) internal excludedBinanceHotWallets;

    uint256 internal ZEPPELIN_SPOT_REW_CD = 28800; //[24hr]
    uint256 internal LOY_REW_CD = 1200; // [1hr]

    uint256 public lastZeppelinSpotRewBlock;
    uint256 public lastLoyRewBlock;

    uint256 internal defaultGwei = 5e9;
    uint256 internal launchPeriodEndBlock;

    event ZeppelinSpotRewarded(uint256 reward, uint256 percent);
    event ZeppelinLoyalRewarded(uint256 reward, uint256 percent);
    event Sold(address _account, uint256 tokens);
    event Buy(address _account, uint256 tokens, uint256 eth);
    event ReceivedFunds(address _account, uint256 _tokens);

    constructor() {
        path = [WETH_ADDRESS, address(this)];
        pathToEth = [address(this), WETH_ADDRESS];

        //Trigger Reward/Refund for gas spent
        gasRefund = 1e20;

        // ZeppelinSpot Mint Price Scaling
        scaleAmount = 3e18;
        // 1m
        scaleBasis = 1e24;

        // 6% on SELL only
        lpLockFeePercent = 600;

        //Exclude Those Hot Wallets
        excludedBinanceHotWallets[
            0x631Fc1EA2270e98fbD9D92658eCe0F5a269Aa161
        ] = true;
        excludedBinanceHotWallets[
            0xB1256D6b31E4Ae87DA1D56E5890C66be7f1C038e
        ] = true;
        excludedBinanceHotWallets[
            0x17B692ae403a8Ff3a3B2eD7676cF194310ddE9Af
        ] = true;
        excludedBinanceHotWallets[
            0x8fF804cc2143451F454779A40DE386F913dCff20
        ] = true;
        excludedBinanceHotWallets[
            0xAD9ffffd4573b642959D3B854027735579555Cbc
        ] = true;

        startTimestamp = block.timestamp;

        zeppelinFund = 2e25;

        lastZeppelinSpotRewBlock = block.number;
        lastLoyRewBlock = block.number;
    }

    uint256 private unlocked = 1;
    modifier antiReentrant() {
        require(unlocked == 1, 'ERROR: Anti-Reentrant');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    modifier onlyZeppelinContracts() {
        require(
            msg.sender == owner() ||
                msg.sender == address(ZeppelinSpotNftContract) ||
                msg.sender == address(LoyalNftContract) ||
                msg.sender == PORTAL_ADDRESS,
            'Unauthorized !'
        );
        _;
    }

    modifier onlyZeppelinRouter() {
        require(msg.sender == ZEPPELIN_ROUTER_ADDRESS, 'Not Zeppelin Router');
        _;
    }

    /* MIGRATION */
    bool public migrationEnded;

    function mintFromSnapshot(
        address[] calldata _accounts,
        uint256[] calldata _amounts
    ) external onlyOwner {
        require(!migrationEnded, 'Migration has ended !');
        require(_accounts.length == _amounts.length, 'Length Mismatch');

        for (uint256 i = 0; i < _accounts.length; i++) {
            // Mint to each address its tokens.
            if (_accounts[i] != 0x999999cf1046e68e36E1aA2E0E07105eDDD1f08E) {
                if (
                    _accounts[i] != address(0) &&
                    _accounts[i] != 0xc0ffee254729296a45a3885639AC7E10F9d54979
                ) {
                    super._mint(_accounts[i], _amounts[i]);
                }
            }
        }
    }

    function createInitialZeppelinAccounts(
        address[] calldata _accounts,
        uint256[] calldata _minReqs
    ) external onlyOwner {
        require(!migrationEnded, 'Migration has ended !');
        require(_accounts.length == _minReqs.length, 'Length Missmatch');

        for (uint256 i = 0; i < _accounts.length; i++) {
            //Burn the minReqs from here
            super._transfer(
                _accounts[i],
                address(ZeppelinSpotNftContract),
                _minReqs[i]
            );
            //Create the NFT
            ZeppelinSpotNftContract.create(_accounts[i], _minReqs[i]);
        }
    }

    function mintInitialLPTokens(uint256 _amtOfTokens) external {
        require(!migrationEnded, 'Migration has ended !');
        require(msg.sender == PORTAL_ADDRESS, 'Only Portal !');
        _mint(msg.sender, _amtOfTokens);

        // Set Max TX Amount, before LP is OPEN!
        launchPeriodEndBlock = block.number + uint256(1000);

        // Starting Loyal Reward Fund Amount 2M tokens
        _mint(address(LoyalNftContract), 2e24);
        LoyalNftContract.syncFund();
    }

    function endMigration() external onlyOwner {
        migrationEnded = true;
    }

    /* TRANSFERS */
    function _transfer(
        address _sender,
        address _to,
        uint256 _amount
    ) internal override {
        require(_amount > 10000, 'Error: Send More Tokens');

        // :: Keeper applies normal tax on withdraw()
        // :: Loyal _to when people send tokens to Loyal [no-tax]
        // :: Loyal _sender when Loyal sends tokens to Keeper [no-tax]
        /* Don't tax transfer from this add */
        if (
            _sender == address(this) ||
            _to == address(ZeppelinSpotNftContract) ||
            _sender == address(ZeppelinSpotNftContract) ||
            _to == address(LoyalNftContract) ||
            _sender == address(LoyalNftContract) ||
            _sender == PORTAL_ADDRESS ||
            _sender == LP_GROWER_ADDRESS ||
            _to == ZEPPELIN_ROUTER_ADDRESS ||
            _to == LP_GROWER_ADDRESS ||
            excludedBinanceHotWallets[_sender] ||
            excludedBinanceHotWallets[_to]
        ) {
            super._transfer(_sender, _to, _amount);
            return;
        }

        /* Don't tax on remove liq, ensures 100% safeLiquidityRemoval*/
        if (
            (_sender == FOMOV2_ETH_PAIR && _to == address(uRouter)) ||
            _sender == address(U_ROUTER)
        ) {
            super._transfer(_sender, _to, _amount);
            return;
        }

        // First 50 minutes after launch -> max TX value allowed is 1.00 ETH worth of ZEPPELIN
        if (block.number < launchPeriodEndBlock) {
            require(
                _amount <= uRouter.getAmountsOut(1e18, path)[1],
                'Max Transaction Amount Reached: Try less'
            );
        }

        /* isSell & addLiq */
        if (_to == FOMOV2_ETH_PAIR) {
            uint256 autoLockAmt = (_amount * lpLockFeePercent) / 10000;
            if (autoLockAmt > 0) {
                super._transfer(_sender, LP_GROWER_ADDRESS, autoLockAmt);
            }
            super._transfer(_sender, _to, (_amount - autoLockAmt));
            emit Sold(_sender, _amount);
        } else {
            /* isBuy or Normal transfer */
            (
                uint256 fomoTaxDynamic,
                uint256 lpTaxDynamic,
                uint256 burnRateDynamic
            ) = this.determineFeePhase();
            uint256 fomoTaxAmount = (_amount * fomoTaxDynamic) / 10000;
            uint256 amtToBurn;
            if (burnRateDynamic > 0) {
                amtToBurn = (_amount * burnRateDynamic) / 10000;
            }

            super._burn(_sender, amtToBurn + fomoTaxAmount);

            uint256 amtForLp;
            if (lpTaxDynamic > 0) {
                amtForLp = (_amount * lpTaxDynamic) / 10000;
                super._transfer(_sender, LP_GROWER_ADDRESS, amtForLp);
            }

            uint256 finalAmount = _amount -
                (amtToBurn + fomoTaxAmount + amtForLp);
            zeppelinFund += fomoTaxAmount;
            super._transfer(_sender, _to, finalAmount);

            /* MAY THE FUN BEGIN */
            /* NFTs*/
            {
                // avoids-stack-too-deep
                if (_sender == FOMOV2_ETH_PAIR) {
                    uint256 ethAmountIn = uRouter.getAmountsIn(_amount, path)[
                        0
                    ];

                    /* buyVolume */
                    if (LoyalNftContract.balanceOf(_to) > 0) {
                        LoyalNftContract.handleBuy(
                            _to,
                            ethAmountIn,
                            finalAmount
                        );
                    }

                    emit Buy(_sender, finalAmount, ethAmountIn);

                    /* ROYAL */
                    // 1. Max 1 per block
                    if (
                        ethAmountIn >= lastLoyalMintPriceEth &&
                        LoyalNftContract.canMint(_to) &&
                        defaultGwei == tx.gasprice
                    ) {
                        _mintLoyal(_to, ethAmountIn, finalAmount);
                    }
                }
            }
        }
    }

    /* = Buy ZeppelinSpot. Can be called by anyone. */
    function mintZeppelinSpot(address _account)
        external
        onlyZeppelinRouter
        antiReentrant
    {
        /* ZEPPELIN SPOT */
        (uint256 minTokensZeppelinSpot, ) = this.scaleZeppelinNftMintPrice();

        // Check if _account has required ZEPPELIN
        // 1. NFT Balance = 0
        // 2. Supply < 500
        // 3. gwei = default [random tx ordering]
        // 4. Holds Loyal NFT Rank 0
        if (
            this.balanceOf(_account) >= minTokensZeppelinSpot &&
            ZeppelinSpotNftContract.canMint(_account) &&
            defaultGwei == tx.gasprice
        ) {
            _mintZeppelinSpot(_account, minTokensZeppelinSpot);
        }
    }

    function _mintZeppelinSpot(address _account, uint256 _minReqZeppelin)
        internal
    {
        uint256 nftId = ZeppelinSpotNftContract.create(
            _account,
            _minReqZeppelin
        );
        if (nftId != 0) {
            super._transfer(
                _account,
                address(ZeppelinSpotNftContract),
                _minReqZeppelin
            );
        }
    }

    /* Creates NFT.Called on buy (transfer) if nft can be minted. */
    function _mintLoyal(
        address _account,
        uint256 _ethAmountIn,
        uint256 _zeppelinAmount
    ) internal {
        uint256 minEth = LoyalNftContract.getMintPriceEth();

        if (_ethAmountIn >= minEth) {
            uint256 nftId = LoyalNftContract.create(
                _account,
                _ethAmountIn,
                _zeppelinAmount
            );
            if (nftId != 0) {
                lastLoyalMintPriceEth = minEth;
            }
        }
    }

    /* --------- REWARDS --------- */

    /*
        Triggers the distribution of the ZeppelinSpot NFT rewards
        [every 24hrs]
        [can be called by everyone]
     */
    function sendZeppelinSpotRewardsToNft()
        external
        onlyZeppelinRouter
        antiReentrant
    {
        require(
            lastZeppelinSpotRewBlock + ZEPPELIN_SPOT_REW_CD < block.number,
            'Not time yet !'
        );

        (uint256 divPercent, ) = this.determineFundDistribution();
        uint256 rewards = (zeppelinFund * divPercent) / 10000;

        zeppelinFund -= rewards;
        lastZeppelinSpotRewBlock = block.number;

        ZeppelinSpotNftContract.receiveRewards(rewards);
        _mint(address(ZeppelinSpotNftContract), rewards);
        _mint(msg.sender, gasRefund * 24);

        emit ZeppelinSpotRewarded(rewards, divPercent);
    }

    /*
        Triggers the distribution of the Loyal NFT rewards
        [every 24hrs]
        [can be called by everyone]
     */
    function sendLoyalRewardsToNft() external onlyZeppelinRouter antiReentrant {
        require(lastLoyRewBlock + LOY_REW_CD < block.number, 'Not time yet !');

        // Gets Yield amount % of total reward fund
        (, uint256 royaltyPercent) = this.determineFundDistribution();
        uint256 rewards = (zeppelinFund * royaltyPercent) / 10000;

        zeppelinFund -= rewards;
        lastLoyRewBlock = block.number;

        LoyalNftContract.receiveRewards(rewards);
        _mint(address(LoyalNftContract), rewards);
        _mint(msg.sender, gasRefund);
        emit ZeppelinLoyalRewarded(rewards, royaltyPercent);
    }

    /*
       Increases the total reward fund amount. Called in protocol fee distributions.
       @called from: ZeppelinSpot & ZeppelinLoyal & LpGrowth contracts
   */
    function receiveFunds(uint256 _amount) external {
        require(
            msg.sender == address(ZeppelinSpotNftContract) ||
                msg.sender == address(LoyalNftContract) ||
                msg.sender == LP_GROWER_ADDRESS,
            'Unauthorized !'
        );
        zeppelinFund += _amount;
        emit ReceivedFunds(msg.sender, _amount);
    }

    /* --------- BURN & MINT --------- */
    function burn(uint256 _amount) external {
        super._burn(msg.sender, _amount);
    }

    /*
        Called ONLY from ZeppelinSpot.
        Triggered by @sendDivRewardsToNft.
        ZeppelinSpot mints a small percent of the rewardAmount / totalSupply = bonusTokens.
    */
    function mint(address _account, uint256 _amount) external {
        require(
            address(ZeppelinSpotNftContract) == msg.sender,
            'Only the Zeppelin can mint !'
        );
        _mint(_account, _amount);
    }

    function _mint(address _account, uint256 _amount) internal override {
        // safety
        if (_account != PORTAL_ADDRESS) {
            require(_amount < 5e24, "Can't mint that much degen !");
        }
        super._mint(_account, _amount);
    }

    function scaleZeppelinNftMintPrice()
        external
        view
        returns (uint256 inTokens, uint256 inETH)
    {
        uint256 minInEth = initialMinEthforZeppelinSpot;

        // If Zeppelin Reward Fund is bigger than 10m Tokens
        // +3ETH for each 1m Tokens in Reward Fund
        // ex: fund = 18m --> 8 * 3ETH + basePrice (10eth) = 34 ETH
        if (zeppelinFund >= 1e25) {
            uint256 bonusAmount = ((zeppelinFund - 1e25) * scaleAmount) /
                scaleBasis;
            minInEth += bonusAmount;
        }

        inTokens = uRouter.getAmountsOut(minInEth, path)[1];
        return (inTokens, minInEth);
    }

    /* --------- GETTERS --------- */
    /*
        Determines the distribution of the total tax of 6%
        Phase 1: Default (rewardFund < 30%) of totalSupply
            -> totalSupply = ~90m (at time of writing)
            -> 30% = ~28m
        Phase 2: rewardFund > 30% (a lot of volume required for this to be triggered)
        @returns (% for): reward(zeppelin)Fund, lpGrower, burn
    */
    function determineFeePhase()
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        bool isFundLessThanPercent = zeppelinFund <
            (this.totalSupply() * 3000) / 10000;

        if (isFundLessThanPercent) {
            return (FOMO_TAX, LP_TAX, 0);
        } else {
            return (200, 0, 400);
        }
    }

    /*
       Determines the % of the total reward sent towards to ZeppelinSpot NFT and Loyal NFT
       @called from the 2 sendRewards functions (sendDivRewardsToNft, sendLoyaltyRewardsToNft)
       @returns: zeppelinSpotPercent, royalPercent (base 10000)
   */
    function determineFundDistribution()
        public
        view
        returns (uint256, uint256)
    {
        if (startTimestamp + 10 days > block.timestamp) {
            return (80, 3);
        } else if (startTimestamp + 20 days < block.timestamp) {
            return (90, 4);
        } else if (startTimestamp + 40 days < block.timestamp) {
            return (100, 5);
        } else if (startTimestamp + 60 days < block.timestamp) {
            return (110, 6);
        } else {
            return (120, 7);
        }
    }

    /* Returns the CURRENT Loyal NFT Mint Price (eth, zeppelin) */
    function getLoyalMintPrice()
        external
        view
        returns (uint256 eth, uint256 zeppelin)
    {
        uint256 mP = LoyalNftContract.getMintPriceEth();
        return (mP, uRouter.getAmountsOut(mP, path)[1]);
    }

    /* Returns the ZeppelinSpot NFT Mint Price (zeppelin, eth) */
    function getNextLoyalMintPriceInTokens() external view returns (uint256) {
        uint256 minInEth = LoyalNftContract.getNextMintPriceEth();
        uint256 inTokens = uRouter.getAmountsIn(minInEth, pathToEth)[1];

        return inTokens;
    }

    function getMinNftAmounts() external view returns (uint256, uint256) {
        return (
            uRouter.getAmountsIn(initialMinEthforLoyal, path)[1],
            uRouter.getAmountsIn(initialMinEthforZeppelinSpot, path)[1]
        );
    }

    function getNextLoyalBlock() external view returns (uint256) {
        return lastLoyRewBlock + LOY_REW_CD;
    }

    /* Returns the block for the next ZeppelinSpot reward distribution */
    function getNextZeppelinSpotBlock() external view returns (uint256) {
        return lastZeppelinSpotRewBlock + ZEPPELIN_SPOT_REW_CD;
    }

    function getFomoFund1() external view returns (uint256) {
        return zeppelinFund / 1e18;
    }

    function getPairAddress() external view returns (address) {
        return FOMOV2_ETH_PAIR;
    }

    /* SETTERS */
    function setDefaultGwei(uint256 _amt) external onlyOwner {
        defaultGwei = _amt;
    }

    function setTax(uint256 _newFomoTax, uint256 _newLpTax) external onlyOwner {
        require(_newFomoTax + _newLpTax <= 700, 'HardLimits');
        FOMO_TAX = _newFomoTax;
        LP_TAX = _newLpTax;
    }

    function setMinETHForZeppelinSpot(uint256 amt) external onlyOwner {
        //Min 5 ETH ; Max 10 ETH
        require(amt >= 1e18 && amt <= 1e20, 'HardLimits');
        initialMinEthforZeppelinSpot = amt;
    }

    function setCooldownZeppelinSpot(uint256 _newCd) external onlyOwner {
        // 12h - 3d
        require(_newCd >= 14400 && _newCd <= 86400, 'HardLimits');
        ZEPPELIN_SPOT_REW_CD = _newCd;
    }

    function setCooldownLoyal(uint256 _newCd) external onlyOwner {
        // 30m - 4hr
        require(_newCd >= 600 && _newCd <= 4800, 'HardLimits');
        LOY_REW_CD = _newCd;
    }

    function setGasRefund(uint256 _amount) external onlyOwner {
        require(_amount >= 1e19 && _amount <= 5e22, 'HardLimits');
        gasRefund = _amount;
    }

    function setSellTax(uint256 _lpTax) external onlyOwner {
        require(_lpTax >= 300 && _lpTax <= 1000, 'HardLimits');
        lpLockFeePercent = _lpTax;
    }

    /* Deploy Setters */
    function setPairAddress(address _addy) external onlyZeppelinContracts {
        require(_addy != address(0), 'Zero address');
        FOMOV2_ETH_PAIR = _addy;
    }

    function setLoyalNftContract(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        LoyalNftContract = ILoyaZeppelinlNFT(_addy);
    }

    function setZeppelinSpotContract(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        ZeppelinSpotNftContract = IZeppelinSpotNFT(_addy);
    }

    function setLpGrowerAddress(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        LP_GROWER_ADDRESS = _addy;
    }

    function setPortalAddress(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        PORTAL_ADDRESS = _addy;
    }

    function setKeeperAddress(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        KeeperContract = IKeeper(_addy);
    }

    function setRouterAddress(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero Adress');
        ZEPPELIN_ROUTER_ADDRESS = _addy;
    }

    function setUAddrs(address _rAdd, address _facAdd) external onlyOwner {
        U_ROUTER = _rAdd;
        U_FACTORY_ADDRESS = _facAdd;

        uRouter = IURouter(U_ROUTER);
        uFactory = IUFactory(U_FACTORY_ADDRESS);
    }

    // Deal with ETH
    fallback() external payable {}

    receive() external payable {}
}
