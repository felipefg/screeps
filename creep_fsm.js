var resourceManager = require('resourceManager');
var pathTools = require('pathTools');

class CreepState {

    static onEnter(creep) {
        return;
    }

    static action(creep) {
        return;
    }

    static onExit(creep) {
        return;
    }

    static onDie(creep) {
        console.log(`Creep ${creep.name} is dying and is currently ${creep.memory.state}`);
    }

    static nextState(creep) {
        return;
    }

}

/**
 * Base class for "moving_*" states.
 *
 * This class can also be used for generic move states.
 */
class StateMovingPath extends CreepState {

    /**
     * Properly sets up the creep for entering the "moving" state.
     */
    static setupTransitionWithObjectives(
        creep,
        objectives,
        pathfinderOpts,
        stateMoving,
        stateArrival)
    {
        // Save the state structure
        var movingState = {
            objectives: JSON.parse(JSON.stringify(objectives)),
            pathfinderOpts: pathfinderOpts,
            mode: "path",
            stateArrival: stateArrival,
            move: 0
        };

        creep.memory.nextState = stateMoving;
        creep.memory.moving = movingState;

        // Generate the path structure
        this.calculatePath(creep);
        this.doMove(creep);
    }

    /**
     * Recover the objectives array from the memory
     */
    static getObjectives(creep) {
        var objectives = creep.memory.moving.objectives.map(obj => {
                return {
                    pos: new RoomPosition(obj.pos.x, obj.pos.y,
                                          obj.pos.roomName),
                    range: obj.range
                };
            }
        );

        return objectives;
    }

    static calculatePath(creep) {

        var results = pathTools.findPath(
            creep.pos,
            this.getObjectives(creep),
            creep.memory.moving.pathfinderOpts
        );

        if (results.incomplete) {
            console.log("Found incomplete path for " + creep.name + "!!!");
        }

        // Serialize path into memory
        creep.memory.moving.path = JSON.parse(JSON.stringify(results.path));
    }

    /**
     * Recover the path from memory.
     *
     * Doing this way because SerializePath seems to be broken.
     */
    static getPath(creep) {
        return _.map(
            creep.memory.moving.path,
            x => new RoomPosition(x.x, x.y, x.roomName)
        );
    }

    static doMove(creep) {
        var path = this.getPath(creep);
        var moveRet = creep.moveByPath(path);

        creep.memory.moving.move = moveRet;

        return moveRet;
    }

    static onEnter(creep) {
        if (!creep.memory.moving.path) {
            this.calculatePath(creep);
        }
    }

    static action(creep) {
        if (creep.memory.moving.movieRet != 0) {
            this.calculatePath(creep);
        }

        this.doMove(creep);
    }

    static nextState(creep) {
        var path = creep.memory.moving.path;

        if (path.length == 0) {
            // Ok, we have arrived!
            creep.memory.nextState = creep.memory.moving.stateArrival;
        }
    }

    static onExit(creep) {
        delete creep.memory.moving;
    }
}

class CreepStateGathering extends CreepState {

    static setupTransition(creep) {

        var resource = resourceManager.energy.findEnergy(creep);

        if (resource.type == "source") {
            resourceManager.source.allocateSource(creep, resource.resource.id);
        }

        console.log("Resource: " + JSON.stringify(resource));

        StateMovingPath.setupTransitionWithObjectives(
            creep,
            [{pos: resource.pos, range: 1}],
            {},
            "moving",
            "gathering"
        );
    }

    static action(creep) {
        var source = Game.getObjectById(creep.memory.sourceId);

        var harvest = creep.harvest(source);

        if (harvest != 0) {
            console.log(`${creep.name}: Error harvesting: ${harvest}`);
        }
    }

    static onExit(creep) {
        resourceManager.source.deallocateSource(creep);
    }

    static onDie(creep) {
        resourceManager.source.deallocateSource(creep);
    }

