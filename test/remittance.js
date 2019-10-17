const Remittance = artifacts.require('Remittance');
const helperTime = require('ganache-time-traveler');
const { advanceTime } = helperTime;
const assert = require("chai").assert;
const truffleAssert = require('truffle-assertions');
const {createTransactionResult, eventEmitted, reverts} = truffleAssert;
const {toBN, toWei, asciiToHex} = web3.utils;
const {getBalance} = web3.eth;
const uuidv4 = require("uuid/v4");

contract('Remittance', (accounts) => {
    const BN_0 = toBN("0");
    const BN_H_ETH = toBN(toWei("0.5", "ether"));
    const BN_1_ETH = toBN(toWei("1", "ether"));

    const BN_FEE = toBN(toWei("0.05", "ether"));
    const BN_FEE_MINUS_ONE = BN_FEE.sub(toBN(1));

    const BN_MIN = toBN(2592000); // 1 month in secs
    const BN_MAX = toBN(7776000); // 3 months in secs

    const BN_LT_MIN = toBN(1296000);   // 15 days in secs
    const BN_DURATION = toBN(2592000); // 1 month in secs
    const BN_GT_MAX = toBN(10368000);  // 4 months in secs

    const DURATION_MS = 2592000 * 1000; // 1 month in msecs

    const FAKE_ID = asciiToHex("LAZY_TOWN");
    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

    const [ALICE, BOB, CAROL] = accounts;
    let remittance;

    beforeEach("deploy", async () => {
        remittance = await Remittance.new(BN_FEE, BN_MIN, BN_MAX, {from: ALICE});
    });

    describe("constructor", function () {
        it("should have initial balance equals to zero", async () => {
            const balance = toBN(await getBalance(remittance.address));
            assert(balance.eq(BN_0), "contract balance is not zero");
        });

        it("should have emmitted fee set event", async () => {
            const result = await createTransactionResult(remittance, remittance.transactionHash);
            await eventEmitted(result, "LogFeeSet", log => {
                return log.sender === ALICE && log.fee.eq(BN_FEE);
            });
        });

        it("should set remittance fee accordingly", async () => {
            const fee = await remittance.getFee({from: ALICE});
            assert.strictEqual(fee.toString(), BN_FEE.toString(), "remittance fee mismatch");
        });
    });

    describe("fallback function", function() {
        it("should reject direct transaction with value", async () => {
            await reverts(
                remittance.sendTransaction({from: ALICE, value: 1, gas: 3000000})
            );
        });

        it("should reject direct transaction without value", async () => {
            await reverts(
                remittance.sendTransaction({from: ALICE, gas: 3000000})
            );
        });
    });

    describe("escrow ids", function () {
        it("should have different escrow ids across instances given same parameters", async () => {
            const otherInstance = await Remittance.new(BN_FEE, BN_MIN, BN_MAX, {from: ALICE});

            const secret = [];
            uuidv4(null, secret, 0);

            const remittanceEscrowId = await remittance.generateEscrowId(CAROL, secret);
            const otherInstanceEscrowId = await otherInstance.generateEscrowId(CAROL, secret);

            assert.notEqual(remittanceEscrowId, otherInstanceEscrowId);
        });
    });

    describe("fee getter and setter", function () {
        it("should change fee", async () => {
            const result = await remittance.setFee(BN_H_ETH, {from: ALICE});
            await eventEmitted(result, "LogFeeSet", log => {
                return log.sender === ALICE && log.fee.eq(BN_H_ETH);
            });
            const fee = await remittance.getFee({from: BOB});
            assert.strictEqual(fee.toString(), BN_H_ETH.toString(), "remittance fee mismatch");
        });
    });

    describe("duration range getter and setter", () => {
        it("should change range", async () => {
            const result = await remittance.setDurationRange(BN_DURATION, BN_GT_MAX, {from: ALICE});
            await eventEmitted(result, "LogDurationRangeSet", log => {
                return (log.sender === ALICE && log.minDuration.eq(BN_DURATION) && log.maxDuration.eq(BN_GT_MAX));
            });
            const range = await remittance.getDurationRange({from: ALICE});
            assert.strictEqual(range.min.toString(), BN_DURATION.toString(), "range min mismatch");
            assert.strictEqual(range.max.toString(), BN_GT_MAX.toString(), "range max mismatch");
        });
    });

    describe("Function: deposit", () => {
        it("should revert on invalid recipient", async () => {
            await reverts(
                remittance.deposit(FAKE_ID, ADDRESS_ZERO, BN_DURATION, {from: ALICE}), "invalid recipient"
            );
        });

        it("should revert on previous remittance", async () => {
            await remittance.deposit(FAKE_ID, BOB, BN_DURATION, {from: ALICE, value: BN_H_ETH});
            await reverts(
                remittance.deposit(FAKE_ID, BOB, BN_DURATION, {from: ALICE, value: BN_H_ETH}), "previous remittance"
            );
        });

        it("should revert on value less than fee", async () => {
            await reverts(
                remittance.deposit(FAKE_ID, BOB, BN_DURATION, {from: ALICE, value: BN_FEE_MINUS_ONE}), "value less than fee"
            );
        });

        it("should revert on duration out of range (LT min)", async () => {
            await reverts(
                remittance.deposit(FAKE_ID, BOB, BN_LT_MIN, {from: ALICE, value: BN_H_ETH}), "duration out of range"
            );
        });

        it("should revert on duration out of range (GT max)", async () => {
            await reverts(
                remittance.deposit(FAKE_ID, BOB, BN_GT_MAX, {from: ALICE, value: BN_H_ETH}), "duration out of range"
            );
        });

        it("should start remittance (deposit)", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(CAROL, secret);
            const balance1a = toBN(await getBalance(remittance.address));
            const result = await remittance.deposit(id, CAROL, BN_DURATION, {from: ALICE, value: BN_1_ETH});
            await eventEmitted(result, "LogDeposited", log => {
                return (log.escrowId === id && log.sender === ALICE && log.recipient === CAROL &&
                    BN_1_ETH.sub(BN_FEE).eq(log.amount) && BN_FEE.eq(log.fee));
            });
            // Check contract balance
            const balance1b = toBN(await getBalance(remittance.address));
            assert.strictEqual(balance1b.sub(balance1a).toString(), BN_1_ETH.toString(), "contract balance mismatch");
            // Check storage
            const info = await remittance.escrows(id);
            assert.strictEqual(info.sender, ALICE, "sender mismatch");
            assert.strictEqual(BN_1_ETH.sub(BN_FEE).toString(), info.amount.toString(), "amount mismatch");
            assert.notEqual(info.dueDate.toString(), BN_0.toString(), "due date not set");
        });
    });

    describe("Function: transfer", () => {
        it("should revert on remittance not found", async () => {
            await reverts(
                remittance.transfer(FAKE_ID, {from: BOB}), "remittance already claimed or not found"
            );
        });

        it("should revert on remittance already claimed", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(CAROL, secret);
            await remittance.deposit(id, CAROL, BN_DURATION, {from: ALICE, value: BN_1_ETH});
            await remittance.transfer(secret, {from: CAROL});
            await reverts(
                remittance.transfer(secret, {from: CAROL}),
                "remittance already claimed or not found"
            );
        });

        it("should revert on remittance not found", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(CAROL, secret);
            await remittance.deposit(id, CAROL, BN_DURATION, {from: ALICE, value: BN_1_ETH});
            await reverts(
                remittance.transfer(FAKE_ID, {from: CAROL}),
                "remittance already claimed or not found"
            );
        });

        it("should complete remittance (transfer)", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(CAROL, secret);
            await remittance.deposit(id, CAROL, BN_DURATION, {from: ALICE, value: BN_1_ETH});
            const balance1a = toBN(await getBalance(remittance.address));
            const balance2a = toBN(await getBalance(CAROL));
            const result = await remittance.transfer(secret, {from: CAROL});
            await eventEmitted(result, "LogTransferred", log => {
                return (log.escrowId === id && log.recipient === CAROL && BN_1_ETH.sub(BN_FEE).eq(log.amount));
            });
            // Check contract balance
            const balance1b = toBN(await getBalance(remittance.address));
            assert.strictEqual(balance1a.sub(balance1b).toString(), BN_1_ETH.sub(BN_FEE).toString(),
                "contract balance mismatch");
            // Check recipient balance
            const balance2b = toBN(await getBalance(CAROL));
            const gasUsed2b = toBN(result.receipt.gasUsed);
            const transact2b = await web3.eth.getTransaction(result.tx);
            const gasPrice2b = toBN(transact2b.gasPrice);
            assert.strictEqual(balance2b.add(gasUsed2b.mul(gasPrice2b)).sub(balance2a).toString(),
                BN_1_ETH.sub(BN_FEE).toString(), "recipient balance mismatch");
            // Check storage
            const info = await remittance.escrows(id);
            assert.strictEqual(info.sender, ADDRESS_ZERO, "sender not released");
            assert.strictEqual(info.amount.toString(), BN_0.toString(), "amount not released");
            assert.notEqual(info.dueDate.toString(), BN_0.toString(), "due date was released");
        });
    });

    describe("Function: reclaim", () => {
        it("remittance not found", async () => {
            await reverts(
                remittance.reclaim(FAKE_ID, { from: ALICE }),
                "remittance already claimed or not found"
            );
        });

        it("should revert on remittance already claimed", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(CAROL, secret);
            await remittance.deposit(id, CAROL, BN_DURATION, {from: ALICE, value: BN_1_ETH});
            await remittance.transfer(secret, { from: CAROL });
            await reverts(
                remittance.reclaim(id, { from: ALICE }),
                "remittance already claimed or not found"
            );
        });

        it("should revert on too early to reclaim", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(CAROL, secret);

            await remittance.deposit(id, CAROL, BN_DURATION, {from: ALICE, value: BN_1_ETH});
            await reverts(
                remittance.reclaim(id, { from: ALICE }),"too early to reclaim");
        });

        it("should revert on sender mismatch", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(CAROL, secret);

            await remittance.deposit(id, CAROL, BN_DURATION, {from: ALICE, value: BN_1_ETH});
            await reverts(
                remittance.reclaim(id, { from: BOB }),"sender mismatch");
        });

        it("should complete remittance (reclaim)", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(CAROL, secret);
            await remittance.deposit(id, CAROL, BN_DURATION, {from: ALICE, value: BN_1_ETH});
            const balance1a = toBN(await getBalance(remittance.address));
            const balance2a = toBN(await getBalance(ALICE));
            await advanceTime(DURATION_MS);
            const result = await remittance.reclaim(id, { from: ALICE });
            await eventEmitted(result, "LogReclaimed", log => {
                return (log.escrowId === id && log.sender === ALICE && BN_1_ETH.sub(BN_FEE).eq(log.amount));
            });
            // Check contract balance
            const balance1b = toBN(await getBalance(remittance.address));
            assert.strictEqual(balance1a.sub(balance1b).toString(), BN_1_ETH.sub(BN_FEE).toString(),
                "contract balance mismatch");
            // Check sender balance
            const balance2b = toBN(await getBalance(ALICE));
            const gasUsed2b = toBN(result.receipt.gasUsed);
            const transact2b = await web3.eth.getTransaction(result.tx);
            const gasPrice2b = toBN(transact2b.gasPrice);
            assert.strictEqual(balance2b.add(gasUsed2b.mul(gasPrice2b)).sub(balance2a).toString(),
                BN_1_ETH.sub(BN_FEE).toString(), "recipient balance mismatch");
            // Check storage
            const info = await remittance.escrows(id);
            assert.strictEqual(info.sender, ADDRESS_ZERO, "sender not released");
            assert.strictEqual(info.amount.toString(), BN_0.toString(), "amount not released");
            assert.notEqual(info.dueDate.toString(), BN_0.toString(), "due date was released");
        });
    });
});
