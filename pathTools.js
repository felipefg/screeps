function getCostMatrix(roomName) {

    let room = Game.rooms[roomName];
    // In this example `room` will always exist, but since PathFinder
    // supports searches which span multiple rooms you should be careful!
    if (!room) return;
    let costs = new PathFinder.CostMatrix;

    room.find(FIND_STRUCTURES).forEach(function(structure) {
        if (structure.structureType === STRUCTURE_ROAD) {
        // Favor roads over plain tiles
        costs.set(structure.pos.x, structure.pos.y, 1);
        } else if (structure.structureType !== STRUCTURE_CONTAINER && 
                    (structure.structureType !== STRUCTURE_RAMPART ||
                    !structure.my)) {
        // Can't walk through non-walkable buildings
        costs.set(structure.pos.x, structure.pos.y, 0xff);
        }
    });

    // Avoid creeps in the room
    room.find(FIND_CREEPS).forEach(function(creep) {
        costs.set(creep.pos.x, creep.pos.y, 0xff);
    });

    return costs;
}

/**
 * Wrapper on PathFinder to do what we expect it to.
 */
function findPath(origin, objectives, options) {

    let opts = {
      plainCost: 2,
      swampCost: 10,
      roomCallback: getCostMatrix
    };

    let ret = PathFinder.search(
        origin,
        objectives,
        _.extend(opts, options)
    );

    return ret
}

module.exports = {
    findPath: findPath
};
