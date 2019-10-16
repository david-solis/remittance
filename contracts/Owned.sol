pragma solidity ^0.5.0;

contract Owned {
    /**
     * Event emitted when a new owner has been set.
     * @param previousOwner The previous owner, who happened to effect the change.
     * @param newOwner The new, and current, owner the contract.
     */
    event LogOwnerSet(address indexed previousOwner, address indexed newOwner);

    address private currentOwner;

    constructor() public {
        currentOwner = msg.sender;
        emit LogOwnerSet(address(0), msg.sender);
    }

    modifier fromOwner() {
        require(msg.sender == currentOwner);
        _;
    }

    /**
     * Sets the new owner for this contract.
     *     It should roll back if the caller is not the current owner.
     *     It should roll back if the argument is a 0 address.
     * @param newOwner The new owner of the contract
     * @return Whether the action was successful.
     * Emits LogOwnerSet with:
     *     The sender of the action.
     *     The new owner.
     */
    function setOwner(address newOwner) public fromOwner returns (bool success) {
        require(newOwner != address(0));

        if (newOwner == msg.sender) {
            return false;
        }
        emit LogOwnerSet(msg.sender, newOwner);
        currentOwner = newOwner;
        return true;
    }

    /**
     * @return The owner of this contract.
     */
    function getOwner() public view returns (address owner) {
        return currentOwner;
    }
}
