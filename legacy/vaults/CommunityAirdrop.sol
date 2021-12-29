pragma solidity ^0.8.3;

import "../interfaces/ICommunityAirdrop.sol";
import "./FomoVault.sol";

contract CommunityAirdrop is IComunityAirdrop, FomoVault {

    uint256 RECEIVED_BNB_THRESHOLD = 1e21;
    uint256 MIN_BNB_THRESHOLD = 1e21; // 1000 BNB
    uint NUMBER_OF_WINNERS = 100;
    uint[] public winningIndexes;
    address[] public winningAddresses;

    uint256 lottaryToTotalBnb;
    // bnbAmount
    mapping(address => uint256) participantsToAmounts;
    address[] participants;

    constructor (address _fomoRouterAddr) {
        super.setRouter(_fomoRouterAddr);
    }

    address[] internal participants;

    /* IN */
    function receiveBnb(address _lottaryAddr, address _fromAccount) public override payable {
        if (participantsToAmounts[_fromAccount] != 0) {
            participants.push(_fromAccount);
        }

        participantsToAmounts[_fromAccount] += msg.value;
        lottaryToTotalBnb[_lottaryAddr] += msg.value; // TODO:

        super._receiveBnb{value : msg.value}(_lottaryAddr, _fromAccount);
    }

    function distributeRewards(uint[] calldata _externalRandomNumbers) public override onlyOwnerAndRouter {
        require(totalReceivedBnb > MIN_BNB_THRESHOLD, "Not Enough BNB accumulated. Aiming for 3000 !");
        require(participants.length > NUMBER_OF_WINNERS, "Not Enough participants. At least 100 !");

        require(_externalRandomNumbers.length > NUMBER_OF_WINNERS);
        bytes32 _structHash;
        uint256 randomNumber;
        bytes32 _blockhash = blockhash(block.number - 1);
        uint256 length = participants.length;

        console.log("CALLED distributeReward!", length);

        // waste some gas fee here
        for (uint i = 0; i < 9; i++) {
            getTotalParticipants(0); // TODO: not 0
        }
        uint256 gasleft = gasleft();

        uint256[] memory outherFactor = new uint256[](4);
        outherFactor[0] = block.difficulty;
        outherFactor[1] = address(this).balance / 1e18;
//        outherFactor[2] = lastTimestamp;
        outherFactor[2] = participants.length; // TODO:

        uint winIndex;
        uint count = 0;
        while (count < NUMBER_OF_WINNERS) {
            _structHash = keccak256(
                abi.encode(
                    _blockhash,
                    outherFactor[count % 4],
                    gasleft,
                    _externalRandomNumbers[count]
                )
            );
            randomNumber = uint256(_structHash);
            winIndex = uint256(randomNumber % length);
            if (!alreadyWon(winIndex)) {
                winningIndexes.push(winIndex);
                count++;
            }
        }
        console.log("GG namerihme 100 indexa !");

        uint256 firstPlaceReward = address(this).balance * 1000 / 10000;
        uint256 secondReward = (address(this).balance * 6000 / 10000) / 49;
        uint256 thirdReward = (address(this).balance * 3000 / 10000) / 50;

        payable(participants[winningIndexes[0]]).transfer(firstPlaceReward);
        winningAddresses.push(participants[winningIndexes[0]]);

        for (uint i = 1; i < 50; i++) {
            payable(participants[winningIndexes[i]]).transfer(secondReward);
            winningAddresses.push(participants[winningIndexes[i]]);
        }

        for (uint i = 50; i < 100; i++) {
            payable(participants[winningIndexes[i]]).transfer(thirdReward);
            winningAddresses.push(participants[winningIndexes[i]]);
        }
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

    function alreadyWon(uint index) internal returns (bool){
        for (uint i = 0; i < winningIndexes; i++) {
            if (winningIndexes[i] == index) {
                return true;
            }
        }
        return false;
    }

    // TODO: add number of winners + hard limits
    // TODO: add percents setters

    function getTotalAmount(){
        // return total received
    }
}
