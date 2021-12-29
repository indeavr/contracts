pragma solidity ^0.8.3;

import "hardhat/console.sol";

import "./interfaces/ILottoVault.sol";
import "./interfaces/IFomoRouter.sol";
import "./interfaces/ILottary.sol";
import "./interfaces/IFomoVault.sol";

contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        this;
        // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
        return msg.data;
    }
}

contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor () {
        address msgSender = _msgSender();
        _owner = msgSender;
        emit OwnershipTransferred(address(0), msgSender);
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
        _;
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions anymore. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby removing any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        emit OwnershipTransferred(_owner, address(0));
        _owner = address(0);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}

contract FomoRouter is IFomoRouterV1, Ownable {
    /*
        Lotto = 0
        CommunityAirdrop = 1
        Master = 2
        Partners = 3
        Zep = 4
        Redeem = 5
    */

    struct VaultInfo {
        uint percentage;
        address addr;
        uint index;
    }

    struct LottoInfo {
        address addr;
        uint totalBnbCollected;
        address lottoVaultAddress;
    }

    VaultInfo[] vaultsInfo;

    // lottoAddr -> vaultAddr
    mapping(address => LottoInfo) lottoAddressToInfo;

    LottoInfo[] allLottaries;

    constructor() {
    }

    function invest(uint lottoId, address participant) public override payable {
        console.log("# FR invest called -> lottoAddr", lottoAddressToInfo[msg.sender].addr);
        // null address check
        if (lottoAddressToInfo[msg.sender].addr != address(0)) {
            console.log("# FR vault length & msg.value", vaultsInfo.length, msg.value);
            for (uint i = 0; i < vaultsInfo.length; i++) {
                uint256 vaultAmount = msg.value * vaultsInfo[i].percentage / 10000;
                console.log("# FR vault 1", i, vaultsInfo[i].addr);
                console.log("# FR vault ", vaultAmount, vaultsInfo[i].percentage);
                IFomoVaultV1(vaultsInfo[i].addr).receiveBnb{value : vaultAmount}(msg.sender, participant);
                console.log("# FR UJ PRATI MA NE");
            }
        }
    }

    function createAllVaults(address[] calldata _vaultAddresses, uint[] calldata _percentages) public override {
        require(_vaultAddresses.length == _percentages.length, "arrays should be same length");

        for (uint i = 0; i < _vaultAddresses.length; i++) {
            vaultsInfo.push(VaultInfo({
            index : i,
            percentage : _percentages[i],
            addr : _vaultAddresses[i]
            }));
        }
    }

    function finishLottary(address _lottoAddr, uint256[] calldata _externalRandomNumbers, bool _finalPrepare) public override onlyOwner {
        ILottoVault vault = ILottoVault(vaultsInfo[0].addr);

        if (_finalPrepare) {
            // 100%
            vault.prepareBasket(_lottoAddr, 10000);
        }

        address[] memory tokensInBasket = vault.getTokensInBasket();
        ILottary(_lottoAddr).finish(_externalRandomNumbers, tokensInBasket);

        vault.clearInfo(_lottoAddr);
    }

    function registerNewLottary(address _address) public override {
        address lottoVaultAddress = vaultsInfo[0].addr;

        // TODO: should receive from above ?
        lottoAddressToInfo[_address] = LottoInfo({addr : _address, totalBnbCollected : 0, lottoVaultAddress : lottoVaultAddress});
    }

    //    function getVaultBalance(uint _vIndex) pure public view returns (uint256){
    //        return IFomoVaultV1(vaultsInfo[_vIndex].addr);
    //    }

    function setVaultPercent(uint _type, uint _percentage) public override {
        vaultsInfo[_type].percentage = _percentage;

        bool isValid = validateVaults();
        require(isValid, "not 100%");
    }

    function setVaultAddress(uint _type, address _address) public override {
        vaultsInfo[_type].addr = _address;
    }

    function replaceVault(uint _type, address _address, uint _percentage) public override {
        vaultsInfo[_type] = VaultInfo({index : _type, addr : _address, percentage : _percentage});
    }

    function validateVaults() internal returns (bool){
        uint pSum = 0;
        for (uint i = 0; i < vaultsInfo.length; i++) {
            pSum += vaultsInfo[i].percentage;
        }

        return pSum == 10000;
    }
    // TODO:
    //    function addVaultToLottary(address addr){
    //
    //    }
    //
    //    function getLottaryVaults(address addr) public view returns (){
    //
    //    }

    // delegate call
    // receive & send

}