    static nextState(creep) {

        if (creep.carry.energy >= creep.carryCapacity) {
            creep.memory.nextState = "returning";
        }
    }

}

class CreepStateReturning extends CreepState {

    static onEnter(creep) {
        // Find a source to gather and let's stick to it.
        var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return ((structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_CONTAINER ||
                            structure.structureType == STRUCTURE_TOWER)
                            && structure.energy < structure.energyCapacity);
                }
        });

        if (targets.length > 0) {
            creep.memory.target_id = targets[0].id;
        } else {
            creep.memory.target_id = null;
        }

    }


    static action(creep) {

        if (creep.memory.target_id === null) {
            return;
        }

        var target = Game.getObjectById(creep.memory.target_id);

        var result = creep.transfer(target, RESOURCE_ENERGY);
        if (result == ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        } else if (result != 0) {
            console.log(creep.name + ": error " + result
                + " on transfer().");
        }
    }


    static nextState(creep) {

        if (creep.memory.target_id === null) {
            creep.memory.nextState = "parking";
            return;
        }

        if (creep.carry.energy < creep.carryCapacity) {
            CreepStateGathering.setupTransition(creep);
        }
    }

}

class CreepStateParking extends CreepState {

    static onEnter(creep) {
        // "Flee" to somewhere that is at least range=2 away from any
        // structures in the near 11x11 squares.

        var pos_top = creep.pos.y - 5;
        var pos_bottom = creep.pos.y + 5;
        var pos_left = creep.pos.x - 5;
        var pos_right = creep.pos.x + 5;

        var ranges = {};
        ranges[LOOK_RESOURCES] = 2;
        ranges[LOOK_SOURCES] = 3;
        ranges[LOOK_STRUCTURES] = 2;

        var objectives = [];
        // Keep track of resources
        creep.room.lookAtArea(
                pos_top, pos_left, pos_bottom, pos_right, true
        ).forEach(obj => {
            if (_.has(ranges, obj.type)) {
                objectives.push({
                    pos: new RoomPosition(obj.x, obj.y, creep.room.name),
                    range: ranges[obj.type]
                });
            }
        });


        var pathresult = PathFinder.search(creep.pos, objectives, {flee: true});

        // Work around a bug on Room.serializePath()...
        var serialized = JSON.parse(JSON.stringify(pathresult.path));
        creep.memory.move_path = serialized;
    }

    static action(creep) {

        var path = _.map(creep.memory.move_path, x => new RoomPosition(x.x, x.y, x.roomName));

        var result = creep.moveByPath(path);

        if (result != 0) {
            console.log("cant move: " + result);
            console.log(JSON.stringify(path));
        } else {
            creep.say('idle!');
        }
    }

    static nextState(creep) {

        var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return ((structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_CONTAINER ||
                            structure.structureType == STRUCTURE_TOWER)
                            && structure.energy < structure.energyCapacity);
                }
        });

        if (targets.length > 0) {
            creep.memory.nextState = "returning";
        }
    }
}

var states = {
    gathering: CreepStateGathering,
    returning: CreepStateReturning,
    parking: CreepStateParking,
    moving: StateMovingPath
}



module.exports = {

    run: function run(creep) {

        var currState = creep.memory.state;

        if (!creep.memory.hasOwnProperty("nextState")) {
            creep.memory.nextState = currState;
        }

        var nextState = creep.memory.nextState;

        // If we are transitioning state, execute the onEnter event.
        if (nextState != currState) {
            console.log(`${creep.name}: changing from ${currState} to ${nextState}`);
            creep.memory.state = nextState;
            states[nextState].onEnter(creep);

            currState = nextState;
        }

        // Perform the state action
        states[currState].action(creep);

        // Decide the state transition
        states[currState].nextState(creep);

        // If we are transitioning state, execute the onExit event.
        if (creep.memory.nextState != currState) {
            states[currState].onExit(creep);
        }

        if (creep.ticksToLive <= 1) {
            states[currState].onDie(creep);
        }

    }

}
