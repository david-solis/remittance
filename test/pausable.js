const truffleAssert = require('truffle-assertions');
const {eventEmitted} = truffleAssert;

const Pausable = artifacts.require("Pausable");

contract('Pausable', accounts => {
    const [owner] = accounts;

    const getEventResult = (txObj, eventName) => {
        const event = txObj.logs.find(log => log.event === eventName);

        if (event) {
            return event.args;
        }
        else {
            return undefined;
        }
    };

    describe("pause", function () {
        it("should allow pause of contract", async () => {
            const pausable = await Pausable.new(false, {from: owner});
            const txObj = await pausable.setPaused(true, {from: owner});
            assert.isTrue(txObj.receipt.status, "receiptstatus must be true");

            var event = getEventResult(txObj, "LogPausedSet");
            assert.equal(event.sender, owner, "function must have been execute by owner");
            assert.equal(event.newPausedState, true, "contract must be paused");
        });

        it("should allow unpause of contract", async () => {
            const pausable = await Pausable.new(true, {from: owner});
            const result = await pausable.setPaused(false, {from: owner});
            assert.isTrue(result.receipt.status, "receipt status must be true");
            // Check event
            await eventEmitted(result, "LogPausedSet", log => {
                return log.sender === owner && !log.newPausedState;
            });


        });

    });

});

