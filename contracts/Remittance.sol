pragma solidity ^0.5.0;

import "./Pausable.sol";

/*
 * It transfers funds from A (on-chain) to C (off-chain) via B (on-chain).
 * B is an exchange to fiat currency.
 */
contract Remittance is Pausable {
    // Parameter configuration events
    event LogFeeSet(address indexed sender, uint fee);
    event LogDueDateRangeSet(address sender, uint minDueDate, uint maxDueDate);

    //  Remittance events
    event LogReclaimed(bytes32 indexed escrowId, address indexed sender, uint amount);
    event LogDeposited(bytes32 indexed escrowId, address indexed sender, address indexed recipient, uint amount,
        uint fee, uint dueDate);
    event LogWTransferred(bytes32 indexed escrowId, address indexed recipient, uint amount);

    // Fees withdrawal event
    event LogWithdrawn(address indexed sender, uint amount);

    struct Escrow {
        address sender;
        address recipient;
        uint amount;
        uint dueDate;
    }

    mapping(bytes32 => Escrow) public escrows;
    mapping(address => uint) public fees;

    uint private minDueDate;
    uint private maxDueDate;
    uint private fee;

    constructor(uint _fee, uint _minDueDate, uint _maxDueDate) public {
        setFee(_fee);
        setDueDateRange(_minDueDate, _maxDueDate);
    }

    function setFee(uint _fee) public fromOwner {
        require(_fee >= 0, "fee must be greater or equal to zero");
        fee = _fee;
        emit LogFeeSet(msg.sender, fee);
    }

    function getFee() view public returns (uint) {
        return fee;
    }

    function setDueDateRange(uint _minDueDate, uint _maxDueDate) public fromOwner {
        require(_minDueDate != uint(0), "min due date cannot be zero");
        require(_maxDueDate >= _minDueDate, "max due date must be >= Min due date");

        minDueDate = _minDueDate;
        maxDueDate = _maxDueDate;
        emit LogDueDateRangeSet(msg.sender, minDueDate, maxDueDate);
    }

    function getDueDateRange() view public returns (uint min, uint max) {
        return (minDueDate, maxDueDate);
    }

    function generateEscrowId(address recipient, bytes32 secretRecipient, bytes32 secretTwo) view public
    returns (bytes32) {
        return keccak256(abi.encodePacked(this, recipient, secretRecipient, secretTwo));
    }

    function deposit(bytes32 escrowId, address recipient, uint dueDate) payable public whenNotPaused {
        require(recipient != address(0), "invalid recipient");
        require(msg.value > fee, "value less than fee");

        require(escrows[escrowId].dueDate == uint(0), "previous remittance");

        require(dueDate >= minDueDate && dueDate <= maxDueDate, "due date out of range");

        uint amount = msg.value - fee;
        Escrow memory escrow = Escrow({
            sender : msg.sender,
            recipient : recipient,
            amount : amount,
            dueDate : block.timestamp + dueDate
            });

        escrows[escrowId] = escrow;
        fees[getOwner()] += fee;
        emit LogDeposited(escrowId, msg.sender, recipient, amount, fee, dueDate);
    }

    function validateEscrow(Escrow storage escrow, address sender, address recipient) view private {
        require(escrow.dueDate != uint(0), "remittance not set");
        require(escrow.amount != uint(0), "remittance already claimed");
        require(escrow.sender == sender, "sender mismatch");
        require(escrow.recipient == recipient, "recipient mismatch");
    }

    function transfer(address sender, bytes32 secretRecipient, bytes32 secretTwo) public whenNotPaused {
        bytes32 escrowId = generateEscrowId(msg.sender, secretRecipient, secretTwo);
        Escrow storage escrow = escrows[escrowId];

        validateEscrow(escrow, sender, msg.sender);
        require(block.timestamp < escrow.dueDate, "too late to transfer");

        uint amount = escrow.amount;

        emit LogWTransferred(escrowId, msg.sender, amount);

        cleanAndReleaseEscrow(escrowId);
        msg.sender.transfer(amount);
    }

    function reclaim(bytes32 escrowId, address recipient) public whenNotPaused {
        Escrow storage escrow = escrows[escrowId];

        validateEscrow(escrow, msg.sender, recipient);

        require(block.timestamp > escrow.dueDate, "too early to reclaim");

        uint amount = escrow.amount;
        emit LogReclaimed(escrowId, msg.sender, amount);

        cleanAndReleaseEscrow(escrowId);
        msg.sender.transfer(amount);
    }

    function cleanAndReleaseEscrow(bytes32 escrowId) private {
        Escrow storage escrow = escrows[escrowId];
        escrow.sender = address(0);
        escrow.recipient = address(0);
        escrow.amount = 0;
        // dueDate is used to identify claimed or transferred scrows
    }

    function withdraw() public whenNotPaused {
        uint amount = fees[msg.sender];
        require(amount > 0);

        fees[msg.sender] = 0;
        emit LogWithdrawn(msg.sender, amount);
        msg.sender.transfer(amount);
    }

    function() external payable {
        revert();
    }

    function kill() public fromOwner whenPaused {
        address payable owner = address(uint160(getOwner()));

        selfdestruct(owner);
    }
}
