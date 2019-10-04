pragma solidity ^0.5.0;

import "./Owned.sol";

contract Pausable is Owned {
    bool private paused;

    event Paused(address indexed sender);
    event Unpaused(address indexed sender);

    constructor() public {
    }

    function pause() public fromOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

     function unpause() public fromOwner whenPaused {
        paused = false;
        emit Unpaused(msg.sender);
    }

     modifier whenPaused() {
         require(paused, "Pausable: not paused");
         _;
     }

     modifier whenNotPaused() {
         require(!paused, "Pausable: paused");
         _;
     }

    /**
     * @return Whether the contract is indeed paused.
     */
    function isPaused() public view  returns(bool isIndeed) {
        return paused;
    }
}
