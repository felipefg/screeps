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
 * Base state for when you have to move to a place and then execute an action.
 *
 * The basic algorithm is:
 * - Compute targets and best path
 * - Move along the path
 * - Perform action
 */
class MoveWorkState extends CreepState {

    /**
     * Get a list of valid objectives for the current state.
     *
     * The return format should be an array of objects containing:
     * - pos: The RoomPosition
     * - target: The target structure
     * - range: The range we need to have.
     */
    static getTargets(creep) {
        return [];
    }

    /**
     * Get an object with pathfinder options, if needed.
     */
    static getPathFinderOpts(creep) {
        return {};
    }

    /**
     * Figure out the best path to go.
     */
    static setTargetAndPath(creep) {

        let targets = this.getTargets(creep);

        // If we have no targets, just don't move anywhere.
        if (targets.length == 0) {
            creep.memory.move_path = [];
            creep.memory.target_id = null;
            return null;
        }

        let objectives = targets.map(
            target => {return {pos:target.pos, range: target.range};}
        );

        // Find the optimal path that will take us to at least one of our
        // targets
        let results = pathTools.findPath(
            creep.pos,
            objectives,
            this.getPathFinderOpts(creep)
        );

        if (results.incomplete) {
            console.log("Found incomplete path for " + creep.name + "!!!");
        }

        // Find out the objectives that are in range of the final path location
        let lastPos = creep.pos;

        if (results.path.length > 0) {
            lastPos = results.path[results.path.length - 1];
        }

        let inRange = targets.filter(
            target => lastPos.inRangeTo(target.pos, target.range)
        );

        // Pick the first one (just because)
        let nearest = inRange[0];

        // Serialize data into memory
        creep.memory.move_path = JSON.parse(JSON.stringify(results.path));
        creep.memory.target_id = nearest.target.id;

        return nearest.target;
    }

    /**
     * Perform the movement.
     */
    static move(creep) {
        let path = creep.memory.move_path.map(
            x => new RoomPosition(x.x, x.y, x.roomName)
        );

        let moveRet = 0;

        if (path.length > 0) {
            moveRet = creep.moveByPath(path);

            // Let's ignore moveRet tired.
            if (moveRet == ERR_TIRED) {
                creep.say("tired...");
                moveRet = 0;
            }

        } else {
            console.log(`${creep.name}: Empty path when trying to move.`);
        }

        creep.memory.move_status = moveRet;

        if (moveRet != 0) {
            console.log(`${creep.name}: moveByPath() returned ${moveRet}`);
        }

        return moveRet;
    }

    /**
     * Check if target is still valid.
     *
     * This may be used to recompute the path as soon as possible.
     */
    static isTargetValid(creep) {
        return true;
    }

    /**
     * Perform the actual work, once in range of the target.
     */
    static work(creep, target) {
        return;
    }

    // State machine implementation
    static onEnter(creep) {
        this.setTargetAndPath(creep);
    }

    static action(creep) {
        if (creep.memory.move_path === undefined) {
            console.log(`${creep.name}: Error: move_path is undefined.`);
            return;
        }
        if (creep.memory.move_path.length > 0) {
            // we still have to move. First lets check if our target is still
            // valid. Otherwise, let's pick up another one.
            if (!this.isTargetValid(creep)) {
                this.setTargetAndPath(creep);
            }

            let moveRet = this.move(creep);

            if (moveRet != 0) {
                console.log(
                    `${creep.name}: Move failed. Recomputing and trying again.`
                );
                this.setTargetAndPath(creep);
                this.move(creep);
            }
        } else {
            // We are at the target location. Let's perform the work.
            let target = Game.getObjectById(creep.memory.target_id);
            this.work(creep, target);
        }
    }
}

class ReturningState extends MoveWorkState {

    static getTargets(creep) {

        var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return ((structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_TOWER)
                            && structure.energy < structure.energyCapacity);
                }
        });

        return targets.map(t => {return {pos: t.pos, range: 1, target: t};});
    }

    /**
     * Perform the actual work, once in range of the target.
     */
    static work(creep, target) {
        var result = creep.transfer(target, RESOURCE_ENERGY);

        if (result != 0) {
            console.log(creep.name + ": error " + result
                + " on transfer().");
        }
    }

    static nextState(creep) {

        if (creep.memory.target_id == null) {
            creep.memory.nextState = "parking";
        } else if (creep.carry.energy < creep.carryCapacity) {
            creep.memory.nextState = "gathering";
        }

    }

}

class GatheringState extends MoveWorkState {

    static getTargets(creep) {
        var sources = resourceManager.source.findSources(creep);

        let targets = sources.map(t => {
            let struct = Game.getObjectById(t.id);
            return {pos: struct.pos, range: 1, target: struct};
        });

        return targets;
    }

    static setTargetAndPath(creep) {
        var target = super.setTargetAndPath(creep);

        if ((target !== null) && (target.type == "source")) {
            resourceManager.source.allocateSource(creep, resource.resource.id);
        }
    }

    static work(creep, target) {

        var harvest = creep.harvest(target);

        if (harvest != 0) {
            console.log(`${creep.name}: Error harvesting: ${harvest}`);
        }
    }

    static onExit(creep) {
        super.onExit(creep);
        resourceManager.source.deallocateSource(creep);
    }

    static onDie(creep) {
        super.onDie(creep);
        resourceManager.source.deallocateSource(creep);
    }

    static nextState(creep) {
        if (creep.carry.energy >= creep.carryCapacity) {
            creep.memory.nextState = "returning";
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
    gathering: GatheringState,
    returning: ReturningState,
    parking: CreepStateParking,
}



module.exports = {

    run: function run(creep) {

        if (creep.spawning) {
            return;
        }

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
