var pathTools = require('pathTools');

var sourceManager = {

    setupRoomSources: function(room) {

        var sources = room.find(FIND_SOURCES);

        var roomSources = {};

        sources.forEach(source => {

            // Count how many plain terrains are around the source
            var slots = 0;
            room.lookForAtArea(
                LOOK_TERRAIN,
                source.pos.y - 1, source.pos.x - 1,
                source.pos.y + 1, source.pos.x + 1, true
            ).forEach(item => {
                if (item.terrain == 'plain') {
                    slots++;
                }
            });

            roomSources[source.id] = {
                id: source.id,
                x: source.pos.x,
                y: source.pos.y,
                roomName: source.pos.roomName,
                maxWorkers: slots,
                workers: [],
                container: null,
                miner: null,
            };
        });

        room.memory.sources = roomSources;
    },

    findSources: function(creep) {

        if (!creep.room.memory.hasOwnProperty('sources')) {
            sourceManager.setupRoomSources(creep.room);
        }

        var sources = _.filter(
            creep.room.memory.sources,
            source => (
                (!source.container) &&
                (source.workers.length < source.maxWorkers)
            )
        );

        return sources;
    },

    allocateSource: function(creep, sourceId) {

        // Add it to the source memory
        creep.room.memory.sources[sourceId].workers.push(creep.name);

        // Add it to the creep memory
        creep.memory.sourceId = sourceId;
        creep.memory.sourceType = 'source';
    },

    deallocateSource: function(creep) {

        if (creep.memory.sourceType != 'source') {
            return;
        }
        var sourceId = creep.memory.sourceId;

        var source = creep.room.memory.sources[sourceId];

        var creepIdx = source.workers.indexOf(creep.name);
        if (creepIdx > -1) {
            // Remove the creep from the list
            source.workers.splice(creepIdx, 1);
        } else {
            console.log("Creep " + creep.name +
                        " has broken reference to source " + sourceId);
        }
        delete creep.memory.sourceId;
        delete creep.memory.sourceType;
    },

    /**
     * Verify all source structures to see if they refer to creeps and
     * structures that exists.
     */
    checkSources: function(room) {

        if (!room.memory.sources) {
            sourceManager.setupRoomSources(room);
            return;
        }

        _.forEach(room.memory.sources, (source, sourceId) => {

            // Look for non-existant workers, and remove them from the list
            var invalidWorkers = source.workers.filter(
                worker => Game.creeps[worker] === undefined
            );

            invalidWorkers.forEach(worker => {
                console.log(
                    `Source ${sourceId}: removing inexistent worker ${worker}`
                );
                let idx = source.workers.indexOf(worker);
                if (idx > -1) {
                    source.workers.splice(idx, 1);
                }
            });

            // For the remainder workers, make sure their sourceId is set
            source.workers.forEach(worker => {
                if (Game.creeps[worker].memory.sourceId != sourceId) {
                    console.log(
                        `Source ${sourceId}: fixing backreference for worker `
                        + worker
                    );

                    Game.creeps[worker].memory.sourceId = sourceId;
                    Game.creeps[worker].memory.sourceType = 'source';
                }
            });

            // If the source has a container, make sure it exists
            if (source.container && (!Game.findObjectById(source.container))) {
                console.log(
                    `Source ${sourceId}: invalid container ${source.container}`
                );
                source.container = null;
            }

            // If the source has a miner, make sure it exists.
            if (source.miner && (!Game.creeps[source.miner])) {
                console.log(
                    `Source ${sourceId}: invalid miner ${source.miner}`
                );
                source.miner = null;
            }

        });

    }
}

/**
 * Functions for finding the nearest source of energy.
 *
 * These functions will look for the available energy sources and storages
 * decide on the nearest, and set up the creep to the according state.
 */
var energyManager = {

    findEnergy: function(creep) {

        var sources = sourceManager.findSources(creep);

        var elligible = [];

        sources.forEach(source => {
            elligible.push({
                pos: new RoomPosition(source.x, source.y, source.roomName),
                type: 'source',
                resource: source
            });
        });

        var objectives = elligible.map(x => { return {pos: x.pos, range: 1};});

        console.log("Objectives: " + JSON.stringify(objectives));

        var pathresult = pathTools.findPath(creep.pos, objectives);
        var lastPos = pathresult.path[pathresult.path.length - 1];

        console.log("Elligible: " + JSON.stringify(elligible));
        console.log("pathresult: " + JSON.stringify(pathresult));
        console.log("lastPos: " + JSON.stringify(lastPos));

        elligible.forEach(val => {
            val.dist = (
                Math.pow(val.pos.x - lastPos.x, 2) +
                Math.pow(val.pos.y - lastPos.y, 2)
            );
        });


        var nearest = _.sortBy(elligible, 'dist')[1];
        console.log("Selecting nearest " + nearest.type + " with sq dist: "
                    + nearest.dist);

        return nearest;
    }

}




module.exports = {
    source: sourceManager,
    energy: energyManager
}
