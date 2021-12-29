pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IWinnerNFT.sol";


contract WinnerNFT is ERC721, Ownable, IWinnerNFT {
    uint256 public tokenCounter = 0;
    string public tokenURI;
    address[] authorized;

    mapping(uint256 => uint256) public winners;

    constructor() public ERC721("Zep Exclusive NFT", "ZepEarlyNFT") {
        // TODO:
        tokenURI = "";
    }

    modifier onlyAuth {
        bool isAuth = false;
        for (uint i = 0; i < authorized.length; i++) {
            if (authorized[i] == msg.sender) {
                isAuth = true;
            }
        }
        require(isAuth, "Not Authorized to mint !");
        _;
    }

    function authorizeLottary(address _lottaryAddr) public override onlyOwner {
        authorized.push(_lottaryAddr);
    }

    function create(address _player, uint256 _issueId) public override onlyAuth returns (uint256) {
        uint256 newItemId = tokenCounter;

        _safeMint(msg.sender, newItemId);
        //        _setTokenURI(newItemId, tokenURI);

        winners[newItemId] = _issueId;
        tokenCounter++;
        return newItemId;

    }

    function burn(uint256 tokenId) external onlyOwner {
        _burn(tokenId);
    }
}
