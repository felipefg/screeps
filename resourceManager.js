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
                workers: []
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
            source => (source.workers.length < source.maxWorkers)
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
