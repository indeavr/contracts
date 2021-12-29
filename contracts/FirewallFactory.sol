pragma solidity 0.8.10;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

contract FirewallFactory is Ownable {
    mapping(bytes => bool) public whitelist;

    event NotWhitelisted(bytes code);
    event WhitelistUpdated(bytes _code, bool _value);
    event Deployed(address addr);

    modifier onlyWhitelisted(bytes memory _code) {
        require(_code.length != 0, 'ERROR: no code');

        if (!whitelist[_code]) {
            emit NotWhitelisted(_code);
            revert('Not Whitelisted !');
        }
        _;
    }

    // *many improvements possible - init data for example
    function deploy2(bytes memory _code, uint256 _salt)
        public
        onlyWhitelisted(_code)
        returns (address addr)
    {
        assembly {
            addr := create2(0, add(_code, 0x20), mload(_code), _salt)
        }
        require(addr != address(0), 'Failed on deploy');

        emit Deployed(addr);
        return addr;
    }

    function deploy(bytes memory _code)
        public
        onlyWhitelisted(_code)
        returns (address addr)
    {
        assembly {
            addr := create(0, add(_code, 0x20), mload(_code))
        }
        require(addr != address(0), 'Failed on deploy');

        emit Deployed(addr);
        return addr;
    }

    function updateWhitelist(bytes memory _code, bool _value)
        public
        onlyOwner
        returns (bool)
    {
        whitelist[_code] = _value;
        emit WhitelistUpdated(_code, _value);
        return true;
    }

    fallback() external payable {}

    receive() external payable {}
}

/*
1. Use Cases:
We need a dapp that generates wallets for new approved users. Why ? Because we want to give the users full custody of their own funds & wallet
by not storing any private keys & having no ownership.
That's why we'll deploy a contract each time a user logs-in. CREATE op-code might feel like the solution, however since we'll be
using Ethereum we need a better solution gas-wise. That's where CREATE2 comes in. It gives us the ability to determine the address
of the newly deployed wallet and only deploy it once the first interaction with the wallet get's made, saving gas.
You need to built the contract serving as a factory and you need to provide tools for easily integrating an UI that accepts code as input.

ps: I like giving people a sense of purpose by providing context for the task. Here is an example:
Use Case 2:
Hi X,
We have seen a big use & need of upgradability for our contracts having made mistakes in the past that led to critical errors.
We want to create the so called - UpgradeProxy that lets us change our business logic if need be.
Your part is the most legacy one - The FirewallFactory contract.
As you may guess from the name it does 2 main things
- it deployes contracts given the bytecode as input.
- it serves as a firewall, allowing only whitelisted bytecode to be deployed.
Spec:
only the owner can add to whitelist.
Please see the diagram for the desired flow & if any questions, feel free to ping me.

Extra Requinments:
- used on Ethereum = optimized gas-wise.

Tips:
* use CREATE for simplicity
*/
