pragma solidity ^0.5.0;

import "./Pausable.sol";
import "./SafeMath.sol";

/*
 * It transfers funds from A (on-chain) to B (off-chain) via C (on-chain).
 * C is an exchange to fiat currency.
 */
contract Remittance is Pausable {
    using SafeMath for uint;

    // Parameter configuration events
    event LogFeeSet(address indexed sender, uint fee);
    event LogDurationRangeSet(address indexed sender, uint minDuration, uint maxDuration);

    //  Remittance events
    event LogReclaimed(bytes32 indexed escrowId, address indexed sender, uint amount);
    event LogDeposited(bytes32 indexed escrowId, address indexed sender, address indexed recipient, uint amount,
        uint fee, uint duration);
    event LogTransferred(bytes32 indexed escrowId, address indexed recipient, uint amount);

    // Fees withdrawal event
    event LogWithdrawn(address indexed sender, uint amount);

    struct Escrow {
        address recipient;
        uint amount;
        uint dueDate;
    }

    mapping(bytes32 => Escrow) public escrows;
    mapping(address => uint) public fees;

    uint private minDuration;
    uint private maxDuration;
    uint private fee;

    constructor(uint _fee, uint _minDuration, uint _maxDuration) Pausable(false) public {
        setFee(_fee);
        setDurationRange(_minDuration, _maxDuration);
    }

    function setFee(uint _fee) public fromOwner {
        require(_fee >= 0, "fee must be greater or equal to zero");
        fee = _fee;
        emit LogFeeSet(msg.sender, fee);
    }

    function getFee() view public returns (uint) {
        return fee;
    }

    function setDurationRange(uint _minDuration, uint _maxDuration) public fromOwner {
        require(_minDuration != uint(0), "min due date cannot be zero");
        require(_maxDuration >= _minDuration, "max due date must be >= Min due date");

        minDuration = _minDuration;
        maxDuration = _maxDuration;
        emit LogDurationRangeSet(msg.sender, minDuration, maxDuration);
    }

    function getDurationRange() view public returns (uint min, uint max) {
        return (minDuration, maxDuration);
    }

    function generateEscrowId(address recipient, bytes32 secretRecipient, bytes32 secretTwo) view public
    returns (bytes32) {
        return keccak256(abi.encodePacked(this, recipient, secretRecipient, secretTwo));
    }

    function deposit(bytes32 escrowId, address recipient, uint duration) payable public whenNotPaused {
        require(recipient != address(0), "invalid recipient");
        require(msg.value > fee, "value less than fee");
        require(escrows[escrowId].dueDate == uint(0), "previous remittance");
        require(minDuration <= duration && duration <= maxDuration, "duration out of range");

        uint amount = msg.value.sub(fee);
        Escrow memory escrow = Escrow({
            recipient : recipient,
            amount : amount,
            dueDate : block.timestamp.add(duration)
            });

        escrows[escrowId] = escrow;
        fees[getOwner()] = fee.add(fees[getOwner()]);
        emit LogDeposited(escrowId, msg.sender, recipient, amount, fee, duration);
    }

    function transfer(bytes32 secretRecipient, bytes32 secretTwo) public whenNotPaused {
        bytes32 escrowId = generateEscrowId(msg.sender, secretRecipient, secretTwo);
        Escrow storage escrow = escrows[escrowId];

        // Check escrow
        require(escrow.amount != uint(0), "remittance already claimed or not found");
        require(escrow.recipient == msg.sender, "recipient mismatch");
        // Check due date
        require(block.timestamp <= escrow.dueDate, "too late to transfer");

        uint amount = escrow.amount;
        emit LogTransferred(escrowId, msg.sender, amount);
        cleanAndReleaseEscrow(escrowId);
        msg.sender.transfer(amount);
    }

    function reclaim(bytes32 escrowId, address recipient) public whenNotPaused {
        Escrow storage escrow = escrows[escrowId];
        // Check escrow
        require(escrow.amount != uint(0), "remittance already claimed or not found");
        require(escrow.recipient == recipient, "recipient mismatch");
        // Check due date
        require(escrow.dueDate <= block.timestamp, "too early to reclaim");

        uint amount = escrow.amount;
        emit LogReclaimed(escrowId, msg.sender, amount);
        cleanAndReleaseEscrow(escrowId);
        msg.sender.transfer(amount);
    }

    function cleanAndReleaseEscrow(bytes32 escrowId) private {
        Escrow storage escrow = escrows[escrowId];
        escrow.recipient = address(0);
        escrow.amount = 0;
        escrow.dueDate = 0;
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
